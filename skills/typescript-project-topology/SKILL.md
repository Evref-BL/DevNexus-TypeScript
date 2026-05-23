---
name: typescript-project-topology
description: TypeScript project topology workflow for separating source, tests, build output, package files, and domain folders without changing behavior. Use when Codex must audit, design, or adjust TypeScript repository layout, especially src/test structure, package publish boundaries, or module grouping.
---

# TypeScript Project Topology

Use this skill when a TypeScript or JavaScript project layout is being audited,
designed, or changed.

1. Classify the project first: library, CLI, app, monorepo package, or test-only
   fixture. Let package scripts, `exports`, `main`, `types`, and `files` define
   the published surface.
2. Keep buildable implementation under a clear compiler root such as `src`, and
   keep generated output under an ignored output directory such as `dist`.
3. For published packages and CLIs, prefer a central `test` tree that mirrors
   source domains. This keeps test files out of emitted declarations, package
   exports, and npm publish artifacts.
4. Colocated `*.test.ts` files are acceptable for small apps or local-only
   packages when `tsconfig`, bundler, coverage, and package publish config all
   exclude them reliably.
5. Avoid a flat source root once the package has durable domains. Group modules
   by ownership, for example `cli`, `git`, `project`, `providers`, `automation`,
   `publication`, `mcp`, and `shared`.
6. Mirror source domains in tests when using a central `test` tree. Prefer
   `test/<domain>/...` over one flat test directory for large packages.
7. Move topology in bounded mechanical steps. Preserve public imports and package
   entrypoints, update internal imports, then run focused tests before full
   package checks.
8. Do not move files solely for cosmetic symmetry. Use topology changes to
   improve ownership, packaging safety, import locality, or test discoverability.
