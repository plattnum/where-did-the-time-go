# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Where Did The Time Go" is an Obsidian plugin for time tracking and visualization. Users create time entries with start/end times, descriptions, optional projects/tags, and linked notes. Entries are stored in markdown files organized by month (YYYY-MM.md format).

## Build Commands

```bash
npm run dev      # Watch mode, auto-copies to test vault
npm run build    # Type-check + production build (minified, tree-shaken)
npm run version  # Bump version in manifest.json and versions.json
```

The dev build automatically copies output to `/Users/plattnum/Obsidian-Vaults/plugin-dev-vault` (configurable via `OBSIDIAN_TEST_VAULT` env var).

## Architecture

### Data Flow
```
User → TimelineView/EntryModal → DataManager → TableParser → Markdown files in vault
```

### Key Layers

- **Plugin Core** (`main.ts`): Lifecycle, view registration, settings, file watching
- **Data Layer** (`src/data/`):
  - `DataManager.ts` - CRUD operations, caching, overlap detection
  - `TableParser.ts` - Markdown table ↔ TimeEntry parsing/serialization (uses unified/remark/mdast)
- **UI Layer** (`src/views/`, `src/modals/`):
  - `TimelineView.ts` - Calendar with drag-to-create/move/resize
  - `EntryModal.ts` - Entry creation/editing form
- **Settings** (`src/settings.ts`, `src/types.ts`): Configuration and types

### Markdown Entry Format
```markdown
# 2024-01

| Start            | End              | Description      | Client | Project | Activity | Notes          |
|------------------|------------------|------------------|--------|---------|----------|----------------|
| 2024-01-15 09:15 | 2024-01-15 10:40 | Morning standup  | acme   | proj1   | meeting  | [[notes/mtg]]  |
| 2024-01-15 14:00 | 2024-01-15 17:00 | Feature work     | acme   | proj1   | dev      |                |
```
One table per month file. Uses standard GFM markdown tables, parsed via mdast/remark for robust handling of edge cases (escaped pipes, code spans, etc.).

### Caching
- In-memory Map<monthStr, ParsedMonth> cache
- Invalidated on file changes via vault watcher
- Load-on-demand by month

## Conventions

- **Async/Await**: All vault I/O is async
- **Console logging**: Prefixed with class name (e.g., "DataManager: loading...")
- **Styling**: Use Obsidian CSS variables (--tt-*) for theme compatibility
- **Git commits**: `type: Description` format (feat, fix, style)

## Key Implementation Notes

- Overlap detection: `newStart < existingEnd AND newEnd > existingStart`
- Midnight-crossing entries store different dates in start/end fields
- Timeline scales with hourHeight setting (40-120px per hour)
- All data persists in user's vault markdown files - no external database
