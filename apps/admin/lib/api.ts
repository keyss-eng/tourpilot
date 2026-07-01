// Worker API base. The dashboard calls its OWN /api/* BFF routes (Phase 3),
// which inject the project's API key server-side and forward here. The browser
// never sees the key.
export const WORKER_API_BASE =
  process.env.AITOUR_API_BASE ?? 'https://aitour-api.vishalkumar-9ca.workers.dev/api/v1';

// Client-side fetch against our own BFF (same-origin). Returns parsed JSON or
// throws with the server message.
export async function bff<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}
