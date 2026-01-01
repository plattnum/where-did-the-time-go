import { EntryParser } from '../src/data/EntryParser';

describe('EntryParser', () => {
    describe('parseEntryLine', () => {
        it('should parse a basic entry with start and end times', () => {
            const line = '[start:: 2025-01-15 09:00] [end:: 2025-01-15 10:30] Morning standup [client:: test-client]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).not.toBeNull();
            expect(entry!.date).toBe('2025-01-15');
            expect(entry!.start).toBe('09:00');
            expect(entry!.end).toBe('10:30');
            expect(entry!.description).toBe('Morning standup');
            expect(entry!.client).toBe('test-client');
            expect(entry!.durationMinutes).toBe(90);
        });

        it('should parse an entry with project', () => {
            const line = '[start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Task work [client:: test-client] [project:: MyProject]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).not.toBeNull();
            expect(entry!.project).toBe('MyProject');
        });

        it('should parse an entry with activity', () => {
            const line = '[start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Feature work [client:: test-client] [activity:: feat]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).not.toBeNull();
            expect(entry!.activity).toBe('feat');
        });

        it('should parse an entry with linked note', () => {
            const line = '[start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Task work [client:: test-client] [[Notes/my-note]]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).not.toBeNull();
            expect(entry!.linkedNote).toBe('Notes/my-note');
        });

        it('should parse a full entry with all fields', () => {
            const line = '[start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Full task [client:: acme] [project:: Work] [activity:: feat] [[Notes/task-notes]]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).not.toBeNull();
            expect(entry!.date).toBe('2025-01-15');
            expect(entry!.start).toBe('09:00');
            expect(entry!.end).toBe('10:00');
            expect(entry!.description).toBe('Full task');
            expect(entry!.client).toBe('acme');
            expect(entry!.project).toBe('Work');
            expect(entry!.activity).toBe('feat');
            expect(entry!.linkedNote).toBe('Notes/task-notes');
            expect(entry!.durationMinutes).toBe(60);
        });

        it('should return null for invalid entry without start time', () => {
            const line = '[end:: 2025-01-15 10:00] Missing start [client:: test-client]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).toBeNull();
        });

        it('should return null for invalid entry without end time', () => {
            const line = '[start:: 2025-01-15 09:00] Missing end [client:: test-client]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).toBeNull();
        });

        it('should return null for entry without client', () => {
            const line = '[start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] No client';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).toBeNull();
        });
    });

    describe('parseDateTimeFields - midnight spanning', () => {
        it('should parse same-day entry correctly', () => {
            const { startDateTime, endDateTime, startDate, endDate } = EntryParser.parseDateTimeFields(
                '2025-01-15 09:00',
                '2025-01-15 17:00'
            );

            expect(startDate).toBe('2025-01-15');
            expect(endDate).toBe('2025-01-15');
            expect(startDateTime.getHours()).toBe(9);
            expect(endDateTime.getHours()).toBe(17);
        });

        it('should parse midnight-spanning entry correctly', () => {
            const { startDateTime, endDateTime, startDate, endDate } = EntryParser.parseDateTimeFields(
                '2025-01-15 22:00',
                '2025-01-16 02:00'
            );

            expect(startDate).toBe('2025-01-15');
            expect(endDate).toBe('2025-01-16');
            expect(startDateTime.getHours()).toBe(22);
            expect(startDateTime.getDate()).toBe(15);
            expect(endDateTime.getHours()).toBe(2);
            expect(endDateTime.getDate()).toBe(16);
        });

        it('should calculate correct duration for midnight-spanning entry', () => {
            const line = '[start:: 2025-01-15 23:00] [end:: 2025-01-16 02:00] Late night work [client:: test-client]';
            const entry = EntryParser.parseEntryLine(line, '2025-01-15', 1);

            expect(entry).not.toBeNull();
            expect(entry!.durationMinutes).toBe(180); // 3 hours
        });

        it('should throw error for invalid date format', () => {
            expect(() => {
                EntryParser.parseDateTimeFields('09:00', '10:00');
            }).toThrow('Invalid date+time format');
        });
    });

    describe('parseMonthFile', () => {
        it('should parse a complete month file', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Morning task [client:: acme]
- [start:: 2025-01-15 14:00] [end:: 2025-01-15 15:30] Afternoon task [client:: acme]

## 2025-01-16

- [start:: 2025-01-16 10:00] [end:: 2025-01-16 12:00] Next day task [client:: acme]
`;

            const result = EntryParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(3);
            expect(result.entriesByDate.size).toBe(2);
            expect(result.entriesByDate.get('2025-01-15')?.length).toBe(2);
            expect(result.entriesByDate.get('2025-01-16')?.length).toBe(1);
        });

        it('should handle empty file', () => {
            const result = EntryParser.parseMonthFile('', '2025-01');

            expect(result.entries.length).toBe(0);
            expect(result.entriesByDate.size).toBe(0);
        });

        it('should ignore invalid lines', () => {
            const content = `## 2025-01-15

- This is not a valid entry
- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Valid entry [client:: acme]
- Another invalid line
`;

            const result = EntryParser.parseMonthFile(content, '2025-01');

            expect(result.entries.length).toBe(1);
            expect(result.entries[0].description).toBe('Valid entry');
        });

        it('should track line numbers correctly', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] First entry [client:: acme]
- [start:: 2025-01-15 11:00] [end:: 2025-01-15 12:00] Second entry [client:: acme]
`;

            const result = EntryParser.parseMonthFile(content, '2025-01');

            expect(result.entries[0].lineNumber).toBe(3);
            expect(result.entries[1].lineNumber).toBe(4);
        });
    });

    describe('utility functions', () => {
        it('getMonthString should format correctly', () => {
            const date = new Date(2025, 0, 15); // Jan 15, 2025
            expect(EntryParser.getMonthString(date)).toBe('2025-01');
        });

        it('getDateString should format correctly', () => {
            const date = new Date(2025, 0, 5); // Jan 5, 2025
            expect(EntryParser.getDateString(date)).toBe('2025-01-05');
        });

        it('formatTime should format correctly', () => {
            const date = new Date(2025, 0, 15, 9, 5);
            expect(EntryParser.formatTime(date)).toBe('09:05');
        });
    });
});
