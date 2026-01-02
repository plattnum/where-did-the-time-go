import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import type { Root, Table, TableRow, TableCell } from 'mdast';
import type { TimeEntry, ParsedMonth } from '../types';

/**
 * Parses and serializes time entries using markdown tables via mdast/remark
 *
 * Format (one table per month file):
 * | Start | End | Description | Client | Project | Activity | Notes |
 * |-------|-----|-------------|--------|---------|----------|-------|
 * | 2024-01-15 09:15 | 2024-01-15 10:40 | Work on feature | acme | proj1 | dev | [[note]] |
 *
 * Uses unified/remark for robust parsing that handles edge cases:
 * - Escaped pipes \|
 * - Pipes inside code spans
 * - Alignment markers
 * - Empty cells
 */
export class TableParser {
    /** Expected column headers (case-insensitive matching) */
    static readonly HEADERS = ['Start', 'End', 'Description', 'Client', 'Project', 'Activity', 'Notes'];

    /** Create the unified processor for parsing */
    private static createParser() {
        return unified()
            .use(remarkParse)
            .use(remarkGfm);
    }

    /** Create the unified processor for serializing */
    private static createSerializer() {
        return unified()
            .use(remarkParse)
            .use(remarkGfm)
            .use(remarkStringify, {
                bullet: '-',
                fence: '`',
                fences: true,
                incrementListMarker: false,
            });
    }

    /**
     * Parse a monthly file content into entries
     */
    static parseMonthFile(content: string, monthStr: string): ParsedMonth {
        const entries: TimeEntry[] = [];
        const entriesByDate = new Map<string, TimeEntry[]>();

        // Parse markdown to AST
        const processor = this.createParser();
        const tree = processor.parse(content) as Root;

        // Find table nodes
        for (const node of tree.children) {
            if (node.type === 'table') {
                const tableEntries = this.parseTable(node as Table);
                for (const entry of tableEntries) {
                    entries.push(entry);

                    // Group by date
                    if (!entriesByDate.has(entry.date)) {
                        entriesByDate.set(entry.date, []);
                    }
                    entriesByDate.get(entry.date)!.push(entry);
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
     * Parse a table node into TimeEntry array
     */
    private static parseTable(table: Table): TimeEntry[] {
        const entries: TimeEntry[] = [];
        const rows = table.children as TableRow[];

        if (rows.length < 2) {
            return entries; // Need at least header + one data row
        }

        // Get header indices
        const headerRow = rows[0];
        const headerMap = this.getHeaderMap(headerRow);

        // Parse data rows (skip header)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const entry = this.parseRow(row, headerMap, i);
            if (entry) {
                entries.push(entry);
            }
        }

        return entries;
    }

    /**
     * Build a map of header name -> column index
     */
    private static getHeaderMap(headerRow: TableRow): Map<string, number> {
        const map = new Map<string, number>();
        const cells = headerRow.children as TableCell[];

        for (let i = 0; i < cells.length; i++) {
            const text = this.getCellText(cells[i]).toLowerCase();
            map.set(text, i);
        }

        return map;
    }

    /**
     * Parse a table row into a TimeEntry
     */
    private static parseRow(row: TableRow, headerMap: Map<string, number>, rowIndex: number): TimeEntry | null {
        const cells = row.children as TableCell[];

        const getValue = (header: string): string => {
            const index = headerMap.get(header.toLowerCase());
            if (index === undefined || index >= cells.length) return '';
            return this.getCellText(cells[index]);
        };

        const startStr = getValue('start');
        const endStr = getValue('end');
        const client = getValue('client');

        // Must have start, end, and client
        if (!startStr || !endStr || !client) {
            console.log('TableParser: Missing required fields (start, end, or client)');
            return null;
        }

        // Parse datetimes
        const startDateTime = this.parseDateTime(startStr);
        const endDateTime = this.parseDateTime(endStr);

        if (!startDateTime || !endDateTime) {
            console.log('TableParser: Invalid datetime format');
            return null;
        }

        // Extract date from start datetime
        const date = this.getDateString(startDateTime);

        // Calculate duration
        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);

        // Extract time strings for display
        const start = this.formatTime(startDateTime);
        const end = this.formatTime(endDateTime);

        // Parse linked note from notes column (extract [[...]])
        const notes = getValue('notes');
        let linkedNote: string | undefined;
        if (notes) {
            const wikiMatch = notes.match(/\[\[([^\]]+)\]\]/);
            if (wikiMatch) {
                linkedNote = wikiMatch[1];
            }
        }

        return {
            date,
            start,
            end,
            description: getValue('description'),
            client,
            project: getValue('project') || undefined,
            activity: getValue('activity') || undefined,
            linkedNote,
            startDateTime,
            endDateTime,
            lineNumber: rowIndex, // Row index in table (not file line number)
            durationMinutes,
        };
    }

    /**
     * Get text content from a table cell
     */
    private static getCellText(cell: TableCell): string {
        let text = '';
        for (const child of cell.children) {
            if (child.type === 'text') {
                text += child.value;
            } else if (child.type === 'inlineCode') {
                text += child.value;
            } else if ('children' in child) {
                // Recursively get text from nested nodes
                text += this.getNodeText(child);
            }
        }
        return text.trim();
    }

    /**
     * Recursively get text from any node
     */
    private static getNodeText(node: unknown): string {
        if (!node || typeof node !== 'object') return '';

        const n = node as { type?: string; value?: string; children?: unknown[] };

        if (n.type === 'text' && typeof n.value === 'string') {
            return n.value;
        }

        if (Array.isArray(n.children)) {
            return n.children.map(child => this.getNodeText(child)).join('');
        }

        return '';
    }

    /**
     * Parse datetime string "YYYY-MM-DD HH:mm" into Date
     */
    static parseDateTime(str: string): Date | null {
        const match = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const [, year, month, day, hours, minutes] = match.map(Number);
        return new Date(year, month - 1, day, hours, minutes);
    }

    /**
     * Format a Date to HH:mm string
     */
    static formatTime(date: Date): string {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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

    /**
     * Get the month string (YYYY-MM) for a given date
     */
    static getMonthString(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Format a Date to "YYYY-MM-DD HH:mm" string for table cells
     */
    static formatDateTime(date: Date): string {
        return `${this.getDateString(date)} ${this.formatTime(date)}`;
    }

    /**
     * Generate markdown table content from entries
     */
    static generateTable(entries: TimeEntry[]): string {
        // Sort entries by start time
        const sorted = [...entries].sort((a, b) =>
            a.startDateTime.getTime() - b.startDateTime.getTime()
        );

        // Build table AST
        const tableRows: TableRow[] = [];

        // Header row
        tableRows.push({
            type: 'tableRow',
            children: this.HEADERS.map(h => ({
                type: 'tableCell',
                children: [{ type: 'text', value: h }],
            })) as TableCell[],
        });

        // Data rows
        for (const entry of sorted) {
            tableRows.push({
                type: 'tableRow',
                children: [
                    this.createCell(this.formatDateTime(entry.startDateTime)),
                    this.createCell(this.formatDateTime(entry.endDateTime)),
                    this.createCell(entry.description),
                    this.createCell(entry.client),
                    this.createCell(entry.project || ''),
                    this.createCell(entry.activity || ''),
                    this.createCell(entry.linkedNote ? `[[${entry.linkedNote}]]` : ''),
                ] as TableCell[],
            });
        }

        const table: Table = {
            type: 'table',
            align: ['left', 'left', 'left', 'left', 'left', 'left', 'left'],
            children: tableRows,
        };

        const root: Root = {
            type: 'root',
            children: [table],
        };

        // Serialize to markdown
        const processor = this.createSerializer();
        let result = processor.stringify(root);

        // Unescape wikilinks (remark escapes [[ but Obsidian needs them)
        result = result.replace(/\\\[\\\[/g, '[[').replace(/\\\]\\\]/g, ']]');

        return result;
    }

    /**
     * Create a table cell with text content
     */
    private static createCell(text: string): TableCell {
        return {
            type: 'tableCell',
            children: [{ type: 'text', value: text }],
        };
    }

    /**
     * Generate a complete month file with header and table
     */
    static generateMonthFile(entries: TimeEntry[], monthStr: string): string {
        const header = this.getFileHeader();
        const table = this.generateTable(entries);
        return `${header}\n# ${monthStr}\n\n${table}`;
    }

    /**
     * Warning header added to the top of monthly files
     */
    static getFileHeader(): string {
        return `%%
⚠️ WARNING: This file is managed by the "Where Did The Time Go" plugin.
Do not edit manually - your changes may be overwritten.
Use the Timeline view to create, edit, or delete entries.

FILE STRUCTURE:
- One file per month, named YYYY-MM.md
- Single table containing all entries for the month
- Entries sorted chronologically by start time

TABLE COLUMNS:
| Start | End | Description | Client | Project | Activity | Notes |
- Start (required): Start date and time (YYYY-MM-DD HH:mm)
- End (required): End date and time (may be next day for overnight entries)
- Description: Free text describing the activity
- Client (required): Client for billing
- Project (optional): Project name
- Activity (optional): Work type classification
- Notes (optional): Obsidian wikilink [[linked note]]
%%
`;
    }
}
