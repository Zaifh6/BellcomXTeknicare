// netlify/functions/admin-logout.js
// Handles POST /admin/logout on Netlify.
// On Netlify, JWTs are stored client-side (localStorage) — so logout is just
// acknowledged here; the real cleanup happens in the browser.
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
}
