import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'aitour_session';

// The JWT lives in an httpOnly cookie — never exposed to client JS. Server
// components / route handlers read it here and forward it to the Worker.
export function getToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}

export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days (matches JWT TTL)
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}
