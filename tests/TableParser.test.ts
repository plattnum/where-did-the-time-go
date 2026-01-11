import { TableParser } from '../src/data/TableParser';
import { TimeEntry } from '../src/types';

describe('TableParser', () => {
    // Helper to create a test entry
    const createEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
        date: '2025-01-15',
        start: '09:00',
        end: '10:00',
        description: 'Test task',
        client: 'test-client',
        startDateTime: new Date(2025, 0, 15, 9, 0),
        endDateTime: new Date(2025, 0, 15, 10, 0),
        durationMinutes: 60,
        lineNumber: 1,
        ...overrides,
    });

    describe('parseMonthFile', () => {
        it('should parse a table with multiple entries', () => {
            const content = `# 2025-01

| Start | End | Description | Client | Project | Activity | Notes |
|-------|-----|-------------|--------|---------|----------|-------|
| 2025-01-15 09:00 | 2025-01-15 10:00 | Morning task | acme | proj1 | dev | |
| 2025-01-15 14:00 | 2025-01-15 15:30 | Afternoon task | acme | | meeting | |
| 2025-01-16 10:00 | 2025-01-16 12:00 | Next day task | acme | proj2 | | [[notes]] |
`;

            const result = TableParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(3);
            expect(result.entriesByDate.size).toBe(2);
            expect(result.entriesByDate.get('2025-01-15')?.length).toBe(2);
            expect(result.entriesByDate.get('2025-01-16')?.length).toBe(1);
        });

        it('should parse entry with all fields', () => {
            const content = `| Start | End | Description | Client | Project | Activity | Notes |
|-------|-----|-------------|--------|---------|----------|-------|
| 2025-01-15 09:00 | 2025-01-15 10:00 | Full task | acme | Work | feat | [[Notes/task]] |
`;

            const result = TableParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(1);
            const entry = result.entries[0];
            expect(entry.date).toBe('2025-01-15');
            expect(entry.start).toBe('09:00');
            expect(entry.end).toBe('10:00');
            expect(entry.description).toBe('Full task');
            expect(entry.client).toBe('acme');
            expect(entry.project).toBe('Work');
            expect(entry.activity).toBe('feat');
            expect(entry.linkedNote).toBe('Notes/task');
            expect(entry.durationMinutes).toBe(60);
        });

        it('should handle empty file', () => {
            const result = TableParser.parseMonthFile('', '2025-01');

            expect(result.entries.length).toBe(0);
            expect(result.entriesByDate.size).toBe(0);
        });

        it('should handle file with only header (no data rows)', () => {
            const content = `| Start | End | Description | Client | Project | Activity | Notes |
|-------|-----|-------------|--------|---------|----------|-------|
`;

            const result = TableParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(0);
        });

        it('should skip rows with missing required fields', () => {
            const content = `| Start | End | Description | Client | Project | Activity | Notes |
|-------|-----|-------------|--------|---------|----------|-------|
| 2025-01-15 09:00 | 2025-01-15 10:00 | Valid entry | acme | | | |
| | 2025-01-15 11:00 | Missing start | acme | | | |
| 2025-01-15 12:00 | | Missing end | acme | | | |
| 2025-01-15 13:00 | 2025-01-15 14:00 | Missing client | | | | |
`;

            const result = TableParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(1);
            expect(result.entries[0].description).toBe('Valid entry');
        });

        it('should parse midnight-spanning entry correctly', () => {
            const content = `| Start | End | Description | Client | Project | Activity | Notes |
|-------|-----|-------------|--------|---------|----------|-------|
| 2025-01-15 23:00 | 2025-01-16 02:00 | Late night work | acme | | | |
`;

            const result = TableParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(1);
            const entry = result.entries[0];
            expect(entry.date).toBe('2025-01-15');
            expect(entry.durationMinutes).toBe(180); // 3 hours
            expect(entry.startDateTime.getDate()).toBe(15);
            expect(entry.endDateTime.getDate()).toBe(16);
        });
    });

    describe('generateTable', () => {
        it('should generate a valid markdown table', () => {
            const entries = [
                createEntry({ description: 'Task 1' }),
                createEntry({
                    description: 'Task 2',
                    startDateTime: new Date(2025, 0, 15, 11, 0),
                    endDateTime: new Date(2025, 0, 15, 12, 0),
                }),
            ];

            const result = TableParser.generateTable(entries);

            // Check headers exist (may have padding)
            expect(result).toMatch(/\| Start\s+\|/);
            expect(result).toMatch(/\| End\s+\|/);
            expect(result).toMatch(/\| Description\s+\|/);
            expect(result).toMatch(/\| Client\s+\|/);
            expect(result).toContain('Task 1');
            expect(result).toContain('Task 2');
            expect(result).toContain('test-client');
        });

        it('should sort entries by start time', () => {
            const entries = [
                createEntry({
                    description: 'Later',
                    startDateTime: new Date(2025, 0, 15, 14, 0),
                    endDateTime: new Date(2025, 0, 15, 15, 0),
                }),
                createEntry({
                    description: 'Earlier',
                    startDateTime: new Date(2025, 0, 15, 9, 0),
                    endDateTime: new Date(2025, 0, 15, 10, 0),
                }),
            ];

            const result = TableParser.generateTable(entries);

            // Earlier should come before Later in the output
            expect(result.indexOf('Earlier')).toBeLessThan(result.indexOf('Later'));
        });

        it('should generate empty table for no entries', () => {
            const result = TableParser.generateTable([]);

            expect(result).toContain('| Start |');
            // Should still have the header row
        });

        it('should include linked notes with wikilink syntax', () => {
            const entry = createEntry({ linkedNote: 'Notes/my-note' });
            const result = TableParser.generateTable([entry]);

            expect(result).toContain('[[Notes/my-note]]');
        });
    });

    describe('generateMonthFile', () => {
        it('should include header and table', () => {
            const entries = [createEntry()];
            const result = TableParser.generateMonthFile(entries, '2025-01');

            expect(result).toContain('WARNING');
            expect(result).toContain('# 2025-01');
            expect(result).toContain('| Start |');
            expect(result).toContain('test-client');
        });
    });

    describe('round-trip parsing', () => {
        it('should generate and parse back to same data', () => {
            const original = createEntry({
                project: 'TestProject',
                activity: 'feat',
                linkedNote: 'Notes/test',
            });

            const table = TableParser.generateTable([original]);
            const parsed = TableParser.parseMonthFile(table, '2025-01');

            expect(parsed.entries.length).toBe(1);
            const entry = parsed.entries[0];
            expect(entry.date).toBe(original.date);
            expect(entry.start).toBe(original.start);
            expect(entry.end).toBe(original.end);
            expect(entry.description).toBe(original.description);
            expect(entry.client).toBe(original.client);
            expect(entry.project).toBe(original.project);
            expect(entry.activity).toBe(original.activity);
            expect(entry.linkedNote).toBe(original.linkedNote);
        });

        it('should round-trip midnight-spanning entry correctly', () => {
            const original = createEntry({
                date: '2025-01-15',
                start: '23:00',
                end: '02:00',
                startDateTime: new Date(2025, 0, 15, 23, 0),
                endDateTime: new Date(2025, 0, 16, 2, 0),
                durationMinutes: 180,
                description: 'Night work',
            });

            const table = TableParser.generateTable([original]);
            const parsed = TableParser.parseMonthFile(table, '2025-01');

            expect(parsed.entries.length).toBe(1);
            const entry = parsed.entries[0];
            expect(entry.client).toBe(original.client);
            expect(entry.durationMinutes).toBe(180);
            expect(entry.startDateTime.getDate()).toBe(15);
            expect(entry.endDateTime.getDate()).toBe(16);
        });

        it('should round-trip multiple entries preserving order', () => {
            const entries = [
                createEntry({
                    description: 'First',
                    startDateTime: new Date(2025, 0, 15, 9, 0),
                    endDateTime: new Date(2025, 0, 15, 10, 0),
                }),
                createEntry({
                    description: 'Second',
                    startDateTime: new Date(2025, 0, 15, 11, 0),
                    endDateTime: new Date(2025, 0, 15, 12, 0),
                }),
                createEntry({
                    description: 'Third',
                    startDateTime: new Date(2025, 0, 15, 14, 0),
                    endDateTime: new Date(2025, 0, 15, 15, 0),
                }),
            ];

            const table = TableParser.generateTable(entries);
            const parsed = TableParser.parseMonthFile(table, '2025-01');

            expect(parsed.entries.length).toBe(3);
            expect(parsed.entries[0].description).toBe('First');
            expect(parsed.entries[1].description).toBe('Second');
            expect(parsed.entries[2].description).toBe('Third');
        });
    });

    describe('utility functions', () => {
        it('getMonthString should format correctly', () => {
            const date = new Date(2025, 0, 15); // Jan 15, 2025
            expect(TableParser.getMonthString(date)).toBe('2025-01');
        });

        it('getDateString should format correctly', () => {
            const date = new Date(2025, 0, 5); // Jan 5, 2025
            expect(TableParser.getDateString(date)).toBe('2025-01-05');
        });

        it('formatTime should format correctly', () => {
            const date = new Date(2025, 0, 15, 9, 5);
            expect(TableParser.formatTime(date)).toBe('09:05');
        });

        it('formatDateTime should format correctly', () => {
            const date = new Date(2025, 0, 15, 9, 5);
            expect(TableParser.formatDateTime(date)).toBe('2025-01-15 09:05');
        });

        it('parseDateTime should parse valid datetime', () => {
            const result = TableParser.parseDateTime('2025-01-15 09:30');
            expect(result).not.toBeNull();
            expect(result!.getFullYear()).toBe(2025);
            expect(result!.getMonth()).toBe(0); // January
            expect(result!.getDate()).toBe(15);
            expect(result!.getHours()).toBe(9);
            expect(result!.getMinutes()).toBe(30);
        });

        it('parseDateTime should return null for invalid format', () => {
            expect(TableParser.parseDateTime('09:30')).toBeNull();
            expect(TableParser.parseDateTime('2025-01-15')).toBeNull();
            expect(TableParser.parseDateTime('invalid')).toBeNull();
        });
    });
});
