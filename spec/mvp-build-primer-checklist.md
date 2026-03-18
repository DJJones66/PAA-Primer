# PAA MVP Primer Checklist

This checklist is self-contained.
Use it directly, or alongside `mvp-build-primer.md`.
It does not require `mvp-build-plan.md`.

## Build Summary

- Product: terminal-first PAA MVP
- Required runtime: Docker, owner-controlled hardware, localhost Gateway, local-owner-mode Auth
- Required architecture: persistent Memory-backed conversations, config-driven adapter selection, export, reliable version history, contract-visible approval, structured logging, offline local-model path
- Not allowed: ephemeral-only conversations, auth-free path, collapsed config, best-effort version history, CLI-only approval semantics

## Fixed MVP Contract Choices

- [ ] Client POST request body is `{ content, metadata? }`
- [ ] Gateway normalizes client request to internal `messages + metadata`
- [ ] Streaming response sets `X-Conversation-ID`
- [ ] `GET /conversations` returns `{ conversations, total, limit, offset }`
- [ ] Conversation list item shape is `{ id, title, created_at, updated_at, message_count }`
- [ ] `GET /conversations/:id` returns `{ id, title, created_at, updated_at, messages }`
- [ ] Message item shape is `{ id, role, content, timestamp }`
- [ ] Client-facing `done` event includes `conversation_id` and `message_id`
- [ ] Approval is represented through `approval-request` and `approval-result` events, not only local readline control flow
- [ ] `approval-request` and `approval-result` are implemented consistently across Gateway, client, and QA

## Milestone 0 - Primer Lock

- [ ] Treat `docs/ai/*.md` and `docs/ai/compliance-matrix.md` as build authority
- [ ] Read `docs/ai/build-sequence.md` before implementation starts
- [ ] Read `docs/ai/accepted-mvp-limits.md` before classifying scope cuts
- [ ] Use `docs/ai/traceability-map.md` to map each work area to its matrix rules, examples, and checklist
- [ ] Mark every accepted MVP limitation explicitly
- [ ] Confirm no accepted limitation violates a non-negotiable matrix rule

## Milestone 1 - Foundation Conformance

### Engine
- [ ] Remove default Engine iteration cap
- [ ] Allow optional implementation-provided safety bound
- [ ] Implement `provider_error`, `tool_error`, `context_overflow`
- [ ] Sanitize all streamed error messages
- [ ] Preserve assistant text across tool-continuation turns

### Gateway
- [ ] Use canonical client request shape
- [ ] Use canonical conversation list envelope
- [ ] Use canonical conversation item envelope
- [ ] Add `X-Conversation-ID` response header
- [ ] Attach `message_id` to client-facing done event if owned here
- [ ] Implement `approval-request` and `approval-result` as contract-visible events

### Auth
- [ ] Wire `authorize()` into tool execution path
- [ ] Attach real permission structure in middleware
- [ ] Implement `auth_whoami`
- [ ] Implement `auth_check`
- [ ] Implement `auth_export`
- [ ] Define minimal product-owned auth state shape

### Memory
- [ ] Add `memory_export`
- [ ] Extend `memory_history` to return previous states
- [ ] Make version-history readiness deterministic

### Models / Config
- [ ] Make adapter selection config-driven
- [ ] Remove hardcoded PAA adapter wiring

### Foundation Validation
- [ ] Validate engine completion semantics
- [ ] Validate error taxonomy and sanitization
- [ ] Validate auth tools and middleware path
- [ ] Validate Memory export and history behavior
- [ ] Validate config-driven adapter selection
- [ ] Validate tool isolation beyond prompt behavior
- [ ] Validate offline local-model path

## Milestone 2 - PAA Runtime Skeleton

### Bootstrap / Config
- [ ] Implement runtime config fields: `memory_root`, `provider_adapter`, `auth_mode`, `tool_sources`, `bind_address`
- [ ] Keep provider details in adapter config
- [ ] Keep secrets in env vars only
- [ ] Default `bind_address` to `127.0.0.1`
- [ ] Match config shapes to `docs/ai/examples/runtime-config.json` and `docs/ai/examples/adapter-config.json`

### Conversations
- [ ] Persist conversations in Memory from day one
- [ ] Do not use in-memory `Map` as source of truth
- [ ] Store conversations in inspectable open format
- [ ] Use dedicated conversation-store boundary
- [ ] Keep full stored history even if model context is truncated

### Auth Path
- [ ] Put auth middleware on the real request path
- [ ] Attach identity and permission headers on every request
- [ ] Store minimal auth state in product-owned Memory
- [ ] Ensure `auth_export` excludes credentials

### Tool Boundaries
- [ ] Root filesystem tools to `memory_root` by default
- [ ] Enforce write approval in code
- [ ] Load tool availability from config, not product branches
- [ ] Enforce scope with runtime controls, not prompt text

## Milestone 3 - Product Interaction Layer

- [ ] Build terminal REPL on top of real Gateway path
- [ ] Implement system prompt and folder workflow
- [ ] Render approval from contract-visible interaction state
- [ ] Handle canonical list/item/done payloads in the client
- [ ] Add structured JSON stdout logging
- [ ] Make git/version history a startup requirement
- [ ] Keep CLI on canonical route and stream contract
- [ ] Match client payload and event shapes to the valid files documented in `docs/ai/examples/README.md`

## Milestone 4 - Verification

### Matrix Gates
- [ ] `G-04` no private in-process conversation store
- [ ] `A-01` auth on every protected request
- [ ] `A-03` auth state is product-owned and inspectable
- [ ] `C-01` split config shape exists
- [ ] `M-03` export exists
- [ ] `M-04` history returns previous states
- [ ] `S-02` structured audit output exists
- [ ] `S-04` tool isolation enforced beyond prompt behavior
- [ ] `E-04` no default completion drift
- [ ] `GC-05` error taxonomy implemented
- [ ] `GC-06` approval represented in contract interaction model
- [ ] `D-02` offline local-model loop works
- [ ] `D-03` localhost-only default bind

### Primer Governance Gates
- [ ] `docs/ai/primer-audit-playbook.md` is the procedure used for the final audit
- [ ] `docs/ai/primer-completeness-test.md` is run and any blocked question is recorded explicitly
- [ ] `docs/ai/examples-validation.md` is respected for any contract or config change during implementation
- [ ] `docs/ai/traceability-map.md` is used to trace major conformance claims and findings back to primer support

### Startup-Readiness Gates
- [ ] `D-05` startup fails clearly if version history cannot be established
- [ ] `D-06` startup loads runtime config, adapter config, tools, Memory, and preferences in deterministic order
- [ ] `D-07` export surface and conversation persistence path are available from day one

### Focused Review Gates
- [ ] Use `docs/ai/review-checklists/gateway-review.md` for Gateway and client-contract review
- [ ] Use `docs/ai/review-checklists/memory-review.md` for Memory/export/history review
- [ ] Use `docs/ai/review-checklists/auth-review.md` for Auth boundary review
- [ ] Use `docs/ai/review-checklists/configuration-review.md` for config and startup-readiness review
- [ ] Use `docs/ai/review-checklists/engine-review.md` for Engine and internal contract review
- [ ] Use `docs/ai/review-checklists/security-review.md` for security, approval, and tool-boundary review

### Manual QA
- [ ] Fresh library boot initializes git or fails clearly
- [ ] Conversation persists to disk in Memory
- [ ] Auth path is live in actual requests
- [ ] `auth_export` returns non-secret auth state
- [ ] Approval is visible through contract-aware client flow
- [ ] Tools cannot escape configured scope without explicit config change
- [ ] Error events use safe messages and correct codes
- [ ] Export archive is readable without the system running
- [ ] Local-model offline loop completes end to end

## Final Stop Condition

- [ ] Primer-only audit can explain the final code without falling back to full human docs
- [ ] No unexpected drift remains
- [ ] Any remaining limitation is explicitly accepted and non-breaking
- [ ] Relevant standalone example files still match the final implementation contracts and config shapes
