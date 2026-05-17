# Agent Guide For DevNexus TypeScript

DevNexus TypeScript is an additive DevNexus plugin for TypeScript and JavaScript
tooling support.

- Keep DevNexus core generic. This package declares plugin capabilities; it does
  not choose or supervise implementation work.
- Do not run package-manager installs unless explicitly requested or required
  for local package setup.
- Prefer focused tests before `npm run check`.
- Preserve unrelated changes in this repository and in any DevNexus dogfood
  project state.
