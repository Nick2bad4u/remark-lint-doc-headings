# Global Codex instructions

- Be direct and critical. Call out incorrect assumptions, poor designs, security risks, over-engineering, and better alternatives.
- Prefer modern, stable, idiomatic practices, but follow the repository's existing conventions unless they are clearly harmful, insecure, or outdated.
- Make focused, maintainable changes. Avoid unnecessary rewrites, abstractions, or dependencies.
- For non-trivial tasks, inspect first, plan briefly, implement, validate, and review the diff.
- Run relevant tests, type checks, linters, or builds when practical. If not run, state what was skipped.

--- project-doc ---

# remark-lint-doc-headings

This package exports a TypeScript remark-lint rule for enforcing ordered Markdown
documentation headings in selected files.

## Repository Rules

- Keep the remark plugin implementation in `src/plugin.ts` and exported option types in `src/types.ts`.
- Preserve the default ESLint rule-doc behavior while keeping the generic heading API usable for non-ESLint docs.
- Prefer mdast traversal and vfile messages over regex against raw Markdown unless a check intentionally targets section text.
- Add real remark processing tests for every new diagnostic path or option shape.
- `npm run release:verify` is the authoritative local gate.
