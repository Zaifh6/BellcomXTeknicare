// netlify/functions/lib/jwt.js
// Minimal, dependency-free JWT implementation (HS256) for Netlify Functions.
// Node 18+ has built-in crypto — no npm packages needed.
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || 'bellcom-secret-key-change-me';
const EXPIRY_SECONDS = 60 * 60 * 8; // 8 hours

function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str + '==='.slice(0, (4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Sign a JWT payload. Returns a compact JWT string.
 * @param {object} payload - e.g. { role: 'user' }
 */
export function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + EXPIRY_SECONDS,
  }));
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${claims}`)
    .digest('base64url');
  return `${header}.${claims}.${sig}`;
}

/**
 * Verify a JWT.  Returns the decoded payload or null if invalid/expired.
 * @param {string} token
 */
export function verifyToken(token) {
  try {
    const [header, claims, sig] = (token || '').split('.');
    if (!header || !claims || !sig) return null;

    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(`${header}.${claims}`)
      .digest('base64url');

    // Constant-time compare to prevent timing attacks
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(base64urlDecode(claims));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract and verify a Bearer token from the Authorization header.
 * @param {object} headers - event.headers from Netlify
 * @returns {object|null} decoded payload or null
 */
export function authFromHeaders(headers) {
  const auth = headers['authorization'] || headers['Authorization'] || '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}
