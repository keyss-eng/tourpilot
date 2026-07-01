import { NextResponse } from 'next/server';
import { WORKER_API_BASE } from '@/lib/api';
import { getToken, clearSessionCookie } from '@/lib/session';

export async function POST() {
  // Record the logout in the project's activity (best-effort) before clearing.
  const token = getToken();
  if (token) {
    try {
      await fetch(`${WORKER_API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore — logout must still clear the cookie */
    }
  }
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
