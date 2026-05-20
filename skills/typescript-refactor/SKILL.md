---
name: typescript-refactor
description: Bounded TypeScript refactoring workflow for improving module locality, reducing duplication, splitting broad files, moving types, and preserving public behavior. Use when Codex must change TypeScript structure while keeping verification focused and API compatibility explicit.
---

# TypeScript Refactor

Use this skill for behavior-preserving TypeScript or JavaScript structure
changes.

1. Define the boundary before editing: target files, exported API, runtime entry
   points, package scripts, and tests that should stay green.
2. Map dependencies with existing imports and exports. Prefer local helpers and
   established module patterns over new abstractions.
3. Choose the smallest refactor that improves locality or removes meaningful
   duplication. Avoid moving code just to create a tidier shape.
4. Preserve public names, exported types, and runtime semantics unless the work
   item explicitly asks for a breaking change.
5. Keep tests focused on behavior, not new implementation structure. Update
   tests only where the refactor changes observable contracts or fixture paths.
6. Run the narrowest relevant verification first. Escalate to `check` or full
   package verification when shared modules, exports, or configuration changed.
7. In the handoff, state what moved, what stayed compatible, and which command
   proved the refactor.
