# Domain context and the brain

## The problem

A generic assistant will **answer anything**, which undermines a **scenario-based demo** (e.g. “book a table at a restaurant”). You want the agent to:

- Stay **on topic** (restaurant booking, hours, party size, date/time).
- Use a **consistent persona** (tone, name of the “restaurant,” policies).
- **Refuse or redirect** off-domain requests without sounding broken.

This is mostly **prompting + orchestration**; “fine-tuning” in the ML sense is optional and usually **later**.

## How Bronius fits today

The LLM is behind `BrainPort.generateReply(context)` (see [Brain adapters](./brain-adapters.md)). The `ConversationContext` carries history and metadata; the adapter builds the request to OpenAI, Mistral, etc.

**Implication:** Domain behavior is configured by **what you put in the system prompt and tools**, not by replacing telephony.

## Proposals

### 1. System prompt + demo persona (first step)

Add a **fixed system message** (or equivalent in your adapter) that defines:

- **Role:** “You are the phone assistant for [Restaurant Name].”
- **Goals:** e.g. capture party size, date, time, dietary notes; confirm booking.
- **Constraints:** short spoken replies; no markdown; ask one clarifying question at a time.
- **Off-topic:** polite redirect: “I can only help with reservations…”

Store the text in **config** (environment variable or small JSON) so you can swap demos without code changes.

**Trade-off:** Long prompts add tokens and a bit of latency; keep them tight.

### 2. Structured output for “demo reliability”

For booking flows, ask the model to return **JSON** (or use provider **JSON mode**) with fields like `say` (spoken line), `slot_updates`, `should_confirm`, `should_end`. Your engine maps that to voice actions.

**Benefit:** Fewer rambling answers; easier to **log** what was “booked” in the UI.

**Trade-off:** Slightly more code in `ConversationEngine` / adapter.

### 3. Few-shot examples in the prompt

Include 2–4 **mini dialogues** in the system or developer message showing ideal turns (user mumbles time → agent confirms in one sentence).

**Benefit:** Large behavior shift without fine-tuning.

### 4. Retrieval (RAG) for real menus / FAQs

If the demo must cite **real** dishes, prices, or policies:

- Store chunks in a **vector store** or simple file.
- On each turn (or on user questions), retrieve top-k chunks and inject into the prompt as **context**.

**Trade-off:** Extra latency and infra; use small corpora for demos.

### 5. Tools / function calling (booking as an API)

Model calls **functions** such as `check_availability(date, party_size)` or `create_booking(…)`. You implement stubs or a real backend.

**Benefit:** Ground truth for “success”; great for investor demos with a **fake** calendar API.

### 6. Actual fine-tuning (usually not first)

**Supervised fine-tuning** on conversation logs can improve style and adherence, but requires **data**, evaluation, and iteration. Reasonable **after** prompts + tools work.

**When it helps:** Brand-specific phrasing, regulated wording, or very narrow domains with lots of logs.

### 7. Evaluation

For a domain demo, define **10–20 scripted user lines** and score: stayed on domain, captured slots, no hallucinated times. Re-run when you change prompts or models.

---

**Suggested priority:** (1) config-driven system prompt + persona, (2) shorter replies and slot-gathering script, (3) JSON or tools if you need reliability, (4) RAG only if content must be factual from documents.
