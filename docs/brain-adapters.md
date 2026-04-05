# BrainPort — LLM Provider Options & Adapter Guide

## How the abstraction works

All LLM logic is behind the `BrainPort` interface (`src/core/ports/brain.port.ts`):

```typescript
interface BrainPort {
  generateReply(context: ConversationContext): Promise<BrainReply>;
}

interface BrainReply {
  text: string;       // what the agent says
  shouldEnd: boolean;  // true = end the call
  reason?: string;     // optional explanation
}
```

The `ConversationEngine` calls `generateReply()` with the full conversation history and turn count. It doesn't know or care which LLM is behind it. To add a new provider, you implement this interface and register it in `provider-registry.ts`.

## Current adapters

| Adapter | Provider | Status |
|---------|----------|--------|
| `MockBrainAdapter` | None (canned replies) | Working, for dev/test |
| `OpenAIBrainAdapter` | OpenAI (GPT-4o-mini) | Implemented, needs API key |
| `MistralBrainAdapter` | Mistral (default `mistral-small-latest`) | Implemented, needs API key from [console.mistral.ai](https://console.mistral.ai) |

## Provider options

### Google Gemini

**Best free tier available.** No credit card required.

- Models: Gemini 2.5 Flash (fast, cheap), Gemini 2.5 Pro (smarter)
- Free limits: Flash at 10 RPM / 250 requests per day, Pro at 5 RPM / 100 per day
- API style: REST, similar to OpenAI's chat completions format
- SDK: `@google/generative-ai` npm package, or use raw `fetch`
- Latency: Good, Flash is very fast
- Best for: POC with zero cost

**Adapter implementation notes:**
- Base URL: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Auth: API key as query param (`?key=API_KEY`) — no OAuth needed
- Request format: `{ contents: [{ role, parts: [{ text }] }] }`
- Response: `response.candidates[0].content.parts[0].text`
- JSON mode: Set `generationConfig.responseMimeType` to `application/json`
- Env vars needed: `GOOGLE_AI_API_KEY`

### Anthropic (Claude)

**Best conversational quality.** Initial free credits for new accounts, then paid.

- Models: Claude 3.5 Haiku (fast/cheap), Claude 3.5 Sonnet (balanced), Claude 3.5 Opus (best)
- Free: Initial credit grant only, not an ongoing free tier
- API style: REST, different format from OpenAI but straightforward
- SDK: `@anthropic-ai/sdk` npm package, or use raw `fetch`
- Latency: Haiku is very fast, Sonnet is moderate
- Best for: Production quality conversations

**Adapter implementation notes:**
- Base URL: `https://api.anthropic.com/v1/messages`
- Auth: `x-api-key` header + `anthropic-version` header
- Request format: `{ model, system, messages: [{ role, content }], max_tokens }`
- System prompt is a top-level field, not a message
- Response: `response.content[0].text`
- No native JSON mode — instruct in system prompt and parse response
- Env vars needed: `ANTHROPIC_API_KEY`

### Groq

**Fastest inference.** Runs open-source models on custom LPU hardware. Free tier.

- Models: Llama 3.3 70B, Llama 4 Scout, Qwen, Mixtral
- Free limits: 30 RPM, 1,000 requests/day for 70B models
- API style: OpenAI-compatible (drop-in base URL swap)
- SDK: Use the `openai` npm package with a custom `baseURL`
- Latency: Extremely fast — sub-second for most requests
- Best for: Low-latency phone conversations on a free tier

**Adapter implementation notes:**
- Base URL: `https://api.groq.com/openai/v1`
- Auth: `Authorization: Bearer API_KEY`
- Request/response format: Identical to OpenAI chat completions
- JSON mode: `response_format: { type: "json_object" }` works
- Can reuse `OpenAIBrainAdapter` almost entirely — just change base URL and model name
- Env vars needed: `GROQ_API_KEY`

### Mistral

**Good European alternative.** Free experiment tier.

- Models: Mistral Small (fast), Mistral Medium, Mistral Large
- Free: Rate-limited experiment tier for testing
- API style: OpenAI-compatible
- SDK: `@mistralai/mistralai` or use `openai` package with custom base URL
- Latency: Good
- Best for: EU data residency requirements

**Adapter implementation notes:**
- Base URL: `https://api.mistral.ai/v1`
- Auth: `Authorization: Bearer API_KEY`
- Request/response: OpenAI-compatible
- JSON mode: Supported via `response_format`
- Can also reuse `OpenAIBrainAdapter` with base URL swap
- Env vars needed: `MISTRAL_API_KEY`

### DeepSeek

**Cheapest paid option.** 5M free tokens to start.

- Models: DeepSeek-V3 (general), DeepSeek-R1 (reasoning)
- Free: 5M token grant, then ~$0.14/M input tokens
- API style: OpenAI-compatible
- Latency: Moderate (slower than Groq)
- Best for: Cost-sensitive production use

**Adapter implementation notes:**
- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible, same adapter pattern as Groq/Mistral
- Env vars needed: `DEEPSEEK_API_KEY`

## How to add a new adapter

1. Create `src/adapters/{provider}-brain.adapter.ts`
2. Implement the `BrainPort` interface
3. The adapter receives `ConversationContext` with:
   - `turns` — full conversation history (speaker + text)
   - `turnCount` — number of human turns so far
   - `maxTurns` — configured limit
4. Return `{ text, shouldEnd, reason }`
5. Register in `src/core/modules/provider-registry.ts`:
   - Add the provider name to the `brainProvider` type
   - Add a case in `createProviders()` to instantiate your adapter
   - Read the API key from the env config

**Key design rules:**
- Keep responses short (1-3 sentences) — this is a phone call, not a chat
- Detect goodbye intent and set `shouldEnd: true`
- Handle near-max-turns by wrapping up the conversation
- Parse JSON from the LLM response (or instruct the model to return JSON)
- Catch parse failures and return a sensible fallback

## Recommendation for this POC

**Start with Groq.** It's free, fast (critical for phone latency), and OpenAI-compatible so the adapter is minimal. Use `llama-3.3-70b-versatile` for good conversational quality.

If you need better conversational nuance later, swap to Anthropic Claude.

## Provider-registry config pattern

The `BRAIN_PROVIDER` env var controls which adapter loads. Current values: `openai`, `mistral`, `mock`. Adding a new provider means adding its name here and mapping it to the adapter class:

```
BRAIN_PROVIDER=groq     # or: openai, mistral, anthropic, gemini, mock
GROQ_API_KEY=gsk_...    # provider-specific key
```
