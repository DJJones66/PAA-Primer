# PAA-Primer

PAA-Primer is an AI-facing architecture primer and build-audit reference layer for working against the Personal AI Architecture.

## What This Repository Is

This repository contains a compressed, operational documentation layer designed for AI-assisted implementation and architecture review. It turns the deeper architecture material into a build-and-audit system with:

- architecture primers by area
- contract docs
- a compliance matrix
- accepted MVP limits
- review checklists
- an audit playbook
- traceability and completeness tooling
- standalone valid and invalid examples

## Upstream Foundation

This project adapts the architectural patterns from [Personal AI Architecture](https://github.com/Personal-AI-Architecture/the-architecture).

It is based on the upstream foundation architecture and is intended as a derived primer layer for implementation and audit work. It does not imply official affiliation or endorsement by the upstream project.

## Repository Structure

- `docs/ai/` - the AI primer layer
- `docs/ai/compliance-matrix.md` - pass/fail architecture rules
- `docs/ai/index.md` - routing entrypoint into the primer system
- `docs/ai/review-checklists/` - targeted review checklists by area
- `docs/ai/examples/` - canonical valid and invalid payload/config examples
- `spec/` - build-plan and primer-oriented planning artifacts

## Start Here

If you are using this repo to build or review a system:

1. Read `docs/ai/index.md`
2. Read `docs/ai/compliance-matrix.md`
3. Use `docs/ai/build-sequence.md` for implementation order
4. Use `docs/ai/primer-audit-playbook.md` for review work
5. Use `docs/ai/primer-completeness-test.md` to prove the primer can stand alone

## Validation

Examples manifest validation:

```bash
python docs/ai/examples/validate-manifest.py
```

## Why This Exists

The goal is to reduce architecture drift during AI-assisted implementation by making the architecture easier to consume, easier to cite, and easier to audit without falling back to large human-readable documents for every decision.

## License

This repository is licensed under the MIT License. See `LICENSE`.
