/**
 * Core types for Where Did The Time Go plugin
 */

/**
 * A time entry representing a block of tracked time
 */
export interface TimeEntry {
    /** YYYY-MM-DD date from parent heading */
    date: string;
    /** Start time in HH:mm format */
    start: string;
    /** End time in HH:mm format, or HH:mm+1 for next day */
    end: string;
    /** Description text (free text between time and metadata) */
    description: string;
    /** Optional project name */
    project?: string;
    /** Optional tags array */
    tags?: string[];
    /** Optional wikilink path to linked note */
    linkedNote?: string;

    // Computed at parse time:
    /** Full start datetime */
    startDateTime: Date;
    /** Full end datetime (handles +1 notation) */
    endDateTime: Date;
    /** Line number in the source file for updates/deletes */
    lineNumber: number;
    /** Duration in minutes */
    durationMinutes: number;
}

/**
 * A project for categorizing time entries
 */
export interface Project {
    /** Unique identifier (slug) */
    id: string;
    /** Display name */
    name: string;
    /** Hex color for the left bar indicator */
    color: string;
    /** Whether the project is archived */
    archived: boolean;
}

/**
 * Plugin settings stored in Obsidian's data.json
 */
export interface TimeTrackerSettings {
    /** Root folder for time tracking files */
    timeTrackingFolder: string;
    /** Pixels per hour in timeline view */
    hourHeight: number;
    /** First hour to display (0-23) */
    dayStartHour: number;
    /** Last hour to display (0-23) */
    dayEndHour: number;
    /** Default project for new entries */
    defaultProject: string;
    /** Whether to show description in cards */
    showDescription: boolean;
    /** Use 24-hour format (true) or 12-hour (false) */
    use24HourFormat: boolean;
    /** First day of week: 'monday' or 'sunday' */
    weekStart: 'monday' | 'sunday';
    /** Auto-create folder if missing */
    autoCreateFolder: boolean;
    /** List of configured projects */
    projects: Project[];
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: TimeTrackerSettings = {
    timeTrackingFolder: 'TimeTracking',
    hourHeight: 60,
    dayStartHour: 6,
    dayEndHour: 22,
    defaultProject: '',
    showDescription: true,
    use24HourFormat: true,
    weekStart: 'monday',
    autoCreateFolder: true,
    projects: [
        { id: 'default', name: 'Default', color: '#4f46e5', archived: false },
    ],
};

/**
 * Result of parsing a monthly file
 */
export interface ParsedMonth {
    /** Year-month string YYYY-MM */
    month: string;
    /** All entries in the file */
    entries: TimeEntry[];
    /** Map of date string to entries for that date */
    entriesByDate: Map<string, TimeEntry[]>;
}

/**
 * View type identifier for the timeline view
 */
export const VIEW_TYPE_TIMELINE = 'where-did-the-time-go-timeline';
