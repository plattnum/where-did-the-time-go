import { TFile, TFolder, Vault, Notice } from 'obsidian';
import type { TimeEntry, ParsedMonth, TimeTrackerSettings } from '../types';
import { TableParser } from './TableParser';
import { Logger } from '../utils/Logger';

/**
 * Manages all data operations for time entries
 * Handles reading/writing markdown files, caching, and file watching
 */
export class DataManager {
    private vault: Vault;
    private settings: TimeTrackerSettings;
    private cache: Map<string, ParsedMonth> = new Map();

    // Limit cache size to prevent unbounded memory growth
    private static readonly MAX_CACHED_MONTHS = 24;

    constructor(vault: Vault, settings: TimeTrackerSettings) {
        this.vault = vault;
        this.settings = settings;
    }

    /**
     * Update settings reference (called when settings change)
     */
    updateSettings(settings: TimeTrackerSettings): void {
        this.settings = settings;
    }

    /**
     * Clear the cache (called on external file changes)
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Invalidate cache for a specific month
     */
    invalidateMonth(monthStr: string): void {
        this.cache.delete(monthStr);
    }

    /**
     * Ensure the time tracking folder exists
     */
    async ensureFolderExists(): Promise<TFolder> {
        const folderPath = this.settings.timeTrackingFolder;

        let folder = this.vault.getAbstractFileByPath(folderPath);

        if (!folder) {
            if (this.settings.autoCreateFolder) {
                await this.vault.createFolder(folderPath);
                folder = this.vault.getAbstractFileByPath(folderPath);
            } else {
                throw new Error(`Time tracking folder "${folderPath}" does not exist`);
            }
        }

        if (!(folder instanceof TFolder)) {
            throw new Error(`"${folderPath}" is not a folder`);
        }

        return folder;
    }

    /**
     * Get the file path for a monthly file
     */
    getMonthFilePath(monthStr: string): string {
        return `${this.settings.timeTrackingFolder}/${monthStr}.md`;
    }

    /**
     * Get or create the monthly file for a given month
     */
    async getOrCreateMonthFile(monthStr: string): Promise<TFile> {
        await this.ensureFolderExists();

        const filePath = this.getMonthFilePath(monthStr);
        let file = this.vault.getAbstractFileByPath(filePath);

        if (!file) {
            // Create the file with header and empty table
            const content = TableParser.generateMonthFile([], monthStr, this.settings.hideTablesInPreview);
            file = await this.vault.create(filePath, content);
        }

        if (!(file instanceof TFile)) {
            throw new Error(`"${filePath}" is not a file`);
        }

        return file;
    }

    /**
     * Load entries for a specific month
     */
    async loadMonth(monthStr: string): Promise<ParsedMonth> {
        // Check cache first
        if (this.cache.has(monthStr)) {
            Logger.log('DataManager: Cache hit for', monthStr);
            return this.cache.get(monthStr);
        }

        const filePath = this.getMonthFilePath(monthStr);
        Logger.log('DataManager: Loading file', filePath);

        const file = this.vault.getAbstractFileByPath(filePath);

        if (!file || !(file instanceof TFile)) {
            Logger.log('DataManager: File not found');
            const emptyMonth: ParsedMonth = {
                month: monthStr,
                entries: [],
                entriesByDate: new Map(),
            };
            return emptyMonth;
        }

        const content = await this.vault.read(file);
        const parsed = TableParser.parseMonthFile(content, monthStr);
        Logger.log('DataManager: Parsed', parsed.entries.length, 'entries');

        // Cache the result
        this.cache.set(monthStr, parsed);

        // Prune cache if over limit (FIFO - Map maintains insertion order)
        if (this.cache.size > DataManager.MAX_CACHED_MONTHS) {
            const firstKey = this.cache.keys().next() as IteratorResult<string, undefined>;
            if (!firstKey.done && firstKey.value) {
                this.cache.delete(firstKey.value);
            }
        }

        return parsed;
    }

    /**
     * Load entries for a date range
     * Returns entries that OVERLAP with the range (not just start within)
     */
    async loadDateRange(startDate: Date, endDate: Date): Promise<TimeEntry[]> {
        const entries: TimeEntry[] = [];
        const monthsToLoad = new Set<string>();

        // Determine which months we need to load
        // Include month before startDate in case an entry started there and spans into our range
        const monthBefore = new Date(startDate);
        monthBefore.setMonth(monthBefore.getMonth() - 1);
        monthsToLoad.add(TableParser.getMonthString(monthBefore));

        const endMonth = TableParser.getMonthString(endDate);
        const current = new Date(startDate);
        current.setDate(1); // Start from first of month

        while (TableParser.getMonthString(current) <= endMonth) {
            monthsToLoad.add(TableParser.getMonthString(current));
            current.setMonth(current.getMonth() + 1);
        }

        // Load all months
        for (const monthStr of monthsToLoad) {
            const parsed = await this.loadMonth(monthStr);
            entries.push(...parsed.entries);
        }

        // Filter to entries that OVERLAP with the date range
        // An entry overlaps if: entryStart < rangeEnd AND entryEnd > rangeStart
        return entries
            .filter(e =>
                e.startDateTime < endDate &&
                e.endDateTime > startDate
            )
            .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
    }

    /**
     * Calculate effective duration of an entry within a date range
     * Handles entries that span midnight by only counting time within the range
     */
    getEffectiveDuration(entry: TimeEntry, rangeStart: Date, rangeEnd: Date): number {
        // Clamp entry times to the range
        const effectiveStart = entry.startDateTime < rangeStart ? rangeStart : entry.startDateTime;
        const effectiveEnd = entry.endDateTime > rangeEnd ? rangeEnd : entry.endDateTime;

        // Calculate duration in minutes
        const durationMs = effectiveEnd.getTime() - effectiveStart.getTime();
        return Math.max(0, Math.round(durationMs / 60000));
    }

    /**
     * Load entries for a specific date
     */
    async loadEntriesForDate(date: Date): Promise<TimeEntry[]> {
        const monthStr = TableParser.getMonthString(date);
        const dateStr = TableParser.getDateString(date);

        const parsed = await this.loadMonth(monthStr);
        return parsed.entriesByDate.get(dateStr) || [];
    }

    /**
     * Load entries for today
     */
    async loadTodayEntries(): Promise<TimeEntry[]> {
        return this.loadEntriesForDate(new Date());
    }

    /**
     * Save a new entry
     */
    async createEntry(entry: Omit<TimeEntry, 'lineNumber' | 'durationMinutes' | 'startDateTime' | 'endDateTime'>): Promise<TimeEntry> {
        const monthStr = entry.date.substring(0, 7); // YYYY-MM

        // Create full entry object - parse start and end as full datetime strings
        const startDateTime = TableParser.parseDateTime(entry.start);
        const endDateTime = TableParser.parseDateTime(entry.end);

        if (!startDateTime || !endDateTime) {
            throw new Error(`Invalid datetime format. Expected "YYYY-MM-DD HH:mm". Got start="${entry.start}", end="${entry.end}"`);
        }

        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);

        const fullEntry: TimeEntry = {
            ...entry,
            startDateTime,
            endDateTime,
            durationMinutes,
            lineNumber: 0, // Row index will be set after save
        };

        // Check for overlaps
        const existingEntries = await this.loadEntriesForDate(startDateTime);
        if (this.hasOverlap(fullEntry, existingEntries)) {
            throw new Error('Entry overlaps with an existing time entry');
        }

        // Load existing entries for the month, add new entry, regenerate file
        const parsed = await this.loadMonth(monthStr);
        const allEntries = [...parsed.entries, fullEntry];

        // Write the updated file
        await this.writeMonthFile(monthStr, allEntries);

        // Invalidate cache
        this.invalidateMonth(monthStr);

        new Notice('Time entry created');

        return fullEntry;
    }

    /**
     * Update an existing entry
     */
    async updateEntry(oldEntry: TimeEntry, newEntry: Partial<TimeEntry>): Promise<TimeEntry> {
        const oldMonthStr = oldEntry.date.substring(0, 7);

        // Merge old and new entry data
        const updatedEntry: TimeEntry = {
            ...oldEntry,
            ...newEntry,
        };

        // Recalculate datetime if times changed
        if (newEntry.start || newEntry.end || newEntry.date) {
            const startDateTime = TableParser.parseDateTime(updatedEntry.start);
            const endDateTime = TableParser.parseDateTime(updatedEntry.end);

            if (!startDateTime || !endDateTime) {
                throw new Error('Invalid datetime format');
            }

            updatedEntry.startDateTime = startDateTime;
            updatedEntry.endDateTime = endDateTime;
            updatedEntry.durationMinutes = Math.round(
                (endDateTime.getTime() - startDateTime.getTime()) / 60000
            );
            // Update the date field from the start datetime
            updatedEntry.date = TableParser.getDateString(startDateTime);
        }

        const newMonthStr = updatedEntry.date.substring(0, 7);
        const monthChanged = oldMonthStr !== newMonthStr;

        // Check for overlaps (excluding self)
        const existingEntries = await this.loadEntriesForDate(updatedEntry.startDateTime);
        const otherEntries = existingEntries.filter(e => !this.isSameEntry(e, oldEntry));
        if (this.hasOverlap(updatedEntry, otherEntries)) {
            throw new Error('Entry overlaps with an existing time entry');
        }

        if (monthChanged) {
            // Month changed - need to remove from old month and add to new month
            Logger.log('Month changed from', oldMonthStr, 'to', newMonthStr);

            // Remove from old month
            const oldParsed = await this.loadMonth(oldMonthStr);
            const oldEntries = oldParsed.entries.filter(e => !this.isSameEntry(e, oldEntry));
            await this.writeMonthFile(oldMonthStr, oldEntries);
            this.invalidateMonth(oldMonthStr);

            // Add to new month
            const newParsed = await this.loadMonth(newMonthStr);
            const newEntries = [...newParsed.entries, updatedEntry];
            await this.writeMonthFile(newMonthStr, newEntries);
            this.invalidateMonth(newMonthStr);
        } else {
            // Same month - update in place
            const parsed = await this.loadMonth(oldMonthStr);
            const entries = parsed.entries.map(e =>
                this.isSameEntry(e, oldEntry) ? updatedEntry : e
            );
            await this.writeMonthFile(oldMonthStr, entries);
            this.invalidateMonth(oldMonthStr);
        }

        new Notice('Time entry updated');

        return updatedEntry;
    }

    /**
     * Delete an entry
     */
    async deleteEntry(entry: TimeEntry): Promise<void> {
        const monthStr = entry.date.substring(0, 7);

        // Load entries, remove the one to delete, regenerate file
        const parsed = await this.loadMonth(monthStr);
        const entries = parsed.entries.filter(e => !this.isSameEntry(e, entry));

        await this.writeMonthFile(monthStr, entries);

        // Invalidate cache
        this.invalidateMonth(monthStr);

        new Notice('Time entry deleted');
    }

    /**
     * Write a month file with the given entries
     */
    private async writeMonthFile(monthStr: string, entries: TimeEntry[]): Promise<void> {
        const file = await this.getOrCreateMonthFile(monthStr);
        const content = TableParser.generateMonthFile(entries, monthStr, this.settings.hideTablesInPreview);
        await this.vault.modify(file, content);
    }

    /**
     * Check if two entries are the same (based on start time and description)
     */
    private isSameEntry(a: TimeEntry, b: TimeEntry): boolean {
        return (
            a.startDateTime.getTime() === b.startDateTime.getTime() &&
            a.endDateTime.getTime() === b.endDateTime.getTime() &&
            a.description === b.description
        );
    }

    /**
     * Check if an entry overlaps with existing entries
     */
    private hasOverlap(newEntry: TimeEntry, existingEntries: TimeEntry[]): boolean {
        return existingEntries.some(existing => {
            // Skip if same entry
            if (this.isSameEntry(existing, newEntry)) {
                return false;
            }
            // Check for overlap
            return (
                newEntry.startDateTime < existing.endDateTime &&
                newEntry.endDateTime > existing.startDateTime
            );
        });
    }

    /**
     * Find all overlapping entries and classify each overlap type
     * - startOverlap: First entry where our START falls inside
     * - endOverlap: First entry where our END falls inside
     * - encompassedEntry: First entry we fully encompass
     */
    async findOverlaps(
        start: Date,
        end: Date,
        excludeEntry?: TimeEntry
    ): Promise<{
        startOverlap: TimeEntry | null;
        endOverlap: TimeEntry | null;
        encompassedEntry: TimeEntry | null;
    }> {
        const entries = await this.loadDateRange(start, end);
        Logger.log('DataManager.findOverlaps:', {
            start: start.toISOString(),
            end: end.toISOString(),
            entriesLoaded: entries.length
        });

        let startOverlap: TimeEntry | null = null;
        let endOverlap: TimeEntry | null = null;
        let encompassedEntry: TimeEntry | null = null;

        for (const entry of entries) {
            if (excludeEntry && this.isSameEntry(entry, excludeEntry)) continue;

            // Check for any overlap first
            const overlaps = start < entry.endDateTime && end > entry.startDateTime;
            if (!overlaps) {
                Logger.log('  vs', entry.start, '-', entry.end, ': no overlap');
                continue;
            }

            // Classify the overlap type
            const startInside = start >= entry.startDateTime && start < entry.endDateTime;
            const endInside = end > entry.startDateTime && end <= entry.endDateTime;

            Logger.log('  vs', entry.start, '-', entry.end, ':',
                startInside ? 'START_INSIDE' : '',
                endInside ? 'END_INSIDE' : '',
                (!startInside && !endInside) ? 'ENCOMPASSED' : '');

            if (startInside && !startOverlap) {
                startOverlap = entry;
            }
            if (endInside && !endOverlap) {
                endOverlap = entry;
            }
            if (!startInside && !endInside && !encompassedEntry) {
                encompassedEntry = entry;
            }
        }

        return { startOverlap, endOverlap, encompassedEntry };
    }

    /**
     * Find adjacent entries (previous entry ending before start, next entry starting after end)
     * Used for "magnet" snap feature in entry modal
     */
    async findAdjacentEntries(
        start: Date,
        end: Date,
        excludeEntry?: TimeEntry
    ): Promise<{
        previous: TimeEntry | null;
        next: TimeEntry | null;
    }> {
        // Load entries for a range around the current entry (same day plus buffer)
        const searchStart = new Date(start);
        searchStart.setDate(searchStart.getDate() - 1);
        const searchEnd = new Date(end);
        searchEnd.setDate(searchEnd.getDate() + 1);

        const entries = await this.loadDateRange(searchStart, searchEnd);

        let previous: TimeEntry | null = null;
        let next: TimeEntry | null = null;

        for (const entry of entries) {
            if (excludeEntry && this.isSameEntry(entry, excludeEntry)) continue;

            // Previous: entry ends before or at our start (no gap = snappable)
            if (entry.endDateTime <= start) {
                // Keep the closest one (latest end time that's still before start)
                if (!previous || entry.endDateTime > previous.endDateTime) {
                    previous = entry;
                }
            }

            // Next: entry starts at or after our end (no gap = snappable)
            if (entry.startDateTime >= end) {
                // Keep the closest one (earliest start time that's still after end)
                if (!next || entry.startDateTime < next.startDateTime) {
                    next = entry;
                }
            }
        }

        Logger.log('DataManager.findAdjacentEntries:', {
            start: start.toISOString(),
            end: end.toISOString(),
            previous: previous ? `${previous.start}-${previous.end}` : null,
            next: next ? `${next.start}-${next.end}` : null
        });

        return { previous, next };
    }

    /**
     * Get all unique projects from entries
     */
    async getAllProjects(): Promise<string[]> {
        const projects = new Set<string>();

        // Load current month and previous month
        const now = new Date();
        const thisMonth = TableParser.getMonthString(now);
        const lastMonth = TableParser.getMonthString(
            new Date(now.getFullYear(), now.getMonth() - 1, 1)
        );

        for (const monthStr of [thisMonth, lastMonth]) {
            const parsed = await this.loadMonth(monthStr);
            for (const entry of parsed.entries) {
                if (entry.project) {
                    projects.add(entry.project);
                }
            }
        }

        return Array.from(projects).sort();
    }

    /**
     * Get all unique tags from entries (deprecated - returns empty)
     */
    async getAllTags(): Promise<string[]> {
        // Tags feature removed - return empty array
        return [];
    }
}
