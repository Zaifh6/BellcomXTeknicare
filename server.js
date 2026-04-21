import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import fs from 'fs';
import { promisify } from 'util';
import cookieParser from 'cookie-parser';
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());                     // allows your HTML file to talk to this server
app.use(express.json());             // parses JSON request bodies
app.use(cookieParser());             // parses cookies on incoming requests
app.use(express.static('public'));   // serves your HTML from ./public

const GROQ_KEY = process.env.GROQ_API_KEY;
const VF_KEY = process.env.VOICEFLOW_API_KEY;
const VF_PROJECT = process.env.VOICEFLOW_PROJECT_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const USER_PASSWORD = process.env.USER_PASSWORD || '';

// ensure data dir + files
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const CHATS_FILE = DATA_DIR + '/chats.json';
const ARTICLES_FILE = DATA_DIR + '/articles.json';
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, '[]');
if (!fs.existsSync(ARTICLES_FILE)) fs.writeFileSync(ARTICLES_FILE, '[]');

async function readJson(path) {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    return [];
  }
}

async function writeJson(path, obj) {
  await writeFile(path, JSON.stringify(obj, null, 2), 'utf8');
}

// simple tokenizer used by local search/scoring
function tokenize(txt) {
  return (txt || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
}

// Find a local KB article/text that best matches the question.
// Searches .txt files and `articles.json` in `data/` and scores by token overlap.
async function findLocalKB(question) {
  try {
    const files = await fs.promises.readdir(DATA_DIR);
    let best = { score: 0, content: '' };

    function scoreText(text) {
      const qTokens = new Set(tokenize(question));
      const toks = tokenize(text);
      let sc = toks.reduce((acc, t) => acc + (qTokens.has(t) ? 1 : 0), 0);
      const lower = (text || '').toLowerCase();
      const KW = ['risk', 'loss', 'unauthor', 'hmrc', 'trustee', 'ombudsman', 'de-register', 'upc', 'due diligence', 'leverage', '15%', '30:1', 'profit', 'bank', 'transfer', 'divert'];
      for (const k of KW) if (lower.includes(k)) sc += 2;
      return sc;
    }

    for (const f of files) {
      const fp = `${DATA_DIR}/${f}`;
      if (f.endsWith('.txt')) {
        try {
          const txt = await readFile(fp, 'utf8');
          const sc = scoreText(txt);
          if (sc > best.score) best = { score: sc, content: txt };
        } catch (e) { /* ignore */ }
      } else if (f === 'articles.json') {
        try {
          const txt = await readFile(fp, 'utf8');
          const arr = JSON.parse(txt || '[]');
          for (const a of arr) {
            const content = a.content || a.text || (typeof a === 'string' ? a : '');
            const sc = scoreText(content);
            if (sc > best.score) best = { score: sc, content };
          }
        } catch (e) { /* ignore */ }
      }
    }

    return best.score > 0 ? best.content : '';
  } catch (e) {
    return '';
  }
}

// System prompt — shapes how Groq answers. Edit to match Bellcom's tone/rules.
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

// ─── 1. Query Voiceflow Knowledge Base ───────────────────────────────────
// Pulls the most relevant chunks from your Voiceflow KB for the user's question.
async function queryVoiceflowKB(question) {
  try {
    const res = await fetch(
      `https://general-runtime.voiceflow.com/knowledge-base/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': VF_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectID: VF_PROJECT,
          question,
          settings: { model: 'gpt-4o-mini', temperature: 0.1 },
        }),
      }
    );

    if (!res.ok) {
      console.warn('[VF KB] non-200:', res.status);
      return '';
    }
    const data = await res.json();
    // Voiceflow returns { output, chunks: [{ content, ... }] }
    if (data.chunks?.length) {
      return data.chunks.map(c => c.content).join('\n---\n');
    }
    return data.output || '';
  } catch (err) {
    console.warn('[VF KB] failed:', err.message);
    return ''; // graceful fallback — Groq still answers without KB context
  }
}

// ─── 2. Ask Groq for the chat reply ──────────────────────────────────────
async function askGroq(userMessage, kbContext, history = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history, // previous turns for memory
    {
      role: 'user',
      content: `KNOWLEDGE BASE CONTEXT:\n${kbContext || '(none available)'}\n\nUSER QUESTION: ${userMessage}`,
    },
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // fast + good quality; swap to llama-3.1-8b-instant for cheaper
      messages,
      temperature: 0.4,
      max_completion_tokens: 600,
      response_format: { type: 'json_object' }, // forces valid JSON back
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content;
  return JSON.parse(raw);
}

// Fallback local "improve answer" when GROQ key is missing.
function localImproveAnswer(article, question, original) {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const art = clean(article || '');
  const orig = clean(original || '');
  const q = (question || '').toLowerCase();

  // Split article into sentences/lines
  const sents = art
    .replace(/\r/g, '')
    .split(/(?<=[.?!])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  // Token sets
  const tokenize = txt => (txt || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const qTokens = new Set(tokenize(q));

  // scoring: overlap + keyword boosts
  const KEYWORDS = ['risk','loss','unauthor','unauthoris','hmrc','trustee','ombudsman','criminal','de-?register','upc','due diligence','leverage','leverage','15%','30:1','profit','return'];

  function scoreSentence(s, idx) {
    const toks = tokenize(s);
    let score = toks.reduce((acc, t) => acc + (qTokens.has(t) ? 1 : 0), 0);
    const lower = s.toLowerCase();
    for (const k of KEYWORDS) if (lower.includes(k)) score += 2;
    // prefer earlier sentences slightly
    score += Math.max(0, 1 - idx * 0.01);
    return score;
  }

  const scored = sents.map((s, i) => ({ s, i, sc: scoreSentence(s, i) }));
  scored.sort((a,b)=> b.sc - a.sc || a.i - b.i);

  // pick top 3 most relevant sentences
  const top = Array.from(new Set(scored.slice(0,3).map(x => x.s))).filter(Boolean);

  // Build a concise reply: reason + trustee guidance
  let reason = '';
  if (top.length) {
    reason = top.join(' ');
  } else if (orig) {
    reason = orig.split(/(?<=[.?!])\s+/).slice(0,2).join(' ');
  } else {
    reason = 'This policy warns that leveraged FX carries high risk and may be unsuitable for most pension schemes.';
  }

  // Generate actionable steps (2-4) tailored to trustees
  const steps = [];
  // step 1: document risk appetite
  steps.push('Document the scheme\'s risk appetite and include any leveraged FX in the formal investment plan.');
  // step 2: limits
  if (art.match(/15%/i)) {
    if (art.match(/30:1/)) {
      steps.push('Limit total leveraged FX exposure to no more than 15% of scheme assets; require HNW/sophisticated self-certification for exposure with leverage greater than 30:1.');
    } else {
      steps.push('Limit total leveraged FX exposure to no more than 15% of scheme assets.');
    }
  } else if (art.match(/30:1/)) {
    steps.push('If using leverage greater than 30:1, apply stricter governance and self-certification.');
  } else {
    steps.push('Apply conservative exposure limits and document the rationale for any leveraged FX investments.');
  }
  // step 3: profits & accounts
  if (art.match(/return.*month/i) || art.match(/monthly/i)) {
    steps.push('Return investment profits to the Scheme bank account monthly and never change the destination account.');
  } else {
    steps.push('Ensure all profits are returned to the Scheme bank account and maintain clear banking controls.');
  }
  // step 4: due diligence
  steps.push('Maintain a complete due diligence file and provide it when requested by administrators or regulators.');

  // trim to 4 and ensure brevity
  const finalSteps = steps.slice(0,4).map(s => s.replace(/\s+/g,' ').trim());

  // Info / source excerpt
  const dateMatch = art.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}\b/i);
  const infoText = (dateMatch ? `${dateMatch[0]} — ` : '') + (sents[0] || art.substring(0,200));

  // ticket flag: escalate when article warns of criminal, Ombudsman, de-register, UPC
  const lowerArt = art.toLowerCase();
  const ticket = /criminal|ombudsman|de-?register|unauthori|unauthorised|unauthorised payment|upc/.test(lowerArt);

  // final reply: keep to 2-3 sentences
  let concise = reason;
  // if reason too long, shorten to first 2 sentences
  const reasonSents = concise.split(/(?<=[.?!])\s+/).filter(Boolean);
  concise = reasonSents.slice(0,2).join(' ');
  if (!concise) concise = 'This policy warns that leveraged FX investments are high-risk and require strict trustee governance.';

  return {
    reply: concise.replace(/\s+/g,' ').trim(),
    steps: finalSteps,
    info: { label: 'Source', text: infoText },
    ticket,
    ctaLabel: ticket ? 'Request specialist review' : 'Read full policy',
  };
}

// ─── 3. Main chat endpoint — this is what your HTML calls ────────────────
app.post('/api/chat', async (req, res) => {
  // require user when USER_PASSWORD set
  if (USER_PASSWORD && !(req.cookies && req.cookies.user === '1')) {
    console.warn('[auth] /api/chat unauthorized - cookies:', req.headers.cookie || '(none)');
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    let kbContext = await queryVoiceflowKB(message);

    // if Voiceflow KB returns nothing, try local articles before deferring
    if (!kbContext || !kbContext.trim()) {
      try {
        const local = await findLocalKB(message);
        if (local && local.trim()) kbContext = local;
      } catch (e) {
        // ignore and continue
      }
    }

    let reply;
    try {
      // Prefer Groq when we have a KB context; otherwise use the local fallback generator
      if (GROQ_KEY && kbContext && kbContext.trim()) {
        reply = await askGroq(message, kbContext, history);
      } else {
        reply = localImproveAnswer(kbContext || '', message, '');
      }
    } catch (e) {
      // on error fallback to local improvement using KB + original message
      reply = localImproveAnswer(kbContext || '', message, e.message || '');
    }

    // store chat record
    try {
      const chats = await readJson(CHATS_FILE);
      const entry = {
        id: Date.now(),
        at: new Date().toISOString(),
        message,
        history,
        kbContext: kbContext || '',
        reply,
      };
      chats.push(entry);
      await writeJson(CHATS_FILE, chats);
    } catch (e) {
      console.warn('failed to store chat:', e.message);
    }

    res.json(reply);
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({
      reply: 'Sorry, I hit an error reaching the HR systems. Please try again shortly.',
      steps: [],
      info: null,
      ticket: true,
      ctaLabel: 'Retry',
    });
  }
});

// Endpoint to accept an article + Q + original answer and return improved JSON
app.post('/api/improve', express.json(), async (req, res) => {
  try {
    const { article, question, original } = req.body;
    if (!article) return res.status(400).json({ error: 'article is required' });
    if (!question) return res.status(400).json({ error: 'question is required' });

    if (GROQ_KEY) {
      // try to ask Groq to improve the answer (wrap as a normal chat request)
      try {
        const improved = await askGroq(`Improve the following answer. ARTICLE:\n${article}\n\nQUESTION: ${question}\n\nORIGINAL ANSWER:\n${original || ''}`, article, []);
        return res.json(improved);
      } catch (e) {
        // fallback
      }
    }

    const improved = localImproveAnswer(article, question, original || '');
    res.json(improved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin: simple password login + chat viewer
app.post('/admin/login', express.json(), (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin', '1', { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

// User login: gates access to chatbot when USER_PASSWORD is configured.
app.post('/user/login', express.json(), (req, res) => {
  const { password } = req.body || {};
  if (!USER_PASSWORD) {
    // no user password configured server-side
    return res.status(400).json({ error: 'no_user_password' });
  }
  if (password === USER_PASSWORD) {
    res.cookie('user', '1', { httpOnly: true, sameSite: 'lax' });
    console.log('[auth] user login success');
    return res.json({ ok: true });
  }
  console.warn('[auth] user login failed');
  res.status(401).json({ ok: false });
});

function requireUser(req, res, next) {
  // if no USER_PASSWORD configured, allow access
  if (!USER_PASSWORD) return next();
  if (req.cookies && req.cookies.user === '1') return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.cookies && req.cookies.admin === '1') return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/admin/chats', requireAdmin, async (_req, res) => {
  const chats = await readJson(CHATS_FILE);
  res.json(chats);
});

// Fetch single chat by id
app.get('/admin/chats/:id', requireAdmin, async (req, res) => {
  try {
    const chats = await readJson(CHATS_FILE);
    const id = req.params.id;
    const entry = chats.find(c => String(c.id) === String(id));
    if (!entry) return res.status(404).json({ error: 'not_found' });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a stored chat by id
app.delete('/admin/chats/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const chats = await readJson(CHATS_FILE);
    const remaining = chats.filter(c => String(c.id) !== String(id));
    await writeJson(CHATS_FILE, remaining);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin logout
app.post('/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

// serve admin page (static file under public) - no auth here, API enforces it
// admin UI is at /admin.html in public

// ─── 4. Ticket logging endpoint — writes to Voiceflow Transcripts ────────
// When user clicks "Create Support Ticket", store the conversation in Voiceflow.
app.post('/api/ticket', async (req, res) => {
  try {
    const { userId = 'anonymous', summary, conversation } = req.body;

    // Option A (simplest): just log server-side for now.
    console.log('[TICKET]', { userId, summary, at: new Date().toISOString() });
    console.log('Conversation:', JSON.stringify(conversation, null, 2));

    // Option B (production): push a transcript to Voiceflow so HR team sees it
    //   in the Voiceflow Transcripts dashboard. Uncomment when ready.
    /*
    await fetch(`https://api.voiceflow.com/v2/transcripts`, {
      method: 'PUT',
      headers: { 'Authorization': VF_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectID: VF_PROJECT,
        sessionID: userId + '-' + Date.now(),
      }),
    });
    */

    const ticketId = 'BCQ-' + Math.floor(Math.random() * 90000 + 10000);
    res.json({ ok: true, ticketId });
  } catch (err) {
    console.error('[ticket]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── 5. Health check ─────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const chats = await readJson(CHATS_FILE);
  const articles = await readJson(ARTICLES_FILE);
  res.json({
    status: 'ok',
    groq: !!GROQ_KEY,
    voiceflow: !!VF_KEY && !!VF_PROJECT,
    chats: chats.length,
    articles: articles.length,
  });
});

app.listen(PORT, () => {
  console.log(`\n✓ Bellcom backend running on http://localhost:${PORT}`);
  console.log(`  Open http://localhost:${PORT}/belltekniare_1.html in your browser`);
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`);
});
