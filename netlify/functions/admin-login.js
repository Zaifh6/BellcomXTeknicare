// netlify/functions/admin-login.js
// Handles POST /admin/login on Netlify (mirrors Express route in server.js)
import { signToken } from './lib/jwt.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  const { password } = body;

  if (password !== ADMIN_PASSWORD) {
    console.warn('[auth] admin login failed');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false }),
    };
  }

  const token = signToken({ role: 'admin' });
  console.log('[auth] admin login success');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, token }),
  };
}
