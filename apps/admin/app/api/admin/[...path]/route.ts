import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker';

// Admin portal BFF — forwards the dashboard JWT (the Worker's adminAuth checks
// role === 'admin'). Separate from /api/aitour/* which swaps in the API key.
const ALLOW = {
  GET: [
    /^admin\/projects$/,
    /^admin\/projects\/[\w-]+$/,
    /^admin\/projects\/[\w-]+\/pages$/,
    /^admin\/projects\/[\w-]+\/events$/,
    /^admin\/plans$/,
    /^admin\/economics-series$/,
  ],
  POST: [/^admin\/plan$/, /^admin\/block$/],
};

function ok(method: 'GET' | 'POST', path: string) {
  return ALLOW[method].some((re) => re.test(path));
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!ok('GET', path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const search = new URL(req.url).search; // forward ?month=, etc.
  const { status, data } = await workerFetch(`/${path}${search}`);
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!ok('POST', path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.text();
  const { status, data } = await workerFetch(`/${path}`, { method: 'POST', body });
  return NextResponse.json(data, { status });
}
