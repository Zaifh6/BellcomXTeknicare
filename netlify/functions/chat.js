// netlify/functions/chat.js
// Mirrors POST /api/chat from server.js for Netlify deployment.
// Auth: Bearer JWT from Authorization header (set by the frontend on Netlify).
import { authFromHeaders } from './lib/jwt.js';
import { getStore } from '@netlify/blobs';

const GROQ_KEY = process.env.GROQ_API_KEY;
const VF_KEY   = process.env.VOICEFLOW_API_KEY;
const VF_PROJECT = process.env.VOICEFLOW_PROJECT_ID;
const USER_PASSWORD = process.env.USER_PASSWORD || '';

// System prompt (keep in sync with server.js)
const SYSTEM_PROMPT = `You are the Bellcom × Empowered HR support assistant.
You help employees with HR questions: training, PTO, payroll, portal login, benefits, expenses, IT issues, and general workplace queries.

RULES:
- Keep replies short, friendly, and professional (2-4 sentences max in the main reply).
- If the user's question matches the KNOWLEDGE BASE CONTEXT below, use ONLY that information. Do not invent facts.
- If the context is empty or irrelevant, answer generally but say you'll log the query for a specialist.
- Respond in this exact JSON format (no markdown fences, no extra text):
{
  "reply": "short main answer (can include <strong> tags for emphasis)",
  "steps": ["step 1", "step 2", "step 3"],
  "info": { "label": "Tip", "text": "optional helpful note" },
  "ticket": false,
  "ctaLabel": "optional button label or null"
}
- "steps" should be 2-4 actionable items. Omit (use []) if not applicable.
- "info" is optional context — set to null if not needed.
- "ticket": true only when the user clearly needs IT/HR escalation (locked accounts, technical failures, unresolved issues).`;

async function queryVoiceflowKB(question) {
  try {
    const res = await fetch('https://general-runtime.voiceflow.com/knowledge-base/query', {
      method: 'POST',
      headers: { 'Authorization': VF_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectID: VF_PROJECT,
        question,
        settings: { model: 'gpt-4o-mini', temperature: 0.1 },
      }),
    });
    if (!res.ok) { console.warn('[VF KB] non-200:', res.status); return ''; }
    const data = await res.json();
    if (data.chunks?.length) return data.chunks.map(c => c.content).join('\n---\n');
    return data.output || '';
  } catch (err) {
    console.warn('[VF KB] failed:', err.message);
    return '';
  }
}

async function askGroq(userMessage, kbContext, history = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: `KNOWLEDGE BASE CONTEXT:\n${kbContext || '(none available)'}\n\nUSER QUESTION: ${userMessage}` },
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.4,
      max_completion_tokens: 600,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

function localFallback(message) {
  return {
    reply: `Thanks for your message. I've logged this query in the system and an HR specialist will follow up.`,
    steps: [
      `Your query has been recorded with reference <strong>#BCQ-${Math.floor(Math.random() * 90000 + 10000)}</strong>`,
      'An HR support specialist will review and respond within <strong>1 business day</strong>',
      'You can track this in <strong>Empowered → My Requests</strong>',
    ],
    info: { label: 'In the meantime', text: 'Check the Bellcom HR Knowledge Base at help.bellcom.internal for answers to common questions.' },
    ticket: true,
    ctaLabel: 'Track My Request',
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  // ─── Auth check ───────────────────────────────────────────────────────────
  // Only enforce when USER_PASSWORD is configured (same logic as server.js)
  if (USER_PASSWORD) {
    const payload = authFromHeaders(event.headers);
    if (!payload || (payload.role !== 'user' && payload.role !== 'admin')) {
      console.warn('[auth] /api/chat unauthorized');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'unauthorized' }),
      };
    }
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  const { message, history = [] } = body;
  if (!message?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  try {
    // Query Voiceflow KB
    let kbContext = '';
    if (VF_KEY && VF_PROJECT) {
      kbContext = await queryVoiceflowKB(message);
    }

    let reply;
    try {
      if (GROQ_KEY && kbContext && kbContext.trim()) {
        reply = await askGroq(message, kbContext, history);
      } else if (GROQ_KEY) {
        // Groq available but no KB context — still ask Groq with no context
        reply = await askGroq(message, '', history);
      } else {
        reply = localFallback(message);
      }
    } catch (e) {
      console.error('[chat] Groq error:', e.message);
      reply = localFallback(message);
    }

    // Persist chat record to Netlify Blobs so admin panel can view sessions.
    try {
      const store = getStore('chats');
      const chatId = String(Date.now());
      await store.setJSON(chatId, {
        id: chatId,
        at: new Date().toISOString(),
        message,
        history,
        kbContext: kbContext || '',
        reply,
      });
    } catch (e) {
      console.warn('[chat] failed to store chat in blobs:', e.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply),
    };
  } catch (err) {
    console.error('[chat] unhandled error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reply: 'Sorry, I hit an error reaching the HR systems. Please try again shortly.',
        steps: [],
        info: null,
        ticket: true,
        ctaLabel: 'Retry',
      }),
    };
  }
}
