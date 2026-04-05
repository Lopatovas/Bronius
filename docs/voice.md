# Voice quality and TTS

## The problem

Twilio’s built-in `<Say>` path (historically Amazon Polly–backed in many accounts) is **reliable and easy**, but it often sounds **flat, robotic, or “IVR-like”** compared to modern neural voices used in assistants and media.

For a **demo**, voice quality is disproportionately important: listeners judge the system before they parse the words.

## Direction: keep Twilio for call control, upgrade the **audio source**

Bronius already documents the pattern: **do not rely on `<Say>` for final quality**. Instead, **generate audio elsewhere** and play it in the call with `<Play url="…" />`. See [TTSPort — External TTS Integration](./tts-integration.md) for the architecture sketch (your app exposes audio URLs; Twilio fetches and plays).

## Proposals

### 1. Neural TTS APIs (fastest path to “human-ish”)

Integrate a **neural TTS** provider behind `TTSPort` and route TwiML to `<Play>`:

| Style | Examples | Notes |
|--------|----------|--------|
| Very natural, configurable | ElevenLabs, Cartesia, PlayHT | Often best “wow” for demos; watch cost and latency. |
| Cloud enterprise | Azure Neural / Google Cloud TTS | Solid quality, good SLAs, voice variety. |
| Open weights / self-host | Coqui XTTS, etc. | More ops burden; interesting for lock-in or air-gapped demos. |

**Selection tips:**

- Prefer **low-latency** modes or models marketed for **real-time** or **conversational** use.
- Pick **one default voice** per demo and stick to it (consistency matters more than exotic voices).
- Test on **phone bandwidth** (narrowband); some providers expose telephony-oriented codecs or sample rates.

### 2. Stay on Polly but use **Neural** engines

If you want minimal vendor sprawl: Amazon Polly **Neural** voices are a step up from standard Polly on `<Say>`, but you still need a path that uses Polly **Neural** explicitly (often via `<Say>` voice/engine parameters or via your own synthesis + `<Play>`). Verify what Twilio exposes for your account.

**Trade-off:** Better than classic robotic, usually not as expressive as top-tier neural APIs.

### 3. Voice cloning / brand voice (later)

For a **specific** demo or customer, some providers allow **custom voices** (cloned or licensed). Useful for marketing; adds **legal/compliance** and **review** overhead.

### 4. Latency vs quality

More human voices sometimes cost **more milliseconds** per sentence. For a phone agent:

- Prefer providers with **streaming synthesis** or **chunk-friendly** APIs so you can start playback before the full paragraph is done (pairs with [latency](./latency.md) work).

### 5. Demo checklist

- One **primary language** and locale (e.g. `en-US`) configured consistently in STT, LLM, and TTS.
- **Prosody**: slightly slower than chat UI defaults; phone audio is lossy.
- **Fallback**: if TTS fails, fall back to `<Say>` so the call never goes silent.

---

**Suggested priority:** Implement `TTSPort` + `<Play>` (per [tts-integration](./tts-integration.md)), pick **one** neural provider for the demo, tune a single voice, then optimize latency.
