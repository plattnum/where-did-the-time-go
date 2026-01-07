# Where Did The Time Go?

A lightweight time tracking plugin for Obsidian. No subscriptions. No bloat. Just you, your vault, and some markdown tables.

## Why This Exists

I got tired of:
- SaaS time trackers that take 10 seconds to load
- Monthly subscriptions for what amounts to a fancy spreadsheet
- Apps that include "team collaboration features" when I just work alone
- Electron apps eating 500MB of RAM to show me a list of tasks
- Syncing conflicts, server outages, and "we're updating our privacy policy" emails

I wanted something **simple**: click, enter time, done. Data lives in my vault as plain markdown. Works offline. Loads instantly. No account required. No telemetry. No upsells.

If you need Gantt charts, resource allocation, or enterprise reporting - this isn't for you. If you just want to track where your hours went so you can bill clients or stop lying to yourself about "where the day went" - welcome.

## Features

### Infinite Timeline View
Visual day-by-day timeline. Drag to create entries, drag to move them, resize to adjust duration. Click to edit. It's a calendar, you've used one before. The timeline extends infinitely in both directions.

![Timeline View](docs/timeline.png)

### Simple Data Model
- **Clients** - Who you're billing (or "Personal" if you're tracking for yourself)
- **Projects** - What you're working on
- **Activities** - Type of work (dev, meeting, admin, etc.)
- **Linked Notes** - Optional wikilink to related notes in your vault

That's it. No tags, labels, priorities, estimates, story points, or whatever else PM tools have invented to justify their existence.

### Plain Markdown Storage
Your data lives in `TimeTracking/YYYY-MM.md` files as markdown tables:

```markdown
| Start            | End              | Description     | Client | Project | Activity | Notes |
| :--------------- | :--------------- | :-------------- | :----- | :------ | :------- | :---- |
| 2024-01-15 09:00 | 2024-01-15 10:30 | Morning standup | acme   | webapp  | meeting  |       |
| 2024-01-15 10:30 | 2024-01-15 12:00 | Fix login bug   | acme   | webapp  | dev      |       |
```

One file per month. Human-readable. Git-friendly. Portable - if this plugin dies, your data doesn't.

### Reports View
See where your time actually went. Filter by client, project, date range. Export to CSV when your accountant asks for timesheets.

### Overlap Detection
Won't let you accidentally double-book yourself. The timeline shows conflicts in real-time.

### Midnight-Spanning Entries
Working late? Entries can cross midnight without breaking. The plugin handles multi-day entries correctly.

## Installation

### From Obsidian Community Plugins
1. Open Settings → Community Plugins
2. Search for "Where Did The Time Go"
3. Install and enable

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/where-did-the-time-go/`
3. Copy the files into that folder
4. Enable the plugin in Settings → Community Plugins

## Usage

### Creating Entries
- **Click + drag** on the timeline to create an entry
- **Click** the + button in the toolbar
- **Command palette** (`Ctrl/Cmd + P`) → "Create Time Entry"
- Fill in the details, hit Save

### Editing Entries
- **Click** an entry card to edit
- **Drag** entries to move them
- **Drag edges** to resize (change duration)

### Command Palette
- `Create Time Entry` - Open entry form directly (pre-fills current time)
- `Open Timeline` - Open the timeline view
- `Open Reports` - Open the reports view

## Settings

| Setting | Description |
|---------|-------------|
| **Time tracking folder** | Where to store monthly files (default: `TimeTracking`) |
| **Hide tables in preview** | Wrap tables in `%%` comments. If you open a monthly file directly, Obsidian won't try to render a large table - improves performance for busy months |
| **Hour height** | Pixels per hour in timeline (200-240) |
| **Day start/end hour** | Visible range in timeline |
| **Week start** | Monday or Sunday |
| **24-hour format** | Toggle 24h vs 12h time display |
| **Description max length** | Character limit for descriptions (0 = unlimited) |

## Clients, Projects & Activities

Configure in Settings:

- **Clients** - Each has a name, color, hourly rate, and currency
- **Projects** - Belong to a client, inherit rate or override
- **Activities** - Work types (dev, meeting, review, etc.) per client

Colors appear as left-border indicators on timeline entries.

## Data Format

Monthly files follow this structure:

```markdown
%%
⚠️ WARNING: This file is managed by the "Where Did The Time Go" plugin.
Do not edit manually - your changes may be overwritten.
%%

# 2024-01

| Start            | End              | Description | Client | Project | Activity | Notes |
| :--------------- | :--------------- | :---------- | :----- | :------ | :------- | :---- |
| 2024-01-15 09:00 | 2024-01-15 10:30 | Standup     | acme   | webapp  | meeting  |       |
```

The `%%` markers hide the table in Obsidian's reading view (configurable in settings).

## FAQ

**Q: Can I edit the markdown files directly?**
A: You can, but the plugin may overwrite your changes. Use the Timeline view.

**Q: Does it sync across devices?**
A: It's just .md files. If your vault syncs (Obsidian Sync, iCloud, Dropbox, Git), your time entries sync.

**Q: Can I query entries with Dataview?**
A: No. Dataview doesn't parse markdown tables. Your data is portable plain text, but you'll use the Reports view for analysis.

**Q: What happens if I uninstall the plugin?**
A: Your data stays. It's just markdown files.

## Contributing

Found a bug? Open an issue. Want a feature? Open an issue first - I might talk you out of it if it adds bloat.

PRs welcome for actual bugs. Feature PRs should be discussed first.

## License

MIT - Do whatever you want with it.

---

*Built because I needed it, shared because maybe you do too.*
