// netlify/functions/admin-chat-item.js
// Handles GET /admin/chats/:id and DELETE /admin/chats/:id on Netlify.
// The chat ID is parsed from the request path.
import { authFromHeaders } from './lib/jwt.js';
import { getStore } from '@netlify/blobs';

export async function handler(event) {
  // Require admin JWT
  const payload = authFromHeaders(event.headers);
  if (!payload || payload.role !== 'admin') {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'unauthorized' }),
    };
  }

  // Extract the chat ID from the path: /admin/chats/<id>
  const parts = (event.path || '').split('/').filter(Boolean);
  const id = parts[parts.length - 1];

  if (!id || id === 'chats') {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing id' }) };
  }

  const store = getStore('chats');

  try {
    if (event.httpMethod === 'GET') {
      const entry = await store.get(id, { type: 'json' });
      if (!entry) return { statusCode: 404, body: JSON.stringify({ error: 'not_found' }) };
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      };
    }

    if (event.httpMethod === 'DELETE') {
      await store.delete(id);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  } catch (err) {
    console.error('[admin-chat-item] error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
