# AI Project Configurator

An LLM-powered feature that reads project documents (tender, scope of work, project description) and pre-configures the seismic acquisition project by generating a config.json.

## Vision

The user uploads project documents, the AI analyses them, asks clarifying questions, and produces a pre-filled config.json. The user then reviews and adjusts through the existing webapp forms.

## Architecture

### Approach: Claude API with Tool Use

Call the Claude API from the ocfa/FastAPI backend. Claude receives:

- **System prompt**: domain knowledge about seismic acquisition (crew composition, parameter ranges, terminology, conventions, decision trees)
- **Tools**: structured functions mapped to config.json schema sections
- **User documents**: uploaded PDFs/text via Claude's native PDF support

### Flow

```
User uploads documents (tender, SOW, etc.)
  -> Backend sends docs + system prompt + tools to Claude API
  -> Claude extracts what it can, calls tools to build config
  -> Claude asks clarifying questions for ambiguous/missing params
  -> User answers in chat UI
  -> Claude refines config
  -> Validation against business rules
  -> Final config.json written to project
```

## Components to Build

### 1. Domain Knowledge Document (System Prompt)

The "seismic crew bible" — a comprehensive reference covering:

- What parameters define a seismic crew (sources, receivers, layout geometry, etc.)
- Valid ranges and constraints for each parameter
- How tender documents typically describe these (terminology mapping)
- Common defaults and industry conventions
- Decision trees (e.g., "if marine survey -> these params matter; if land -> these others")

This is the competitive moat. Iterate by testing against real tenders manually first.

### 2. Tool Definitions from config.json Schema

Each config section becomes a tool. Example:

```python
tools = [
    {
        "name": "set_survey_parameters",
        "description": "Set the survey area and geometry parameters",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_type": {"enum": ["2D", "3D", "4D"]},
                "area_km2": {"type": "number"},
                "bin_size_inline": {"type": "number"},
                # ...
            }
        }
    },
    {
        "name": "ask_clarification",
        "description": "Ask the user a clarifying question when info is ambiguous or missing",
        "input_schema": {
            "properties": {
                "question": {"type": "string"},
                "context": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}}
            }
        }
    }
]
```

### 3. FastAPI Endpoint

A route in ocfa that manages multi-turn conversations with Claude, accumulating tool calls into a config draft. Use SSE for streaming responses (infrastructure already exists from OSM download feature).

### 4. Chat UI (React Component)

- Document upload (drag & drop PDFs)
- AI shows what it extracted and asks questions
- User confirms/corrects
- Progress indicator showing which config sections are filled
- "Apply to project" button writes the final config.json

### 5. Document Storage and Extraction Pipeline

#### Storage Structure

```
superseis_storage/
  projects/
    {project_id}/
      inputs/
        documents/                   # human-provided source documents
          tender_v1.pdf
          amendment_01.pdf
          clarification_rfi_03.pdf
          processing_specs.pdf
        llm/                         # AI-generated artifacts
          tender_v1_summary.json     # extracted summary per document
          amendment_01_summary.json
          chat_history.json          # conversation messages
          extraction_log.json        # what was extracted when, from which doc
      config.json                    # the project config
```

#### Document Summary Schema

Not a standard — a custom schema mirroring config.json structure with provenance metadata:

```json
{
  "document": "tender_v2.pdf",
  "uploaded": "2026-04-16",
  "extracted": {
    "survey_type": {
      "value": "3D",
      "source": "Section 2.1, page 4",
      "confidence": "explicit"
    },
    "bin_size": {
      "value": 25,
      "unit": "m",
      "source": "Table 3, page 12",
      "confidence": "explicit"
    },
    "source_type": {
      "value": "vibroseis",
      "source": "Inferred from 'no drilling permitted' in section 5.3",
      "confidence": "inferred"
    }
  },
  "unresolved": [
    "Receiver line spacing not specified",
    "Number of crews unclear — mentions 'phased approach' but no details"
  ],
  "key_constraints": [
    "No drilling permitted in zone A",
    "Operations restricted to daylight hours",
    "Completion deadline: 2027-03-01"
  ]
}
```

The `confidence` field (explicit vs inferred) tells the user what the AI read directly from the document vs what it deduced. This drives trust — the user can verify inferred values.

#### Upload and Extraction Flow

Extraction happens immediately on upload as part of the chat flow:

```
User drops PDF
  -> Frontend shows "Uploading..."
  -> Backend receives file, stores original in superseis_storage
  -> Backend sends PDF to Claude with extraction prompt (async)
  -> Frontend shows "Analysing document..." (SSE stream)
  -> Claude extracts parameters, returns structured summary
  -> Summary stored as JSON alongside original file
  -> Chat displays: "I've read the document. Here's what I found: ..."
  -> In Mode 1: AI proceeds to ask clarifying questions
  -> In Mode 2: AI compares against current config, highlights changes/conflicts
```

The user sees the analysis in real time via SSE — no silent waiting.

#### Context Management Across Messages

On each new chat message, the backend assembles the Claude API call:

- **Always included**: system prompt + current config.json + conversation history
- **Document summaries**: injected as compact context (~500 tokens per document instead of full PDF)
- **Full document access**: via a `read_document` tool that Claude can call on demand when it needs to re-check a specific section (e.g., "let me re-read section 4.2 of the original tender")

This keeps token costs manageable as documents accumulate over the project lifecycle.

### 6. Validation Layer

After Claude proposes a config, validate against business rules before writing.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM provider | Anthropic (Claude) | Best tool use, prompt caching, native PDF support |
| API calls | Backend (ocfa) | Never expose API keys to frontend |
| Interaction model | Multi-turn with tool use | Tenders are ambiguous, need Q&A loop |
| Streaming | SSE | Already have SSE infrastructure |
| Cost management | Prompt caching | System prompt (domain knowledge) is static, cache across turns |
| Model | Sonnet for speed/cost, Opus for accuracy | Start with Sonnet, upgrade if extraction quality needs it |

## Provider Portability

Tool use format is provider-specific (Anthropic, OpenAI, Google all differ). Decision: commit to Anthropic SDK directly. The system prompt and domain knowledge are portable. Tool definition rewiring is a day's work if ever needed. Abstraction layers (LiteLLM, Vercel AI SDK) add complexity without clear benefit.

## Confidentiality & Deployment Tiers

### The Issue

Tender PDFs are confidential. Where they're processed matters to some clients, especially in oil & gas where tender information can be worth millions.

### Three Deployment Options, One Codebase

| Tier | Setup | Data location | Client experience |
|---|---|---|---|
| **Standard** | Direct Anthropic API | Anthropic servers (no training, zero retention) | Single subscription, no region choice |
| **Professional / Enterprise** | AWS Bedrock in your AWS account, multi-region | Client picks region — data stays there | Single subscription, picks region from dropdown |
| **Offline** | Manual config, no AI | Nothing leaves client | Existing manual flow |

Key point: you own the AWS account and manage everything in the background. Clients never see AWS, never get a separate invoice, never configure anything. They just pick a region and pay you a flat subscription.

### Region Offering (Professional/Enterprise Tier)

| Region | AWS location(s) | Typical clients |
|---|---|---|
| US | Virginia / Oregon | US majors, North American ops |
| Europe | Ireland / Frankfurt / Zurich | GDPR, Swiss FINMA, UK |
| APAC | Singapore / Tokyo | Asian operations |
| LATAM | São Paulo | Brazilian, LATAM clients — verify Claude availability |
| GCC | Bahrain / UAE | Aramco, ADNOC, QatarEnergy — limited Claude availability, may fall back to Frankfurt |

Architecture is deployment-agnostic: same codebase, only the SDK client initialization and region ID change. Switching a client's region is a config change, not a migration.

**Selling point**: "Your tender documents are processed in the region you choose and never leave it. One subscription, no AWS setup on your side."

## Cost Estimates

### Model Rates (per 1M tokens)

| Model | Input | Output |
|---|---|---|
| Haiku 4.5 | $1 | $5 |
| Sonnet 4.6 | $3 | $15 |
| Opus 4.6 | $5 | $25 |

### Assumptions

- **Light workload**: 50-page PDF (~50k input tokens) + 10 back-and-forth messages
- **Heavy workload**: 300-page PDF (~300k input tokens) + 50 back-and-forth messages
- Prompt caching on system prompt + PDF (90% discount on re-reads)

### Per-Project Cost by Model (Standard Tier, Direct Anthropic API)

| Workload | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
|---|---|---|---|
| Light | ~$0.12 | ~$0.35 | ~$0.60 |
| Heavy | ~$2.00 | ~$6.00 | ~$10.00 |

### Standard vs. Professional/Enterprise (Sonnet 4.6, Recommended Default)

| Deployment | Light workload | Heavy workload |
|---|---|---|
| Standard — direct Anthropic API | ~$0.35 | ~$6.00 |
| Professional/Enterprise — Bedrock regional (+10%) | ~$0.40 | ~$6.60 |

The ~10% premium for regional Bedrock endpoints is what you absorb to offer the "data stays in your region" guarantee. On a per-project basis this is cents to a few dollars — easy to build into subscription pricing.

### Key Optimizations (Apply to Both Deployments)

- **Cache the system prompt + uploaded PDF** — cuts heavy workload costs by 40–60%
- **Batch API (−50%)** for any non-interactive processing
- **Route by complexity**: Haiku for extraction, Sonnet for analysis/chat, Opus only when reasoning depth is needed

### Bottom Line

- Token costs are negligible per project (<$10 even on heavy workloads with Opus)
- The regional Bedrock premium is ~10% on tokens — a rounding error you absorb into pricing
- You manage AWS in the background — clients get one subscription, one invoice, one vendor (you)
- Region choice is the product feature that justifies Professional/Enterprise pricing above Standard
- Same codebase runs all deployment modes; switching a client's region or tier is a config change

## Two Modes: Same Chat, Different Context

The AI chat is not just a one-time setup tool — it persists as a project assistant throughout the project lifecycle. Both modes share the same infrastructure (multi-turn chat, tools, SSE streaming). The difference is the system prompt context and which tools are emphasized.

### Mode 1: Initial Configuration (from tender)

- Triggered when: user creates a new project and uploads documents
- System prompt focus: extracting parameters from documents, filling config from scratch
- Primary tools: `set_survey_parameters`, `set_source_config`, `set_receiver_layout`, etc.
- Conversation ends with: a complete (or near-complete) config.json draft

### Mode 2: Ongoing Project Assistant

- Available anytime: the chat stays accessible from the project sidebar/panel
- System prompt focus: the current config.json is injected as context, so the AI knows the project state
- The user can ask things like:
  - "Add 2 more vibrator units to the crew"
  - "Change the receiver line spacing to 300m"
  - "What would happen if we switch to dynamite source?"
  - "The client just sent an amendment, here's the PDF" (upload new doc)
  - "Add the processing section, here are the specs"
  - "We need to add a second crew for infill, duplicate the current setup"
- Primary tools: same config tools, but also `read_config_section` (to answer questions about current state)
- Conversation is persistent: keeps history so the AI remembers earlier decisions and rationale

### Document Handling Across the Project Lifecycle

Documents aren't just for initial setup. Throughout the project, the user may upload:

- **Amendments / change orders**: client changes scope, adds areas, modifies parameters
- **Clarifications / RFIs**: answers to technical questions that affect the config
- **Field reports**: terrain assessments, access road surveys that impact crew planning
- **Processing specs**: added later when the processing section needs to be configured
- **Subcontractor proposals**: equipment specs, crew capabilities
- **Meeting minutes**: decisions made during kick-off or planning meetings

The AI should:

1. **Compare new documents against current config** — highlight what changed or conflicts ("This amendment changes the bin size from 25m to 12.5m, which affects your receiver layout. Want me to update?")
2. **Track document provenance** — remember which document drove which config decision, so when a new amendment arrives, it can flag which parameters might need revisiting
3. **Handle contradictions** — when a new document conflicts with an earlier one, surface it to the user rather than silently overwriting

This is the same upload mechanism as Mode 1, no extra infrastructure. The difference is that the AI has the existing config + conversation history as context, so it can reason about *what changed* rather than starting from scratch.

### What This Means for Implementation

No extra infrastructure needed. The key differences are:

1. **System prompt includes current config.json** — on each new message, inject the latest config state so the AI always knows where the project stands
2. **Conversation history stored per project** — so the AI remembers "we chose dynamite because the tender specified no vibroseis access roads"
3. **Tool calls are incremental** — instead of building config from scratch, they patch/update existing sections
4. **The chat UI is always available** — not just during initial setup, but as a persistent panel in the project view

This makes the chat a natural extension of the webapp rather than a one-off wizard.

## Abuse Prevention

Prevent users from using the AI chat for off-topic purposes (at your token cost).

### Layer 1: System Prompt Scope Constraint

The system prompt explicitly restricts the domain: "You are a seismic acquisition project assistant. Only answer questions related to the current project configuration. Decline any request unrelated to seismic acquisition."

Works ~95% of the time. Not bulletproof against prompt injection, but handles casual misuse.

### Layer 2: Tool Use as Natural Constraint

The strongest defense. Claude can only act through the tools you define (`set_survey_parameters`, `read_document`, `ask_clarification`, etc.). There is no `write_pancake_recipe` tool. Even if someone tricks the chat into going off-topic, it cannot produce any action outside your domain. The worst case is wasted tokens on a text response.

### Layer 3: Backend Rate Limiting and Budgets

- **Rate limiting**: cap messages per user per hour/day
- **Token budget per project**: set a maximum token spend per project, cut off when reached
- **Message length limits**: reject unusually long inputs

This is your cost protection layer — even if layers 1 and 2 fail, the financial exposure is capped.

### Layer 4: Topic Classification (optional, strict mode)

Before forwarding a user message to the main Claude call, run a cheap pre-check with Haiku (~$0.001 per check): "Is this message related to seismic acquisition project configuration? Yes/No." Reject off-topic messages before they hit the expensive model.

Only implement this if abuse becomes a real problem — layers 1-3 are usually sufficient.

## Implementation Order

1. Write the domain knowledge system prompt, test manually against real tenders in claude.ai
2. Map config.json schema to tool definitions
3. Build the FastAPI endpoint with multi-turn conversation management
4. Build the chat UI with document upload
5. Add validation and "apply to project" flow
6. Iterate on system prompt quality based on real usage

## Analogy

This follows the same pattern as Claude Code:
- Claude Code's coding knowledge = seismic crew configuration knowledge (system prompt)
- Claude Code reads codebase = AI reads tender documents
- Claude Code asks clarifying questions = AI asks about ambiguous specs
- Claude Code writes code = AI writes config.json
