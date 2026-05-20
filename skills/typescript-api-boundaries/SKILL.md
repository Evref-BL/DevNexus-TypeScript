---
name: typescript-api-boundaries
description: TypeScript API boundary review workflow for public exports, package entrypoints, type-only exports, barrels, compatibility, and module ownership. Use when Codex must add, remove, or review exported TypeScript contracts or package-facing APIs.
---

# TypeScript API Boundaries

Use this skill when a TypeScript change touches exported contracts.

1. Identify the boundary: package `exports`, `main`, `types`, index files,
   barrel modules, public classes, public functions, and exported types.
2. Classify each export as public contract, internal convenience, test fixture,
   or accidental exposure.
3. Prefer explicit exports over broad barrels when ownership or dependencies
   are unclear.
4. Keep type-only exports type-only. Avoid importing runtime values solely for
   type annotations.
5. Check downstream usage before removing or renaming an export. If downstream
   usage cannot be inspected, record the compatibility risk.
6. Update declaration-oriented tests or compile checks when public types change.
7. Verify with typechecking or `check`, and summarize any API compatibility
   decision in the PR or handoff.
