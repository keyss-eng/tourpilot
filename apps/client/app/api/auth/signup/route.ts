import { NextResponse } from 'next/server';
import { WORKER_API_BASE } from '@/lib/api';
import { setSessionCookie } from '@/lib/session';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${WORKER_API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  setSessionCookie(data.token);
  return NextResponse.json({ account: data.account, project: data.project });
}
