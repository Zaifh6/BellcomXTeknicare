// netlify/functions/health.js
// Mirrors GET /api/health from server.js for Netlify deployment.
export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      groq: !!process.env.GROQ_API_KEY,
      voiceflow: !!(process.env.VOICEFLOW_API_KEY && process.env.VOICEFLOW_PROJECT_ID),
      chats: 0,      // no persistent storage on Netlify
      articles: 0,
    }),
  };
}
