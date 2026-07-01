// Server-side bridge: the dashboard authenticates with a JWT (cookie), but the
// Worker's /admin/* and /billing/* endpoints are guarded by the project API KEY.
// So we resolve the API key from the session (via /auth/me) and call the Worker
// with it. The API key never reaches the browser.
import { WORKER_API_BASE } from './api';
import { getToken } from './session';

async function resolveApiKey(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${WORKER_API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { project?: { apiKey?: string } };
  return data.project?.apiKey ?? null;
}

export async function callWorker(
  path: string,
  init?: RequestInit
): Promise<{ status: number; data: unknown }> {
  const apiKey = await resolveApiKey();
  if (!apiKey) return { status: 401, data: { error: 'Not authenticated' } };

  const res = await fetch(`${WORKER_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
