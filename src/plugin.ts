import type { Heading, Root } from "mdast";
import type { Plugin } from "unified";
import type { Node } from "unist";
import type { VFile } from "vfile";

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import picomatch from "picomatch";
import { arrayFirst, arrayJoin } from "ts-extras";
import { lintRule } from "unified-lint-rule";

import type {
    DetailHeadingDefinition,
    DocHeadingsConfig,
    DocHeadingsOptions,
    H1Options,
    HeadingDefinition,
    PathPattern,
    PatternExpression,
    RuleDocHeadingKey,
} from "./types.js";

export type {
    DetailHeadingDefinition,
    DocHeadingsConfig,
    DocHeadingsOptions,
    H1Options,
    HeadingDefinition,
    PathPattern,
    PatternExpression,
    RuleDocDetailHeadingKey,
    RuleDocHeadingKey,
    RuleDocPrimaryHeadingKey,
} from "./types.js";

interface BuiltInDetailHeadingDefinition extends DetailHeadingDefinition {
    readonly key: RuleDocHeadingKey;
}

interface BuiltInHeadingDefinition extends HeadingDefinition {
    readonly key: RuleDocHeadingKey;
}

interface NormalizedOptions {
    readonly allowUnknownHeadings: boolean;
    readonly detailHeadings: readonly DetailHeadingDefinition[];
    readonly exclude: PathPattern;
    readonly h1: false | H1Options;
    readonly h2Headings: readonly HeadingDefinition[];
    readonly include: PathPattern;
    readonly packageDocumentationLabelPattern: RegExp;
    readonly requireDeprecatedReplacementLink: boolean;
    readonly requirePackageDocumentation: boolean;
    readonly requirePackageDocumentationLabel: boolean;
    readonly requireRuleCatalogId: boolean;
    readonly ruleCatalogIdLinePattern: RegExp;
    readonly ruleNamespaceAliases: readonly string[];
}

interface PackageMetadata {
    readonly name?: unknown;
}

const origin = "remark-lint:doc-headings";
const url = "https://github.com/Nick2bad4u/remark-lint-doc-headings";
const eslintPluginPackagePrefix = "eslint-plugin-";
const packageMetadataCache = new Map<string, PackageMetadata | undefined>();

const defaultInclude = "docs/rules/**/*.md";
const defaultExclude = [
    "docs/rules/getting-started.md",
    "docs/rules/overview.md",
    "docs/rules/presets/**",
] as const;
const defaultRuleCatalogIdLinePattern = /^> \*\*Rule catalog ID:\*\* R\d{3}$/v;
const defaultPackageDocumentationLabelPattern = /package documentation:$/mv;

const eslintRuleDocHeadings = [
    {
        heading: "Targeted pattern scope",
        key: "targetedPatternScope",
        required: true,
    },
    {
        heading: "What this rule reports",
        key: "whatThisRuleReports",
        required: true,
    },
    {
        heading: "Why this rule exists",
        key: "whyThisRuleExists",
        required: true,
    },
    { heading: "❌ Incorrect", key: "incorrect", required: true },
    { heading: "✅ Correct", key: "correct", required: true },
    { heading: "Deprecated", key: "deprecated", required: false },
    {
        heading: "Behavior and migration notes",
        key: "behaviorAndMigrationNotes",
        required: false,
    },
    {
        heading: "Additional examples",
        key: "additionalExamples",
        required: false,
    },
    {
        heading: "ESLint flat config example",
        key: "eslintFlatConfigExample",
        required: false,
    },
    {
        heading: "When not to use it",
        key: "whenNotToUseIt",
        required: false,
    },
    {
        heading: "Package documentation",
        key: "packageDocumentation",
        required: false,
    },
    {
        heading: "Further reading",
        key: "furtherReading",
        required: true,
    },
    {
        heading: "Adoption resources",
        key: "adoptionResources",
        required: false,
    },
] as const satisfies readonly BuiltInHeadingDefinition[];

const eslintRuleDocDetailHeadings = [
    {
        heading: "Matched patterns",
        key: "matchedPatterns",
        parents: ["Targeted pattern scope", "What this rule reports"],
        required: false,
    },
    {
        heading: "Detection boundaries",
        key: "detectionBoundaries",
        parents: ["Targeted pattern scope", "What this rule reports"],
        required: false,
    },
] as const satisfies readonly BuiltInDetailHeadingDefinition[];

const defaultHeadingToggles = Object.freeze({
    additionalExamples: true,
    adoptionResources: true,
    behaviorAndMigrationNotes: true,
    correct: true,
    deprecated: true,
    detectionBoundaries: true,
    eslintFlatConfigExample: true,
    furtherReading: true,
    incorrect: true,
    matchedPatterns: true,
    packageDocumentation: true,
    targetedPatternScope: true,
    whatThisRuleReports: true,
    whenNotToUseIt: true,
    whyThisRuleExists: true,
} satisfies Partial<Record<RuleDocHeadingKey, boolean>>);

/** Unified-compatible plugin type for the doc-headings lint rule. */
export type DocHeadingsPlugin = Plugin<[config?: DocHeadingsConfig], Root>;

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

function getEnabledBuiltInHeadings(
    headings: Partial<Record<RuleDocHeadingKey, boolean>> | undefined
): readonly BuiltInHeadingDefinition[] {
    const toggles = { ...defaultHeadingToggles, ...headings };

    return eslintRuleDocHeadings.filter(
        (definition) => toggles[definition.key]
    );
}

function getEnabledDetailHeadings(
    headings: Partial<Record<RuleDocHeadingKey, boolean>> | undefined
): readonly DetailHeadingDefinition[] {
    const toggles = { ...defaultHeadingToggles, ...headings };

    return eslintRuleDocDetailHeadings.filter(
        (definition) => toggles[definition.key]
    );
}

function getExpectedH1Titles(
    fileRuleId: string,
    ruleNamespaceAliases: readonly string[],
    h1Options: H1Options
): readonly string[] {
    const expectedTitles = new Set<string>(h1Options.allowedTitles);

    if (h1Options.requireFileNameMatch !== false) {
        expectedTitles.add(fileRuleId);
    }

    if (fileRuleId.startsWith("typescript-")) {
        expectedTitles.add(`typescript/${fileRuleId.slice(11)}`);
    }

    for (const ruleNamespaceAlias of ruleNamespaceAliases) {
        expectedTitles.add(`${ruleNamespaceAlias}/${fileRuleId}`);
    }

    return [...expectedTitles];
}

function getHeadingsByDepth(
    tree: Root,
    depth: Heading["depth"]
): readonly Heading[] {
    return tree.children.filter(
        (node): node is Heading => isHeadingNode(node) && node.depth === depth
    );
}

function getNearestPackageMetadata(
    documentPath: string
): PackageMetadata | undefined {
    const traversedDirectories: string[] = [];
    let currentDirectory = path.dirname(documentPath);

    while (true) {
        traversedDirectories.push(currentDirectory);

        if (packageMetadataCache.has(currentDirectory)) {
            const cached = packageMetadataCache.get(currentDirectory);

            for (const directory of traversedDirectories) {
                packageMetadataCache.set(directory, cached);
            }

            return cached;
        }

        const packageJsonPath = path.join(currentDirectory, "package.json");

        if (existsSync(packageJsonPath)) {
            let metadata: PackageMetadata | undefined;

            try {
                const parsedMetadata: unknown = JSON.parse(
                    readFileSync(packageJsonPath, "utf8")
                );

                metadata =
                    typeof parsedMetadata === "object" &&
                    parsedMetadata !== null
                        ? parsedMetadata
                        : undefined;
            } catch {
                metadata = undefined;
            }

            for (const directory of traversedDirectories) {
                packageMetadataCache.set(directory, metadata);
            }

            return metadata;
        }

        const parentDirectory = path.dirname(currentDirectory);

        if (parentDirectory === currentDirectory) {
            for (const directory of traversedDirectories) {
                packageMetadataCache.set(directory, undefined);
            }

            return undefined;
        }

        currentDirectory = parentDirectory;
    }
}

function getNodeText(node: Node): string {
    if (hasValue(node)) {
        return node.value;
    }

    if (hasChildren(node)) {
        return arrayJoin(
            node.children.map((child) => getNodeText(child)),
            ""
        );
    }

    return "";
}

function getPatternExpression(
    expression: PatternExpression | undefined,
    fallback: RegExp
): RegExp {
    if (expression === undefined) {
        return fallback;
    }

    return typeof expression === "string"
        ? new RegExp(expression, "u")
        : expression;
}

function getRuleNamespaceAliasesFromPackageName(
    packageName: string
): readonly string[] {
    if (packageName.startsWith(eslintPluginPackagePrefix)) {
        const pluginName = packageName.slice(eslintPluginPackagePrefix.length);

        return pluginName === "" ? [] : [pluginName];
    }

    if (!packageName.startsWith("@")) {
        return [];
    }

    const packageSeparatorIndex = packageName.indexOf("/");

    if (packageSeparatorIndex === -1) {
        return [];
    }

    const packageScope = packageName.slice(0, packageSeparatorIndex);
    const scopedPackageName = packageName.slice(packageSeparatorIndex + 1);

    if (!scopedPackageName.startsWith(eslintPluginPackagePrefix)) {
        return [];
    }

    const pluginName = scopedPackageName.slice(
        eslintPluginPackagePrefix.length
    );

    return pluginName === ""
        ? []
        : [pluginName, `${packageScope}/${pluginName}`];
}

function getSectionContent(
    file: VFile,
    sectionHeading: Heading,
    nextSectionHeading: Heading | undefined
): string {
    const sectionPosition = sectionHeading.position;
    const nextSectionPosition = nextSectionHeading?.position;
    const sectionStartOffset =
        sectionPosition === undefined ? undefined : sectionPosition.end.offset;
    const nextSectionOffset =
        nextSectionPosition === undefined
            ? undefined
            : nextSectionPosition.start.offset;
    const startOffset =
        typeof sectionStartOffset === "number" ? sectionStartOffset : 0;
    const endOffset =
        typeof nextSectionOffset === "number"
            ? nextSectionOffset
            : String(file.value).length;

    return String(file.value).slice(startOffset, endOffset);
}

function hasChildren(
    value: unknown
): value is { readonly children: readonly Node[] } {
    return (
        typeof value === "object" &&
        value !== null &&
        "children" in value &&
        Array.isArray(value.children)
    );
}

function hasMarkdownLinkMarker(markdown: string): boolean {
    return (
        markdown.includes("[") &&
        markdown.includes("](") &&
        markdown.includes(")")
    );
}

function hasValue(value: unknown): value is { readonly value: string } {
    return (
        typeof value === "object" &&
        value !== null &&
        "value" in value &&
        typeof value.value === "string"
    );
}

function isHeadingNode(node: Node): node is Heading {
    return node.type === "heading" && "depth" in node;
}

function isMatchingPattern(filePath: string, patterns: PathPattern): boolean {
    const normalizedPatterns = patternsToArray(patterns).map((pattern) =>
        normalizePath(pattern)
    );

    return pathCandidates(filePath).some((candidate) =>
        normalizedPatterns.some((pattern) =>
            picomatch.isMatch(candidate, pattern, { dot: true })
        )
    );
}

function normalizeOptions(
    options: DocHeadingsOptions | false
): NormalizedOptions {
    if (options === false) {
        return {
            allowUnknownHeadings: true,
            detailHeadings: [],
            exclude: [],
            h1: false,
            h2Headings: [],
            include: [],
            packageDocumentationLabelPattern:
                defaultPackageDocumentationLabelPattern,
            requireDeprecatedReplacementLink: false,
            requirePackageDocumentation: false,
            requirePackageDocumentationLabel: false,
            requireRuleCatalogId: false,
            ruleCatalogIdLinePattern: defaultRuleCatalogIdLinePattern,
            ruleNamespaceAliases: [],
        };
    }

    const h1 = options.h1 ?? {
        requireExactlyOne: true,
        requireFileNameMatch: true,
    };

    return {
        allowUnknownHeadings: options.allowUnknownHeadings ?? false,
        detailHeadings:
            options.detailHeadings ??
            getEnabledDetailHeadings(options.headings),
        exclude: options.exclude ?? defaultExclude,
        h1,
        h2Headings:
            options.h2Headings ?? getEnabledBuiltInHeadings(options.headings),
        include: options.include ?? defaultInclude,
        packageDocumentationLabelPattern: getPatternExpression(
            options.packageDocumentationLabelPattern,
            defaultPackageDocumentationLabelPattern
        ),
        requireDeprecatedReplacementLink:
            options.requireDeprecatedReplacementLink ?? true,
        requirePackageDocumentation:
            options.requirePackageDocumentation ?? false,
        requirePackageDocumentationLabel:
            options.requirePackageDocumentationLabel ??
            options.packageDocumentationLabelPattern !== undefined,
        requireRuleCatalogId:
            options.requireRuleCatalogId ??
            options.ruleCatalogIdLinePattern !== undefined,
        ruleCatalogIdLinePattern: getPatternExpression(
            options.ruleCatalogIdLinePattern,
            defaultRuleCatalogIdLinePattern
        ),
        ruleNamespaceAliases: options.ruleNamespaceAliases ?? [],
    };
}

function pathCandidates(filePath: string): readonly string[] {
    const normalized = normalizePath(filePath);
    const candidates = new Set([normalized]);

    if (path.isAbsolute(filePath)) {
        const relativePath = path.relative(process.cwd(), filePath);

        candidates.add(normalizePath(relativePath));
    }

    return [...candidates];
}

function patternsToArray(patterns: PathPattern): readonly string[] {
    return typeof patterns === "string" ? [patterns] : patterns;
}

function report(file: VFile, reason: string, place: Heading | undefined): void {
    file.message(reason, place);
}

function validateDetailHeadings(
    tree: Root,
    file: VFile,
    detailHeadings: readonly DetailHeadingDefinition[]
): void {
    const detailHeadingByTitle = new Map(
        detailHeadings.map((heading) => [heading.heading, heading])
    );
    let currentH2HeadingName: string | undefined;
    const detailHeadingIndexes = new Map<string, number>();

    for (const [index, node] of tree.children.entries()) {
        if (!isHeadingNode(node)) {
            continue;
        }

        const headingName = getNodeText(node).trim();

        if (node.depth === 2) {
            currentH2HeadingName = headingName;
            continue;
        }

        if (node.depth !== 3) {
            continue;
        }

        const detailHeading = detailHeadingByTitle.get(headingName);

        if (detailHeading === undefined) {
            continue;
        }

        if (
            detailHeading.parents !== undefined &&
            !detailHeading.parents.includes(currentH2HeadingName ?? "")
        ) {
            report(
                file,
                `\`### ${headingName}\` must be placed under one of: ${arrayJoin(
                    detailHeading.parents.map((parent) => `\`## ${parent}\``),
                    ", "
                )}.`,
                node
            );
        }

        detailHeadingIndexes.set(headingName, index);
    }

    for (const [leftIndex, left] of detailHeadings.entries()) {
        const leftHeadingIndex = detailHeadingIndexes.get(left.heading);

        if (leftHeadingIndex === undefined) {
            continue;
        }

        for (const right of detailHeadings.slice(0, leftIndex)) {
            const rightHeadingIndex = detailHeadingIndexes.get(right.heading);

            if (
                rightHeadingIndex !== undefined &&
                leftHeadingIndex < rightHeadingIndex
            ) {
                report(
                    file,
                    `\`### ${left.heading}\` must appear after \`### ${right.heading}\`.`,
                    tree.children[leftHeadingIndex] as Heading
                );
            }
        }
    }
}

function validateDuplicateHeadings(
    file: VFile,
    h2Headings: readonly Heading[]
): void {
    const seenHeadings = new Set<string>();

    for (const heading of h2Headings) {
        const headingName = getNodeText(heading).trim();

        if (seenHeadings.has(headingName)) {
            report(
                file,
                `Duplicate H2 heading \`${headingName}\` is not allowed.`,
                heading
            );
            continue;
        }

        seenHeadings.add(headingName);
    }
}

function validateH1(
    tree: Root,
    file: VFile,
    normalizedFilePath: string,
    options: NormalizedOptions
): void {
    if (options.h1 === false) {
        return;
    }

    const h1Headings = getHeadingsByDepth(tree, 1);

    if ((options.h1.requireExactlyOne ?? true) && h1Headings.length !== 1) {
        report(
            file,
            "Matched documents must contain exactly one H1 heading.",
            arrayFirst(h1Headings)
        );
    }

    if (h1Headings.length !== 1) {
        return;
    }

    const expectedFileTitle = normalizedFilePath
        .split("/")
        .at(-1)
        ?.replace(/\.mdx?$/v, "");

    if (expectedFileTitle === undefined) {
        return;
    }

    const packageMetadata = getNearestPackageMetadata(file.path);
    const packageAliases =
        typeof packageMetadata?.name === "string"
            ? getRuleNamespaceAliasesFromPackageName(packageMetadata.name)
            : [];
    const expectedTitles = getExpectedH1Titles(
        expectedFileTitle,
        [...new Set([...packageAliases, ...options.ruleNamespaceAliases])],
        options.h1
    );

    if (expectedTitles.length === 0) {
        return;
    }

    const h1Heading = arrayFirst(h1Headings);

    if (h1Heading === undefined) {
        return;
    }

    const actualTitle = getNodeText(h1Heading).trim();

    if (!expectedTitles.includes(actualTitle)) {
        report(
            file,
            `H1 heading must match one of: ${arrayJoin(
                expectedTitles.map((title) => `\`${title}\``),
                ", "
            )}.`,
            h1Heading
        );
    }
}

function validateH2Headings(
    file: VFile,
    h2Headings: readonly Heading[],
    options: NormalizedOptions
): void {
    const configuredHeadings = options.h2Headings;
    const headingOrderIndex = new Map(
        configuredHeadings.map((heading, index) => [heading.heading, index])
    );
    const headingNames = h2Headings.map((heading) =>
        getNodeText(heading).trim()
    );
    let lastOrder = -1;

    for (const [index, headingName] of headingNames.entries()) {
        const headingOrder = headingOrderIndex.get(headingName);
        const headingNode = h2Headings[index];

        if (headingOrder === undefined) {
            if (!options.allowUnknownHeadings) {
                report(
                    file,
                    `Unexpected H2 heading \`${headingName}\`. Allowed H2 headings: ${arrayJoin(
                        configuredHeadings.map((heading) => heading.heading),
                        ", "
                    )}.`,
                    headingNode
                );
            }

            continue;
        }

        if (headingOrder < lastOrder) {
            report(
                file,
                `Heading \`${headingName}\` is out of order. Follow the configured heading sequence.`,
                headingNode
            );
        }

        lastOrder = headingOrder;
    }

    for (const requiredHeading of configuredHeadings) {
        if (requiredHeading.required !== true) {
            continue;
        }

        if (!headingNames.includes(requiredHeading.heading)) {
            report(
                file,
                `Missing required H2 heading \`${requiredHeading.heading}\`.`,
                undefined
            );
        }
    }
}

function validateSpecialSections(
    file: VFile,
    h2Headings: readonly Heading[],
    options: NormalizedOptions
): void {
    const headingNames = h2Headings.map((heading) =>
        getNodeText(heading).trim()
    );
    const packageDocumentationIndex = headingNames.indexOf(
        "Package documentation"
    );
    const deprecatedSectionIndex = headingNames.indexOf("Deprecated");
    const furtherReadingIndex = headingNames.indexOf("Further reading");

    if (
        options.requirePackageDocumentation &&
        packageDocumentationIndex === -1
    ) {
        report(
            file,
            "Missing required `## Package documentation` section.",
            undefined
        );
    }

    if (
        options.requireDeprecatedReplacementLink &&
        deprecatedSectionIndex !== -1
    ) {
        const deprecatedHeading = h2Headings[deprecatedSectionIndex];

        if (deprecatedHeading === undefined) {
            return;
        }

        const deprecatedContent = getSectionContent(
            file,
            deprecatedHeading,
            h2Headings[deprecatedSectionIndex + 1]
        );

        if (!hasMarkdownLinkMarker(deprecatedContent)) {
            report(
                file,
                "`## Deprecated` should include a link to the recommended replacement rule or package.",
                deprecatedHeading
            );
        }
    }

    if (
        packageDocumentationIndex !== -1 &&
        furtherReadingIndex !== -1 &&
        packageDocumentationIndex !== furtherReadingIndex - 1
    ) {
        report(
            file,
            "`## Package documentation` must appear immediately before `## Further reading`.",
            h2Headings[packageDocumentationIndex]
        );
    }

    if (
        options.requirePackageDocumentationLabel &&
        packageDocumentationIndex !== -1
    ) {
        const packageHeading = h2Headings[packageDocumentationIndex];

        if (packageHeading === undefined) {
            return;
        }

        const packageContent = getSectionContent(
            file,
            packageHeading,
            h2Headings[packageDocumentationIndex + 1]
        );

        if (!options.packageDocumentationLabelPattern.test(packageContent)) {
            report(
                file,
                "`## Package documentation` must include at least one `<package> package documentation:` label line.",
                packageHeading
            );
        }
    }

    if (options.requireRuleCatalogId) {
        const ruleCatalogIdLines = String(file.value)
            .split(/\r?\n/v)
            .map((line) => line.trimEnd())
            .filter((line) => options.ruleCatalogIdLinePattern.test(line));
        const place = h2Headings[furtherReadingIndex] ?? arrayFirst(h2Headings);

        if (ruleCatalogIdLines.length === 0) {
            report(
                file,
                "Missing required rule catalog marker line `> **Rule catalog ID:** R###`.",
                place
            );
        }

        if (ruleCatalogIdLines.length > 1) {
            report(
                file,
                "Rule docs must contain exactly one `> **Rule catalog ID:** R###` marker line.",
                place
            );
        }
    }
}

/**
 * Remark lint rule that enforces ordered documentation headings in matched
 * Markdown files.
 */
const remarkLintDocHeadings: DocHeadingsPlugin = lintRule(
    { origin, url },
    (
        tree: Root,
        file: VFile,
        settings: DocHeadingsOptions | false | undefined
    ) => {
        if (settings === false) {
            return;
        }

        const rawFilePath = Reflect.get(file, "path");

        if (typeof rawFilePath !== "string" || rawFilePath === "") {
            return;
        }

        const options = normalizeOptions(settings ?? {});

        if (
            !isMatchingPattern(rawFilePath, options.include) ||
            isMatchingPattern(rawFilePath, options.exclude)
        ) {
            return;
        }

        const normalizedFilePath = normalizePath(rawFilePath);
        const h2Headings = getHeadingsByDepth(tree, 2);

        validateH1(tree, file, normalizedFilePath, options);
        validateDuplicateHeadings(file, h2Headings);
        validateDetailHeadings(tree, file, options.detailHeadings);
        validateH2Headings(file, h2Headings, options);
        validateSpecialSections(file, h2Headings, options);
    }
);

export default remarkLintDocHeadings;
