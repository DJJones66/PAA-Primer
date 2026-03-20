# Primer Lock

Milestone: Primer Lock

- Checklist section: `spec/mvp-build-primer-checklist.md` Milestone 0
- Matrix families: `F-*`, `G-*`, `E-*`, `C-*`, `M-*`, `A-*`, `S-*`, `MO-*`, `T-*`, `D-*`, `GC-*`
- Primer docs used:
  - `spec/mvp-build-primer.md`
  - `spec/mvp-build-primer-checklist.md`
  - `docs/ai/compliance-matrix.md`
  - `docs/ai/build-sequence.md`
  - `docs/ai/traceability-map.md`
  - `docs/ai/accepted-mvp-limits.md`
  - `docs/ai/client-gateway-contract.md`
  - `docs/ai/gateway-engine-contract.md`
  - `docs/ai/configuration.md`
  - `docs/ai/memory.md`
  - `docs/ai/auth.md`
  - `docs/ai/security.md`
- Example files used:
  - `docs/ai/examples/runtime-config.json`
  - `docs/ai/examples/adapter-config.json`
  - `docs/ai/examples/client-message-request.json`
  - `docs/ai/examples/gateway-engine-request.json`
  - `docs/ai/examples/conversation-list-response.json`
  - `docs/ai/examples/conversation-detail-response.json`
  - `docs/ai/examples/approval-request-event.json`
  - `docs/ai/examples/approval-result-event.json`

Findings

- conforms: runtime config and adapter config stay split.
- conforms: Gateway owns conversation lifecycle through a dedicated conversation-store boundary.
- conforms: Auth exists on the protected request path in local-owner mode.
- conforms: approvals are emitted as `approval-request` and `approval-result` stream events.
- accepted limitation: terminal-only client and local Docker runtime remain in scope.
- conforms: the primer now defines the approval-decision submission contract used by the runtime.
- conforms: the primer now documents one Docker-local model option for offline containerized use.
