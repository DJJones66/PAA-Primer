# MVP Build Plan Primer Assessment

Date: 2026-03-17

## Question

If the BrainDrive MVP had been built using the AI primer layer in `/home/hex/Project/References/docs/ai` instead of relying on the full human-readable architecture docs alone, would the final implementation likely have had fewer drift points, and would the remaining drifts likely have been smaller?

## Short Answer

Yes, probably.

The primer layer likely would have reduced the number and severity of the accidental architecture drifts that showed up in `/home/hex/Library/active/braindrive/drift-analysis.md`. It would not have eliminated all drift, because some of the final mismatches were already chosen or deferred in `mvp-build-plan.md` itself rather than simply missed during implementation.

## What The Primers Likely Would Have Reduced

These look like implementation misses that the primer layer would likely have surfaced earlier and more clearly:

### 1. Missing auth wiring

The build plan says the Auth boundary exists in MVP and should be wired in local-owner-mode. The final drift report shows auth absent from runtime wiring. The primers make this requirement much harder to miss because `docs/ai/auth.md`, `docs/ai/gateway-engine-contract.md`, and `docs/ai/compliance-matrix.md` all present it as a short binary rule rather than prose buried in larger docs.

### 2. Configuration layer collapse

The final code collapsed runtime config, provider settings, and model selection into one loader. The primer layer is stronger than the original doc set for catching this because `docs/ai/configuration.md` compresses the config taxonomy into a small number of explicit categories and `C-01` through `C-03` in `docs/ai/compliance-matrix.md` make the failure mode obvious.

### 3. Missing audit logging

The drift report found no structured audit implementation. This is exactly the sort of thing the primers are good at preventing because `docs/ai/security.md` and `S-02` in `docs/ai/compliance-matrix.md` turn audit logging into a short pass/fail requirement instead of something easy to lose in a long security narrative.

### 4. Best-effort version history

The implementation degraded git/version-history failures to warnings. The primer layer would likely have reduced this drift because `docs/ai/memory.md` makes version/history a required Memory guarantee and `M-04` frames it as contract behavior, not a convenience.

### 5. RAM-only conversation storage with hard truncation

Even if full conversation resumption remained out of MVP scope, the actual implementation ended up using an in-memory `Map` plus truncation as the only persisted truth. The primers would likely have pushed this closer to the architecture because `docs/ai/gateway.md`, `docs/ai/memory.md`, and `G-04`/`M-05` now state clearly that conversations are Memory-owned data and must not live as a private in-process store.

## What The Primers Likely Would Not Have Prevented

These drifts were not just implementation misses. They were already implied, chosen, or explicitly deferred in the build plan.

### 1. No dedicated conversation-store tool in MVP

The drift report calls this a real architecture drift, and the primers now make that rule explicit. But the build plan already chose a simpler MVP path. So the primers would not have quietly prevented this; they would have forced an explicit decision that the plan was diverging from the architecture.

### 2. No resumable conversations

`mvp-build-plan.md` explicitly defers conversation resumption. The primers would not have changed that choice. They would only have made the architectural cost of that choice easier to see and harder to blur with unrelated implementation shortcuts.

### 3. Approval handled as a CLI-local interaction

The build plan explicitly lists stream-level approval flow as deferred. The primers now make approval-as-contract-interaction explicit in `docs/ai/gateway-engine-contract.md` and `GC-06`, but that means they would have highlighted a planned deviation, not prevented it automatically.

## Best Interpretation Of The Outcome

The right conclusion is not "the primers would have made the build fully compliant."

The better conclusion is:

- They likely would have reduced accidental drift.
- They likely would have made the remaining drift more intentional, narrower, and easier to name.
- They likely would have separated "MVP simplification" from "implementation miss" much earlier in the build.

That is valuable because the final BrainDrive drift report mixes both kinds of problems:

- accidental misses like auth wiring, config collapse, audit omission, and best-effort version guarantees
- planned simplifications like deferred stream-level approval and simplified conversation behavior

The primer layer is especially strong at stopping the first category.

## Overall Judgment

Yes — using the primers likely would have gotten BrainDrive closer to the architecture and reduced both drift count and drift severity.

But not to zero.

The drifts most likely to remain would have been the ones already embedded in the MVP plan as simplifications or deferrals. The big gain from the primers is that those remaining drifts would have stood out as explicit plan-level exceptions instead of becoming mixed together with accidental implementation mistakes.

## Practical Takeaway

For future build plans, the primers are most useful when they are used before implementation as a scope filter:

1. mark every intentional deviation from `docs/ai/*.md` or `docs/ai/compliance-matrix.md`
2. distinguish "deferred by plan" from "must still conform in MVP"
3. treat any unmarked drift found later as an implementation failure, not a planning ambiguity

That would likely have produced a cleaner BrainDrive MVP with fewer surprise drift points at the end.
