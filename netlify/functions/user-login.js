// netlify/functions/user-login.js
// Handles POST /user/login on Netlify (mirrors Express route in server.js)
import { signToken } from './lib/jwt.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  const USER_PASSWORD = process.env.USER_PASSWORD || '';

  if (!USER_PASSWORD) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'no_user_password' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  const { password } = body;

  if (password !== USER_PASSWORD) {
    console.warn('[auth] user login failed');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false }),
    };
  }

  const token = signToken({ role: 'user' });
  console.log('[auth] user login success');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, token }),
  };
}
