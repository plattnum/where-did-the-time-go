import type { TimeEntry, ParsedMonth } from '../types';

/**
 * Parses time entries from markdown content
 *
 * Expected format:
 * ## 2024-01-15
 * - [start:: 09:15] [end:: 10:40] Description text [project:: name] [tags:: a, b] [[linked note]]
 */
export class EntryParser {
    // Match date headers like "## 2024-01-15"
    private static DATE_HEADER_REGEX = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/;

    // Match inline fields like [start:: 09:15] - no g flag, we'll use matchAll
    private static INLINE_FIELD_PATTERN = /\[(\w+)::\s*([^\]]+)\]/g;

    // Match wikilinks like [[path/to/note]]
    private static WIKILINK_REGEX = /\[\[([^\]]+)\]\]/;

    // Match list items
    private static LIST_ITEM_REGEX = /^-\s+(.+)$/;

    /**
     * Parse a monthly file content into entries
     */
    static parseMonthFile(content: string, monthStr: string): ParsedMonth {
        const lines = content.split('\n');
        const entries: TimeEntry[] = [];
        const entriesByDate = new Map<string, TimeEntry[]>();

        let currentDate: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1; // 1-indexed for editor compatibility

            // Check for date header
            const dateMatch = line.match(this.DATE_HEADER_REGEX);
            if (dateMatch) {
                currentDate = dateMatch[1];
                if (!entriesByDate.has(currentDate)) {
                    entriesByDate.set(currentDate, []);
                }
                continue;
            }

            // Check for list item (potential entry)
            const listMatch = line.match(this.LIST_ITEM_REGEX);
            if (listMatch && currentDate) {
                const entry = this.parseEntryLine(listMatch[1], currentDate, lineNumber);
                if (entry) {
                    entries.push(entry);
                    entriesByDate.get(currentDate)!.push(entry);
                }
            }
        }

        return {
            month: monthStr,
            entries,
            entriesByDate,
        };
    }

    /**
     * Parse a single entry line (without the leading "- ")
     */
    static parseEntryLine(line: string, date: string, lineNumber: number): TimeEntry | null {
        console.log('EntryParser: Parsing line:', line);

        // Extract all inline fields
        const fields = new Map<string, string>();
        let remainingText = line;

        // Extract inline fields [key:: value] using matchAll to avoid regex state issues
        const matches = Array.from(line.matchAll(this.INLINE_FIELD_PATTERN));
        console.log('EntryParser: Matches found:', matches.length, matches);

        for (const match of matches) {
            console.log('EntryParser: Match:', match[1], '=', match[2]);
            fields.set(match[1].toLowerCase(), match[2].trim());
            remainingText = remainingText.replace(match[0], '');
        }

        console.log('EntryParser: Fields map:', Object.fromEntries(fields));

        // Must have start and end times
        const startStr = fields.get('start');
        const endStr = fields.get('end');
        console.log('EntryParser: start=', startStr, 'end=', endStr);

        if (!startStr || !endStr) {
            console.log('EntryParser: Missing start or end, returning null');
            return null;
        }

        // Extract wikilink if present
        let linkedNote: string | undefined;
        const wikilinkMatch = remainingText.match(this.WIKILINK_REGEX);
        if (wikilinkMatch) {
            linkedNote = wikilinkMatch[1];
            remainingText = remainingText.replace(wikilinkMatch[0], '');
        }

        // Clean up remaining text to get description
        const description = remainingText.trim();

        // Parse tags (comma-separated)
        const tagsStr = fields.get('tags');
        const tags = tagsStr
            ? tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : undefined;

        // Parse times and create Date objects
        const { startDateTime, endDateTime } = this.parseTimeRange(date, startStr, endStr);

        // Calculate duration
        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);

        return {
            date,
            start: startStr.replace(/\+\d+$/, ''), // Remove +1 suffix for display
            end: endStr.replace(/\+\d+$/, ''),
            description,
            project: fields.get('project'),
            tags,
            linkedNote,
            startDateTime,
            endDateTime,
            lineNumber,
            durationMinutes,
        };
    }

    /**
     * Parse time strings into Date objects, handling +N notation for next day
     */
    static parseTimeRange(date: string, startStr: string, endStr: string): { startDateTime: Date; endDateTime: Date } {
        const [year, month, day] = date.split('-').map(Number);

        // Parse start time
        const startTime = this.parseTime(startStr);
        const startDateTime = new Date(year, month - 1, day, startTime.hours, startTime.minutes);

        // Parse end time (may have +N suffix for days offset)
        const endDaysOffset = this.extractDaysOffset(endStr);
        const endTime = this.parseTime(endStr.replace(/\+\d+$/, ''));
        const endDateTime = new Date(year, month - 1, day + endDaysOffset, endTime.hours, endTime.minutes);

        return { startDateTime, endDateTime };
    }

    /**
     * Parse HH:mm string into hours and minutes
     */
    private static parseTime(timeStr: string): { hours: number; minutes: number } {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return { hours: hours || 0, minutes: minutes || 0 };
    }

    /**
     * Extract +N days offset from time string (e.g., "01:30+1" returns 1)
     */
    private static extractDaysOffset(timeStr: string): number {
        const match = timeStr.match(/\+(\d+)$/);
        return match ? parseInt(match[1]) : 0;
    }

    /**
     * Get the month string (YYYY-MM) for a given date
     */
    static getMonthString(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Get the date string (YYYY-MM-DD) for a given date
     */
    static getDateString(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
