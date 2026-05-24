---
name: typescript-quality-feedback
description: TypeScript quality feedback workflow for using diagnostics, import graphs, Sonar JSON snapshots, touched-file deltas, and rule playbooks before and after source changes. Use when Codex must audit or improve TypeScript quality, triage Sonar findings, or avoid introducing new quality regressions.
---

# TypeScript Quality Feedback

Use this skill when working on TypeScript or JavaScript source quality.

1. Start with setup facts. Confirm the project has local dependency context,
   TypeScript, a selected `tsconfig`, and usable package scripts. Report setup
   blockers instead of installing packages or fetching tools automatically.
2. Take a read-only baseline before editing when quality tools are available:
   TypeScript diagnostics, import graph cycles, and any local Sonar JSON exports.
3. Scope the work to touched files unless the work item explicitly asks for a
   broad cleanup. Avoid hiding old debt behind unrelated edits.
4. After editing, compare before/after quality snapshots for touched files.
   Call out new bugs, vulnerabilities, security hotspots, critical/blocker
   findings, failed quality-gate conditions, diagnostics, and import cycles.
5. Treat new bugs, vulnerabilities, security hotspots, and critical/blocker
   findings as stop-and-fix issues unless the user or project policy explicitly
   accepts the risk.
6. Use focused verification first, then the nearest package check. Keep Sonar or
   Docker-backed scans local unless the project has an explicit CI policy.
7. In the handoff, report the touched-file quality delta, serious remaining
   findings, verification commands, and any deferred debt.

## Rule Playbooks

### `typescript:S3776` Cognitive Complexity

Preferred fixes:

- Extract helpers around cohesive decisions or output construction.
- Replace deep nesting with guards, early returns, or named predicate helpers.
- Move repeated condition matrices into data-driven policy tables when that
  matches the domain.
- Keep behavior tests around the original path before splitting a large
  function.

Defer when the code is generated, adapter glue, or safer to split after a
broader boundary change. Do not create single-use helpers that make names worse
than the original branches.

References:

- https://www.sonarsource.com/resources/cognitive-complexity/
- https://www.sonarsource.com/blog/5-clean-code-tips-for-reducing-cognitive-complexity/

### `typescript:S5852` Regex Backtracking Risk

Preferred fixes:

- Remove nested or overlapping quantifiers on attacker-controlled or unbounded
  input.
- Constrain repetition with explicit character classes, anchors, and length
  bounds.
- Replace the regex with a parser or linear scan when the accepted language is
  not simple.
- Add worst-case tests for long non-matching inputs when the path stays regex
  based.

Defer only when the input is trusted, tightly bounded, and that bound is
enforced nearby, or when a proper parser needs separate design work.

References:

- https://www.sonarsource.com/blog/crafting-regexes-to-avoid-stack-overflows/
- https://community.sonarsource.com/t/write-efficient-error-free-and-safe-regular-expressions-in-javascript-and-typescript/47720

### `typescript:S4036` PATH Trust Boundary

Preferred fixes:

- Resolve executable paths from trusted configuration or an allowlist instead of
  ambient `PATH`.
- Sanitize `PATH` before process launch when ambient lookup is required.
- Keep process launch policy behind one helper so callers cannot bypass it.
- Test that untrusted path entries are rejected or ignored.

Defer when the command is deliberately interactive developer tooling and the
trust model is documented, or when a proper fix depends on a broader credential,
runner, or host-policy boundary.

Reference:

- https://community.sonarsource.com/t/false-positive-for-rule-typescript-s4036/142908
