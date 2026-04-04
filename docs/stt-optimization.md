# STT & Gather Optimization

## Current setup

Bronius uses Twilio's `<Gather input="speech">` for speech-to-text. Twilio handles the audio capture and transcription internally, returning the result as `SpeechResult` in the gather callback. The current `<Gather>` configuration:

```xml
<Gather input="speech" speechTimeout="auto" timeout="5"
        action="/api/v1/telephony/gather?callSessionId=..." method="POST"
        actionOnEmptyResult="true"/>
```

This uses Twilio's default STT model, which is Google STT v1 with the `default` speech model. It works, but accuracy on natural conversation is mediocre.

## Quick wins: Twilio Gather attributes

These require zero new services — just change the attributes on the `<Gather>` tag.

### 1. Use a better speech model

The biggest single improvement. Change the `speechModel` attribute:

| Model | Accuracy | Latency | Notes |
|-------|----------|---------|-------|
| `default` (current) | Okay | Fast | Google STT v1, basic |
| `phone_call` | Better | Fast | Optimized for telephony audio |
| `experimental_conversations` | Good | Moderate | Better at natural conversation |
| `experimental_utterances` | Good | Moderate | Better at short utterances |
| `deepgram_nova-2` | Very good | Fast | Deepgram's model via Twilio, best accuracy |

**Recommendation:** `phone_call` for a safe improvement, or `deepgram_nova-2` for best accuracy. Note that `deepgram_nova-2` may have different pricing on Twilio.

**Important:** When using a specific `speechModel`, set `speechTimeout` to a number (e.g., `"3"`) instead of `"auto"`. Twilio docs state that `auto` may not work correctly with all speech models.

### 2. Set language explicitly

Add `language="en-US"` (or the appropriate language). The default is `en-US` but being explicit helps, and other languages need this set correctly.

### 3. Add hints

The `hints` attribute tells the speech recognizer which words/phrases to expect. This significantly improves recognition of names, domain-specific terms, and uncommon words.

```xml
<Gather hints="Bronius, pricing, appointment, schedule, callback"
        input="speech" .../>
```

Up to 500 entries, each up to 100 characters. Separate with commas.

For a phone agent, good hints include:
- The agent's name and company name
- Common intents: "schedule", "cancel", "pricing", "help"
- Product names or jargon specific to the use case

### 4. Tune timeouts

| Attribute | Current | Recommendation | Why |
|-----------|---------|---------------|-----|
| `timeout` | `5` | `5` | Seconds to wait for any speech to start. 5 is fine. |
| `speechTimeout` | `auto` | `3` | Seconds of silence after speech stops before finalizing. `auto` can be unpredictable. `3` gives natural pauses without cutting off. |

### 5. Profanity filter

Currently defaults to `true`. For a business call, this is fine. For use cases where you need verbatim transcription, set `profanityFilter="false"`.

### Optimized Gather example

Applying all the quick wins:

```xml
<Gather input="speech"
        speechModel="phone_call"
        language="en-US"
        speechTimeout="3"
        timeout="5"
        hints="Bronius, pricing, schedule, appointment, cancel, callback"
        action="/api/v1/telephony/gather?callSessionId=..."
        method="POST"
        actionOnEmptyResult="true"/>
```

### Where to make these changes

All `<Gather>` attributes are controlled through the `VoiceAction` type and the `gatherOptions` object in `src/core/ports/telephony.port.ts`. The `buildTwiml()` function in the Twilio adapter translates them to XML attributes.

To add new attributes:
1. Add the field to `gatherOptions` in the `VoiceAction` interface
2. Emit the attribute in `buildTwiml()` in the Twilio adapter
3. Set the value in the `CallController` where gather actions are created

## Beyond Twilio Gather: External STT

If Twilio's built-in STT is still not good enough after tuning, the next step is using an external STT provider. This requires **Twilio Media Streams** — a fundamentally different architecture.

### How Media Streams works

Instead of `<Gather>`, you use:

```xml
<Response>
  <Connect>
    <Stream url="wss://your-server.com/media-stream" />
  </Connect>
</Response>
```

Twilio opens a WebSocket and streams raw audio (mulaw 8kHz) from the caller to your server. You pipe this audio to an STT provider, get text back, and can respond by streaming TTS audio back over the same WebSocket.

### External STT providers

| Provider | Model | Accuracy | Latency | Free tier |
|----------|-------|----------|---------|-----------|
| Deepgram | nova-2 | Excellent | ~300ms | $200 credit |
| OpenAI | Whisper | Very good | ~1-2s | No (but cheap) |
| Google STT v2 | chirp | Very good | ~500ms | 60 min/month free |
| AssemblyAI | Universal-2 | Excellent | ~500ms | Free tier available |

**Deepgram** is the top choice for real-time phone audio:
- Built for streaming audio
- WebSocket API for real-time transcription
- Very accurate on telephony audio (8kHz mulaw)
- Interim results (partial transcriptions as the person speaks)
- Endpointing (detects when someone stops talking)

### Trade-offs of external STT

| | Twilio Gather (current) | External STT via Media Streams |
|---|---|---|
| Setup complexity | None — built in | High — WebSocket server + STT integration |
| Hosting | Works on Vercel | Needs persistent server (Fly.io, Railway, VPS) |
| Accuracy | Moderate | High |
| Latency | Low (STT is internal to Twilio) | Depends on provider |
| Cost | Included in Twilio voice pricing | Additional STT charges |
| Control | Limited to Gather attributes | Full control over audio pipeline |

### STTPort interface

The codebase already has a placeholder `STTPort` interface:

```typescript
interface STTPort {
  transcribe(audioUrl: string): Promise<STTResult>;
}
```

For the Media Streams approach, this interface would change to handle streaming audio rather than a single audio URL — likely a WebSocket-based pattern where audio chunks flow in and transcription results flow out.

## Recommendation

**Immediate (no code change):** Update `<Gather>` attributes to use `speechModel="phone_call"`, explicit `language`, and relevant `hints`. This is a config-level change that meaningfully improves accuracy.

**Short-term:** If `phone_call` model isn't sufficient, try `deepgram_nova-2` in the `speechModel` attribute. This uses Deepgram through Twilio's infrastructure — better accuracy without managing a separate STT integration.

**Long-term (v2):** Move to Media Streams with Deepgram for real-time bidirectional audio. This is the production architecture for a high-quality voice agent, but it's a significant infrastructure change.
