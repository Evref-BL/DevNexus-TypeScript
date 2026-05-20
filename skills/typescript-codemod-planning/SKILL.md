---
name: typescript-codemod-planning
description: Dry-run TypeScript codemod planning workflow for safe large-scale edits, AST matching, sample validation, rollback strategy, and human approval boundaries. Use when Codex must design or evaluate a TypeScript codemod before write-capable execution.
---

# TypeScript Codemod Planning

Use this skill when a TypeScript change may need mechanical edits across many
files.

1. Start with a read-only inventory: target file globs, excluded generated
   folders, affected exports, likely syntax patterns, and verification scripts.
2. Define the transformation in plain language and with at least two concrete
   before/after examples.
3. Choose the least risky matching strategy: TypeScript compiler API for type or
   symbol aware changes, AST matching for syntax-only edits, and text search
   only for trivial unambiguous replacements.
4. Plan a dry run before any write-capable command. The dry run should report
   matched files, skipped files, sample diffs, and uncertain matches.
5. State rollback and review strategy before execution: branch, commit boundary,
   generated diff size, and focused verification command.
6. Do not execute write-capable codemods unless the project policy or user
   explicitly authorizes it.
7. After execution, verify a representative sample and the relevant package
   script, then report remaining uncertain matches.
