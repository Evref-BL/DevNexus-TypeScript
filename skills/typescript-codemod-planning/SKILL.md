---
name: typescript-codemod-planning
description: Dry-run TypeScript bulk rewrite planning workflow for safe repeated mechanical edits, AST matching, preview evidence, rollback strategy, and human approval boundaries. Use when Codex must design or evaluate a TypeScript bulk rewrite/codemod before any broad edit.
---

# TypeScript Bulk Rewrite Planning

Use this skill when a TypeScript change may need mechanical edits across many
files. A codemod is just a scripted bulk rewrite; the default DevNexus
TypeScript policy is preview-only.

Prefer this workflow when the same edit pattern may affect more than three to
five files, such as renaming an API, moving imports, changing repeated call
shapes, or replacing a common assertion pattern.

1. Start with a read-only inventory: target file globs, excluded generated
   folders, affected exports, likely syntax patterns, and verification scripts.
2. Define the transformation in plain language and with at least two concrete
   before/after examples.
3. Choose the least risky matching strategy: TypeScript compiler API for type or
   symbol aware changes, AST matching for syntax-only edits, and text search
   only for trivial unambiguous replacements.
4. Use `typescript.bulkRewritePlan` when available. The plan must report
   matched files, matched nodes, proposed edit previews, rewrite categories,
   risks, and verification commands.
5. Do not execute write-capable codemods unless the project policy or user
   explicitly authorizes it. Current DevNexus-TypeScript policy allows dry-run
   planning only.
6. If the plan is clear, use it as evidence for manual edits or for a separate
   human-approved apply workflow.
