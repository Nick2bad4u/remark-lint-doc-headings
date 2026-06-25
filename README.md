# remark-lint-doc-headings

[![NPM license.](https://flat.badgen.net/npm/license/remark-lint-doc-headings?color=purple)](https://github.com/Nick2bad4u/remark-lint-doc-headings/blob/main/LICENSE) [![NPM total downloads.](https://flat.badgen.net/npm/dt/remark-lint-doc-headings?color=pink)](https://www.npmjs.com/package/remark-lint-doc-headings) [![Latest GitHub release.](https://flat.badgen.net/github/release/Nick2bad4u/remark-lint-doc-headings?color=cyan)](https://github.com/Nick2bad4u/remark-lint-doc-headings/releases) [![GitHub open issues.](https://flat.badgen.net/github/open-issues/Nick2bad4u/remark-lint-doc-headings?color=red)](https://github.com/Nick2bad4u/remark-lint-doc-headings/issues) [![Codecov.](https://flat.badgen.net/codecov/github/Nick2bad4u/remark-lint-doc-headings?color=blue)](https://codecov.io/gh/Nick2bad4u/remark-lint-doc-headings) [![Repo Checks.](https://flat.badgen.net/github/checks/Nick2bad4u/remark-lint-doc-headings?color=green)](https://github.com/Nick2bad4u/remark-lint-doc-headings/actions)

Remark lint rule for enforcing documentation heading structure in selected
Markdown files.

The default rule is intentionally generic: it checks matched Markdown files for a
single H1 and duplicate H2 headings, then enforces H2 order and required H2
sections only when `h2Headings` is configured. ESLint rule-documentation
conventions are available as explicit `eslint` and `eslintStrict` presets.

## Install

```sh
npm install --save-dev remark-lint-doc-headings
```

## Remark Usage

```mjs
import remarkLintDocHeadings from "remark-lint-doc-headings";

export default {
 plugins: [
  [
   remarkLintDocHeadings,
   {
    include: ["docs/guides/**/*.md", "docs/reference/**/*.mdx"],
    h2Headings: [
     { heading: "Summary", required: true },
     { heading: "Usage", required: true },
     { heading: "Options" },
     { heading: "Examples" },
    ],
   },
  ],
 ],
};
```

With no options, the rule applies generic checks to Markdown-family files:

- exactly one H1 heading
- no duplicate H2 headings

## ESLint Rule Doc Presets

Use the standard ESLint rule-doc preset when you want this package’s built-in
rule documentation conventions:

```mjs
import { eslint } from "remark-lint-doc-headings";

export default {
 plugins: [eslint],
};
```

Use the strict preset when rule docs must include the generally optional
sections, package documentation labels, and rule catalog marker:

```mjs
import { eslintStrict } from "remark-lint-doc-headings";

export default {
 plugins: [eslintStrict],
};
```

The strict preset does not require `Deprecated`, because requiring a deprecated
section for every active rule would be incorrect.

## Default ESLint Rule Doc Sections

The `eslint` preset H2 sequence is:

1. `Targeted pattern scope`
2. `What this rule reports`
3. `Why this rule exists`
4. `❌ Incorrect`
5. `✅ Correct`
6. `Deprecated`
7. `Behavior and migration notes`
8. `Additional examples`
9. `ESLint flat config example`
10. `When not to use it`
11. `Package documentation`
12. `Further reading`
13. `Adoption resources`

The required default sections are `Targeted pattern scope`, `What this rule
reports`, `Why this rule exists`, `❌ Incorrect`, `✅ Correct`, and `Further
reading`.

Disable individual built-in checks with `headings`:

```mjs
[
 remarkLintDocHeadings,
 {
  headings: {
   additionalExamples: false,
   packageDocumentation: false,
  },
 },
];
```

## Options

- `include`: glob or globs to lint. Defaults to Markdown-family files.
- `exclude`: glob or globs to skip after include matching.
- `h1`: H1 validation options, or `false` to disable H1 checks.
- `h2Headings`: ordered H2 definitions with optional `required` flags.
- `detailHeadings`: H3 headings with optional allowed H2 parent headings.
- `allowUnknownHeadings`: allow H2 headings not listed in `h2Headings`.
- `headings`: built-in ESLint rule-doc heading toggles.
- `ruleNamespaceAliases`: extra aliases accepted for ESLint rule-doc H1 titles.
- `requireDeprecatedReplacementLink`: require links in `## Deprecated` sections.
  The ESLint presets enable this check.
- `requirePackageDocumentation`: require `## Package documentation`.
- `requirePackageDocumentationPlacement`: require `## Package documentation` to
  appear immediately before `## Further reading`.
- `requirePackageDocumentationLabel`: require package documentation label lines.
- `packageDocumentationLabelPattern`: label pattern as a `RegExp` or pattern
  string.
- `requireRuleCatalogId`: require exactly one rule catalog marker line.
- `ruleCatalogIdLinePattern`: catalog marker pattern as a `RegExp` or pattern
  string.

## H1 Matching

For matched files, the generic default requires exactly one H1 but does not
require it to match the file name. Set `h1.requireFileNameMatch: true` to enable
file-name matching.

When file-name matching is enabled, the rule accepts:

- the file basename without `.md` or `.mdx`
- `typescript/<rule>` for files named `typescript-<rule>.md`
- package namespace aliases inferred from `eslint-plugin-*` package names
- values passed through `h1.allowedTitles` or `ruleNamespaceAliases`

The ESLint presets enable file-name matching. Set `h1: false` for documentation
where H1 checks are not useful.
