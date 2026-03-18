# Drift Remediation Work List

> Generated from MVP Build Review call, 2026-03-17.
> Based on 6 drift analysis documents (Engine, Init, Gateway, Auth, Memory, Provider) reviewed by Dave W, Dave J, and Claude.

---

## How to Read This

Each item shows:
- **Source**: which drift analysis and point number
- **Repo**: `arch` = personal-ai-architecture, `bd` = braindrive
- **Type**: code, arch-docs, bd-docs
- **MVP vs Deferred**: whether it's in scope for MVP or explicitly deferred

Items marked "COVERED" are resolved by another item — no separate work needed.

---

## ENGINE DRIFT

### E-DP1: Premature Loop Termination

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | arch-docs | engine-spec.md — Add to guarantees: "The loop continues until the model signals completion. Implementations MAY configure a safety bound, but the Agent Loop itself MUST NOT impose a default iteration cap." |
| 2 | arch | arch-docs | gateway-engine-contract.md — Clarify `maxIterations` is an optional, implementation-provided parameter with no default |
| 3 | arch | code | src/engine/index.ts — Remove `maxIterations: 50` default, make it `undefined` |
| 4 | bd | code | src/cli.ts — Pass `maxIterations: 50` explicitly as BrainDrive's implementation choice |
| 5 | bd | bd-docs | mvp-build-plan.md — Document `maxIterations: 50` as a conscious implementation choice, not an architecture default |

### E-DP2: Incomplete Error Taxonomy

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | src/engine/index.ts — Add error classification logic at catch sites: `provider_error` for model/network failures, `tool_error` for unrecoverable tool infrastructure failures, `context_overflow` for context limit hits |
| 2 | arch | code | Distinguish recoverable tool failures (return to model as tool-result) from infrastructure failures (emit `tool_error`, close stream) |
| 3 | bd | bd-docs | mvp-build-plan.md — Note error classification as cross-cutting concern |

### E-DP3: Unsanitized Error Messages

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | src/engine/index.ts — Replace raw `Error.message` forwarding with fixed safe messages per error code. Map: `provider_error` → "Model provider unavailable", `tool_error` → "Tool execution failed", `context_overflow` → "Conversation exceeded context limit" |
| 2 | arch | code | Log full error detail (stack traces, paths, raw messages) to structured stdout, never into SSE events |
| 3 | bd | bd-docs | mvp-build-plan.md — Document error sanitization approach |

*Note: Pairs with E-DP2 — same code paths.*

### E-DP4: Assistant Text Dropped on Tool Continuation

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | src/engine/index.ts — Accumulate `text-delta` content during provider turn; use accumulated text (not `content: ""`) when building assistant message for next loop iteration |
| 2 | bd | bd-docs | mvp-build-plan.md — Note fix |

---

## INIT DRIFT

### I-DP1: Conversations in Process Memory

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Replace in-memory `Map` with file-backed storage in the library (Your Memory). Store as inspectable JSON or markdown, one file per conversation |
| 2 | bd | code | Move 24-message limit from hard-coded to configurable preference |
| 3 | bd | code | Store full conversations on disk; send last N messages to the model |
| 4 | bd | bd-docs | mvp-build-plan.md — Document conversation storage approach, configurable message limit |
| 5 | bd | bd-docs | mvp-spec.md — Update conversation behavior if referenced |

*Conversation loading/resumption explicitly deferred to post-MVP.*

### I-DP2: No Conversation-Store Tool

**COVERED** by I-DP1 for MVP. Files in library = in Your Memory. Formal dedicated tool deferred to post-MVP with resumption work.

### I-DP3: Auth Missing from Runtime Wiring

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Add auth middleware to Gateway→Engine path with local-owner-mode policy (auto-attach `X-Actor-ID: owner`, `X-Actor-Permissions: {"type":"owner","permissions":["*"]}`) |
| 2 | bd | code | Ensure Engine receives identity headers on every request |
| 3 | bd | bd-docs | mvp-build-plan.md — Document auth wiring and local-owner-mode policy |
| 4 | bd | bd-docs | mvp-spec.md — Note auth boundary exists even in single-user mode |

### I-DP4: Configuration Split Violated

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Introduce four-field runtime config shape: `memory_root`, `provider_adapter`, `auth_mode`, `tool_sources` |
| 2 | bd | code | Move provider details (`modelUrl`, `modelName`) into adapter config, separate from runtime bootstrap |
| 3 | bd | code | Keep secrets (`apiKey`) in env vars only |
| 4 | bd | bd-docs | mvp-build-plan.md — Document config restructuring |
| 5 | bd | bd-docs | mvp-spec.md — Update config section |

*Preferences in Your Memory deferred to post-MVP.*

### I-DP5: Approval Gating is CLI-Only

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Verify approval executor has clean boundary between enforcement logic and CLI readline prompt; refactor if tangled |
| 2 | bd | bd-docs | mvp-build-plan.md — Document CLI readline as temporary client-specific approval, note post-MVP migration to stream contract |
| 3 | bd | bd-docs | mvp-spec.md — Note approval is coded enforcement with CLI prompt for MVP |

*Stream-level approval deferred to post-MVP.*

### I-DP6: Audit Logging Missing

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Add structured JSON logging to stdout: `{ timestamp, correlation_id, component, level, message }` for tool calls, auth events, and errors |
| 2 | bd | bd-docs | mvp-build-plan.md — Document stdout-based structured logging as MVP audit approach |

*Configurable detail levels deferred to post-MVP.*

### I-DP7: Version History is Best-Effort

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Fix git initialization sequencing — ensure library dir exists before `git init`, ensure repo exists before `git config --local` |
| 2 | bd | code | Fail startup with clear error if git init fails (not a warning) |
| 3 | bd | bd-docs | mvp-build-plan.md — Document git initialization as a startup requirement, not best-effort |

### I-DP (new): Gateway Bind Address

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Add `bind_address` to runtime config, default `127.0.0.1` |
| 2 | bd | code | Configurable to `0.0.0.0` for network access (opt-in) |
| 3 | bd | code | `docker-compose.yml` — do not expose Gateway port to host by default |
| 4 | bd | bd-docs | mvp-build-plan.md — Document as security consideration |

---

## GATEWAY DRIFT

### G-DP1: No Conversation-Store Tool Boundary

**COVERED** by I-DP1 / I-DP2 for MVP.

### G-DP2: Client POST Request Shape Wrong

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Update Gateway routes to accept canonical `{ content, metadata? }` request body |
| 2 | arch | code | Internal normalization to Message shape for Gateway core |
| 3 | bd | code | Update CLI client to send canonical request shape |
| 4 | bd | code | Update `validate-foundation.ts` to use canonical request shape |
| 5 | bd | bd-docs | mvp-build-plan.md — Note client API conformance fix |

*Do atomically — routes, CLI client, and validation script updated together.*

### G-DP3: GET /conversations Doesn't Match Canonical List Contract

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Update route to parse `limit` and `offset` query params, pass to store |
| 2 | arch | code | Return canonical envelope `{ conversations, total, limit, offset }` |
| 3 | arch | code | Accept `search`, `from`, `to` without erroring; actual filtering deferred post-MVP |
| 4 | bd | bd-docs | mvp-build-plan.md — Note list contract conformance, deferred filters |

### G-DP4: Missing X-Conversation-ID Header

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Add `X-Conversation-ID` header to streaming response for both new and resumed conversation POST routes |
| 2 | arch | code | Source value from resolved conversation before stream begins |

### G-DP5: Done Event Missing message_id

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Conversation store append returns a stable message ID |
| 2 | arch | code | Gateway attaches `message_id` to client-facing `done` event alongside `conversation_id` |
| 3 | arch | code | Engine-facing `done` event unchanged |

### G-DP6: GET /conversations/:id Returns Raw Storage Shape

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Add response-mapping layer for GET /conversations/:id |
| 2 | arch | code | Return messages with stable IDs and timestamps per canonical schema |
| 3 | arch | code | Keep storage internals separate from client response shape |

*Pairs with G-DP5 — same message ID/timestamp infrastructure.*

### G-DP7: Validation Script Uses Ephemeral Override

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Remove `createEphemeralGateway` from `validate-foundation.ts` |
| 2 | bd | code | Wire validation script to use the real persistence-capable Gateway |

---

## AUTH DRIFT

### A-DP1: BrainDrive Bypasses Auth Entirely

**COVERED** by I-DP3.

### A-DP2: Authorization Not Wired

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Wire `authorize()` call before tool execution in the Engine/tool executor path |
| 2 | arch | code | MVP policy: owner → always allow |
| 3 | bd | bd-docs | mvp-build-plan.md — Document authorization boundary |

### A-DP3: X-Actor-Permissions Too Weak

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Update middleware to set `X-Actor-Permissions` with real permission structure `{"type":"owner","permissions":["*"]}`, not just `{"type":"owner"}` |

### A-DP4: Minimal Auth Tools Missing

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Implement `auth_whoami`, `auth_check`, `auth_export` tools |
| 2 | arch | code | Register in tool registry alongside memory tools |
| 3 | bd | bd-docs | mvp-build-plan.md — Document auth tools |

### A-DP5: Product-Owned Auth State Absent

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | bd | code | Store minimal auth config in library: owner identity, auth mode, basic policy (owner = full access) |
| 2 | bd | code | Make exportable through `auth_export` tool |
| 3 | bd | bd-docs | mvp-build-plan.md — Document MVP auth state, defer full policy store |

---

## MEMORY DRIFT

### M-DP1: No Database-Backed Memory in Tools

**COVERED** by I-DP1 for MVP (conversations as files in library). Dedicated structured query tools deferred post-MVP.

### M-DP2: No Memory Export

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Add `memory_export` tool — packages library contents into archive (tar/zip) |
| 2 | arch | code | Register in Memory tool registry |
| 3 | bd | bd-docs | mvp-build-plan.md — Document export as MVP requirement |

### M-DP3: Version Guarantee Not Reliable

**COVERED** by I-DP7.

### M-DP4: memory_history Returns Metadata Only

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Extend `memory_history` to accept optional commit hash parameter; return file content at that commit via `git show <hash>:<path>` |

### M-DP5: No Structured/Queryable Operations

Deferred post-MVP. File tools cover MVP use cases.

---

## PROVIDER DRIFT

### P-DP1–5: Adapter Not Config-Driven (Single Root Cause)

All 5 provider drift points resolve with one fix: make adapter selection config-driven.

| # | Repo | Type | Work |
|---|------|------|------|
| 1 | arch | code | Add adapter loader that selects adapter from runtime config `provider_adapter` field |
| 2 | arch | code | Upstream BrainDrive adapter improvements (richer error parsing, auth headers) into foundation `createOpenAICompatibleAdapter` |
| 3 | bd | code | Remove hardcoded `createBrainDriveAdapter` import from cli.ts, use config-driven selection |
| 4 | bd | code | Delete `src/provider-adapter.ts` — use the foundation adapter |
| 5 | bd | code | Update `validate-foundation.ts` to use same config-driven adapter path as production |
| 6 | bd | bd-docs | mvp-build-plan.md — Document config-driven adapter selection, single adapter surface |

---

## IMPLEMENTER'S REFERENCE & CONFORMANCE UPDATES

These are updates needed in the architecture repo's guidance docs so future implementors don't hit the same drift.

### implementers-reference.md Updates

| # | Section | Update |
|---|---------|--------|
| 1 | Agent Loop | Add: "The loop continues until the model signals completion. The Agent Loop MUST NOT impose a default iteration cap. Implementations MAY configure a safety bound as a deployment choice." |
| 2 | Agent Loop | Add: "When the model emits text and tool calls in the same turn, the Agent Loop must preserve the text in the assistant message for the next loop iteration. Do not discard streamed text on tool continuation." |
| 3 | Internal Contract — error event | Add: "Error messages in SSE events must be safe for client display. Never forward raw `Error.message` or stack traces. Map each error code to a fixed safe message; log raw detail to stdout." |
| 4 | Auth | Add to Auth section: "Minimal tool surface required from day one: `auth_whoami` (returns current identity), `auth_check` (returns permission decision), `auth_export` (returns auth config minus credentials)." |
| 5 | Configuration | Add `bind_address` to "Where things live" — default `127.0.0.1`, configurable for network access. Reference DEPLOY-3. |
| 6 | Your Memory | Add: "Export must be available from day one, even if the implementation is a simple archive of the memory root. This is non-negotiable." |
| 7 | Your Memory | Add: "`memory_history` must return previous states, not just metadata. Accept an optional commit hash to retrieve file content at that point in time." |
| 8 | Boot Sequence | Between steps 4 and 5, add: "Verify version history (git init). Fail startup if version history cannot be established — do not degrade to warning." |

### arch-tests.md Updates (New Conformance Tests)

| ID | Test | Pass Condition |
|----|------|----------------|
| ARCH-5 | Error taxonomy compliance | Engine emits correct error codes: `provider_error` for model/network, `tool_error` for unrecoverable tool failures, `context_overflow` for context limits. No catch-all error code. |
| ARCH-6 | Error message sanitization | No SSE error event contains file paths, stack traces, or credentials. All error messages are safe for client display. |
| ARCH-7 | Memory export | `memory_export` produces a complete archive of all owned data in open formats. Archive is readable without the system running. |
| ARCH-8 | Auth tool surface | `auth_whoami`, `auth_check`, `auth_export` tools exist and return correct results for the current actor. |
| ARCH-9 | Version history reliability | System fails to start if version history cannot be initialized. `memory_history` returns previous file states, not just metadata. |
| DEPLOY-5 | Default bind address | Fresh install binds Gateway to `127.0.0.1` only. Network binding requires explicit configuration change. |

---

## SUMMARY COUNTS

| Category | Total DPs | MVP Work Items | Covered/Deferred |
|----------|-----------|---------------|-----------------|
| Engine | 4 | 4 | 0 |
| Init | 8 (incl. bind address) | 7 | 1 covered (I-DP2) |
| Gateway | 7 | 6 | 1 covered (G-DP1) |
| Auth | 5 | 4 | 1 covered (A-DP1) |
| Memory | 5 | 2 | 3 covered/deferred |
| Provider | 5 (1 root cause) | 1 | 0 |
| Arch docs | — | 8 ref updates + 6 new tests | — |
| **Total** | **34** | **24 MVP work items** | **6 covered, 4 deferred** |
