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
    // Don't try to transform obsidian module
    transformIgnorePatterns: [
        'node_modules/(?!obsidian)'
    ],
    // Mock the obsidian module
    moduleNameMapper: {
        '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts'
    }
};
