# Agent Guide For DevNexus TypeScript

DevNexus TypeScript is an additive DevNexus plugin for TypeScript and JavaScript
tooling support.

- Keep DevNexus core generic. This package declares plugin capabilities; it does
  not choose or supervise implementation work.
- Do not run package-manager installs unless explicitly requested or required
  for local package setup.
- For source quality work, take a TypeScript quality snapshot before editing,
  compare the touched-file delta afterward, and treat new bugs, vulnerabilities,
  security hotspots, and critical/blocker findings as stop-and-fix issues.
- Prefer focused tests before `npm run check`; use `npm run check` before
  claiming source changes are ready.
- Keep local quality reports and scanner runtime output out of Git. `.quality/`
  and `.scannerwork/` are ignored for that reason.
- Preserve unrelated changes in this repository and in any DevNexus dogfood
  project state.
