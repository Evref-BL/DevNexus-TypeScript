---
name: typescript-test-hygiene
description: TypeScript test hygiene workflow for adding focused coverage, reducing brittle tests, keeping fixtures realistic, and choosing appropriate package scripts. Use when Codex must create, repair, or simplify TypeScript tests without expanding the suite unnecessarily.
---

# TypeScript Test Hygiene

Use this skill when adding or changing TypeScript tests.

1. State the behavior or regression the test protects before writing it.
2. Prefer one focused test near the affected module over broad integration
   coverage unless the bug crosses module boundaries.
3. Build fixtures with ordinary project APIs and realistic data. Keep synthetic
   files minimal, named, and easy to inspect.
4. Avoid brittle assertions against incidental ordering, generated formatting,
   absolute temp paths, timestamps, or full snapshots unless those details are
   the contract under test.
5. Keep test helpers small. Extract a helper only when it removes repeated setup
   that obscures the behavior being asserted.
6. Verify the focused test first, then the nearest relevant package script.
7. If the test suite is already oversized, prefer deleting or consolidating
   redundant assertions only when the remaining coverage still protects the
   behavior.
