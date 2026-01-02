/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
    ],
    coverageDirectory: 'coverage',
    // Transform ESM modules (unified/remark ecosystem)
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true,
        }],
    },
    extensionsToTreatAsEsm: ['.ts'],
    transformIgnorePatterns: [
        'node_modules/(?!(unified|remark-parse|remark-gfm|remark-stringify|mdast-util-gfm|mdast-util-gfm-table|mdast-util-to-markdown|mdast-util-from-markdown|micromark|micromark-util-.*|micromark-extension-gfm.*|unist-util-.*|bail|trough|vfile|vfile-message|devlop|ccount|escape-string-regexp|markdown-table|zwitch|longest-streak)/)'
    ],
    // Mock the obsidian module
    moduleNameMapper: {
        '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts'
    }
};
