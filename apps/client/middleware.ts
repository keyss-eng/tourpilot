import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

// Gate the client (app) screens: no session cookie → bounce to /login.
// Auth pages and the BFF auth routes stay public. (Admin lives in a separate app.)
const PUBLIC = ['/login', '/signup'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    // Already logged in? Skip the auth pages.
    if (hasSession) {
      return NextResponse.redirect(new URL('/overview', req.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on app screens; skip Next internals, the BFF API, and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
