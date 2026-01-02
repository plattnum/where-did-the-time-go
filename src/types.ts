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
    /** Optional activity type (feat, fix, meeting, etc.) */
    activity?: string;
    /** Client for billing (required) */
    client: string;
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
 * Projects belong to a client
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
    /** Client ID this project belongs to (required) */
    clientId: string;
    /** Optional rate override (uses client rate if not set) */
    rateOverride?: number;
}

/**
 * An activity type for classifying work (feat, fix, meeting, etc.)
 * Single value per entry, mutually exclusive - enables % breakdowns
 * Activities belong to a client
 */
export interface Activity {
    /** Unique identifier (slug) */
    id: string;
    /** Display name */
    name: string;
    /** Hex color for reports/display */
    color: string;
    /** Client ID this activity belongs to (required) */
    clientId: string;
}

/**
 * A client for billing and invoicing
 * Projects can optionally belong to a client
 */
export interface Client {
    /** Unique identifier (slug) */
    id: string;
    /** Display name */
    name: string;
    /** Hex color for UI */
    color: string;
    /** Whether the client is archived */
    archived: boolean;

    // Billing
    /** Billing rate (e.g., 150) */
    rate: number;
    /** Currency code (USD, EUR, GBP, etc.) */
    currency: string;
    /** Rate type */
    rateType: 'hourly' | 'daily';

    // Invoice Details
    /** Multi-line billing address (use \n for line breaks) */
    address?: string;
    /** Invoice recipient email */
    email?: string;
    /** VAT/Tax ID number */
    taxId?: string;
    /** Payment terms (e.g., "Net 30", "Due on receipt") */
    paymentTerms?: string;

    // Optional
    /** Internal notes about client */
    notes?: string;
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
    /** Max characters for description (0 = no limit) */
    descriptionMaxLength: number;
    /** List of configured projects */
    projects: Project[];
    /** List of activity types */
    activities: Activity[];
    /** Default activity for new entries */
    defaultActivity: string;
    /** List of clients for billing */
    clients: Client[];
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
    descriptionMaxLength: 200,
    clients: [
        {
            id: 'personal',
            name: 'Personal',
            color: '#4f46e5',
            archived: false,
            rate: 0,
            currency: 'USD',
            rateType: 'hourly',
            paymentTerms: 'N/A',
        },
    ],
    projects: [
        { id: 'default', name: 'Default', color: '#4f46e5', archived: false, clientId: 'personal' },
    ],
    activities: [],
    defaultActivity: '',
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

/**
 * View type identifier for the reports view
 */
export const VIEW_TYPE_REPORTS = 'where-did-the-time-go-reports';

/**
 * Time range preset options for reports
 */
export type TimeRangePreset = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

/**
 * Report data for a single project
 */
export interface ProjectReport {
    /** Project name */
    project: string;
    /** Project color */
    color: string;
    /** Total minutes for this project */
    totalMinutes: number;
    /** Percentage of total time */
    percentage: number;
    /** Breakdown by activity within this project */
    activityBreakdown: ProjectActivityBreakdown[];
}

/**
 * Report data for a single activity within a project
 */
export interface ProjectActivityBreakdown {
    /** Activity name */
    activity: string;
    /** Activity color */
    color: string;
    /** Total minutes for this activity within the project */
    totalMinutes: number;
    /** Percentage of project time */
    percentageOfProject: number;
}

/**
 * Report data for a single activity type
 */
export interface ActivityReport {
    /** Activity id */
    activity: string;
    /** Activity display name */
    name: string;
    /** Activity color */
    color: string;
    /** Total minutes for this activity */
    totalMinutes: number;
    /** Percentage of total time */
    percentage: number;
}

/**
 * Report data for a single client
 */
export interface ClientReport {
    /** Client id */
    clientId: string;
    /** Client display name */
    name: string;
    /** Client color */
    color: string;
    /** Billing rate */
    rate: number;
    /** Currency code */
    currency: string;
    /** Rate type */
    rateType: 'hourly' | 'daily';
    /** Total minutes for this client */
    totalMinutes: number;
    /** Calculated billable amount (rate * hours or days) */
    billableAmount: number;
    /** Percentage of total time */
    percentage: number;
    /** Breakdown by project within this client */
    projectBreakdown: ProjectReport[];
}
