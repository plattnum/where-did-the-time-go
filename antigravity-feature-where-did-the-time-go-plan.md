# Where Did The Time Go? - Core Feature Plan

## Goal Description
Implement a full-featured time tracking system within Obsidian, inspired by Clockify/Toggl but backed by local Markdown files. The core interface will be an infinite scrolling vertical "day planner" timeline.

## User Review Required
> [!IMPORTANT]
> **Data Storage Decision**: We will use **Dataview Inline Fields** within Monthly Log Files.
> This avoids complex regex maintenance and allows users to query their data with Dataview easily.
>
> **Format**:
> ```markdown
> ## 2025-01-01
> - [start:: 09:00] [end:: 10:00] Deep work on backend [project:: ClientA]
> - [start:: 10:00] [end:: 11:00] Sync with team [[Meeting Note]]
> ```

## Proposed System Architecture

### 1. Data Layer (Markdown Backing)
We will create a `DataService` responsible for:
- **Project Structure**: Configurable folder (default: `TimeTracker`).
- **File Format**: Monthly files (`YYYY-MM.md`).
- **Parsing**: **Dataview Inline Field Parsing**.
    - We will parse the line for `[key:: value]` patterns.
    - `[start:: HH:mm]`
    - `[end:: HH:mm]`
    - `[project:: Name]`
    - Remaining text is the Description.
- **Writing**: Standardized serialization of these objects back to list items.

### 2. UI Layer (React + Obsidian View)
We will use **React** for the complex interactive timeline.
- **View Type**: Custom Obsidian `ItemView`.
- **Components**:
    - `TimelineContainer`: Handles infinite scrolling behavior using `IntersectionObserver`.
    - `DayColumn`: Renders a single day's ruler and events.
    - `EventCard`: The visual block for a time entry (absolute positioned).
    - `EditorModal`: A popup form to add/edit details (Start, End, Project, Desc).

### 3. Infinite Scrolling Strategy
- The "Infinite" scroll will technically be a **virtualized list**.
- Initially load: `Current Month`.
- Scroll Up: Load `Previous Month` data on demand.
- Scroll Down: Load `Next Month` data on demand.

### 4. Interactions
- **Click Empty Space**: Open "Add Entry" modal pre-filled with the clicked time.
- **Click Event**: Open "Edit Entry" modal.
- **Drag & Drop** (Future): Allow resizing/moving events directly (Post-MVP).

## Plan Assessment & Comparison

I have reviewed `claude-feature-where-did-the-time-go-plan.md` (Alternative Plan) and compared it with this plan.

| Feature | Antigravity Plan (This Plan) | Claude Plan (Alternative) | Assessment |
| :--- | :--- | :--- | :--- |
| **Data Format** | **List-based**<br>`- [start:: 09:00] ...` | **Block-based**<br>`### ID`<br>`start:: ...` | **Winner: Antigravity**. List-based is far more compact for time logs. Block-based adds 5-6 lines of overhead per entry, which will make monthly files huge and hard to read manually. |
| **Completeness** | High-level overview | Detailed specs (commands, settings) | **Winner: Claude**. I will adopt the detailed architecture specs from the Claude plan into this one. |
| **Config** | Implicit / Settings Tab | `_config.md` file | **Winner: Settings Tab**. Keeping config in the plugin settings is standard. `_config.md` adds unnecessary file management overhead. |

**Conclusion**: We will proceed with the **List-based Inline Field** format but adopt the **Depth and Rigor** of the Claude plan regarding architecture and features.

---

## Detailed System Architecture

### 1. Data Layer (Markdown Backing)
We will create a `DataService` responsible for:
- **Project Structure**: Configurable folder (default: `TimeTracker`).
- **File Format**: Monthly files (`YYYY-MM.md`).
- **Parsing**: Standard Dataview Inline Field Parsing.
    - **Pattern**: `^-\s+\[start::\s*(\d{2}:\d{2})\]\s+\[end::\s*(\d{2}:\d{2})\]\s+(.*?)(\s+\[project::\s*(.*?)\])?$`
    - This allows for clean, one-line entries.
- **Writing**: intelligently inserting/updating lines in the monthly file.

### 2. UI Layer (React + Obsidian View)
- **View Type**: Custom Obsidian `ItemView` (`TIMELINE_VIEW_TYPE`).
- **Components**:
    - `TimelineView`: The main container bridging React and Obsidian.
    - `Timeline`: The virtualized infinite scroll container.
    - `DayColumn`: Renders the ruler for a specific day.
    - `EntryCard`: Absolute positioned card.
        - **Props**: `entry`, `onClick`, `onResize`.
    - `EntryModal`: React Portal or Obsidian Modal for editing.

### 3. Settings & Configuration
We will implement a standard Obsidian Settings Tab:
- **Vault Path**: Folder to store logs (Default: `TimeTracker`).
- **Default Project**: Pre-fill for new entries.
- **Ruler Settings**:
    - `Start Hour`: (Default: 06:00)
    - `Pixels per Hour`: (Default: 60px)

### 4. Commands & Hotkeys
- `Open Timeline View` (Default: `Cmd+Shift+T`)
- `Add Entry (Now)` (Default: `Cmd+Shift+N`)
- `Insert Entry to Current Note` (Capture to daily note if needed)

## Implementation Roadmap

### Phase 1: Foundation (Data & Settings)
1.  **Project Setup**: Install `react`, `react-dom`, `lucide-react` (for icons).
2.  **Settings Tab**: Create basic configuration UI.
3.  **Data Service**:
    - Implement `ensureFolderExists()`.
    - Implement `getMonthlyFile(date)`.
    - Implement `parseLines(content)` -> `TimeEntry[]`.
    - Implement `serializeEntry(TimeEntry)` -> `string`.

### Phase 2: The Timeline UI
1.  **View Registration**: Register `TimelineView` and mount a React root.
2.  **Basic Layout**: Create the static HTML/CSS structure ("Ruler" visualization).
3.  **Entry Rendering**: Render dummy data as absolute positioned cards.

### Phase 3: Interaction & Logic
1.  **Virtualization**: Implement "Infinite" scroll strategies (loading previous/next months).
2.  **Modals**: Create the "Add/Edit Entry" form.
3.  **Persistence**: Wire up the "Save" button to write back to the Markdown file.

### Phase 4: Polish
1.  **Ribbon Icon**: Ensure it toggles the view correctly.
2.  **Styling**: Match the specific "Premium" look from the mockup (CSS variables for theming).
3.  **Conflict Handling**: Basic check to prevent overlapping times (if desired).

## Questions for You
1.  **Project vs Tags**: The Claude plan suggests separating them. My generic `[project:: name]` field handles this well. Are you happy with just `project` or do you need arbitrary tags too?
2.  **Date Format**: Is `YYYY-MM.md` acceptable for the file structure?
