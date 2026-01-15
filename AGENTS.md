# Agent Guidelines for Where Did The Time Go

This document contains instructions and conventions for AI agents working on this codebase.

## 1. Environment & Tooling

This is an Obsidian plugin written in TypeScript.

### Build Commands
- **Build Production:** `npm run build` (Runs `tsc` check + `esbuild` minification)
- **Development Watch:** `npm run dev` (Runs `esbuild` in watch mode)
- **Install Dependencies:** `npm install`

### Test Commands
The project uses `jest` with `ts-jest` and experimental VM modules.
- **Run All Tests:** `npm test`
- **Run Single Test File:** `npm test -- path/to/test.ts` or `npx jest path/to/test.ts`
- **Watch Mode:** `npm run test:watch`
- **Coverage:** `npm run test:coverage`

### Linting
- **Run Lint:** `npx eslint .`
- **Fix Lint:** `npx eslint . --fix`

## 2. Project Structure

```
.
├── main.ts                 # Plugin entry point (extends Plugin)
├── manifest.json           # Plugin metadata
├── styles.css              # CSS styles
├── esbuild.config.mjs      # Build configuration
└── src/
    ├── data/               # Data management (DataManager, parsers)
    ├── invoice/            # Invoice generation logic
    ├── modals/             # Obsidian Modals (EntryModal, etc.)
    ├── settings/           # Settings tab and configuration
    ├── types/              # TypeScript interfaces and constants
    ├── utils/              # Helper utilities (Logger, dates)
    └── views/              # Custom Obsidian Views (Timeline, Reports)
```

## 3. Code Style & Conventions

### TypeScript & Typing
- **Strict Typing:** Always use explicit types. Avoid `any` whenever possible.
- **Interfaces:** Define interfaces in `src/types.ts` or co-located if private to a module.
- **Async/Await:** Prefer `async/await` over raw promises.
- **Null Checks:** Handle potential `null` or `undefined` values, especially when interacting with the Obsidian API (e.g., `workspace.getLeavesOfType`).

### Naming Conventions
- **Classes:** `PascalCase` (e.g., `DataManager`, `TimelineView`)
- **Methods/Functions:** `camelCase` (e.g., `activateTimelineView`, `parseTable`)
- **Variables:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `VIEW_TYPE_TIMELINE`)
- **Files:** Match the primary export (usually `PascalCase` for classes, `camelCase` for utilities).

### Formatting
- **Indentation:** 4 spaces.
- **Quotes:** Single quotes `'` preferred.
- **Semicolons:** Always use semicolons.

### Imports
- Group imports:
    1. External libraries (`obsidian`, `react`, etc.)
    2. Internal types/interfaces
    3. Internal components/utilities
- Use relative imports (e.g., `../utils/Logger`) or explicit `src/` paths if configured (currently relative paths are used in `main.ts`).

### Obsidian API Usage
- Extend `Plugin` from `obsidian` for the main class.
- Use `WorkspaceLeaf` for views.
- Use `PluginSettingTab` for settings.
- **Modals:** Extend `Modal` for UI dialogs.
- **Views:** Extend `ItemView`.

## 4. Testing Guidelines

- **Framework:** Jest.
- **Location:** Tests are located in `tests/` or co-located with source files (check `tests/` first).
- **Mocking:** Mock Obsidian API components (`App`, `Vault`, `Workspace`) when testing logic that depends on them.
- **Unit Tests:** Focus on logic in `src/data` and `src/utils` first as they are easier to isolate from the UI.

## 5. Error Handling & Logging

- Use `Logger` from `src/utils/Logger` instead of `console.log` for app-level logging.
- `Logger.setDebugMode(boolean)` controls verbosity.
- Wrap async operations in `try/catch` blocks when they involve file I/O or external calls.

## 6. Versioning

- **Manifest:** Update `manifest.json` version.
- **Package:** Update `package.json` version.
- **Versions File:** Update `versions.json`.
- **Command:** `npm run version` handles these updates automatically.
