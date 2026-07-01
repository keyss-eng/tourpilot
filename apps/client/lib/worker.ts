// Server-side Worker API client. Used only in route handlers / server
// components — never shipped to the browser. The dashboard JWT is forwarded as
// a Bearer token so the Worker scopes data to the account's project.
import { WORKER_API_BASE } from './api';
import { getToken } from './session';

export async function workerFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const token = getToken();
  const res = await fetch(`${WORKER_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
