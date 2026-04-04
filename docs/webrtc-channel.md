# WebRTC Browser Voice Channel

## The idea

Support voice conversations with Bronius directly in the browser — no phone number, no Twilio, no per-minute cost. Same conversation engine, different transport. Users click a "Talk to Bronius" button on a web page and have a real-time voice conversation.

## Why this matters

- **Zero cost per call** — no telephony charges, just server compute
- **Zero friction for users** — no phone number needed, no app to install, works on any device with a browser and microphone
- **Better audio quality** — browser audio is 48kHz stereo vs telephone 8kHz mono, which means better STT accuracy
- **Direct audio access** — you control the raw audio stream, no middleware like Twilio constraining what you can do with it
- **Simpler architecture** — no webhooks, no TwiML, no XML, no status callbacks. Just a WebSocket streaming audio both ways

## How it maps to the current architecture

The core modules are already channel-agnostic:

```
                    ┌─────────────────────────┐
                    │    ConversationEngine    │
                    │    TranscriptService     │
                    │    CallController        │
                    │    BrainPort (LLM)       │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     TelephonyPort    WebRTCPort       Future: 
     (Twilio)         (Browser)       Teams/Zoom/SIP
```

A `WebRTCPort` adapter would feed audio into the same `ConversationEngine` and `TranscriptService`. The `CallController` state machine works the same way — INIT → CONNECTED → GREETING → LISTENING ⇄ RESPONDING → COMPLETED. The only difference is how audio gets in and out.

## Technical approach

### Client side (browser)

1. User clicks "Talk to Bronius"
2. Browser requests microphone access via `getUserMedia()`
3. Opens a WebSocket connection to the server
4. Streams audio chunks to the server via the WebSocket
5. Receives audio chunks back from the server, plays them through a speaker

No WebRTC peer-to-peer needed for this use case — a simple WebSocket carrying audio is enough. WebRTC's peer-to-peer, STUN/TURN, ICE negotiation are for browser-to-browser calls. Browser-to-server is simpler.

### Server side

1. Accepts WebSocket connection, creates a call session
2. Receives audio chunks from the browser
3. Pipes audio to STT (Deepgram, Whisper, Google, etc.) to get text
4. Sends text to `ConversationEngine.processUtterance()` — same as the phone flow
5. Gets reply text back
6. Pipes reply text to TTS (ElevenLabs, OpenAI TTS, etc.) to get audio
7. Streams TTS audio back to the browser over the WebSocket
8. Saves transcript turns — same `TranscriptService`

### The key difference from phone

With Twilio, STT and TTS happen inside Twilio's infrastructure (via `<Gather>` and `<Say>`). With the browser channel, you run your own STT and TTS. This means:

- You need a real `STTPort` implementation (not just Twilio's built-in Gather)
- You need a real `TTSPort` implementation (not just Twilio's built-in Say)
- You get full control over quality, latency, and provider choice
- The `STTPort` and `TTSPort` interfaces already exist in the codebase as placeholders

## Hosting consideration

The WebSocket server needs to be persistent — it maintains a connection for the duration of the call. This doesn't work on Vercel (serverless, no WebSockets). Options:

- **Fly.io** — supports WebSockets, easy deploy, free tier
- **Railway** — same, good DX
- **A VPS** (Hetzner, DigitalOcean) — full control
- **Cloudflare Workers with Durable Objects** — supports WebSockets at edge

The Next.js app could stay on Vercel for the UI and API, with the WebSocket voice server running separately. Or move everything to one of the above.

## Latency budget

For a natural-feeling conversation, the total round-trip should be under 2 seconds:

```
User stops speaking
  → STT finalizes transcript         ~300-500ms (Deepgram streaming)
  → Brain generates reply            ~500-1000ms (Groq/fast LLM)
  → TTS generates first audio chunk  ~200-500ms (ElevenLabs streaming)
  → Audio plays in browser           ~0ms (direct)
Total: ~1-2 seconds
```

Compare to the phone flow where Twilio adds overhead at every step (webhook round-trips, TwiML parsing, carrier latency). The browser channel can be noticeably faster.

## Streaming STT + TTS

The real unlock for low latency is streaming everything:

1. **Streaming STT** — Deepgram and Google STT v2 support WebSocket streaming. You get partial transcriptions as the user speaks, and a final result when they stop. No waiting for a complete utterance before processing.

2. **Streaming TTS** — ElevenLabs, Cartesia, and OpenAI TTS support streaming audio output. You start playing audio to the user before the full response is generated.

3. **LLM streaming** — Most LLMs support streaming token output. You can start TTS on the first sentence while the LLM is still generating the second.

Chained together: user stops speaking → STT final result → LLM starts streaming → first sentence goes to TTS → audio starts playing. The user hears a response before the LLM has even finished thinking.

## What would need to be built

1. **WebSocket server** — accepts connections, manages session lifecycle
2. **STTPort adapter** — real implementation (e.g., Deepgram WebSocket streaming)
3. **TTSPort adapter** — real implementation (e.g., ElevenLabs or OpenAI TTS)
4. **Browser UI component** — microphone capture, WebSocket connection, audio playback
5. **Audio encoding/decoding** — browser sends PCM or Opus, server needs to handle it

The `ConversationEngine`, `TranscriptService`, `BrainPort`, and `CallStorePort` all stay exactly as they are.

## Third-party options that simplify this

Instead of building the WebSocket + STT + TTS pipeline yourself, there are platforms that handle the real-time audio layer:

**LiveKit** — open-source WebRTC infrastructure. Has an "Agents" framework specifically for building voice AI. Handles the audio transport, you plug in your STT/TTS/LLM. Can self-host or use their cloud.

**Daily.co** — similar to LiveKit but fully managed. Has a voice AI toolkit. Simple JavaScript SDK for the browser side.

**Vapi** — fully managed voice AI platform. You provide the LLM, they handle telephony, STT, TTS, and the audio pipeline. Works for both phone and browser. Less control but much less to build.

**OpenAI Realtime API** — OpenAI's own voice-to-voice solution. Send audio in, get audio out. They handle STT, LLM, and TTS internally. Very simple but locks you into OpenAI for everything.

These trade control for speed-to-market. The ports architecture means you could start with one of these and swap to a custom pipeline later.

## Recommendation

**For the POC:** Don't build this yet. The phone channel is the differentiator for the job platform. Get that working end-to-end first.

**When to add it:** Once Bronius has a working conversation flow with a real LLM, adding a browser channel becomes a "nice demo" that's relatively quick to build. It also lets you test and iterate on conversations without burning Twilio minutes.

**Simplest path to browser voice:** LiveKit Agents or Daily.co. They handle the hard parts (WebSocket management, audio encoding, echo cancellation, VAD) and you plug in your existing `BrainPort`. Could be a few hundred lines of code.

**Full custom path:** WebSocket server + Deepgram streaming STT + ElevenLabs TTS + browser `getUserMedia()`. More work, full control, no platform dependency.

Either way, the core Bronius engine doesn't change. Just a new adapter.
