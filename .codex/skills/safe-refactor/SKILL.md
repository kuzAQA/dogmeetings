---
name: safe-refactor
description: Safely refactor and optimize this repository with minimal, behavior-preserving changes and focused validation.
---

# Safe Refactor

Use this skill when changing existing code to reduce code, complexity, duplication, or unnecessary state while preserving behavior.

## Operating rules

- Start with `git status --short` and `git diff --stat`; inspect only the smallest relevant dependency graph.
- Prefer Serena symbol/reference navigation when available. Search before reading; symbols before files; targeted snippets before whole files.
- Do not scan or reread the whole repository or unchanged large files unless a narrow investigation cannot answer the question.
- Before changing or deleting exported/public code, find its references and identify affected symbols.
- Preserve behavior, API contracts, UI behavior, database schema, and external interfaces unless the user explicitly requests a change.
- Prefer deleting, merging, or simplifying over adding abstractions. Do not add dependencies unless unavoidable.
- Do not perform unrelated formatting or stylistic rewrites.

## Refactoring targets

Look for high-impact, low-risk opportunities:

- dead code, duplicate logic, redundant wrappers, unnecessary helpers/components, unused imports/exports, obsolete compatibility code;
- simpler branching and data transformations;
- duplicated React UI logic and unnecessary state/effects;
- unnecessarily complex TypeScript types and API handlers.

## Pass protocol

For each independent pass:

1. Identify one candidate and estimate impact versus risk (`risk = affected surface + behavioral uncertainty`).
2. Inspect references and relevant snippets before editing.
3. Make the smallest reviewable change.
4. Run the narrowest relevant validation immediately.
5. Inspect `git diff` and confirm the change is minimal and behavior-preserving.
6. Stop and fix regressions before starting another pass.

If the task becomes broad, split it into independent passes rather than loading more repository context. Reuse known context and do not repeat unchanged inspection.

## Validation

After focused checks pass, run the project's existing typecheck, lint, tests, or build as appropriate. Prefer existing scripts and do not invent new tooling for a one-off refactor.

## Response contract

Final output must contain only:

- changed areas;
- important simplifications;
- validation performed;
- remaining high-value candidates.

Keep the response concise. Do not reproduce source code unless necessary and do not explain obvious operations.
