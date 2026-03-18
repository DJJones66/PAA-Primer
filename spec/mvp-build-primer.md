# BrainDrive MVP Build Primer

> Self-contained MVP build plan.
> This document does not require `mvp-build-plan.md`.
> Primary authority:
> 1. `docs/ai/*.md`
> 2. `docs/ai/compliance-matrix.md`

Historical drift analysis informed this plan, but is already folded into the requirements below and is not required during implementation.

---

## What This Build Is

BrainDrive MVP is a terminal-first AI product that runs locally in Docker, uses the architecture foundation as a dependency, and lets the user create folders and produce three owned documents inside each folder: `AGENT.md`, `spec.md`, and `plan.md`.

The user interacts through chat only. There is no web UI in MVP. The system must still preserve the architecture boundaries around Memory, Gateway, Engine, Auth, tools, models, and deployment.

---

## Product Goal

Ship a working MVP that:

- starts in the terminal immediately
- runs on owner-controlled hardware
- supports Docker-based local use
- lets the user create and switch folders through chat
- lets the user read and write files with approval
- turns pasted prompts into folder outputs like `AGENT.md`, `spec.md`, and `plan.md`
- works with a config-driven OpenAI-compatible model adapter path, including a local-model offline path

---

## What Is In Scope

- Terminal client
- Local Docker runtime
- Gateway on localhost
- Auth boundary in local-owner-mode
- Memory-backed persistent conversations
- Approval-gated file writes
- Structured stdout audit logging
- Git-backed version history as a startup requirement
- Exportable owner data
- Config-driven adapter selection

---

## What Is Out Of Scope But Still Must Not Cause Drift

- No web client
- No managed hosting
- No skill system
- No multi-identity auth policy store beyond local-owner-mode
- No marketplace UX for tools
- No configurable audit detail levels beyond structured stdout JSON
- No broad general-purpose structured Memory query surface beyond what MVP needs for conversations and owned state

Allowed MVP limitation examples:

- conversation resumption may remain a product limitation
- approval may still be rendered in the terminal client

Not allowed even in MVP:

- ephemeral-only conversations
- auth omitted from the real request path
- config collapsed into one BrainDrive-specific loader
- best-effort version history
- approval that exists only as a CLI-local branch and not as contract-visible interaction

---

## Non-Negotiable Architecture Gates

The implementation must satisfy these rule families from `docs/ai/compliance-matrix.md`:

- `F-*` foundation shape
- `G-*` Gateway ownership and Memory boundary
- `E-*` Engine behavior and completion semantics
- `C-*` configuration split and secret handling
- `M-*` Memory guarantees, export, history, conversations in Memory
- `A-*` Auth boundary and product-owned auth state
- `S-*` safe errors, audit, coded approval, tool isolation
- `MO-*` config-driven models and adapters
- `T-*` tool ownership and availability rules
- `D-*` local-first deployment and offline path
- `GC-*` Gateway-Engine contract, error taxonomy, approval in contract, auth on path

If a proposed task violates one of these families, the plan must be corrected before coding.

---

## Runtime Shape

```text
Terminal CLI client
  -> HTTP request with auth headers
  -> Gateway (localhost-bound)
  -> dedicated conversation-store boundary
  -> Engine / Agent Loop
  -> ToolExecutor with coded approval enforcement
  -> config-driven model adapter

Memory
  - owned files
  - persisted conversations
  - version history established at startup
  - exportable owner data

Auth
  - middleware on every protected request
  - local-owner-mode policy
  - inspectable exportable auth state
```

---

## Required Conformance Corrections Before Product Work

The previous BrainDrive build drifted because several issues were already present in the foundation/runtime path. Fix these first.

### Engine

- remove default iteration cap
- allow optional implementation-provided safety bound only
- implement `provider_error`, `tool_error`, and `context_overflow`
- sanitize all client-visible errors
- preserve assistant text across tool-continuation turns

### Gateway

- use canonical client request shape
- use canonical conversation list and item envelopes
- add `X-Conversation-ID` behavior
- add `message_id` to the client-facing done event where required

### Auth

- wire `authorize()` into the tool execution path
- attach real permission structure in middleware
- implement `auth_whoami`, `auth_check`, and `auth_export`
- define minimal product-owned auth state in Memory

### Memory

- add `memory_export`
- make `memory_history` return previous states, not only metadata
- make version-history readiness deterministic

### Models / Config

- make adapter selection config-driven
- remove hardcoded BrainDrive adapter wiring

Only after these are done should BrainDrive product-specific work begin.

---

## BrainDrive Product Build Requirements

### Bootstrap and Config

Implement a runtime bootstrap shape with:

- `memory_root`
- `provider_adapter`
- `auth_mode`
- `tool_sources`
- `bind_address` defaulting to `127.0.0.1`

Rules:

- provider details live in adapter config
- secrets stay in env vars only
- owner preferences do not get collapsed into runtime bootstrap

### Conversations

Implement persistent conversations in Memory from day one.

Rules:

- no in-memory `Map` as source of truth
- conversations stored in inspectable open format
- Gateway uses a dedicated conversation-store boundary
- model-context truncation may exist, but full stored history must remain persisted

### Auth

Wire local-owner-mode through the real path.

Rules:

- Gateway request goes through auth middleware
- identity and permission headers are attached on every request
- minimal auth state is stored in product-owned Memory
- `auth_export` returns non-secret auth state

### Approval and Tools

Approval must be both coded and contract-visible.

Rules:

- ToolExecutor blocks writes pending approval
- terminal client renders approval from contract-visible interaction state
- tool scope is enforced by runtime boundaries, not only by prompt text or headers
- tool availability comes from config plus auth, not ad hoc product branches
- filesystem tools are rooted to `memory_root` unless explicit wider scope is configured

### Logging and Version History

Rules:

- structured JSON logs to stdout exist from day one
- auth events, tool calls, tool results, Memory writes, startup failures, and contract errors are logged
- git/version history is a startup requirement, not best-effort
- startup fails clearly if version history cannot be established

### Client and Contract

Rules:

- CLI uses the real Gateway path
- CLI sends canonical request shape
- CLI consumes canonical stream shape
- no validation or helper path may bypass real persistence or auth behavior

Client-facing Gateway choices for MVP:

- POST message request body is `{ "content": string, "metadata"?: object }`
- Gateway normalizes that into the internal `messages + metadata` handoff
- streaming responses include `X-Conversation-ID` header once the conversation is resolved
- `GET /conversations` returns `{ "conversations": [...], "total": number, "limit": number, "offset": number }`
- each conversation list item is `{ "id": string, "title": string | null, "created_at": string, "updated_at": string, "message_count": number }`
- `GET /conversations/:id` returns `{ "id": string, "title": string | null, "created_at": string, "updated_at": string, "messages": [...] }`
- each message item is `{ "id": string, "role": "system" | "user" | "assistant" | "tool", "content": string, "timestamp": string }`
- client-facing `done` event includes at least `conversation_id` and `message_id`

Approval interaction choice for MVP:

- approval is represented as contract-visible interaction, not hidden local control flow
- MVP uses explicit stream events `approval-request` and `approval-result`
- `approval-request` includes enough information for the client to present the pending action safely
- `approval-result` includes the decision outcome and the related request identifier
- this event pair must be implemented consistently in Gateway, client handling, and verification
- CLI rendering is only the presentation layer for that interaction, not the source of truth

### Offline Path

Rules:

- runtime config supports a local model path
- Docker/runtime setup documents one local model option
- the system can complete a full loop without internet when pointed at the local model path

---

## Milestones

### Milestone 0 - Primer Lock

- classify accepted MVP limits
- map required matrix rules to work items
- confirm no ambiguity remains between deferred work and mandatory conformance

### Milestone 1 - Patched Foundation Ready

- Engine/Gateway/Auth/Memory/config fixes complete
- offline-capable local model path validated at runtime level
- patched dependency passes conformance checks

### Milestone 2 - BrainDrive Runtime Skeleton

- Docker image ready
- bootstrap loader implemented
- localhost bind default implemented
- auth on real path
- persistent conversation storage in Memory
- product-owned auth state in Memory
- tool isolation enforced in runtime configuration

### Milestone 3 - Product Interaction Layer

- terminal REPL built
- system prompt and folder workflow built
- contract-visible approval rendering works
- structured logging active
- reliable git/version behavior active

### Milestone 4 - Conformance and Hardening

- primer-only audit explains final code
- no unexpected drift remains
- any remaining limitation is explicit and non-breaking

---

## Verification Requirements

The final build must prove at least these:

- no private in-process conversation store
- auth on every protected request
- product-owned inspectable auth state exists
- split config shape exists
- export exists
- history returns previous states
- structured audit output exists
- tool isolation is enforced beyond prompt behavior
- Engine completion semantics match the contract
- error taxonomy is implemented
- approval is represented through the contract interaction model
- localhost-only default bind
- local-model offline loop works end to end

Manual QA must include:

- fresh library boot initializes git or fails clearly
- conversation persists to disk
- auth path is visible in live requests
- `auth_export` returns expected non-secret data
- approval is visible through contract-aware flow
- tools cannot escape configured scope without explicit config change
- error events use safe messages and correct codes
- export archive is readable without the system running
- local-model offline loop completes end to end

---

## Done Means

This build is done only when:

- the implementation can be explained and audited using `docs/ai/*.md` and `docs/ai/compliance-matrix.md` without falling back to `mvp-build-plan.md`
- the implementation can be built from this document plus `docs/ai/*.md` and `docs/ai/compliance-matrix.md` without consulting `spec/drift-descisions.md`
- no major unexpected drift remains
- any remaining limitation is an explicit MVP boundary rather than an accidental architecture miss

This is the required standard for a one-shot-oriented, low-drift BrainDrive MVP.
