# remark-lint-doc-headings

[![NPM license.](https://flat.badgen.net/npm/license/remark-lint-doc-headings?color=purple)](https://github.com/Nick2bad4u/remark-lint-doc-headings/blob/main/LICENSE) [![NPM total downloads.](https://flat.badgen.net/npm/dt/remark-lint-doc-headings?color=pink)](https://www.npmjs.com/package/remark-lint-doc-headings) [![Latest GitHub release.](https://flat.badgen.net/github/release/Nick2bad4u/remark-lint-doc-headings?color=cyan)](https://github.com/Nick2bad4u/remark-lint-doc-headings/releases) [![GitHub open issues.](https://flat.badgen.net/github/open-issues/Nick2bad4u/remark-lint-doc-headings?color=red)](https://github.com/Nick2bad4u/remark-lint-doc-headings/issues) [![Codecov.](https://flat.badgen.net/codecov/github/Nick2bad4u/remark-lint-doc-headings?color=blue)](https://codecov.io/gh/Nick2bad4u/remark-lint-doc-headings) [![Repo Checks.](https://flat.badgen.net/github/checks/Nick2bad4u/remark-lint-doc-headings?color=green)](https://github.com/Nick2bad4u/remark-lint-doc-headings/actions)

Remark lint rule for enforcing ordered documentation headings in selected
Markdown files.

The default preset targets ESLint rule documentation under `docs/rules/**/*.md`.
It checks the H1 title, canonical H2 order, required rule-doc sections, duplicate
headings, optional H3 detail heading placement, deprecated-section replacement
links, package documentation labels, and rule catalog markers. Projects can
replace the default headings and globs for non-ESLint documentation.

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
    requirePackageDocumentation: true,
    requireRuleCatalogId: true,
    ruleNamespaceAliases: ["my-plugin"],
   },
  ],
 ],
};
```

## Custom Headings

Use `include`, `exclude`, and `h2Headings` when a project has its own
documentation layout:

```mjs
import remarkLintDocHeadings from "remark-lint-doc-headings";

export default {
 plugins: [
  [
   remarkLintDocHeadings,
   {
    h1: false,
    include: ["docs/guides/**/*.md", "docs/reference/**/*.mdx"],
    h2Headings: [
     { heading: "Summary", required: true },
     { heading: "Usage", required: true },
     { heading: "Options" },
     { heading: "Examples" },
     { heading: "Troubleshooting" },
    ],
   },
  ],
 ],
};
```

## Default ESLint Rule Doc Sections

The built-in H2 sequence is:

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

- `include`: glob or globs to lint. Defaults to `docs/rules/**/*.md`.
- `exclude`: glob or globs to skip after include matching. Defaults to common
  non-rule docs under `docs/rules`.
- `h1`: H1 validation options, or `false` to disable H1 checks.
- `h2Headings`: ordered H2 definitions with optional `required` flags.
- `detailHeadings`: H3 headings with optional allowed H2 parent headings.
- `allowUnknownHeadings`: allow H2 headings not listed in `h2Headings`.
- `headings`: built-in ESLint rule-doc heading toggles.
- `ruleNamespaceAliases`: extra aliases accepted for ESLint rule-doc H1 titles.
- `requireDeprecatedReplacementLink`: require links in `## Deprecated` sections.
- `requirePackageDocumentation`: require `## Package documentation`.
- `requirePackageDocumentationLabel`: require package documentation label lines.
- `packageDocumentationLabelPattern`: label pattern as a `RegExp` or pattern
  string.
- `requireRuleCatalogId`: require exactly one rule catalog marker line.
- `ruleCatalogIdLinePattern`: catalog marker pattern as a `RegExp` or pattern
  string.

## H1 Matching

For matched files, the default H1 rule requires exactly one H1 and accepts:

- the file basename without `.md` or `.mdx`
- `typescript/<rule>` for files named `typescript-<rule>.md`
- package namespace aliases inferred from `eslint-plugin-*` package names
- values passed through `h1.allowedTitles` or `ruleNamespaceAliases`

Set `h1: false` for generic documentation where file-name-based H1 checks are
not useful.
