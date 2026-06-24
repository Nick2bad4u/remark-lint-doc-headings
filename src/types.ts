import type { Label, Severity } from "unified-lint-rule";

/** Ordered H3 heading definition and optional parent constraints. */
export interface DetailHeadingDefinition extends HeadingDefinition {
    /** H2 headings under which this detail heading is allowed. */
    readonly parents?: readonly string[];
}

/** Configuration accepted by remark-lint-doc-headings. */
export type DocHeadingsConfig =
    | [level: boolean | Label | Severity, option?: DocHeadingsOptions]
    | DocHeadingsOptions
    | false
    | Label
    | Severity;

/** Options accepted by the doc-headings lint rule. */
export interface DocHeadingsOptions {
    /**
     * Allow H2 headings that are not listed in `headings`.
     *
     * @default false
     */
    readonly allowUnknownHeadings?: boolean;

    /**
     * Ordered H3 detail headings. Defaults to the ESLint rule-doc details used
     * under "Targeted pattern scope" and "What this rule reports".
     */
    readonly detailHeadings?: readonly DetailHeadingDefinition[];

    /**
     * Excluded path globs matched after `include`.
     *
     * Defaults to common non-rule docs under `docs/rules`.
     */
    readonly exclude?: PathPattern;

    /**
     * H1 validation options. Set to `false` to disable H1 checks.
     *
     * Defaults to requiring exactly one H1 that matches the file name.
     */
    readonly h1?: false | H1Options;

    /**
     * Ordered H2 heading definitions. When omitted, the ESLint rule-doc heading
     * preset is used.
     */
    readonly h2Headings?: readonly HeadingDefinition[];

    /**
     * Toggle individual built-in ESLint rule-doc heading validations on or off.
     *
     * Disabled headings are ignored by presence and order checks.
     */
    readonly headings?: Partial<Record<RuleDocHeadingKey, boolean>>;

    /**
     * Included path globs.
     *
     * Defaults to Markdown files under `docs/rules`.
     */
    readonly include?: PathPattern;

    /** Pattern required inside `## Package documentation` when label checks run. */
    readonly packageDocumentationLabelPattern?: PatternExpression;

    /**
     * Require a replacement link in `## Deprecated` sections.
     *
     * Defaults to `true` for the built-in ESLint rule-doc preset and `false`
     * for custom `h2Headings`.
     */
    readonly requireDeprecatedReplacementLink?: boolean;

    /** Require `## Package documentation`. */
    readonly requirePackageDocumentation?: boolean;

    /** Require package documentation label lines. */
    readonly requirePackageDocumentationLabel?: boolean;

    /** Require exactly one rule catalog marker line. */
    readonly requireRuleCatalogId?: boolean;

    /** Pattern used to find rule catalog marker lines. */
    readonly ruleCatalogIdLinePattern?: PatternExpression;

    /** Extra namespace aliases accepted in ESLint rule-doc H1 titles. */
    readonly ruleNamespaceAliases?: readonly string[];
}

/** H1 validation options. */
export interface H1Options {
    /**
     * Additional allowed H1 titles. Useful when file names intentionally differ
     * from public rule IDs.
     */
    readonly allowedTitles?: readonly string[];

    /** Whether exactly one H1 heading is required. */
    readonly requireExactlyOne?: boolean;

    /** Whether the H1 must match the current file name. */
    readonly requireFileNameMatch?: boolean;
}

/** Ordered H2 heading definition. */
export interface HeadingDefinition {
    /** Heading text without the leading markdown marker. */
    readonly heading: string;

    /** Whether this heading must be present in matched documents. */
    readonly required?: boolean;
}

/** Glob pattern or patterns matched against normalized file paths. */
export type PathPattern = readonly string[] | string;

/** RegExp instance or constructor source string. */
export type PatternExpression = RegExp | string;

/** Built-in ESLint rule documentation H3 detail heading keys. */
export type RuleDocDetailHeadingKey = "detectionBoundaries" | "matchedPatterns";

/** Built-in ESLint rule documentation heading keys. */
export type RuleDocHeadingKey =
    | RuleDocDetailHeadingKey
    | RuleDocPrimaryHeadingKey;

/** Built-in ESLint rule documentation H2 heading keys. */
export type RuleDocPrimaryHeadingKey =
    | "additionalExamples"
    | "adoptionResources"
    | "behaviorAndMigrationNotes"
    | "correct"
    | "deprecated"
    | "eslintFlatConfigExample"
    | "furtherReading"
    | "incorrect"
    | "packageDocumentation"
    | "targetedPatternScope"
    | "whatThisRuleReports"
    | "whenNotToUseIt"
    | "whyThisRuleExists";
