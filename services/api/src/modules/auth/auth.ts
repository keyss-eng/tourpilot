import type { Context, Next } from 'hono';
import { getDb } from '../../db';
import { accounts, projects } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, signJwt, verifyJwt } from '../../services/auth-tokens';
import { writeAuditLog } from '../../services/audit';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function jwtSecret(c: Context): string {
  // Falls back to ADMIN_SECRET so the feature works before a dedicated secret is
  // set; production should set AUTH_JWT_SECRET via `wrangler secret put`.
  return c.env.AUTH_JWT_SECRET || c.env.ADMIN_SECRET || 'dev-insecure-secret';
}

// Effective role: emails listed in ADMIN_EMAILS env are auto-promoted to admin
// at token-mint time (no DB change needed). Otherwise the stored role is used.
function effectiveRole(c: Context, email: string, dbRole: string): string {
  const list = (c.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase()) ? 'admin' : dbRole;
}

// POST /auth/signup  { email, password, projectName, allowedOrigins? }
// Creates a project + an owner account, returns a JWT.
export async function signup(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const projectName = String(body.projectName || '').trim();
  const allowedOrigins = String(body.allowedOrigins || '*').trim() || '*';

  if (!EMAIL_RE.test(email)) return c.json({ error: 'Invalid email' }, 400);
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
  if (!projectName) return c.json({ error: 'Project name is required' }, 400);

  const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).get();
  if (existing) return c.json({ error: 'An account with this email already exists' }, 409);

  // Reject duplicate non-wildcard origin (matches createProject rule).
  if (allowedOrigins !== '*') {
    const dup = await db.select({ id: projects.id }).from(projects).where(eq(projects.allowedOrigins, allowedOrigins)).get();
    if (dup) return c.json({ error: `A project already exists for origin "${allowedOrigins}"` }, 409);
  }

  const projectId = `proj_${crypto.randomUUID().replace(/-/g, '')}`;
  const apiKey = `at_live_${crypto.randomUUID().replace(/-/g, '')}`;
  const accountId = `acc_${crypto.randomUUID().replace(/-/g, '')}`;
  const now = new Date();

  await db.insert(projects).values({
    id: projectId,
    name: projectName,
    apiKey,
    allowedOrigins,
    plan: 'free',
    createdAt: now,
  }).run();

  await db.insert(accounts).values({
    id: accountId,
    email,
    passwordHash: await hashPassword(password),
    projectId,
    role: 'client',
    createdAt: now,
  }).run();

  const role = effectiveRole(c, email, 'client');
  const token = await signJwt({ sub: accountId, projectId, email, role }, jwtSecret(c));
  await writeAuditLog(db, { projectId, action: 'signup', entity: 'account', email });
  return c.json({ token, account: { id: accountId, email, role }, project: { id: projectId, name: projectName } }, 201);
}

// POST /auth/login  { email, password }
export async function login(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

  const acc = await db.select().from(accounts).where(eq(accounts.email, email)).get();
  // Always run a verify to keep timing uniform whether or not the email exists.
  const ok = acc ? await verifyPassword(password, acc.passwordHash) : false;
  if (!acc || !ok) return c.json({ error: 'Invalid email or password' }, 401);

  const role = effectiveRole(c, acc.email, acc.role);
  const token = await signJwt({ sub: acc.id, projectId: acc.projectId, email: acc.email, role }, jwtSecret(c));
  await writeAuditLog(db, { projectId: acc.projectId, action: 'login', entity: 'account', email: acc.email });
  return c.json({ token, account: { id: acc.id, email: acc.email, role }, project: { id: acc.projectId } });
}

// POST /auth/admin-login { email, password } — separate admin-portal login that
// checks env credentials (ADMIN_EMAIL + ADMIN_PASSWORD), NO database account.
// Issues an admin JWT with an empty projectId (admin is cross-project).
export async function adminLogin(c: Context) {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const envEmail = String(c.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const envPass = String(c.env.ADMIN_PASSWORD || '');
  if (!envEmail || !envPass) return c.json({ error: 'Admin login is not configured' }, 503);

  if (email !== envEmail || password !== envPass) {
    return c.json({ error: 'Invalid admin credentials' }, 401);
  }

  const token = await signJwt({ sub: 'admin', projectId: '', email: envEmail, role: 'admin' }, jwtSecret(c));
  return c.json({ token, account: { id: 'admin', email: envEmail, role: 'admin' } });
}

// POST /auth/logout — records a logout in the project's activity. The cookie is
// cleared by the dashboard BFF; this only writes the audit entry.
export async function logout(c: Context) {
  const claims = c.get('account') as { projectId: string; email: string } | undefined;
  if (claims?.projectId) {
    const db = getDb(c.env.aitour_db_Vishal);
    await writeAuditLog(db, { projectId: claims.projectId, action: 'logout', entity: 'account', email: claims.email });
  }
  return c.json({ ok: true });
}

// GET /auth/me — returns the account + project (incl. apiKey) for the bearer JWT.
export async function me(c: Context) {
  const claims = c.get('account') as { sub: string; projectId: string; email: string; role: string } | undefined;
  if (!claims) return c.json({ error: 'Unauthorized' }, 401);

  const db = getDb(c.env.aitour_db_Vishal);
  const proj = await db.select().from(projects).where(eq(projects.id, claims.projectId)).get();
  if (!proj) return c.json({ error: 'Project not found' }, 404);

  return c.json({
    account: { id: claims.sub, email: claims.email, role: claims.role },
    project: {
      id: proj.id,
      name: proj.name,
      apiKey: proj.apiKey, // dashboard needs this for the Integration snippet
      allowedOrigins: proj.allowedOrigins,
      plan: proj.plan,
    },
  });
}

// Middleware: validates the dashboard JWT (Authorization: Bearer <jwt>) and sets
// c.get('account') + c.get('projectId'). Distinct from authMiddleware (API key).
export async function dashboardAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'Missing token' }, 401);
  const claims = await verifyJwt(header.slice(7), jwtSecret(c));
  if (!claims) return c.json({ error: 'Invalid or expired token' }, 401);
  c.set('account', claims);
  c.set('projectId', claims.projectId);
  await next();
}
