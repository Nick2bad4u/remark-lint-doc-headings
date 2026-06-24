import nickTwoBadFourU from "eslint-config-nick2bad4u";

/** @type {import("eslint").Linter.Config[]} */
const config = [
    ...nickTwoBadFourU.configs.all,
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        name: "Local Public API and Framework Callback Boundaries",
        rules: {
            "@typescript-eslint/prefer-readonly-parameter-types": "off",
        },
    },
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        name: "Local Runtime Validation Boundaries",
        rules: {
            "@typescript-eslint/no-unsafe-type-assertion": "off",
            "@typescript-eslint/strict-boolean-expressions": "off",
        },
    },
    {
        files: ["src/plugin.ts"],
        name: "Local User-Supplied Pattern Handling",
        rules: {
            "canonical/no-re-export": "off",
            "n/no-sync": "off",
            "no-barrel-files/no-barrel-files": "off",
            "security/detect-non-literal-fs-filename": "off",
            "security/detect-non-literal-regexp": "off",
            "typefest/prefer-ts-extras-array-at": "off",
            "typefest/prefer-ts-extras-array-includes": "off",
            "typefest/prefer-ts-extras-is-defined": "off",
            "typefest/prefer-ts-extras-is-empty": "off",
            "typefest/prefer-ts-extras-key-in": "off",
            "typefest/prefer-ts-extras-set-has": "off",
            "typefest/prefer-ts-extras-string-split": "off",
            "unicorn/prefer-iterator-concat": "off",
        },
    },
    {
        files: ["src/types.ts"],
        name: "Local Public Type Documentation",
        rules: {
            "tsdoc/syntax": "off",
        },
    },
    {
        files: ["test/**/*.ts"],
        name: "Local Integration Test Style",
        rules: {
            "@typescript-eslint/strict-void-return": "off",
            "no-restricted-syntax": "off",
            "sdl/no-insecure-url": "off",
            "vitest/no-hooks": "off",
            "vitest/prefer-expect-assertions": "off",
            "vitest/prefer-strict-equal": "off",
        },
    },
];

export default config;
