import { NextResponse } from 'next/server';
import { WORKER_API_BASE } from '@/lib/api';

// Public pricing list — no auth needed (the Worker /plans is public).
export async function GET() {
  const res = await fetch(`${WORKER_API_BASE}/plans`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
