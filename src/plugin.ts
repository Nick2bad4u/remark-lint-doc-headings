import type { Heading, Root } from "mdast";
import type { UnknownRecord } from "type-fest";
import type { Plugin, Preset } from "unified";
import type { Node } from "unist";
import type { VFile } from "vfile";

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import picomatch from "picomatch";
import {
    arrayAt,
    arrayFirst,
    arrayIncludes,
    arrayJoin,
    isDefined,
    isEmpty,
    keyIn,
    setHas,
    stringSplit,
} from "ts-extras";
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
    readonly packageDocumentationLabelPattern: RegExp | undefined;
    readonly requireDeprecatedReplacementLink: boolean;
    readonly requireH2HeadingOrder: boolean;
    readonly requireNoSkippedHeadingLevels: boolean;
    readonly requirePackageDocumentation: boolean;
    readonly requirePackageDocumentationLabel: boolean;
    readonly requireRuleCatalogId: boolean;
    readonly ruleCatalogIdLinePattern: RegExp;
    readonly ruleNamespaceAliases: readonly string[];
    readonly shouldValidatePackageDocumentationPlacement: boolean;
}

interface PackageMetadata {
    readonly name?: unknown;
}

const origin = "remark-lint:doc-headings";
const url = "https://github.com/Nick2bad4u/remark-lint-doc-headings";
const eslintPluginPackagePrefix = "eslint-plugin-";
const packageMetadataCache = new Map<string, PackageMetadata | undefined>();

const defaultInclude = [
    "**/*.markdown",
    "**/*.md",
    "**/*.mdx",
] as const;
const defaultExclude = [] as const;
const eslintRuleDocInclude = "docs/rules/**/*.md";
const eslintRuleDocExclude = [
    "docs/rules/getting-started.md",
    "docs/rules/overview.md",
    "docs/rules/presets/**",
] as const;
const defaultRuleCatalogIdLinePattern = /^> \*\*Rule catalog ID:\*\* R\d{3}$/v;

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

/** Unified preset object exported by this package. */
export type DocHeadingsPreset = Preset;

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

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

function getPackageDocumentationSettings(
    options: DocHeadingsOptions
): Pick<
    NormalizedOptions,
    | "requirePackageDocumentationLabel"
    | "shouldValidatePackageDocumentationPlacement"
> {
    const requiresPackageDocumentationLabel =
        options.requirePackageDocumentationLabel ??
        isDefined(options.packageDocumentationLabelPattern);

    return {
        requirePackageDocumentationLabel: requiresPackageDocumentationLabel,
        shouldValidatePackageDocumentationPlacement:
            options.requirePackageDocumentationPlacement === true ||
            options.requirePackageDocumentation === true ||
            requiresPackageDocumentationLabel,
    };
}

function getPatternExpression(expression: PatternExpression): RegExp {
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
    const sectionStartOffset = isDefined(sectionPosition)
        ? sectionPosition.end.offset
        : undefined;
    const nextSectionOffset = isDefined(nextSectionPosition)
        ? nextSectionPosition.start.offset
        : undefined;
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
    return hasKey(value, "children") && Array.isArray(value.children);
}

function hasKey<Key extends string>(
    value: unknown,
    key: Key
): value is Record<Key, unknown> {
    if (typeof value === "object" && value !== null) {
        const record = value as UnknownRecord;

        return keyIn(record, key);
    }

    return false;
}

function hasMarkdownLinkMarker(markdown: string): boolean {
    return (
        markdown.includes("[") &&
        markdown.includes("](") &&
        markdown.includes(")")
    );
}

function hasPackageDocumentationLabel(markdown: string): boolean {
    return stringSplit(markdown.replaceAll("\r\n", "\n"), "\n").some(
        (line) =>
            line.endsWith(" package documentation:") &&
            line.trim() !== "package documentation:"
    );
}

function hasValue(value: unknown): value is { readonly value: string } {
    return hasKey(value, "value") && typeof value.value === "string";
}

function isHeadingNode(node: Node): node is Heading {
    return node.type === "heading" && hasKey(node, "depth");
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
            packageDocumentationLabelPattern: undefined,
            requireDeprecatedReplacementLink: false,
            requireH2HeadingOrder: false,
            requireNoSkippedHeadingLevels: false,
            requirePackageDocumentation: false,
            requirePackageDocumentationLabel: false,
            requireRuleCatalogId: false,
            ruleCatalogIdLinePattern: defaultRuleCatalogIdLinePattern,
            ruleNamespaceAliases: [],
            shouldValidatePackageDocumentationPlacement: false,
        };
    }

    const h2Headings = options.h2Headings ?? [];
    const hasConfiguredH2Headings = isDefined(options.h2Headings);
    const h1 = options.h1 ?? {
        requireExactlyOne: true,
        requireFileNameMatch: false,
    };
    const packageDocumentationSettings =
        getPackageDocumentationSettings(options);

    return {
        allowUnknownHeadings:
            options.allowUnknownHeadings ?? !hasConfiguredH2Headings,
        detailHeadings:
            options.detailHeadings ??
            (hasConfiguredH2Headings
                ? getEnabledDetailHeadings(options.headings)
                : []),
        exclude: options.exclude ?? defaultExclude,
        h1,
        h2Headings,
        include: options.include ?? defaultInclude,
        packageDocumentationLabelPattern: isDefined(
            options.packageDocumentationLabelPattern
        )
            ? getPatternExpression(options.packageDocumentationLabelPattern)
            : undefined,
        requireDeprecatedReplacementLink:
            options.requireDeprecatedReplacementLink ?? false,
        requireH2HeadingOrder: options.requireH2HeadingOrder ?? true,
        requireNoSkippedHeadingLevels:
            options.requireNoSkippedHeadingLevels ?? false,
        requirePackageDocumentation:
            options.requirePackageDocumentation ?? false,
        requirePackageDocumentationLabel:
            packageDocumentationSettings.requirePackageDocumentationLabel,
        requireRuleCatalogId:
            options.requireRuleCatalogId ??
            isDefined(options.ruleCatalogIdLinePattern),
        ruleCatalogIdLinePattern: isDefined(options.ruleCatalogIdLinePattern)
            ? getPatternExpression(options.ruleCatalogIdLinePattern)
            : defaultRuleCatalogIdLinePattern,
        ruleNamespaceAliases: options.ruleNamespaceAliases ?? [],
        shouldValidatePackageDocumentationPlacement:
            packageDocumentationSettings.shouldValidatePackageDocumentationPlacement,
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

        if (!isDefined(detailHeading)) {
            continue;
        }

        if (
            isDefined(detailHeading.parents) &&
            !arrayIncludes(detailHeading.parents, currentH2HeadingName ?? "")
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

        if (!isDefined(leftHeadingIndex)) {
            continue;
        }

        for (const right of detailHeadings.slice(0, leftIndex)) {
            const rightHeadingIndex = detailHeadingIndexes.get(right.heading);

            if (
                isDefined(rightHeadingIndex) &&
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

        if (setHas(seenHeadings, headingName)) {
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

    const expectedFileTitle = arrayAt(
        stringSplit(normalizedFilePath, "/"),
        -1
    )?.replace(/\.mdx?$/v, "");

    if (!isDefined(expectedFileTitle)) {
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

    if (isEmpty(expectedTitles)) {
        return;
    }

    const h1Heading = arrayFirst(h1Headings);

    if (!isDefined(h1Heading)) {
        return;
    }

    const actualTitle = getNodeText(h1Heading).trim();

    if (!arrayIncludes(expectedTitles, actualTitle)) {
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

        if (!isDefined(headingOrder)) {
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

        if (options.requireH2HeadingOrder && headingOrder < lastOrder) {
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

        const missingHeadingReason = `Missing required H2 heading \`${requiredHeading.heading}\`.`;

        if (arrayIncludes(headingNames, requiredHeading.heading)) {
            continue;
        }

        report(file, missingHeadingReason, undefined);
    }
}

function validateHeadingLevels(
    tree: Root,
    file: VFile,
    options: NormalizedOptions
): void {
    if (!options.requireNoSkippedHeadingLevels) {
        return;
    }

    const headings = tree.children.filter(isHeadingNode);
    let previousHeading: Heading | undefined;

    for (const heading of headings) {
        if (
            isDefined(previousHeading) &&
            heading.depth > previousHeading.depth + 1
        ) {
            report(
                file,
                `Heading levels must not skip from H${previousHeading.depth} to H${heading.depth}.`,
                heading
            );
        }

        previousHeading = heading;
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

        if (!isDefined(deprecatedHeading)) {
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
        options.shouldValidatePackageDocumentationPlacement &&
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

        if (!isDefined(packageHeading)) {
            return;
        }

        const packageContent = getSectionContent(
            file,
            packageHeading,
            h2Headings[packageDocumentationIndex + 1]
        );
        const hasLabel = isDefined(options.packageDocumentationLabelPattern)
            ? options.packageDocumentationLabelPattern.test(packageContent)
            : hasPackageDocumentationLabel(packageContent);

        if (!hasLabel) {
            report(
                file,
                "`## Package documentation` must include at least one `<package> package documentation:` label line.",
                packageHeading
            );
        }
    }

    if (options.requireRuleCatalogId) {
        const ruleCatalogIdLines = stringSplit(
            String(file.value).replaceAll("\r\n", "\n"),
            "\n"
        )
            .map((line) => line.trimEnd())
            .filter((line) => options.ruleCatalogIdLinePattern.test(line));
        const place = h2Headings[furtherReadingIndex] ?? arrayFirst(h2Headings);

        if (isEmpty(ruleCatalogIdLines)) {
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

function withRequiredHeadings(
    headings: readonly HeadingDefinition[],
    options: { readonly includeDeprecated?: boolean } = {}
): readonly HeadingDefinition[] {
    return headings.map((heading) => {
        if (
            heading.heading === "Deprecated" &&
            options.includeDeprecated !== true
        ) {
            return isDefined(heading.required)
                ? { heading: heading.heading, required: heading.required }
                : { heading: heading.heading };
        }

        return { heading: heading.heading, required: true };
    });
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
        validateHeadingLevels(tree, file, options);
        validateDuplicateHeadings(file, h2Headings);
        validateDetailHeadings(tree, file, options.detailHeadings);
        validateH2Headings(file, h2Headings, options);
        validateSpecialSections(file, h2Headings, options);
    }
);

/** Options for the built-in ESLint rule documentation preset. */
export const eslintOptions = {
    detailHeadings: eslintRuleDocDetailHeadings,
    exclude: eslintRuleDocExclude,
    h1: {
        requireExactlyOne: true,
        requireFileNameMatch: true,
    },
    h2Headings: eslintRuleDocHeadings,
    headings: defaultHeadingToggles,
    include: eslintRuleDocInclude,
    requireDeprecatedReplacementLink: true,
    requirePackageDocumentationPlacement: true,
} as const satisfies DocHeadingsOptions;

/** Options for the strict ESLint rule documentation preset. */
export const eslintStrictOptions = {
    ...eslintOptions,
    h2Headings: withRequiredHeadings(eslintRuleDocHeadings),
    requirePackageDocumentation: true,
    requirePackageDocumentationLabel: true,
    requireRuleCatalogId: true,
} as const satisfies DocHeadingsOptions;

/** Unified preset for ESLint rule documentation headings. */
export const eslint = {
    plugins: [[remarkLintDocHeadings, eslintOptions]],
} satisfies DocHeadingsPreset;

/** Unified preset for stricter ESLint rule documentation headings. */
export const eslintStrict = {
    plugins: [[remarkLintDocHeadings, eslintStrictOptions]],
} satisfies DocHeadingsPreset;

/** Named preset collection, including the hyphenated `eslint-strict` key. */
export const presets = {
    eslint,
    "eslint-strict": eslintStrict,
} as const;

export default remarkLintDocHeadings;
