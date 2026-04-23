// netlify/functions/admin-chats.js
// Mirrors GET /admin/chats from server.js for Netlify deployment.
// NOTE: Netlify Functions have no persistent filesystem, so chat history is
// not stored between function invocations. Returns an empty array with a note.
// To add persistence, integrate a database (Supabase, MongoDB Atlas, etc.).
import { authFromHeaders } from './lib/jwt.js';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  // Require admin JWT
  const payload = authFromHeaders(event.headers);
  if (!payload || payload.role !== 'admin') {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'unauthorized' }),
    };
  }

  // No persistent storage on Netlify — return empty array
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([]),
  };
}
