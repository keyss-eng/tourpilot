import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, crawlerAuthMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/security';
import { createProject, getProjectDetails, getMyProject } from './modules/projects/projects';
import { fetchActiveTour, recordTourProgress, getCurrentTourForCrawler } from './modules/tours/tours';
import { ingestMetricsBatch } from './modules/analytics/analytics';
import { getBillingUsage, getMauBilling, listPublicPlans } from './modules/billing/billing';
import { snapshotMonthlyMau } from './services/mau';
import { getAdminOverview, getAdminPages, getAdminEvents, getTimeseries, regenerateTour, triggerMauSnapshot } from './modules/admin/admin';
import { getDb, getKV } from './db';
import type { Env } from './db';
import { projects } from './db/schema';
import { eq } from 'drizzle-orm';
import { generateTourWithGuards } from './services/tour-generation';
import { cleanupOldLogs } from './services/retention';
import { signup, login, me, logout, dashboardAuth, adminLogin } from './modules/auth/auth';
import { getSdkConfig, getSettings, saveSettings } from './modules/settings/settings';
import { adminAuth, listProjects, getProjectDetail, getProjectPages, getProjectEvents, getEconomicsSeries, setProjectPlan, setProjectBlocked, listPlans } from './modules/admin/admin-portal';

type Variables = {
  projectId: string;
  auditContext?: string;
  auditUser?: string;
  account?: { sub: string; projectId: string; email: string; role: string };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>().basePath('/api/v1');

// R-2: CORS — API key is the auth layer, allow any origin.
app.use('*', cors({
  origin: (origin) =>
    origin || 'https://aitour-api.vishalkumar-9ca.workers.dev',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-AITour-SDK-Version', 'X-Admin-Secret'],
  maxAge: 600,
  credentials: false,
}));

// Global API version header
app.use('*', async (c, next) => {
  await next();
  c.header('X-AITour-API-Version', '1.0.0');
});

app.get('/health', (c) => c.json({ status: 'healthy', timestamp: new Date() }));

// Public pricing list (no auth) — powers the dashboard "Plans" section.
app.get('/plans', rateLimiter, listPublicPlans);

// ── Dashboard auth (email + password → JWT) ─────────────────────────────────
// These power the dashboard login; distinct from the SDK API-key auth above.
app.post('/auth/signup', rateLimiter, signup);
app.post('/auth/login', rateLimiter, login);
app.post('/auth/admin-login', rateLimiter, adminLogin);
app.get('/auth/me', dashboardAuth, me);
app.post('/auth/logout', dashboardAuth, logout);

// ── S2: rateLimiter now runs AFTER auth on every protected route ────────────
// Previously it was a global `app.use('*', rateLimiter)` that executed BEFORE
// authMiddleware, so `c.get('projectId')` was always undefined and every
// request fell back to an IP bucket — defeating per-project limiting and
// making the limit trivially bypassable via IP rotation. By chaining it after
// auth, the limiter keys on the real projectId. Crawler/admin routes still
// get it (IP-keyed) as a basic DoS guard.

app.post('/projects', rateLimiter, async (c, next) => {
  const secret = c.req.header('X-Admin-Secret');
  if (!secret || secret !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
}, createProject);

app.get('/projects/me', authMiddleware, rateLimiter, getMyProject);

// Protect /projects/:id with auth checking either matching projectId or admin secret
app.get('/projects/:id', authMiddleware, rateLimiter, async (c) => {
  const authedProjectId = c.get('projectId');
  const paramProjectId = c.req.param('id');

  const secret = c.req.header('X-Admin-Secret');
  const isAdmin = secret && secret === c.env.ADMIN_SECRET;

  if (authedProjectId !== paramProjectId && !isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return getProjectDetails(c);
});

app.get('/tours/active', authMiddleware, rateLimiter, fetchActiveTour);
app.post('/tours/progress', authMiddleware, rateLimiter, recordTourProgress);
// S6: crawler route now authenticated (was fully open).
app.get('/tours/current', crawlerAuthMiddleware, rateLimiter, getCurrentTourForCrawler);

app.post('/analytics/batch', authMiddleware, rateLimiter, ingestMetricsBatch);

// [BILLING] Page-wise usage + per-tour cost (internal margin) for the project.
app.get('/billing/usage', authMiddleware, rateLimiter, getBillingUsage);
// [BILLING] MAU-based subscription bill (client charge) for a month.
app.get('/billing/mau', authMiddleware, rateLimiter, getMauBilling);
// Manual MAU snapshot trigger (admin) — populates mau_monthly on demand.
app.post('/admin/snapshot-mau', authMiddleware, rateLimiter, triggerMauSnapshot);

// ── Admin PORTAL (cross-project — the SaaS owner's view of all clients) ──────
// Gated by adminAuth (admin-role JWT or X-Admin-Secret), NOT the per-project key.
app.get('/admin/projects', adminAuth, listProjects);
app.get('/admin/projects/:id', adminAuth, getProjectDetail);
app.get('/admin/projects/:id/pages', adminAuth, getProjectPages);
app.get('/admin/projects/:id/events', adminAuth, getProjectEvents);
app.post('/admin/plan', adminAuth, setProjectPlan);
app.post('/admin/block', adminAuth, setProjectBlocked);
app.get('/admin/economics-series', adminAuth, getEconomicsSeries);
app.get('/admin/plans', adminAuth, listPlans);

// ── Admin dashboard (scoped to the API key's project) ───────────────────────
app.get('/admin/overview', authMiddleware, rateLimiter, getAdminOverview);
app.get('/admin/timeseries', authMiddleware, rateLimiter, getTimeseries);
// [SETTINGS] tour element config — SDK (api key) reads /config; dashboard reads/writes /admin/settings.
app.get('/config', authMiddleware, rateLimiter, getSdkConfig);
app.get('/admin/settings', authMiddleware, rateLimiter, getSettings);
app.post('/admin/settings', authMiddleware, rateLimiter, saveSettings);
app.get('/admin/pages', authMiddleware, rateLimiter, getAdminPages);
app.get('/admin/events', authMiddleware, rateLimiter, getAdminEvents);
// Destructive: also requires X-Admin-Secret (checked inside the handler).
app.post('/tours/regenerate', authMiddleware, rateLimiter, regenerateTour);

// ─── /tours/generate-sdk ──────────────────────────────────────────────────────
app.post('/tours/generate-sdk', authMiddleware, rateLimiter, async (c) => {
  const body = await c.req.json();
  const { contextKey, domSchema, elementFingerprints, uiVersion } = body;
  const projectId = c.get('projectId');

  // Validate contextKey format.
  if (!contextKey || !/^[a-zA-Z0-9\/_\-?=&%.:]*$/.test(contextKey)) {
    return c.json({ error: 'Invalid contextKey format' }, 400);
  }

  // Expose the page to the audit logger (it's in the body, not the query).
  c.set('auditContext', contextKey);

  if (!Array.isArray(domSchema)) {
    return c.json({ error: 'Missing or invalid domSchema' }, 400);
  }

  const db = getDb(c.env.aitour_db_Vishal);
  const result = await generateTourWithGuards({
    db,
    kv: getKV(c.env),
    env: c.env,
    projectId,
    contextKey,
    domSchema,
    elementFingerprints,
    uiVersion: uiVersion ?? null,
    source: 'sdk',
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  if (!result.success) {
    return c.json({ error: result.error }, (result.status || 500) as any);
  }

  return c.json(result);
});

// ─── /tours/generate (crawler route) ─────────────────────────────────────────
// S6: auth is now the shared crawlerAuthMiddleware (same constant-time compare,
// deduplicated from the old inline block).
app.post('/tours/generate', crawlerAuthMiddleware, rateLimiter, async (c) => {
  const body = await c.req.json();
  const { contextKey, versionHash, domSchema, projectId, elementFingerprints } = body;

  if (!contextKey || !versionHash || !projectId || !Array.isArray(domSchema)) {
    return c.json({ error: 'Missing contextKey, versionHash, projectId, or domSchema' }, 400);
  }

  const db = getDb(c.env.aitour_db_Vishal);
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const result = await generateTourWithGuards({
    db,
    kv: getKV(c.env),
    env: c.env,
    projectId,
    contextKey,
    domSchema,
    elementFingerprints,
    source: 'crawler',
    versionHash,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  if (!result.success) {
    return c.json({ error: result.error }, (result.status || 500) as any);
  }

  return c.json(result);
});

// Worker entry: HTTP via Hono (fetch) + a daily Cron (scheduled) that prunes old
// logs (audit_log + analytics) so the tables stay bounded across many projects.
export default {
  fetch: app.fetch,
  scheduled: async (_event: any, env: Env, ctx: any) => {
    ctx.waitUntil(cleanupOldLogs(env));
    ctx.waitUntil(snapshotMonthlyMau(env));
  },
};