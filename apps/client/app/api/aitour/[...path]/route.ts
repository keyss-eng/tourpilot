import { NextResponse } from 'next/server';
import { callWorker } from '@/lib/proxy';

// Only these Worker paths may be reached through the dashboard BFF. Anything else
// (e.g. project creation) is rejected so a session can't be abused beyond its
// own read/maintenance surface.
const ALLOW = {
  GET: ['admin/overview', 'admin/timeseries', 'admin/pages', 'admin/events', 'admin/settings', 'billing/usage', 'billing/mau'],
  POST: ['tours/regenerate', 'admin/settings'],
};

function guard(method: 'GET' | 'POST', path: string): boolean {
  return ALLOW[method].includes(path);
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!guard('GET', path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const search = new URL(req.url).search; // forward ?month=, ?limit=, etc.
  const { status, data } = await callWorker(`/${path}${search}`);
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!guard('POST', path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.text();
  const { status, data } = await callWorker(`/${path}`, { method: 'POST', body });
  return NextResponse.json(data, { status });
}
