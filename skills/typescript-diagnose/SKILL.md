---
name: typescript-diagnose
description: Systematic TypeScript diagnosis workflow for compiler errors, runtime regressions, failing package scripts, unavailable local binaries, and setup blockers in TypeScript or JavaScript projects. Use when Codex must reproduce, isolate, fix, and verify TypeScript failures without installing dependencies or fetching tools automatically.
---

# TypeScript Diagnose

Use this skill when a TypeScript or JavaScript project is failing to build,
typecheck, test, lint, or load.

1. Start with the setup facts: inspect package scripts, `tsconfig*.json`,
   dependency projection, and local binaries before choosing commands.
2. Reproduce with the narrowest existing script or direct local binary. Prefer
   `check`, `typecheck`, `test`, `lint`, then `build` when available.
3. Treat missing `node_modules`, missing `tsc`, or unavailable test binaries as
   setup blockers. Do not run package-manager installs or `npx` fetches unless
   the project policy or user explicitly allows it.
4. Capture the first useful diagnostic, including file, line, code, command,
   and whether the failure is type-level, runtime, configuration, or tooling.
5. Reduce the fault to the smallest owning module, fixture, or config file.
   Avoid broad rewrites while the failing boundary is still unclear.
6. Fix the cause, not the symptom. Prefer preserving exported types and runtime
   behavior unless the work item asks for a contract change.
7. Verify with the reproducing command, then the nearest relevant package
   script. Report any remaining blocked checks with exact blocker facts.
