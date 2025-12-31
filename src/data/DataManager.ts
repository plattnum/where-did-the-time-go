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
        console.log('DataManager: Looking for file at', filePath);

        const file = this.vault.getAbstractFileByPath(filePath);
        console.log('DataManager: File found?', !!file);

        if (!file || !(file instanceof TFile)) {
            // No file exists, return empty month
            console.log('DataManager: No file found, returning empty month');
            const emptyMonth: ParsedMonth = {
                month: monthStr,
                entries: [],
                entriesByDate: new Map(),
            };
            return emptyMonth;
        }

        const content = await this.vault.read(file);
        console.log('DataManager: File content length', content.length);

        const parsed = EntryParser.parseMonthFile(content, monthStr);
        console.log('DataManager: Parsed entries count', parsed.entries.length);

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
        const current = new Date(startDate);
        while (current <= endDate) {
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

        // Create full entry object
        const { startDateTime, endDateTime } = EntryParser.parseTimeRange(
            entry.date,
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
        const monthStr = oldEntry.date.substring(0, 7);
        const file = await this.getOrCreateMonthFile(monthStr);

        // Merge old and new entry data
        const updatedEntry: TimeEntry = {
            ...oldEntry,
            ...newEntry,
        };

        // Recalculate datetime if times changed
        if (newEntry.start || newEntry.end || newEntry.date) {
            const { startDateTime, endDateTime } = EntryParser.parseTimeRange(
                updatedEntry.date,
                updatedEntry.start,
                updatedEntry.end
            );
            updatedEntry.startDateTime = startDateTime;
            updatedEntry.endDateTime = endDateTime;
            updatedEntry.durationMinutes = Math.round(
                (endDateTime.getTime() - startDateTime.getTime()) / 60000
            );
        }

        // Check for overlaps (excluding self)
        const existingEntries = await this.loadEntriesForDate(updatedEntry.startDateTime);
        const otherEntries = existingEntries.filter(e => e.lineNumber !== oldEntry.lineNumber);
        if (this.hasOverlap(updatedEntry, otherEntries)) {
            throw new Error('Entry overlaps with an existing time entry');
        }

        // Update file content
        const content = await this.vault.read(file);
        const newContent = EntrySerializer.updateEntryInContent(content, oldEntry, updatedEntry);
        await this.vault.modify(file, newContent);

        // Invalidate cache
        this.invalidateMonth(monthStr);

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
