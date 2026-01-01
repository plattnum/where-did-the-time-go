import type { TimeEntry } from '../types';
import { EntryParser } from './EntryParser';

/**
 * Serializes time entries to markdown format
 *
 * Output format:
 * - [start:: 2024-01-15 09:15] [end:: 2024-01-15 10:40] Description text [project:: name] [activity:: feat] [tags:: a, b] [[linked note]]
 */
export class EntrySerializer {
    /**
     * Warning header added to the top of monthly files
     */
    static readonly FILE_HEADER = `%%
⚠️ WARNING: This file is managed by the "Where Did The Time Go" plugin.
Do not edit manually - your changes may be overwritten.
Use the Timeline view to create, edit, or delete entries.

FILE STRUCTURE:
- One file per month, named YYYY-MM.md
- Entries grouped under date headers: ## YYYY-MM-DD
- Entries sorted chronologically within each date

ENTRY FORMAT:
- [start:: YYYY-MM-DD HH:MM] [end:: YYYY-MM-DD HH:MM] Description [project:: name] [activity:: type] [tags:: a, b] [[linked note]]

FIELDS:
- start (required): Start date and time
- end (required): End date and time (may be next day for overnight entries)
- Description: Free text describing the activity
- project (optional): Project name for grouping
- activity (optional): Work type classification (feat, fix, meeting, etc.)
- tags (optional): Comma-separated tags for categorization
- [[linked note]] (optional): Obsidian wikilink to related note

Uses Dataview-compatible inline field syntax [key:: value].
%%

`;
    /**
     * Serialize a single entry to a markdown line
     */
    static serializeEntry(entry: TimeEntry): string {
        const parts: string[] = [];

        // Format start and end with explicit date+time
        const startDateStr = EntryParser.getDateString(entry.startDateTime);
        const startTimeStr = EntryParser.formatTime(entry.startDateTime);
        parts.push(`[start:: ${startDateStr} ${startTimeStr}]`);

        const endDateStr = EntryParser.getDateString(entry.endDateTime);
        const endTimeStr = EntryParser.formatTime(entry.endDateTime);
        parts.push(`[end:: ${endDateStr} ${endTimeStr}]`);

        // Description
        if (entry.description) {
            parts.push(entry.description);
        }

        // Project (optional)
        if (entry.project) {
            parts.push(`[project:: ${entry.project}]`);
        }

        // Activity (optional)
        if (entry.activity) {
            parts.push(`[activity:: ${entry.activity}]`);
        }

        // Tags (optional)
        if (entry.tags && entry.tags.length > 0) {
            parts.push(`[tags:: ${entry.tags.join(', ')}]`);
        }

        // Linked note (optional)
        if (entry.linkedNote) {
            parts.push(`[[${entry.linkedNote}]]`);
        }

        return `- ${parts.join(' ')}`;
    }

    /**
     * Serialize multiple entries for a single date
     */
    static serializeEntriesForDate(entries: TimeEntry[]): string {
        return entries
            .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())
            .map(e => this.serializeEntry(e))
            .join('\n');
    }

    /**
     * Generate or update a monthly file content with entries
     */
    static generateMonthFile(entriesByDate: Map<string, TimeEntry[]>, existingContent?: string): string {
        // Get all dates and sort them
        const dates = Array.from(entriesByDate.keys()).sort();

        if (dates.length === 0) {
            return existingContent || '';
        }

        const lines: string[] = [];

        for (const date of dates) {
            const entries = entriesByDate.get(date) || [];
            if (entries.length === 0) continue;

            // Date header
            lines.push(`## ${date}`);
            lines.push('');

            // Entries for this date
            lines.push(this.serializeEntriesForDate(entries));
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Update a specific entry in existing file content
     * Returns the updated content
     */
    static updateEntryInContent(
        content: string,
        oldEntry: TimeEntry,
        newEntry: TimeEntry
    ): string {
        const lines = content.split('\n');

        // Find and replace the line at the entry's line number
        if (oldEntry.lineNumber > 0 && oldEntry.lineNumber <= lines.length) {
            const lineIndex = oldEntry.lineNumber - 1; // Convert to 0-indexed
            lines[lineIndex] = this.serializeEntry(newEntry);
        }

        return lines.join('\n');
    }

    /**
     * Add a new entry to existing file content
     * Inserts the entry under the correct date heading
     */
    static addEntryToContent(content: string, entry: TimeEntry): string {
        const lines = content.split('\n');
        const dateHeader = `## ${entry.date}`;
        const entryLine = this.serializeEntry(entry);

        // Find the date header
        let dateHeaderIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === dateHeader) {
                dateHeaderIndex = i;
                break;
            }
        }

        if (dateHeaderIndex === -1) {
            // Date doesn't exist, need to add it in the right place
            return this.addNewDateSection(content, entry);
        }

        // Find where to insert the entry (after date header, sorted by time)
        let insertIndex = dateHeaderIndex + 1;

        // Skip empty lines after header
        while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
            insertIndex++;
        }

        // Find the right position based on start time
        while (insertIndex < lines.length) {
            const line = lines[insertIndex];

            // Stop if we hit a new date header
            if (line.match(/^##\s+\d{4}-\d{2}-\d{2}/)) {
                break;
            }

            // Parse existing entry to compare times
            if (line.startsWith('- ')) {
                const existingEntry = EntryParser.parseEntryLine(
                    line.substring(2),
                    entry.date,
                    insertIndex + 1
                );
                if (existingEntry && existingEntry.startDateTime > entry.startDateTime) {
                    break;
                }
            }

            insertIndex++;
        }

        // Insert the new entry
        lines.splice(insertIndex, 0, entryLine);

        return lines.join('\n');
    }

    /**
     * Add a new date section with an entry
     */
    private static addNewDateSection(content: string, entry: TimeEntry): string {
        const lines = content.split('\n');
        const dateHeader = `## ${entry.date}`;
        const entryLine = this.serializeEntry(entry);

        // Find where to insert the new date section (sorted)
        let insertIndex = lines.length;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^##\s+(\d{4}-\d{2}-\d{2})/);
            if (match && match[1] > entry.date) {
                insertIndex = i;
                break;
            }
        }

        // Insert date header and entry
        const newLines = ['', dateHeader, '', entryLine, ''];
        lines.splice(insertIndex, 0, ...newLines);

        return lines.join('\n');
    }

    /**
     * Delete an entry from file content
     */
    static deleteEntryFromContent(content: string, entry: TimeEntry): string {
        const lines = content.split('\n');

        if (entry.lineNumber > 0 && entry.lineNumber <= lines.length) {
            const lineIndex = entry.lineNumber - 1;
            lines.splice(lineIndex, 1);
        }

        return lines.join('\n');
    }
}
