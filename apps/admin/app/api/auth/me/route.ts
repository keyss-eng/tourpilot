import { NextResponse } from 'next/server';
import { WORKER_API_BASE } from '@/lib/api';
import { getToken } from '@/lib/session';

// Returns the logged-in account + project (incl. apiKey, which the owner is
// allowed to see — it's the public SDK key they embed on their site).
export async function GET() {
  const token = getToken();
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const res = await fetch(`${WORKER_API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
