# Development Setup

## Prerequisites

- Node.js 18+
- npm
- An Obsidian vault for testing

## Getting Started

```bash
# Clone
git clone https://github.com/plattnum/where-did-the-time-go.git
cd where-did-the-time-go

# Install dependencies
npm install

# Start dev mode (watches for changes, rebuilds automatically)
npm run dev
```

## Test Vault

A test vault is included in the repo at `vaults/where-did-the-time-go-vault/`. This is where the plugin gets copied on build.

To open in Obsidian:
1. Open Obsidian → "Open another vault" → "Open folder as vault"
2. Select `vaults/where-did-the-time-go-vault`
3. The plugin is pre-installed and ready to use

To use a different vault, either:
1. **Edit the default** in `esbuild.config.mjs` (line 17)
2. **Set an environment variable:** `export OBSIDIAN_TEST_VAULT="/path/to/your/vault"`

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Watch mode - rebuilds on file changes, auto-copies to test vault |
| `npm run build` | One-shot build with type-check, copies to test vault, then exits |
| `npm run version` | Bump version in manifest.json and versions.json |

**Tip:** If `npm run dev` stops picking up changes, just run `npm run build` for a clean one-shot rebuild.

## Project Structure

```
src/
├── main.ts              # Plugin entry point
├── types.ts             # TypeScript interfaces
├── settings.ts          # Settings tab UI
├── data/
│   ├── DataManager.ts   # CRUD operations, caching
│   └── TableParser.ts   # Markdown table ↔ TimeEntry
├── views/
│   ├── TimelineView.ts  # Main calendar view
│   └── ReportsView.ts   # Reports/export view
└── modals/
    └── EntryModal.ts    # Create/edit entry form
```

## Data Files

Time entries are stored in your vault as markdown tables:
```
<vault>/TimeTracking/YYYY-MM.md
```

One file per month. Human-readable. Don't edit manually while the plugin is running.
