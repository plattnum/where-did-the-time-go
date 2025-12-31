# Where Did The Time Go? - Feature Implementation Plan

## Overview

A time-tracking Obsidian plugin inspired by Clockify/Toggl with a visual infinite-scrolling timeline view. Data is stored in Markdown files within a designated folder.

---

## Plan Comparison & Adopted Decisions

Compared with `antigravity-feature-where-did-the-time-go-plan.md`:

| Aspect | Claude (Original) | Antigravity | **Adopted** |
|--------|-------------------|-------------|-------------|
| Entry format | Block-based (6+ lines) | List-based (1 line) | **Antigravity** - compact |
| Config storage | `_config.md` file | Settings Tab | **Antigravity** - standard pattern |
| Detail level | Very detailed | High-level | **Claude** - keep detailed specs |
| Architecture | Vanilla DOM | React | **TBD** - evaluate complexity |

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Overlapping entries | **Prevented** | Time tracking for billing/percentages requires non-overlapping time. Validation rejects overlaps. |
| Midnight-spanning | **Continuous render** | Infinite scroll means entries visually span midnight naturally. Use `+1` notation for next-day end times. |
| Mobile support | **Desktop first** | Focus on desktop experience; mobile optimization in future phase. |
| Entry IDs | **Not needed** | List format uses line position. No explicit IDs required. |
| Dataview compat | **Yes - bracketed inline fields** | Use `[field:: value]` syntax for Dataview queryability. |
| Config | **Settings Tab** | Standard Obsidian pattern, no extra files. |

---

## Core Concepts

### Data Model

**Time Entry**
```typescript
interface TimeEntry {
  // No explicit ID - identified by date + line position
  date: string;                  // YYYY-MM-DD (from parent heading)
  start: string;                 // HH:mm
  end: string;                   // HH:mm or HH:mm+1 (next day)
  description: string;           // Free text between time and metadata
  project?: string;              // Project name
  tags?: string[];               // Optional tags
  linkedNote?: string;           // Optional [[wikilink]] path

  // Computed at parse time:
  startDateTime: Date;           // Full datetime
  endDateTime: Date;             // Full datetime (handles +1 notation)
  lineNumber: number;            // For updates/deletes
}
```

**Project**
```typescript
interface Project {
  id: string;
  name: string;
  color: string;                 // Hex color for the left bar indicator
  archived: boolean;
}
```

### Storage Structure

```
vault/
└── TimeTracking/                    # Configurable root folder
    ├── 2024-01.md                   # January 2024 entries
    ├── 2024-02.md                   # February 2024 entries
    ├── ...
    └── Notes/                       # Optional linked notes for detailed entries
        ├── 2024-01-15-meeting.md
        └── 2024-01-16-deep-work.md
```

> **Note**: Projects/settings stored in plugin settings (Settings Tab), not in markdown files.

### Monthly Entry File Format

Uses **compact list-based format** with Dataview inline fields in brackets. One line per entry.

```markdown
## 2024-01-15

- [start:: 09:15] [end:: 10:40] Deep work · Backend cache fixes [project:: client-work] [tags:: dev, backend]
- [start:: 11:00] [end:: 11:45] Weekly sync with team [project:: internal] [tags:: meeting]
- [start:: 14:00] [end:: 15:30] Code review for PR #123 [project:: client-work] [[Notes/2024-01-15-pr-review]]
- [start:: 23:00] [end:: 01:30+1] Late night debugging session [project:: client-work] [tags:: dev, urgent]

## 2024-01-16

- [start:: 10:00] [end:: 12:00] Planning session [project:: internal]
```

**Format breakdown:**
```
- [start:: HH:mm] [end:: HH:mm] Description text [project:: name] [tags:: a, b] [[optional link]]
```

**Midnight-spanning notation:** `[end:: 01:30+1]` means 01:30 the next day. Parser calculates actual end datetime.

**Why this format:**
- Compact: 1 line per entry (vs 6+ lines in block format)
- Dataview compatible: `[field:: value]` syntax
- Human readable/editable
- Optional linked note via standard `[[wikilink]]`

**Dataview Query Examples:**
```dataview
TABLE start, end, project
FROM "TimeTracking"
WHERE project = "client-work"
SORT start DESC
```

### Configuration

Use **standard Obsidian Settings Tab** (not a config file). Simpler, follows Obsidian conventions.

Projects are stored in plugin settings as JSON, managed via Settings UI.

---

## Architecture

### File Structure

```
src/
├── main.ts                      # Plugin entry point
├── types.ts                     # TypeScript interfaces
├── settings.ts                  # Settings tab
├── data/
│   ├── DataManager.ts           # Coordinates all data operations
│   ├── EntryParser.ts           # Parse markdown → TimeEntry[]
│   ├── EntrySerializer.ts       # TimeEntry[] → markdown
│   └── ConfigManager.ts         # Handles _config.md
├── views/
│   ├── TimelineView.ts          # Main Obsidian ItemView
│   ├── TimelineRenderer.ts      # Renders the infinite scroll timeline
│   ├── EntryCard.ts             # Individual entry card component
│   └── DayHeader.ts             # Day separator/header component
├── modals/
│   ├── EntryModal.ts            # Create/edit entry modal
│   ├── ProjectModal.ts          # Manage projects modal
│   └── QuickEntryModal.ts       # Quick entry (command palette)
└── utils/
    ├── dateUtils.ts             # Date/time helpers
    ├── colorUtils.ts            # Color manipulation
    └── idGenerator.ts           # Generate unique IDs
```

### Key Components

1. **DataManager** - Central data coordinator
   - Loads entries for visible date range
   - Caches parsed entries
   - Handles writes with debouncing
   - Listens for external file changes

2. **TimelineView** - Obsidian leaf view
   - Registers as custom view type
   - Manages scroll state and virtualization
   - Handles keyboard navigation

3. **TimelineRenderer** - The visual timeline
   - Infinite scroll with virtual DOM (only renders visible range)
   - Time axis with hour markers
   - Day separators for multi-day view
   - Drag-to-create new entries
   - Drag-to-resize existing entries

4. **EntryCard** - Individual time block
   - Displays title, time, tags, project color
   - Click to edit
   - Right-click context menu
   - Hover to show full details

---

## Implementation Phases

### Phase 1: Foundation
**Goal**: Basic data layer and minimal UI

1. **Types & Interfaces**
   - Define all TypeScript interfaces
   - Create type guards and validators

2. **Settings Tab**
   - Configure time tracking folder path
   - Set default project
   - Configure hour display range (start/end hour)
   - Pixel height per hour setting

3. **Data Layer**
   - Implement EntryParser (markdown → objects)
   - Implement EntrySerializer (objects → markdown)
   - Implement ConfigManager for projects/tags
   - Basic DataManager with file I/O

4. **Basic View**
   - Register TimelineView with Obsidian
   - Static timeline rendering (no scroll)
   - Display entries from current day
   - Ribbon icon to open view

### Phase 2: Core Timeline
**Goal**: Functional infinite-scroll timeline

1. **Infinite Scroll**
   - Virtual scrolling implementation
   - Load entries as user scrolls
   - Day headers/separators
   - Smooth scroll to date

2. **Entry Cards**
   - Render cards at correct position
   - Project color indicator
   - Tags as chips
   - Time range display
   - Description preview

3. **Entry Modal**
   - Create new entry form
   - Edit existing entry
   - Date picker
   - Time pickers (start/end)
   - Project dropdown
   - Tag input (autocomplete from existing)
   - Description textarea
   - Delete with confirmation

4. **Basic Interactions**
   - Click entry to edit
   - Double-click empty space to create
   - Right-click context menu

### Phase 3: Enhanced UX
**Goal**: Polish and power-user features

1. **Drag & Drop**
   - Drag to move entry to different time
   - Drag edges to resize (change duration)
   - Visual feedback during drag

2. **Quick Entry**
   - Command palette quick-add
   - Natural language parsing ("meeting 2pm-3pm #work")
   - Timer mode (start now, stop later)

3. **Navigation**
   - Jump to date command
   - Today button
   - Keyboard shortcuts (j/k to navigate days)
   - Mini calendar picker

4. **Linked Notes**
   - Create linked note from entry
   - Open linked note in new pane
   - Backlink display in note

### Phase 4: Advanced Features
**Goal**: Reporting and integrations

1. **Filtering & Search**
   - Filter by project
   - Filter by tag
   - Search entries
   - Date range filter

2. **Reports View**
   - Time by project (pie chart)
   - Time by day (bar chart)
   - Export to CSV

3. **Running Timer**
   - Start/stop timer in status bar
   - Auto-create entry when stopped
   - Reminder if timer running too long

4. **Obsidian Integrations**
   - Daily notes integration (embed today's entries)
   - Dataview compatibility
   - Template support for linked notes

---

## UI Specifications

### Infinite Scroll Timeline Concept

The timeline is a **continuous vertical ruler** representing time. Think of it as an infinitely long scroll where:

- Scrolling **up** goes back in time (yesterday, last week, etc.)
- Scrolling **down** goes forward in time (tomorrow, next week, etc.)
- **No pagination** - just smooth continuous scrolling
- Day headers appear inline as visual separators
- Midnight is just another point on the ruler - entries flow across it naturally

```
         ↑ Scroll up = Past
         │
   ══════════════════════════════════════
   ─── Sunday, January 14 ───────────────
   ══════════════════════════════════════
         │
   22:00 ─┼────────────────────────────────
   23:00 ─┼────────────────────────────────
         │ ┌──────────────────────────┐
         │ │▎Late night session      │    ← Entry spanning midnight
   ══════│═│══════════════════════════│════
   ─── Mo│n│day, January 15 ──────────│────  (Day header doesn't break the entry)
   ══════│═│══════════════════════════│════
   00:00 ─┤ │ 23:00 – 01:30 · 2h 30m  │
   01:00 ─┤ └──────────────────────────┘
   02:00 ─┼────────────────────────────────
         │
         ↓ Scroll down = Future
```

### Timeline View Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: "Today · Timeline"              [+ New] [⚙]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ── Monday, January 15 ──────────────────────────────  │
│                                                         │
│  09:00 ─┬──────────────────────────────────────────────│
│         │ ┌────────────────────────────────────────┐   │
│  10:00 ─┤ │▎Deep work · Backend cache fixes       │   │
│         │ │ 09:15 – 10:40 · 1h 25m                │   │
│         │ │ [#dev] [#backend]                     │   │
│         │ │ Investigating memcached latency...   │   │
│         │ └────────────────────────────────────────┘   │
│  11:00 ─┼──────────────────────────────────────────────│
│         │ ┌────────────────────────────────────────┐   │
│         │ │▎Weekly sync with team                 │   │
│  12:00 ─┤ │ 11:00 – 11:45 · 45m                   │   │
│         │ │ [#meeting]                            │   │
│         │ └────────────────────────────────────────┘   │
│  13:00 ─┼──────────────────────────────────────────────│
│         │                                              │
│  14:00 ─┼──────────────────────────────────────────────│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Entry Card Anatomy

```
┌────────────────────────────────────────┐
│▎ Title of the entry          09:15-10:40│  ← Header row
│  [#tag1] [#tag2] [Project]             │  ← Meta row
│  Description text that can wrap        │  ← Notes (optional)
│  to multiple lines if needed...        │
└────────────────────────────────────────┘
 ↑
 Project color bar (4px wide)
```

### Color Palette (matching mockup)

```css
--bg: #0f172a;                    /* Main background */
--bg-panel: #020617;              /* Panel/card background */
--axis-text: #94a3b8;             /* Time labels */
--line: rgba(148, 163, 184, 0.3); /* Hour lines */
--text-primary: #e5e7eb;          /* Primary text */
--text-secondary: #9ca3af;        /* Secondary text */
--border: rgba(148, 163, 184, 0.25);
--border-hover: rgba(129, 140, 248, 0.8);

/* Project colors */
--project-1: #4f46e5;             /* Indigo */
--project-2: #059669;             /* Emerald */
--project-3: #e11d48;             /* Rose */
--project-4: #f59e0b;             /* Amber */
--project-5: #8b5cf6;             /* Violet */
```

---

## Commands & Hotkeys

| Command | Default Hotkey | Description |
|---------|---------------|-------------|
| Open Timeline | `Ctrl/Cmd + Shift + T` | Open/focus timeline view |
| Quick Add Entry | `Ctrl/Cmd + Shift + N` | Open quick entry modal |
| Start Timer | `Ctrl/Cmd + Shift + S` | Start running timer |
| Stop Timer | `Ctrl/Cmd + Shift + X` | Stop timer, create entry |
| Jump to Today | `T` (in view) | Scroll to current time |
| Jump to Date | `G` (in view) | Open date picker |
| Previous Day | `K` (in view) | Scroll to previous day |
| Next Day | `J` (in view) | Scroll to next day |

---

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Time Tracking Folder | string | `TimeTracking` | Root folder for all data |
| Hour Height | number | `80` | Pixels per hour in timeline |
| Day Start Hour | number | `6` | First hour shown (0-23) |
| Day End Hour | number | `22` | Last hour shown (0-23) |
| Default Project | string | (none) | Pre-selected project for new entries |
| Show Description | boolean | `true` | Show description in cards |
| 24-Hour Format | boolean | `true` | Use 24h vs 12h time |
| Week Start | string | `monday` | First day of week |
| Auto-create Folder | boolean | `true` | Create folder if missing |

---

## Technical Considerations

### Performance

1. **Virtual Scrolling**
   - Only render visible entries + buffer
   - Use intersection observer for lazy loading
   - Recycle DOM nodes when scrolling

2. **Data Caching**
   - Cache parsed entries by month
   - Invalidate on file change (via Obsidian vault events)
   - Debounce writes (500ms)

3. **File Watching**
   - Listen to `vault.on('modify')` for external changes
   - Re-parse affected month file
   - Update view reactively

### Obsidian API Usage

- `Plugin.registerView()` - Register timeline view type
- `Plugin.addRibbonIcon()` - Sidebar icon
- `Plugin.addCommand()` - Commands and hotkeys
- `Plugin.addSettingTab()` - Settings
- `Modal` - Entry edit modal
- `ItemView` - Base class for timeline view
- `vault.read()/modify()` - File I/O
- `vault.on('modify')` - File change events
- `SuggestModal` - Autocomplete for tags/projects

### Edge Cases

| Case | Handling |
|------|----------|
| Entries spanning midnight | Render continuously across midnight boundary in infinite scroll. Entry stored in the month file of its start date. |
| Overlapping entries | **Prevented via validation**. When creating/editing, check for conflicts. Show error if overlap detected. |
| Very long entries | Cap visual card height at ~200px, show "..." truncation. Full content visible on hover/click. |
| Timezone handling | Store all times in local timezone. No UTC conversion (keeps markdown human-readable). |
| Empty days | Show in timeline (continuous ruler) but with no entries. Optional setting to collapse empty days in future. |
| Missing/corrupt data | Graceful fallback: log warning, skip unparseable entries, don't crash. |
| Entry crossing month boundary | Entry lives in start month's file. Parser loads adjacent months when needed for display. |

### Overlap Validation

```typescript
function hasOverlap(newEntry: TimeEntry, existingEntries: TimeEntry[]): boolean {
  return existingEntries.some(existing => {
    if (existing.id === newEntry.id) return false; // Skip self when editing
    return newEntry.start < existing.end && newEntry.end > existing.start;
  });
}
```

When overlap detected:
1. Highlight conflicting entry in red
2. Show error: "This entry overlaps with [existing entry title] (HH:mm - HH:mm)"
3. Prevent save until resolved

---

## Remaining Considerations

1. **Sync/conflict resolution**: If edited on multiple devices simultaneously, last-write-wins. Could add conflict markers in future if needed.

2. **Theming**: Should respect Obsidian's light/dark theme. The mockup is dark-themed but we'll use CSS variables that adapt.

3. **Performance threshold**: Target smooth scrolling with 1000+ entries visible. If issues arise, implement more aggressive virtualization.

---

## Next Steps

1. ✅ Plan reviewed and approved
2. Begin Phase 1 implementation:
   - Set up `src/` folder structure
   - Create `types.ts` with interfaces
   - Implement basic settings tab
   - Create entry parser/serializer
3. Set up test data in the dev vault

---

## References

- [Obsidian Plugin API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian Kanban Plugin](https://github.com/mgmeyers/obsidian-kanban) - Similar linked-note pattern
- UI Mockup: `/Users/plattnum/repos/obsidian-plugin-time-tagger/index.html`
