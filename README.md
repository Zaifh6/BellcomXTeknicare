# Bellcom × Empowered — Backend Setup

Local proxy connecting your chat UI to **Groq** (AI brain) and **Voiceflow** (knowledge base + tickets).

## Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌─────────────┐
│  belltekniare_1  │─────▶│   server.js      │─────▶│  Voiceflow  │  (fetch HR docs)
│  (your HTML)     │      │   localhost:3000 │      └─────────────┘
│                  │      │                  │      ┌─────────────┐
│                  │◀─────│                  │─────▶│    Groq     │  (generate reply)
└──────────────────┘      └──────────────────┘      └─────────────┘
```

Your API keys never touch the browser — they live in `.env` on the server.

---

## Step 1 — Install Node.js

Need v18 or newer (for built-in `fetch`). Check with:

```bash
node --version
```

If missing, grab it from https://nodejs.org.

## Step 2 — Install dependencies

From this folder (`belltekniare-backend/`):

```bash
npm install
```

## Step 3 — Get your Groq API key

1. Go to https://console.groq.com and sign up (free tier is generous).
2. Visit https://console.groq.com/keys and click **Create API Key**.
<!-- 3. Copy the key (starts with `gsk_...`). Paste it into your `.env` file; do NOT commit it to git. -->

## Step 4 — Set up your Voiceflow project

1. Sign up at https://voiceflow.com.
2. Create a new **AI Agent** project.
3. Open **Knowledge Base** (left sidebar) and upload your HR docs:
   - Paste URLs (HR portal, FAQ pages), or
   - Upload PDFs / DOCX files (PTO policy, benefits guide, etc.), or
   - Paste raw text for quick Q&A pairs.
4. Get your **API key**: Integration tab → Dialog Manager API Keys → copy the key starting with `VF.DM.`
5. Get your **Project ID**: it's in the URL when you have your project open, e.g. `voiceflow.com/project/abc123xyz/...` — the `abc123xyz` part.

## Step 5 — Configure your keys

```bash
cp .env.example .env
```

Then edit `.env` and paste your three values:

```
GROQ_API_KEY=gsk_...
VOICEFLOW_API_KEY=VF.DM....
VOICEFLOW_PROJECT_ID=...
```

## Step 6 — Run it

```bash
npm start
```

You should see:

```
✓ Bellcom backend running on http://localhost:3000
  Open http://localhost:3000/belltekniare_1.html in your browser
```

## Step 7 — Test

1. Open http://localhost:3000/belltekniare_1.html
2. Log in with access code `1234` (still hardcoded in the HTML — change later).
3. Ask something that matches your KB: *"How do I request time off?"*
4. Groq's reply should pull facts from your Voiceflow KB.

Admin UI

- Visit http://localhost:3000/admin.html to view stored chats.
- Set `ADMIN_PASSWORD` in `.env` (defaults to `changeme`) before starting.

**Quick sanity check** — visit http://localhost:3000/api/health to confirm both keys are loaded.

---

## How it works

**`server.js` does three things per message:**

1. Receives `{ message, history }` from the frontend.
2. Calls Voiceflow KB → gets the 3 most relevant chunks of HR info.
3. Sends those chunks + the question + conversation history to Groq with a strict JSON system prompt → returns `{ reply, steps, info, ticket, ctaLabel }`.

The frontend's existing `addBotMsg()` already renders that exact shape, so no UI changes were needed beyond swapping `getReply()` for a `fetch()`.

## Common issues

| Problem | Fix |
|---|---|
| `ECONNREFUSED` in browser console | Server isn't running. Run `npm start`. |
| `401` from Groq | Wrong or expired `GROQ_API_KEY`. Regenerate at console.groq.com/keys. |
| Empty/irrelevant replies | Your Voiceflow KB is empty or docs don't cover the question. Add more sources. |
| `CORS` errors | Only happens if you open the HTML as `file://`. Use the server URL instead. |
| Groq returns non-JSON | Lower `temperature` in `server.js` or tighten the system prompt. |

## Things to improve next

- **Rate limiting**: add `express-rate-limit` before going public.
- **Real auth**: the `1234` login is client-side only — anyone can bypass it. Move auth to the server.
- **Ticket storage**: uncomment the Voiceflow Transcripts block in `/api/ticket` once you're ready, or swap in a real DB (Postgres, Supabase).
- **Streaming replies**: Groq supports SSE streaming for faster-feeling responses. Requires changes to both server and HTML.
- **Model choice**: `llama-3.3-70b-versatile` is balanced. For cheaper/faster use `llama-3.1-8b-instant`. For reasoning-heavy queries try `deepseek-r1-distill-llama-70b`.
