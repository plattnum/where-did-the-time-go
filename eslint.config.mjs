import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default tseslint.config(
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        "eslint.config.mjs",
                        "manifest.json",
                    ],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts", "main.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "CallExpression[callee.type='Identifier'][callee.name=/^(requestAnimationFrame|cancelAnimationFrame)$/]",
                    message: "Use the element's ownerDocument.defaultView for animation frames in popout windows.",
                },
            ],
        },
    },
    {
        // The DOM mock implements Obsidian's createEl helpers, so it must use the native APIs.
        files: ["tests/__mocks__/obsidianDom.ts"],
        rules: {
            "obsidianmd/prefer-create-el": "off",
        },
    },
    {
        ignores: [
            "node_modules/**",
            "main.js",
            "vaults/**",
            "esbuild.config.mjs",
            "version-bump.mjs",
            "versions.json",
            "jest.config.js",
            "scripts/**",
            "**/*.test.ts",
        ],
    },
);
