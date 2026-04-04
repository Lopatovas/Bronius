# TTSPort — External TTS Integration via Twilio

## The problem

Twilio's built-in `<Say>` uses Amazon Polly voices. They're functional but robotic — not the quality you'd want for a convincing phone agent.

## How to use external TTS with Twilio

The approach is simple: replace `<Say>text</Say>` with `<Play>url</Play>`. Twilio fetches the audio from your URL and plays it to the caller.

### Architecture

```
Current flow:
  Call Controller → VoiceAction { type: 'say', text: 'Hello' }
  TwiML builder  → <Say voice="Polly.Amy">Hello</Say>
  Twilio         → speaks with Polly

Upgraded flow:
  Call Controller → VoiceAction { type: 'say', text: 'Hello' }
  TwiML builder  → <Play>https://your-app.com/api/tts?text=Hello&amp;voice=default</Play>
  Twilio         → fetches audio from your endpoint → plays it
  Your endpoint  → calls TTSPort.synthesize('Hello') → streams audio back
```

### What changes in code

1. Add a `GET /api/v1/tts` endpoint that:
   - Takes `text` and optional `voice` as query params
   - Calls the `TTSPort.synthesize(text)` method
   - Returns audio as `audio/mpeg` or `audio/wav`

2. Modify `buildTwiml()` in the Twilio adapter:
   - When a TTS provider is configured, emit `<Play>` instead of `<Say>`
   - Point to your `/api/v1/tts` endpoint with the text URL-encoded

3. Implement a TTS adapter behind the existing `TTSPort` interface:
   ```typescript
   interface TTSPort {
     synthesize(text: string): Promise<TTSResult>;
   }
   ```

### Latency consideration

This adds a round-trip: Twilio calls your server, your server calls the TTS API, generates audio, streams it back to Twilio, then Twilio plays it. Expect 1-3 seconds of added delay per utterance depending on the TTS provider.

To reduce this:
- Use a TTS provider with streaming support (start sending audio before the full text is processed)
- Cache common phrases (greeting, goodbye)
- Keep responses short (which is good phone etiquette anyway)

## TTS provider options

### OpenAI TTS

**Good quality, simple API.** Already have the SDK if using OpenAI for brain.

- Voices: alloy, echo, fable, onyx, nova, shimmer
- Models: `tts-1` (fast, lower quality), `tts-1-hd` (slower, better quality)
- Latency: `tts-1` is optimized for real-time, ~500ms to first byte
- Output: mp3, opus, aac, flac, wav, pcm
- Pricing: $15/M characters (tts-1), $30/M characters (tts-1-hd)
- No free tier, but cheap at phone-conversation volumes

**Implementation notes:**
- Endpoint: `POST https://api.openai.com/v1/audio/speech`
- Body: `{ model: "tts-1", voice: "nova", input: "text" }`
- Returns raw audio bytes — stream directly to Twilio
- Use `tts-1` not `tts-1-hd` for phone calls — the quality difference is inaudible over telephony audio
- Env vars: `OPENAI_API_KEY` (same key as brain if using OpenAI)

### ElevenLabs

**Best voice quality.** Most natural-sounding voices available.

- Voices: Large library of pre-made voices + voice cloning
- Free tier: 10,000 characters/month (enough for testing, ~20 short calls)
- Latency: Streaming support, ~300ms to first byte with Turbo v2.5
- Output: mp3, pcm, wav
- Pricing: Starts at $5/month for 30K characters

**Implementation notes:**
- Endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Auth: `xi-api-key` header
- Body: `{ text, model_id: "eleven_turbo_v2_5" }`
- Returns audio stream
- Use `eleven_turbo_v2_5` model for lowest latency
- Env vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

### Cartesia

**Built for real-time.** Designed specifically for voice AI applications.

- Ultra-low latency: ~90ms to first byte
- Streaming: word-level streaming supported
- Free tier: Limited free usage for development
- Best suited for Media Streams approach (see below)

**Implementation notes:**
- REST API and WebSocket API available
- For `<Play>` approach, use REST endpoint
- Env vars: `CARTESIA_API_KEY`

### Deepgram Aura

**TTS from an STT company.** Good quality, competitive latency.

- Latency: ~250ms to first byte
- Free tier: $200 in free credits
- Output: mp3, wav, pcm
- Simple REST API

**Implementation notes:**
- Endpoint: `POST https://api.deepgram.com/v1/speak`
- Auth: `Authorization: Token API_KEY`
- Body: `{ text }`
- Env vars: `DEEPGRAM_API_KEY`

### Google Cloud TTS

**Wide language support.** Good for multilingual agents.

- Voices: Standard, WaveNet, Neural2, Studio
- Free tier: 1M standard characters/month, 1M WaveNet characters/month (first 90 days)
- Latency: Moderate (~500ms)
- Output: mp3, wav, ogg

**Implementation notes:**
- Requires Google Cloud project + service account
- More complex auth (OAuth/service account key)
- Env vars: `GOOGLE_APPLICATION_CREDENTIALS` (path to service account JSON)

## Comparison for phone agent use

| Provider | Quality | Latency | Free tier | Complexity |
|----------|---------|---------|-----------|------------|
| Twilio `<Say>` (current) | Okay | None (built-in) | Included | None |
| OpenAI TTS | Good | ~500ms | No | Low |
| ElevenLabs | Excellent | ~300ms | 10K chars/mo | Low |
| Cartesia | Very good | ~90ms | Limited | Medium |
| Deepgram Aura | Good | ~250ms | $200 credit | Low |
| Google Cloud | Good | ~500ms | 1M chars/mo | High |

## Beyond `<Play>`: Twilio Media Streams

For the lowest latency, the `<Play>` approach has a fundamental limit — Twilio has to fetch the entire audio (or wait for streaming to buffer enough) before it starts playing.

The alternative is **Twilio Media Streams** using `<Connect><Stream>`:

```xml
<Response>
  <Connect>
    <Stream url="wss://your-server.com/media-stream" />
  </Connect>
</Response>
```

This opens a bidirectional WebSocket. You receive raw caller audio, run your own STT, call the brain, generate TTS, and stream audio bytes back — all in real-time. Latency can be sub-second for the full loop.

**Trade-offs:**
- Requires a persistent WebSocket server (not compatible with Vercel serverless)
- Replaces the entire `<Gather>` → webhook → TwiML loop
- Significantly more complex
- Needs a host like Fly.io, Railway, or a VPS

This is the v2 architecture for production-grade voice quality.

## Recommendation for this POC

**If staying with `<Play>` approach:** Use OpenAI TTS (`tts-1` model) if you're already using OpenAI, or ElevenLabs if you want the best voice quality. Both are simple REST calls.

**If Twilio `<Say>` is acceptable for now:** Keep it. Focus on getting the conversation loop solid first. TTS quality is a polish step — swap it out later without changing any other code thanks to the `TTSPort` abstraction.
