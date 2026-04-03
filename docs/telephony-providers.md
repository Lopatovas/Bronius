# TelephonyPort — Phone Channel Provider Options

## How the abstraction works

All telephony logic is behind the `TelephonyPort` interface (`src/core/ports/telephony.port.ts`):

```typescript
interface TelephonyPort {
  placeCall(params: PlaceCallParams): Promise<PlaceCallResult>;
  hangupCall(providerCallId: string): Promise<void>;
  normalizeProviderEvent(rawPayload: Record<string, string>): NormalizedProviderEvent;
  respondWithVoiceActions(actions: VoiceAction[]): string;
  validateWebhookSignature(signature: string, url: string, params: Record<string, string>): boolean;
}
```

The core modules (`CallController`, `ConversationEngine`) never interact with Twilio directly. They work with canonical types: `VoiceAction`, `NormalizedProviderEvent`, `CallStatus`. The adapter translates between these and the provider's API.

To swap providers, you implement this interface and register the adapter in `provider-registry.ts`. Nothing else changes.

## Current adapter

| Adapter | Provider | Status |
|---------|----------|--------|
| `TwilioTelephonyAdapter` | Twilio | Working, production-ready |

Uses raw `fetch` against Twilio REST API with API Key auth. Generates TwiML XML by hand. No SDK dependency.

## What an adapter needs to do

Every telephony provider follows roughly the same pattern:

1. **Place a call** — REST API call with from/to numbers and a webhook URL for call instructions
2. **Receive status callbacks** — provider POSTs to your webhook when call state changes (ringing, answered, completed, failed)
3. **Return call instructions** — when the call connects, provider fetches instructions from your webhook (what to say, when to listen, when to hang up)
4. **Capture speech** — provider transcribes caller speech and POSTs the result to your webhook
5. **Hang up** — REST API call to end the call

The adapter translates each provider's specific API format, webhook payload format, and call instruction format into the canonical `TelephonyPort` interface.

## Provider options

### Vonage (formerly Nexmo)

**Closest Twilio alternative.** Very similar developer experience.

- Call control: NCCO (Nexmo Call Control Objects) — JSON-based, not XML
- Outbound calls: `POST https://api.nexmo.com/v1/calls`
- Webhooks: event webhooks for status changes, answer webhooks for instructions
- STT: Built-in speech recognition via `input` action in NCCO
- TTS: Built-in via `talk` action in NCCO
- Pricing: Competitive with Twilio, sometimes cheaper internationally
- Free trial: Credit-based trial account

**Adapter implementation notes:**
- Auth: JWT-based (application ID + private key) or API key + secret
- Call instructions format (NCCO):
  ```json
  [
    { "action": "talk", "text": "Hello!", "voiceName": "Amy" },
    { "action": "input", "type": ["speech"], "speech": { "language": "en-US" } }
  ]
  ```
- Webhook payloads are JSON (not form-encoded like Twilio)
- Status values: `started`, `ringing`, `answered`, `completed`, `failed`, `busy`, `cancelled`
- Map `respondWithVoiceActions()` to return JSON instead of XML
- Env vars needed: `VONAGE_APPLICATION_ID`, `VONAGE_PRIVATE_KEY`, `VONAGE_PHONE_NUMBER`

**Key differences from Twilio:**
- NCCO is JSON, TwiML is XML — cleaner to generate
- Speech input results come via a webhook, similar to Twilio Gather
- Signature validation uses JWT verification instead of HMAC-SHA1

### Plivo

**Budget-friendly Twilio competitor.** Same model, lower prices.

- Call control: Plivo XML (very similar to TwiML)
- Outbound calls: `POST https://api.plivo.com/v1/Account/{auth_id}/Call/`
- Webhooks: answer URL and status callback URL
- STT: Built-in via `<GetInput>` element (equivalent to `<Gather>`)
- TTS: Built-in via `<Speak>` element
- Pricing: Generally 20-40% cheaper than Twilio
- Free trial: Credit-based

**Adapter implementation notes:**
- Auth: Basic auth with Auth ID + Auth Token
- Call instructions format (Plivo XML):
  ```xml
  <Response>
    <Speak voice="Polly.Amy">Hello!</Speak>
    <GetInput action="https://..." inputType="speech" />
  </Response>
  ```
- Very similar to TwiML — `<Speak>` instead of `<Say>`, `<GetInput>` instead of `<Gather>`
- Could likely share most of the TwiML builder logic with minor tag name changes
- Status values: `ring`, `answer`, `hangup`, `cancel`, `busy`, `timeout`, `machine`
- Env vars needed: `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_PHONE_NUMBER`

**Key differences from Twilio:**
- XML elements have different names but same structure
- `<GetInput>` instead of `<Gather>`, `<Speak>` instead of `<Say>`
- Slightly different status callback payload fields
- Lower per-minute rates, especially for international calls

### Telnyx

**Developer-focused, modern API.** JSON-based call control, no XML.

- Call control: TEL Commands — JSON sent via REST API (not returned from webhooks)
- Outbound calls: `POST https://api.telnyx.com/v2/calls`
- Webhooks: event-driven, all state changes delivered as webhook events
- STT: Built-in via `gather` command or Media Streams
- TTS: Built-in via `speak` command
- Pricing: Very competitive, owns their own network infrastructure
- Free trial: Credit-based

**Adapter implementation notes:**
- Auth: API key in `Authorization: Bearer` header
- Call control is imperative, not declarative — you send commands to an active call rather than returning instructions:
  ```
  POST /v2/calls/{call_id}/actions/speak
  { "payload": "Hello!", "voice": "female", "language": "en-US" }

  POST /v2/calls/{call_id}/actions/gather
  { "minimum_digits": 1, "valid_digits": "0123456789" }
  ```
- This is a fundamentally different model from TwiML/NCCO — instead of returning call instructions via webhook response, you make API calls to control the call
- Status values: `call.initiated`, `call.answered`, `call.hangup`, `call.machine.detection.ended`
- The `respondWithVoiceActions()` method would need to be rethought — instead of returning a document, it would fire API calls
- Env vars needed: `TELNYX_API_KEY`, `TELNYX_PHONE_NUMBER`, `TELNYX_CONNECTION_ID`

**Key differences from Twilio:**
- Imperative call control (send commands) vs declarative (return document)
- JSON everywhere, no XML
- Built-in AMD (answering machine detection)
- Owns their network — can be cheaper and lower latency
- The adapter pattern still works, but `respondWithVoiceActions()` would call APIs instead of returning a string

### Sinch

**Strong in Europe.** Good international SMS and voice coverage.

- Call control: SVAML (Sinch Voice Application Markup Language) — JSON-based
- Outbound calls: REST API via Sinch Voice API
- Webhooks: ICE (Incoming Call Event), ACE (Answered Call Event), DiCE (Disconnected Call Event)
- STT: Limited built-in, better with external integration
- TTS: Built-in via `tts` instruction
- Pricing: Competitive for European numbers and routes

**Adapter implementation notes:**
- Auth: Application key + secret, signed requests
- Call instructions format (SVAML):
  ```json
  {
    "instructions": [
      { "name": "say", "text": "Hello!", "locale": "en-US" }
    ],
    "action": {
      "name": "continue"
    }
  }
  ```
- Webhook model: respond to ICE with SVAML instructions
- Env vars needed: `SINCH_APP_KEY`, `SINCH_APP_SECRET`, `SINCH_PHONE_NUMBER`

**Key differences from Twilio:**
- Webhook event model: ICE/ACE/DiCE instead of status callbacks
- SVAML is JSON with a different structure than NCCO
- Stronger European presence and compliance
- More complex authentication (signed requests)

### Bandwidth

**US carrier-grade.** Owns their own telecom network in the US.

- Call control: BXML (Bandwidth XML) — similar to TwiML
- Outbound calls: `POST /api/v2/accounts/{accountId}/calls`
- Webhooks: answer callback and status callbacks
- STT: Built-in via `<Gather>` element
- TTS: Built-in via `<SpeakSentence>` element
- Pricing: Very competitive at scale, especially US domestic
- Free trial: Available with number provisioning

**Adapter implementation notes:**
- Auth: Basic auth with API username + password
- Call instructions format (BXML):
  ```xml
  <Response>
    <SpeakSentence voice="julie">Hello!</SpeakSentence>
    <Gather gatherUrl="https://..." speechTimeout="3">
      <SpeakSentence>Please speak.</SpeakSentence>
    </Gather>
  </Response>
  ```
- Very close to TwiML — `<SpeakSentence>` instead of `<Say>`, same `<Gather>` element
- Status values: `initiated`, `ringing`, `answered`, `completed`, `disconnected`
- Env vars needed: `BANDWIDTH_ACCOUNT_ID`, `BANDWIDTH_USERNAME`, `BANDWIDTH_PASSWORD`, `BANDWIDTH_PHONE_NUMBER`, `BANDWIDTH_APPLICATION_ID`

**Key differences from Twilio:**
- Owns US network — potential latency and reliability advantages domestically
- BXML is similar enough to TwiML that the adapter could share builder logic
- Less international coverage than Twilio
- Better suited for high-volume US calling

## Comparison

| Provider | Call Control Format | STT Built-in | Pricing | Best For |
|----------|-------------------|--------------|---------|----------|
| Twilio (current) | TwiML (XML) | Yes (Gather) | $$$ | General purpose, best docs |
| Vonage | NCCO (JSON) | Yes (input) | $$ | International calls |
| Plivo | Plivo XML | Yes (GetInput) | $$ | Budget Twilio replacement |
| Telnyx | REST commands (JSON) | Yes (gather) | $$ | Modern API, own network |
| Sinch | SVAML (JSON) | Limited | $$ | European market |
| Bandwidth | BXML (XML) | Yes (Gather) | $ at scale | US high-volume |

## How to add a new telephony adapter

1. Create `src/adapters/{provider}-telephony.adapter.ts`
2. Implement the `TelephonyPort` interface:
   - `placeCall()` — call the provider's REST API to initiate an outbound call, return the provider's call ID
   - `hangupCall()` — call the provider's API to end the call
   - `normalizeProviderEvent()` — map the provider's webhook payload to `NormalizedProviderEvent` (ringing, answered, completed, failed, etc.)
   - `respondWithVoiceActions()` — translate `VoiceAction[]` into the provider's call instruction format (XML, JSON, or API calls)
   - `validateWebhookSignature()` — verify webhook authenticity using the provider's signing method
3. Register in `provider-registry.ts`:
   - Add a config option for the telephony provider
   - Instantiate the adapter based on env config
4. Add provider-specific webhook routes if the URL structure differs

**Key design rules:**
- Never leak provider-specific types into core modules
- Map all statuses to the canonical `NormalizedProviderEvent` types
- All voice actions use the generic `VoiceAction` type — the adapter translates
- Keep credentials server-side only

## Recommendation

**Stay with Twilio for now.** It has the best documentation, widest community support, and you already have it working. The reasons to switch would be:

- **Cost** — if call volume grows, Plivo or Bandwidth could save 20-40%
- **International coverage** — Vonage or Sinch for European numbers
- **Modern API preference** — Telnyx if you want JSON-based imperative control
- **US scale** — Bandwidth if you're doing high-volume US domestic calling

The `TelephonyPort` abstraction means you can make this switch later without touching any core logic.
