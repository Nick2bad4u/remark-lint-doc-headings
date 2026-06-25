import * as path from "node:path";
import { remark } from "remark";
import { describe, expect, it } from "vitest";

import remarkLintDocHeadings, {
    type DocHeadingsOptions,
    eslint,
    eslintOptions,
    eslintStrict,
} from "../src/plugin.js";

const fixturePath = path.resolve("docs/rules/no-bad-practice.md");

async function processMarkdown(markdown: string, options?: DocHeadingsOptions) {
    const processor = remark();

    if (options === undefined) {
        processor.use(remarkLintDocHeadings);
    } else {
        processor.use(remarkLintDocHeadings, options);
    }

    return processor.process({ path: fixturePath, value: markdown });
}

describe("remark-lint-doc-headings", () => {
    it("applies generic heading checks by default", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings)
            .process({
                path: path.resolve("docs/guide.md"),
                value: "# Guide\n\n## Setup\n\n## Setup\n\n## Deprecated\n\nNo replacement link.\n",
            });

        expect(file.messages.map((message) => message.reason)).toStrictEqual([
            "Duplicate H2 heading `Setup` is not allowed.",
        ]);
    });

    it("accepts the default ESLint rule-doc heading order", async () => {
        const file = await processMarkdown(
            `# no-bad-practice

## Targeted pattern scope

### Matched patterns

Examples.

### Detection boundaries

Boundaries.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

\`\`\`js
bad();
\`\`\`

## ✅ Correct

\`\`\`js
good();
\`\`\`

## Further reading

- [Reference](https://example.com)
`,
            eslintOptions
        );

        expect(file.messages).toStrictEqual([]);
    });

    it("reports missing, unknown, duplicate, and out-of-order H2 headings", async () => {
        const file = await processMarkdown(
            `# no-bad-practice

## Why this rule exists

Rationale.

## Targeted pattern scope

Scope.

## Unknown

Unexpected.

## Unknown

Duplicate.
`,
            eslintOptions
        );

        expect(file.messages.map((message) => message.ruleId)).toStrictEqual([
            "doc-headings",
            "doc-headings",
            "doc-headings",
            "doc-headings",
            "doc-headings",
            "doc-headings",
            "doc-headings",
            "doc-headings",
        ]);
        expect(file.messages.map((message) => message.reason)).toEqual(
            expect.arrayContaining([
                "Duplicate H2 heading `Unknown` is not allowed.",
                expect.stringContaining("Unexpected H2 heading `Unknown`."),
                expect.stringContaining(
                    "Heading `Targeted pattern scope` is out of order."
                ),
                "Missing required H2 heading `What this rule reports`.",
                "Missing required H2 heading `❌ Incorrect`.",
                "Missing required H2 heading `✅ Correct`.",
                "Missing required H2 heading `Further reading`.",
            ])
        );
    });

    it("validates H1 headings with package namespace aliases", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, {
                ...eslintOptions,
                ruleNamespaceAliases: ["custom-plugin"],
            })
            .process({
                path: fixturePath,
                value: `# custom-plugin/no-bad-practice

## Targeted pattern scope

Scope.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

Bad.

## ✅ Correct

Good.

## Further reading

Reference.
`,
            });

        expect(file.messages).toStrictEqual([]);
    });

    it("supports custom includes and heading definitions", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, {
                h1: false,
                h2Headings: [
                    { heading: "Summary", required: true },
                    { heading: "Usage", required: true },
                    { heading: "Reference", required: false },
                ],
                include: "guides/**/*.md",
            })
            .process({
                path: path.resolve("guides/getting-started.md"),
                value: `# Getting started

## Usage

Use it.

## Summary

Summary.
`,
            });

        expect(file.messages.map((message) => message.reason)).toEqual(
            expect.arrayContaining([
                "Heading `Summary` is out of order. Follow the configured heading sequence.",
            ])
        );
    });

    it("can allow configured H2 headings in any order", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, {
                h1: false,
                h2Headings: [
                    { heading: "Summary", required: true },
                    { heading: "Usage", required: true },
                    { heading: "Reference", required: false },
                ],
                include: "guides/**/*.md",
                requireH2HeadingOrder: false,
            })
            .process({
                path: path.resolve("guides/getting-started.md"),
                value: `# Getting started

## Usage

Use it.

## Summary

Summary.
`,
            });

        expect(file.messages).toStrictEqual([]);
    });

    it("can report skipped heading levels", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, {
                requireNoSkippedHeadingLevels: true,
            })
            .process({
                path: path.resolve("docs/guide.md"),
                value: `# Guide

### Details

## Usage

#### Nested
`,
            });

        expect(file.messages.map((message) => message.reason)).toStrictEqual([
            "Heading levels must not skip from H1 to H3.",
            "Heading levels must not skip from H2 to H4.",
        ]);
    });

    it("supports remark-lint severity tuple configuration", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, [
                2,
                {
                    h1: false,
                    h2Headings: [
                        { heading: "Summary", required: true },
                        { heading: "Usage", required: true },
                    ],
                    include: "guides/**/*.md",
                },
            ])
            .process({
                path: path.resolve("guides/getting-started.md"),
                value: "# Getting started\n\n## Summary\n\nSummary.\n",
            });

        expect(file.messages).toHaveLength(1);
        expect(file.messages[0]?.fatal).toBe(true);
        expect(file.messages[0]?.reason).toBe(
            "Missing required H2 heading `Usage`."
        );
    });

    it("does not apply ESLint-specific deprecated checks to custom heading schemas by default", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, {
                h1: false,
                h2Headings: [
                    { heading: "Summary", required: true },
                    { heading: "Deprecated" },
                ],
                include: "guides/**/*.md",
            })
            .process({
                path: path.resolve("guides/migration.md"),
                value: "# Migration\n\n## Summary\n\nSummary.\n\n## Deprecated\n\nOld behavior.\n",
            });

        expect(file.messages).toStrictEqual([]);
    });

    it("allows custom heading schemas to opt into deprecated replacement links", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings, {
                h1: false,
                h2Headings: [
                    { heading: "Summary", required: true },
                    { heading: "Deprecated" },
                ],
                include: "guides/**/*.md",
                requireDeprecatedReplacementLink: true,
            })
            .process({
                path: path.resolve("guides/migration.md"),
                value: "# Migration\n\n## Summary\n\nSummary.\n\n## Deprecated\n\nOld behavior.\n",
            });

        expect(file.messages.map((message) => message.reason)).toStrictEqual([
            "`## Deprecated` should include a link to the recommended replacement rule or package.",
        ]);
    });

    it("ignores files outside configured include globs", async () => {
        const file = await remark()
            .use(remarkLintDocHeadings)
            .process({
                path: path.resolve("README.md"),
                value: "# README\n\n## Anything\n",
            });

        expect(file.messages).toStrictEqual([]);
    });

    it("accepts default package documentation labels when required", async () => {
        const file = await processMarkdown(
            `# no-bad-practice

## Targeted pattern scope

Scope.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

Bad.

## ✅ Correct

Good.

## Package documentation

remark-lint-doc-headings package documentation:

## Further reading

> **Rule catalog ID:** R001
`,
            {
                ...eslintOptions,
                requirePackageDocumentation: true,
                requirePackageDocumentationLabel: true,
                requireRuleCatalogId: true,
            }
        );

        expect(file.messages).toStrictEqual([]);
    });

    it("reports detail headings that violate the configured detail order", async () => {
        const file = await processMarkdown(
            `# no-bad-practice

## Targeted pattern scope

### Detection boundaries

Boundaries.

### Matched patterns

Patterns.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

Bad.

## ✅ Correct

Good.

## Further reading

Reference.
`,
            eslintOptions
        );

        expect(file.messages.map((message) => message.reason)).toEqual(
            expect.arrayContaining([
                "`### Detection boundaries` must appear after `### Matched patterns`.",
            ])
        );
    });

    it("checks special package documentation and rule catalog sections when enabled", async () => {
        const file = await processMarkdown(
            `# no-bad-practice

## Targeted pattern scope

Scope.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

Bad.

## ✅ Correct

Good.

## Package documentation

No label.

## Further reading

Reference.
`,
            {
                ...eslintOptions,
                requirePackageDocumentation: true,
                requirePackageDocumentationLabel: true,
                requireRuleCatalogId: true,
            }
        );

        expect(file.messages.map((message) => message.reason)).toEqual(
            expect.arrayContaining([
                "`## Package documentation` must include at least one `<package> package documentation:` label line.",
                "Missing required rule catalog marker line `> **Rule catalog ID:** R###`.",
            ])
        );
    });

    it("exports an ESLint preset for standard rule docs", async () => {
        const file = await remark()
            .use(eslint)
            .process({
                path: fixturePath,
                value: `# no-bad-practice

## Targeted pattern scope

Scope.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

Bad.

## ✅ Correct

Good.

## Further reading

Reference.
`,
            });

        expect(file.messages).toStrictEqual([]);
    });

    it("exports a strict ESLint preset with generally optional headings required", async () => {
        const file = await remark()
            .use(eslintStrict)
            .process({
                path: fixturePath,
                value: `# no-bad-practice

## Targeted pattern scope

Scope.

## What this rule reports

Reports.

## Why this rule exists

Rationale.

## ❌ Incorrect

Bad.

## ✅ Correct

Good.

## Further reading

Reference.
`,
            });

        expect(file.messages.map((message) => message.reason)).toEqual(
            expect.arrayContaining([
                "Missing required H2 heading `Behavior and migration notes`.",
                "Missing required H2 heading `Additional examples`.",
                "Missing required H2 heading `ESLint flat config example`.",
                "Missing required H2 heading `When not to use it`.",
                "Missing required `## Package documentation` section.",
                "Missing required rule catalog marker line `> **Rule catalog ID:** R###`.",
            ])
        );
        expect(file.messages.map((message) => message.reason)).not.toContain(
            "Missing required H2 heading `Deprecated`."
        );
    });
});
