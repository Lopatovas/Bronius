# Bronius — AI Phone Agent POC

A TypeScript proof-of-concept for AI-powered outbound phone calls. Built with a Ports + Adapters (hexagonal) architecture for vendor-swappable telephony, LLM, and storage providers.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         Next.js API Layer                         │
│  POST /api/v1/calls        – Start outbound call                 │
│  POST /api/v1/telephony/*  – Provider webhooks (events/voice/    │
│                               gather)                            │
│  GET  /api/v1/calls/:id    – Call session status                 │
│  GET  /api/v1/calls/:id/transcript – Transcript                  │
├───────────────────────────────────────────────────────────────────┤
│                        Core Modules                               │
│  ┌─────────────────┐ ┌──────────────────┐ ┌────────────────────┐ │
│  │ Call Controller  │ │ Conversation     │ │ Transcript         │ │
│  │ (state machine)  │ │ Engine           │ │ Service            │ │
│  └────────┬────────┘ └────────┬─────────┘ └────────┬───────────┘ │
│           │                   │                     │             │
│  ┌────────┴───────────────────┴─────────────────────┴──────────┐ │
│  │                    Provider Registry                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────┤
│                     Ports (Interfaces)                             │
│  TelephonyPort  │  BrainPort  │  CallStorePort  │  STT/TTS Ports │
├───────────────────────────────────────────────────────────────────┤
│                    Adapters (Implementations)                     │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Twilio    │ │ OpenAI   │ │ Supabase │ │ InMemory         │   │
│  │ Telephony │ │ Brain    │ │ CallStore│ │ CallStore        │   │
│  └───────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                ┌──────────┐                                      │
│                │ Mock     │ (proves swappability)                 │
│                │ Brain    │                                       │
│                └──────────┘                                      │
└───────────────────────────────────────────────────────────────────┘
```

### Call State Machine

```
INIT → DIALING → RINGING → CONNECTED → GREETING → LISTENING ⇄ RESPONDING → CLOSING → HANGUP → COMPLETED
                                                                                              ↗
Any non-terminal state ──────────────────────────────────────────────────────────────→ FAILED
```

### Call Flow (Twilio webhook-based)

1. UI sends `POST /api/v1/calls` with phone number
2. Server creates session, calls Twilio API to place outbound call
3. Twilio POSTs status callbacks → `/api/v1/telephony/events`
4. On answer, Twilio fetches TwiML from → `/api/v1/telephony/voice`
5. Server returns `<Say>` greeting + `<Gather>` for speech
6. User speaks → Twilio POSTs transcription to → `/api/v1/telephony/gather`
7. Server saves utterance, calls BrainPort, saves reply, returns next TwiML
8. Steps 5-7 repeat until goodbye or max turns
9. Server returns `<Hangup>`, session marked COMPLETED

## Local Setup

### Prerequisites

- Node.js 18+
- Twilio account (for real calls)
- OpenAI API key (optional, mock brain is default)
- Supabase project (optional, in-memory store is default)

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
```

### Supabase Setup (optional)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** in the Supabase dashboard
3. Paste and run the contents of `db/schema.sql`
4. Copy your project URL and service role key into `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
   ```

Without these variables, the app uses an in-memory store (data lost on restart).

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the UI.

### Twilio Webhook Setup

For Twilio to reach your local server, use a tunnel (e.g. ngrok):

```bash
ngrok http 3000
```

Set `TWILIO_WEBHOOK_BASE_URL` in `.env` to your ngrok URL (e.g. `https://abc123.ngrok.io`).

Twilio will automatically use the webhook URLs configured when placing the call — no manual webhook configuration in the Twilio console is needed.

## Running Tests

```bash
npm test
```

Test coverage includes:
- **State transitions** — validates the call state machine
- **Call controller** — full lifecycle including initiation, provider events, gather results, silence handling
- **Conversation engine** — end conditions (max turns, user goodbye), reply generation
- **Webhook normalization** — Twilio status mapping to canonical events
- **Transcript service** — append ordering, speaker types
- **Idempotency** — duplicate and out-of-order event handling
- **Integration** — full call flow from start to completion with transcript verification

## Switching Providers via Environment

### Brain Provider

```bash
# Use mock brain (no API key needed)
BRAIN_PROVIDER=mock

# Use OpenAI
BRAIN_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

### Storage

```bash
# In-memory (default when SUPABASE_URL is not set)
# No configuration needed

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
```

To add a new provider, implement the corresponding port interface and register it in `provider-registry.ts`.

## Configuration Reference

| Variable | Description | Default |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | — |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | — |
| `TWILIO_PHONE_NUMBER` | Twilio phone number (E.164) | — |
| `TWILIO_WEBHOOK_BASE_URL` | Public URL for webhooks | — |
| `BRAIN_PROVIDER` | `openai` or `mock` | `mock` |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `SUPABASE_URL` | Supabase project URL | (in-memory) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | (in-memory) |
| `MAX_TURNS` | Max conversation turns | `10` |
| `MAX_CALL_DURATION_SEC` | Max call duration | `300` |
| `MAX_SILENCE_RETRIES` | Retries on silence before hangup | `2` |

## Project Structure

```
src/
├── adapters/                    # Provider implementations
│   ├── twilio-telephony.adapter.ts
│   ├── openai-brain.adapter.ts
│   ├── mock-brain.adapter.ts
│   ├── in-memory-call-store.adapter.ts
│   └── supabase-call-store.adapter.ts
├── core/
│   ├── domain/                  # Domain types, events, state machine
│   │   ├── types.ts
│   │   ├── events.ts
│   │   └── transitions.ts
│   ├── modules/                 # Core business logic
│   │   ├── call-controller.ts
│   │   ├── conversation-engine.ts
│   │   ├── transcript-service.ts
│   │   └── provider-registry.ts
│   └── ports/                   # Interface contracts
│       ├── telephony.port.ts
│       ├── brain.port.ts
│       ├── call-store.port.ts
│       ├── stt.port.ts
│       └── tts.port.ts
├── lib/                         # Shared utilities
│   ├── container.ts
│   ├── id.ts
│   ├── logger.ts
│   └── validation.ts
└── app/                         # Next.js app router
    ├── layout.tsx
    ├── page.tsx                 # UI
    └── api/v1/
        ├── calls/
        │   ├── route.ts         # POST /api/v1/calls
        │   └── [id]/
        │       ├── route.ts     # GET /api/v1/calls/:id
        │       └── transcript/
        │           └── route.ts # GET /api/v1/calls/:id/transcript
        └── telephony/
            ├── events/route.ts  # POST - status callbacks
            ├── voice/route.ts   # POST - TwiML on answer
            └── gather/route.ts  # POST - speech capture
tests/
├── state-transitions.test.ts
├── call-controller.test.ts
├── conversation-engine.test.ts
├── webhook-normalization.test.ts
├── transcript-service.test.ts
├── idempotency.test.ts
└── integration.test.ts
db/
└── schema.sql                   # Supabase schema (run in SQL Editor)
```
