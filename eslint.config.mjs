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
