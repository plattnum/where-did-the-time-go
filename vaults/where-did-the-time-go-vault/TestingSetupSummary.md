# Testing Setup Summary

This document describes the test data configuration for the "Where Did The Time Go" Obsidian plugin. The test vault contains fictitious clients, projects, activities, and time entries designed to exercise all plugin features including edge cases.

---

## Plugin Configuration

**Location:** `.obsidian/plugins/where-did-the-time-go/data.json`

### Bill From (Invoice Sender)
| Field | Value |
|-------|-------|
| Name | John Doodle |
| Address | 123 Main Street, Somecity, ZZ 90210 |

### General Settings
| Setting | Value |
|---------|-------|
| Time Tracking Folder | `TimeTracking` |
| Invoice Folder | `TimeTracking/Invoices` |
| Hour Height | 200px |
| Day Start Hour | 6:00 |
| Day End Hour | 22:00 |
| Time Format | 24-hour |
| Week Start | Monday |
| Description Max Length | 200 characters |

---

## Clients

Three fictitious clients with different currencies and rates to test multi-currency invoicing:

| Client | ID | Rate | Currency | Color | Payment Terms |
|--------|-----|------|----------|-------|---------------|
| Acme Rocket Supplies LLC | `personal` | $50/hr | USD | Indigo (#4f46e5) | N/A |
| Umbrella Corporation | `umbrella-corporation` | $100/hr | CAD | Red (#f60404) | Net 30 |
| Weyland-Yutani | `weyland-yutani` | $210/hr | AUD | Emerald (#059669) | Net 30 |

**Testing Notes:**
- Different currencies test invoice currency display
- Different rates test billable amount calculations
- Different payment terms test due date calculations

---

## Projects

9 projects (3 per client) with thematic names:

### Acme Rocket Supplies LLC
| Project | ID | Color |
|---------|----|-------|
| Operation Coyote | `operation-coyote` | Amber (#f59e0b) |
| Giant Magnet Research | `giant-magnet-research` | Violet (#8b5cf6) |
| Instant Tunnel Paint R&D | `instant-tunnel-paint` | Pink (#ec4899) |

### Umbrella Corporation
| Project | ID | Color |
|---------|----|-------|
| T-Virus Containment | `t-virus-containment` | Red (#dc2626) |
| Raccoon City Cleanup | `raccoon-city-cleanup` | Purple (#7c3aed) |
| Nemesis Program | `nemesis-program` | Slate (#1e293b) |

### Weyland-Yutani
| Project | ID | Color |
|---------|----|-------|
| LV-426 Survey | `lv-426-survey` | Cyan (#06b6d4) |
| Xenomorph Integration | `xenomorph-integration` | Lime (#84cc16) |
| Prometheus Mission | `prometheus-mission` | Orange (#f97316) |

---

## Activities

6 activity types per client (18 total), using consistent engineering-focused categories:

| Activity | Color | Purpose |
|----------|-------|---------|
| Feature | Green (#22c55e) | New functionality |
| Bug Fix | Red (#ef4444) | Defect resolution |
| Documentation | Blue (#3b82f6) | Docs and guides |
| Refactor | Purple (#a855f7) | Code improvement |
| Testing | Yellow (#eab308) | QA and validation |
| Code Review | Cyan (#06b6d4) | Peer review |

**Testing Notes:**
- Same activity names across clients but unique IDs (e.g., `feat-acme`, `feat-umbrella`)
- Enables testing activity breakdown reports per client

---

## Time Entry Files

### November 2025 (`TimeTracking/2025-11.md`)

**Total Entries:** 46

#### Standard Entries (24 entries)
Regular work entries spread across the month with varying durations (1-8 hours).

#### Chaos Day - November 6th (22 entries)
A single day packed with 15 and 30-minute entries across all three clients, simulating rapid context-switching:

| Duration | Count |
|----------|-------|
| 15 minutes | 12 |
| 30 minutes | 10 |

**Client Distribution on Chaos Day:**
- Acme: 8 entries
- Umbrella: 8 entries
- Weyland-Yutani: 6 entries

**Time Range:** 08:00 - 17:00 (continuous with lunch break)

#### Edge Cases in November

| Edge Case | Entry | Start | End | Notes |
|-----------|-------|-------|-----|-------|
| **Midnight Span** | T-Virus containment bug fix | 2025-11-15 22:00 | 2025-11-16 02:30 | Entry crosses midnight within the same month |
| **Month Boundary Span** | T-Virus vaccine deployment | 2025-11-30 21:00 | 2025-12-01 03:00 | Entry starts in November, ends in December |

---

### December 2025 (`TimeTracking/2025-12.md`)

**Total Entries:** 28

#### Standard Entries
Regular work entries throughout the month with good coverage of all clients, projects, and activities.

#### Edge Cases in December

| Edge Case | Entry | Start | End | Notes |
|-----------|-------|-------|-----|-------|
| **Midnight Span** | Giant Magnet refactoring | 2025-12-12 22:30 | 2025-12-13 01:30 | Entry crosses midnight within the same month |
| **Year Boundary Span** | Umbrella year-end maintenance | 2025-12-31 20:00 | 2026-01-01 02:00 | Entry starts in 2025, ends in 2026 |

---

## Edge Case Summary

### Time Boundary Edge Cases

| Type | Location | Description |
|------|----------|-------------|
| Midnight crossing (same month) | Nov 15-16 | Tests timeline rendering across day boundary |
| Midnight crossing (same month) | Dec 12-13 | Second midnight crossing for consistency |
| Month boundary crossing | Nov 30 - Dec 1 | Tests entry appearing in correct month's file and reports |
| Year boundary crossing | Dec 31 - Jan 1 | Tests year transition handling |

### Duration Edge Cases

| Type | Location | Description |
|------|----------|-------------|
| Very short (15 min) | Nov 6 (12 entries) | Tests minimum billable increments |
| Short (30 min) | Nov 6 (10 entries) | Tests timeline block rendering |
| Standard (1-2 hrs) | Throughout | Normal usage pattern |
| Long (4+ hrs) | Nov 7 (8 hrs) | Tests extended duration display |

### Multi-Client Day
- **November 6th** contains entries for all 3 clients in a single day
- Tests filtering, grouping, and report generation for multi-client scenarios

---

## Testing Scenarios

### Timeline View
1. Navigate to November 6th - verify 22 small blocks render correctly
2. Navigate to November 15th - verify midnight-spanning entry displays
3. Navigate to November 30th - verify month-boundary entry shows

### Reports View
1. Filter "This Month" for November - verify all 46 entries included
2. Filter by single client - verify correct project/activity breakdown
3. Filter date range spanning Nov 30 - Dec 1 - verify boundary entry counted correctly
4. Generate invoice for each client - verify currency and totals

### Invoice Generation
1. Generate invoice for Acme (USD) - verify $50/hr rate applied
2. Generate invoice for Umbrella (CAD) - verify $100/hr rate and Net 30 terms
3. Generate invoice for Weyland-Yutani (AUD) - verify $210/hr rate
4. Verify line items group by project correctly
5. Verify billable hours match Reports view totals

### Data Integrity
1. Edit an entry via Timeline - verify markdown updates correctly
2. Delete an entry - verify removal from file
3. Create new entry on existing day - verify chronological ordering
4. Create entry spanning midnight - verify correct date handling

---

## File Locations

```
vaults/where-did-the-time-go-vault/
├── .obsidian/
│   └── plugins/
│       └── where-did-the-time-go/
│           └── data.json          # Plugin settings, clients, projects, activities
├── TimeTracking/
│   ├── 2025-11.md                 # November entries (46 total)
│   ├── 2025-12.md                 # December entries (28 total)
│   └── Invoices/                  # Generated invoices (created on demand)
└── TestingSetupSummary.md         # This file
```

---

## Quick Reference

| Metric | Value |
|--------|-------|
| Total Clients | 3 |
| Total Projects | 9 |
| Total Activities | 18 |
| November Entries | 46 |
| December Entries | 28 |
| **Total Test Entries** | **74** |
| Midnight Spans | 2 |
| Month Boundary Spans | 1 |
| Year Boundary Spans | 1 |
| Chaos Day Entries | 22 |
