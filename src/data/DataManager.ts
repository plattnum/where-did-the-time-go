import { TFile, TFolder, Vault, Notice } from 'obsidian';
import type { TimeEntry, ParsedMonth, TimeTrackerSettings } from '../types';
import { EntryParser } from './EntryParser';
import { EntrySerializer } from './EntrySerializer';

/**
 * Manages all data operations for time entries
 * Handles reading/writing markdown files, caching, and file watching
 */
export class DataManager {
    private vault: Vault;
    private settings: TimeTrackerSettings;
    private cache: Map<string, ParsedMonth> = new Map();

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
            // Create the file with initial content
            file = await this.vault.create(filePath, '');
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
            console.log('DataManager: Cache hit for', monthStr);
            return this.cache.get(monthStr)!;
        }

        const filePath = this.getMonthFilePath(monthStr);
        console.log('DataManager: Loading file', filePath);

        const file = this.vault.getAbstractFileByPath(filePath);

        if (!file || !(file instanceof TFile)) {
            console.log('DataManager: File not found');
            const emptyMonth: ParsedMonth = {
                month: monthStr,
                entries: [],
                entriesByDate: new Map(),
            };
            return emptyMonth;
        }

        const content = await this.vault.read(file);
        const parsed = EntryParser.parseMonthFile(content, monthStr);
        console.log('DataManager: Parsed', parsed.entries.length, 'entries');

        // Cache the result
        this.cache.set(monthStr, parsed);

        return parsed;
    }

    /**
     * Load entries for a date range
     */
    async loadDateRange(startDate: Date, endDate: Date): Promise<TimeEntry[]> {
        const entries: TimeEntry[] = [];
        const monthsToLoad = new Set<string>();

        // Determine which months we need to load
        const endMonth = EntryParser.getMonthString(endDate);
        const current = new Date(startDate);
        current.setDate(1); // Start from first of month

        while (EntryParser.getMonthString(current) <= endMonth) {
            monthsToLoad.add(EntryParser.getMonthString(current));
            current.setMonth(current.getMonth() + 1);
        }

        // Load all months
        for (const monthStr of monthsToLoad) {
            const parsed = await this.loadMonth(monthStr);
            entries.push(...parsed.entries);
        }

        // Filter to date range and sort
        return entries
            .filter(e =>
                e.startDateTime >= startDate &&
                e.startDateTime <= endDate
            )
            .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
    }

    /**
     * Load entries for a specific date
     */
    async loadEntriesForDate(date: Date): Promise<TimeEntry[]> {
        const monthStr = EntryParser.getMonthString(date);
        const dateStr = EntryParser.getDateString(date);

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
        const file = await this.getOrCreateMonthFile(monthStr);

        // Create full entry object - start and end contain full date+time
        const { startDateTime, endDateTime } = EntryParser.parseDateTimeFields(
            entry.start,
            entry.end
        );
        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);

        const fullEntry: TimeEntry = {
            ...entry,
            startDateTime,
            endDateTime,
            durationMinutes,
            lineNumber: 0, // Will be set after save
        };

        // Check for overlaps
        const existingEntries = await this.loadEntriesForDate(startDateTime);
        if (this.hasOverlap(fullEntry, existingEntries)) {
            throw new Error('Entry overlaps with an existing time entry');
        }

        // Add entry to file content
        const content = await this.vault.read(file);
        const newContent = EntrySerializer.addEntryToContent(content, fullEntry);
        await this.vault.modify(file, newContent);

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

        // Recalculate datetime if times changed - start and end contain full date+time
        if (newEntry.start || newEntry.end || newEntry.date) {
            const { startDateTime, endDateTime } = EntryParser.parseDateTimeFields(
                updatedEntry.start,
                updatedEntry.end
            );
            updatedEntry.startDateTime = startDateTime;
            updatedEntry.endDateTime = endDateTime;
            updatedEntry.durationMinutes = Math.round(
                (endDateTime.getTime() - startDateTime.getTime()) / 60000
            );
        }

        const newMonthStr = updatedEntry.date.substring(0, 7);
        const dateChanged = oldEntry.date !== updatedEntry.date;

        // Check for overlaps (excluding self if same date)
        const existingEntries = await this.loadEntriesForDate(updatedEntry.startDateTime);
        const otherEntries = dateChanged
            ? existingEntries // All entries on new date are "other"
            : existingEntries.filter(e => e.lineNumber !== oldEntry.lineNumber);
        if (this.hasOverlap(updatedEntry, otherEntries)) {
            throw new Error('Entry overlaps with an existing time entry');
        }

        if (dateChanged) {
            // Date changed - need to delete from old location and add to new location
            console.log('Date changed from', oldEntry.date, 'to', updatedEntry.date);

            // Delete from old file
            const oldFile = await this.getOrCreateMonthFile(oldMonthStr);
            const oldContent = await this.vault.read(oldFile);
            const contentAfterDelete = EntrySerializer.deleteEntryFromContent(oldContent, oldEntry);
            await this.vault.modify(oldFile, contentAfterDelete);
            this.invalidateMonth(oldMonthStr);

            // Add to new file (might be same file if same month, different day)
            const newFile = await this.getOrCreateMonthFile(newMonthStr);
            const newContent = await this.vault.read(newFile);
            const contentAfterAdd = EntrySerializer.addEntryToContent(newContent, updatedEntry);
            await this.vault.modify(newFile, contentAfterAdd);
            this.invalidateMonth(newMonthStr);
        } else {
            // Same date - just update in place
            const file = await this.getOrCreateMonthFile(oldMonthStr);
            const content = await this.vault.read(file);
            const newContent = EntrySerializer.updateEntryInContent(content, oldEntry, updatedEntry);
            await this.vault.modify(file, newContent);
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
        const file = await this.getOrCreateMonthFile(monthStr);

        const content = await this.vault.read(file);
        const newContent = EntrySerializer.deleteEntryFromContent(content, entry);
        await this.vault.modify(file, newContent);

        // Invalidate cache
        this.invalidateMonth(monthStr);

        new Notice('Time entry deleted');
    }

    /**
     * Check if an entry overlaps with existing entries
     */
    private hasOverlap(newEntry: TimeEntry, existingEntries: TimeEntry[]): boolean {
        return existingEntries.some(existing => {
            // Skip if same line (editing self)
            if (existing.lineNumber === newEntry.lineNumber) {
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
     * Get all unique projects from entries
     */
    async getAllProjects(): Promise<string[]> {
        const projects = new Set<string>();

        // Load current month and previous month
        const now = new Date();
        const thisMonth = EntryParser.getMonthString(now);
        const lastMonth = EntryParser.getMonthString(
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
     * Get all unique tags from entries
     */
    async getAllTags(): Promise<string[]> {
        const tags = new Set<string>();

        // Load current month and previous month
        const now = new Date();
        const thisMonth = EntryParser.getMonthString(now);
        const lastMonth = EntryParser.getMonthString(
            new Date(now.getFullYear(), now.getMonth() - 1, 1)
        );

        for (const monthStr of [thisMonth, lastMonth]) {
            const parsed = await this.loadMonth(monthStr);
            for (const entry of parsed.entries) {
                if (entry.tags) {
                    entry.tags.forEach(tag => tags.add(tag));
                }
            }
        }

        return Array.from(tags).sort();
    }
}
