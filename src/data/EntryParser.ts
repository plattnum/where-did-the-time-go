import type { TimeEntry, ParsedMonth } from '../types';

/**
 * Parses time entries from markdown content
 *
 * Format:
 * ## 2024-01-15
 * - [start:: 2024-01-15 09:15] [end:: 2024-01-15 10:40] Description text [project:: name] [tags:: a, b] [[linked note]]
 *
 * Entries spanning midnight:
 * - [start:: 2024-01-15 22:00] [end:: 2024-01-16 03:00] Late night work
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
     * Note: headingDate is kept for API compatibility but not used - dates are in the start/end fields
     */
    static parseEntryLine(line: string, _headingDate: string, lineNumber: number): TimeEntry | null {
        console.log('EntryParser: Parsing line:', line);

        // Extract all inline fields
        const fields = new Map<string, string>();
        let remainingText = line;

        // Extract inline fields [key:: value] using matchAll to avoid regex state issues
        const matches = Array.from(line.matchAll(this.INLINE_FIELD_PATTERN));
        console.log('EntryParser: Matches found:', matches.length);

        for (const match of matches) {
            fields.set(match[1].toLowerCase(), match[2].trim());
            remainingText = remainingText.replace(match[0], '');
        }

        // Must have start and end times
        const startStr = fields.get('start');
        const endStr = fields.get('end');

        if (!startStr || !endStr) {
            console.log('EntryParser: Missing start or end, skipping');
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

        // Parse start and end with explicit date+time format
        const { startDateTime, endDateTime, startDate, endDate } = this.parseDateTimeFields(startStr, endStr);

        // The entry's date is the start date (for organizing under headings)
        const entryDate = startDate;

        // Calculate duration
        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);

        // Extract just the time portion for display
        const startTime = this.formatTime(startDateTime);
        const endTime = this.formatTime(endDateTime);

        return {
            date: entryDate,
            start: startTime,
            end: endTime,
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
     * Parse start and end fields with explicit date+time format: "YYYY-MM-DD HH:mm"
     */
    static parseDateTimeFields(
        startStr: string,
        endStr: string
    ): { startDateTime: Date; endDateTime: Date; startDate: string; endDate: string } {
        // Parse "YYYY-MM-DD HH:mm" format
        const startMatch = startStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
        const endMatch = endStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);

        if (!startMatch || !endMatch) {
            throw new Error(`Invalid date+time format. Expected "YYYY-MM-DD HH:mm". Got start="${startStr}", end="${endStr}"`);
        }

        const startDate = startMatch[1];
        const startTime = this.parseTime(startMatch[2]);
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const startDateTime = new Date(sy, sm - 1, sd, startTime.hours, startTime.minutes);

        const endDate = endMatch[1];
        const endTime = this.parseTime(endMatch[2]);
        const [ey, em, ed] = endDate.split('-').map(Number);
        const endDateTime = new Date(ey, em - 1, ed, endTime.hours, endTime.minutes);

        return { startDateTime, endDateTime, startDate, endDate };
    }

    /**
     * Parse HH:mm string into hours and minutes
     */
    private static parseTime(timeStr: string): { hours: number; minutes: number } {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return { hours: hours || 0, minutes: minutes || 0 };
    }

    /**
     * Format a Date to HH:mm string
     */
    static formatTime(date: Date): string {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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
