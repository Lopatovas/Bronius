# Fine-tuning the Bronius demo

The current stack proves the **happy path**: a PSTN call connects, speech is recognized, the brain replies, and audio is played back. For a credible **demo** (not just a technical POC), three gaps show up in real calls:

| Area | Symptom | Why it matters |
|------|---------|----------------|
| **Latency** | Roughly 2–3 seconds (or more) before the caller hears the agent after they stop speaking | Conversation feels sluggish; people talk over each other or assume a dropped call. |
| **Voice** | Twilio’s default `<Say>` / Polly voices sound robotic | First impression of “AI phone agent” is negative before content even matters. |
| **Context** | Generic assistant behavior | A demo should show a **defined scenario** (e.g. restaurant booking) so stakeholders see intent, slots, and guardrails. |

This folder treats these as **product/engineering tracks**, not one-off tweaks. Each track has a dedicated note with **concrete options** and trade-offs:

- [Latency and responsiveness](./latency.md) — where delay comes from and how to shrink it end-to-end.
- [Voice quality and TTS](./voice.md) — moving beyond built-in Twilio speech to more natural audio.
- [Domain context and the brain](./domain-context.md) — steering the LLM toward a fixed domain without rewriting the whole stack.

Related existing docs: [STT & Gather optimization](./stt-optimization.md), [TTS integration](./tts-integration.md), [Brain adapters](./brain-adapters.md).

## Suggested order of work

1. **Domain / context** — Lock the demo scenario (persona, scope, shorter on-topic replies). Cheap to change, defines what “success” means.
2. **Voice** — Add a neural TTS path (`<Play>` + your endpoint) so the agent sounds credible. Expect this to add **some** latency versus built-in `<Say>` (extra hop: synthesize → fetch → play).
3. **Latency** — Optimize end-to-end delay **after** the audio pipeline is what you intend to ship. Measuring and tuning earlier is still fine for baselines, but the last pass should assume the **final** stack (including external TTS), so you are not re-tuning twice.
