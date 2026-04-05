# Latency and responsiveness

## What you are feeling

A 2–3 second gap after the user **stops speaking** usually is not a single bug. It is the **sum** of:

1. **End-of-utterance detection** — Twilio `<Gather>` (or similar) deciding the user finished talking (`speechTimeout`, model behavior, noise).
2. **STT** — transcription latency if audio is sent to a model.
3. **HTTP round-trips** — webhook to your app, TwiML response, optional follow-up requests.
4. **LLM time to first token** — full `generateReply()` waiting for a complete string before TTS can start.
5. **TTS** — synthesizing the reply (especially if you generate the whole reply first, then play).
6. **Playback** — Twilio fetching `<Play>` audio or buffering `<Say>`.

Improving “latency” means attacking **the largest slices** for your actual deployment, in measurement order.

## Proposals (from low-effort to structural)

### 1. Measure and label each segment

Before changing architecture, add **structured timing** (or temporary logging) around: gather callback received → brain start → brain end → TwiML returned → user hears audio. Without this, you risk optimizing the wrong layer.

**Outcome:** A simple waterfall view of where the 2–3 seconds actually go.

### 2. Tune STT / Gather (often cheap wins)

Twilio’s speech settings strongly affect **how long the platform waits** before it fires the gather callback. See [STT & Gather optimization](./stt-optimization.md): `speechModel`, explicit `speechTimeout` (not always `auto` with every model), `language`, hints, and barge-in settings.

**Trade-off:** Shorter timeouts feel snappier but increase **false end-of-utterance** (cutting the user off).

### 3. Use a faster or streaming LLM

If the brain is a large model with high latency:

- Switch to a **smaller / “flash”** tier for voice (e.g. models optimized for low latency).
- Keep **temperature** moderate and **max tokens** tight for spoken replies.

**Trade-off:** Less “literary” answers; usually acceptable for phone scripts.

### 4. Stream the LLM and start TTS early

Today, many stacks wait for the **full** assistant message before synthesis. Better:

- **Stream** tokens from the provider.
- **Chunk by sentence or clause** and enqueue TTS for the first chunk while the rest generates.

This requires code changes: `BrainPort` may need a streaming variant or a callback that yields partial text, and the telephony layer must support **multiple short plays** or a streaming audio source (depending on Twilio constraints).

**Trade-off:** More complex state machine; must handle interruption (barge-in) cleanly.

### 5. Overlap work where possible

Where the architecture allows:

- Start **intent classification** or **tool routing** on partial transcripts (if you move to streaming STT).
- **Prefetch** static prompts or RAG context so the model request payload is minimal.

### 6. Consider a different media path for demos (optional)

PSTN + Twilio adds inherent delay. For **live demos** only, a **WebRTC** or browser-based path can reduce perceived latency (see [WebRTC channel](./webrtc-channel.md) if you add that track). PSTN remains the “real” telephony story.

### 7. Shorter default replies

Product-level: enforce a **max spoken length** (e.g. two sentences unless the user asked for detail). Less text → less TTS → faster playback.

---

**Suggested priority (technical, within this track):** (1) measure, (2) Gather/STT tuning, (3) faster model + shorter answers, (4) streaming brain + chunked TTS when you need sub-second perceived response.

**When to do this track in the overall demo plan:** Treat latency as the **last** pass once domain context and the **final** TTS path (`<Play>` + external synthesis) are in place — that stack adds hops and changes where time is spent, so you avoid optimizing twice. See ordering in [fine-tuning](./fine-tuning.md#suggested-order-of-work).
