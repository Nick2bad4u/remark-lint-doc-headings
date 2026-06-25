import {
    type DetailHeadingDefinition,
    type DocHeadingsOptions,
    type DocHeadingsPreset,
    eslint,
    type HeadingDefinition,
    presets,
    type RuleDocHeadingKey,
} from "../src/plugin.js";

const headingKey: RuleDocHeadingKey = "targetedPatternScope";
const h2Headings: readonly HeadingDefinition[] = [
    { heading: "Summary", required: true },
    { heading: "Usage" },
];
const detailHeadings: readonly DetailHeadingDefinition[] = [
    { heading: "Options", parents: ["Usage"] },
];

export const options: DocHeadingsOptions = {
    allowUnknownHeadings: true,
    detailHeadings,
    h1: {
        allowedTitles: ["custom-title"],
        requireExactlyOne: true,
        requireFileNameMatch: false,
    },
    h2Headings,
    headings: {
        [headingKey]: true,
    },
    include: ["docs/**/*.md", "guides/**/*.mdx"],
    packageDocumentationLabelPattern: String.raw`^[^\r\n]+ package documentation:$`,
    requireH2HeadingOrder: false,
    requireNoSkippedHeadingLevels: true,
    ruleCatalogIdLinePattern: String.raw`^> \*\*Rule catalog ID:\*\* R\d{3}$`,
    ruleNamespaceAliases: ["example"],
};

const eslintPreset: DocHeadingsPreset = eslint;
const eslintStrictPreset: DocHeadingsPreset = presets["eslint-strict"];

void eslintPreset;
void eslintStrictPreset;
