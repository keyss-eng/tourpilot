import type { Context } from 'hono';
import { getDb } from '../../db';
import { projects } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function createProject(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const body = await c.req.json();

  const allowedOrigins: string = body.allowedOrigins || '*';

  // FIX: Same allowedOrigins se dobara project create hone se rokna
  // Agar same URL already registered hai to existing project return karo
  if (allowedOrigins !== '*') {
    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.allowedOrigins, allowedOrigins))
      .get();

    if (existing) {
      return c.json({
        success: false,
        error: `A project already exists for origin "${allowedOrigins}".`,
        existingProjectId: existing.id,
      }, 409); // 409 Conflict
    }
  }

  const id = `proj_${crypto.randomUUID().replace(/-/g, '')}`;
  const apiKey = `at_live_${crypto.randomUUID().replace(/-/g, '')}`;

  const newProject = {
    id,
    name: body.name,
    apiKey,
    allowedOrigins,
    createdAt: new Date(),
  };

  await db.insert(projects).values(newProject).run();

  return c.json({ success: true, project: newProject }, 201);
}

export async function getProjectDetails(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.req.param('id') as string;

  const result = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!result) {
    return c.json({ error: 'Project environment not found' }, 404);
  }

  // BE-2: Never expose apiKey in GET response — this endpoint has no auth requirement
  return c.json({ id: result.id, name: result.name, allowedOrigins: result.allowedOrigins });
}

// Returns project info for the authenticated API key
export async function getMyProject(c: Context) {
  const db = getDb(c.env.aitour_db_Vishal);
  const projectId = c.get('projectId'); // populated by authMiddleware

  const result = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!result) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ id: result.id, name: result.name, allowedOrigins: result.allowedOrigins });
}