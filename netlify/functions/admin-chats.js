// netlify/functions/admin-chats.js
// Mirrors GET /admin/chats from server.js for Netlify deployment.
// Reads all stored chat sessions from Netlify Blobs.
import { authFromHeaders } from './lib/jwt.js';
import { getStore } from '@netlify/blobs';

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

  try {
    const store = getStore('chats');
    const { blobs } = await store.list();

    if (!blobs || blobs.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      };
    }

    // Fetch all chat entries in parallel
    const chats = (
      await Promise.all(
        blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null))
      )
    ).filter(Boolean);

    // Sort newest first (same as server.js)
    chats.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chats),
    };
  } catch (err) {
    console.error('[admin-chats] error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
