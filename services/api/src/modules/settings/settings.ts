import type { Context } from 'hono';
import { getDb } from '../../db';
import { projects } from '../../db/schema';
import { eq } from 'drizzle-orm';
import {
  CATEGORY_META,
  DEFAULT_CONFIG,
  parseConfig,
  normalizeConfig,
  buildSelectors,
  type ElementCategory,
} from '../../services/tour-elements';

// GET /config — SDK-facing. Returns the project's actionable-element selector
// string (built from the client's settings). API-key auth (projectId from key).
export async function getSdkConfig(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const proj = await db.select({ tourConfig: projects.tourConfig })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  const config = parseConfig(proj?.tourConfig);
  return c.json({ selectors: buildSelectors(config) });
}

// GET /admin/settings — dashboard-facing. Returns the toggles + their metadata.
export async function getSettings(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const proj = await db.select({ tourConfig: projects.tourConfig })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  return c.json({
    config: parseConfig(proj?.tourConfig),
    categories: CATEGORY_META,
    defaults: DEFAULT_CONFIG,
  });
}

// POST /admin/settings  { config: {...} } — save the toggles.
export async function saveSettings(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId');
  if (!projectId) return c.json({ error: 'Missing projectId' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const config = normalizeConfig(body.config) as Record<ElementCategory, boolean>;

  await db.update(projects)
    .set({ tourConfig: JSON.stringify(config) })
    .where(eq(projects.id, projectId))
    .run();

  return c.json({ success: true, config });
}
