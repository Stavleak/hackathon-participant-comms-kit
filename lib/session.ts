import 'server-only';
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {appId} from '../app/config';

export const cookieName = `stavleak-${appId}`;
export const lifetime = 8 * 60 * 60;
function secret() {
  const value = process.env.APP_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Сначала выполните pnpm setup');
  return value;
}
export function sameOrigin(request: Request) {
  const allowed = process.env.APP_ORIGIN || 'http://127.0.0.1:3005';
  // Next.js can normalize Request.url to an internal hostname. The configured
  // public Origin and the actual Host header must both match; forwarded headers
  // never expand this allowlist for the loopback-only application.
  return request.headers.get('origin') === allowed && request.headers.get('host') === new URL(allowed).host;
}
export function passwordMatches(value: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 12) throw new Error('Сначала выполните pnpm setup');
  return timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update(expected).digest());
}
export function signSession() {
  const body = `${Math.floor(Date.now()/1000)+lifetime}.${randomBytes(16).toString('hex')}`;
  return `${body}.${createHmac('sha256',secret()).update(body).digest('hex')}`;
}
export function verifySession(token: string | undefined) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{10}$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const expires = Number(parts[0]);
  if (expires <= Date.now()/1000 || expires > Date.now()/1000+lifetime+5) return false;
  const expected = createHmac('sha256',secret()).update(`${parts[0]}.${parts[1]}`).digest();
  return timingSafeEqual(expected,Buffer.from(parts[2],'hex'));
}
export async function authorized() { return verifySession((await cookies()).get(cookieName)?.value); }

const attempts: number[] = [];
export function takeLoginAttempt() {
  const cutoff = Date.now()-60_000;
  while (attempts.length && attempts[0] < cutoff) attempts.shift();
  if (attempts.length >= 5) return false;
  attempts.push(Date.now());
  return true;
}
