import { EntrySerializer } from '../src/data/EntrySerializer';
import { TimeEntry } from '../src/types';

describe('EntrySerializer', () => {
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

    describe('serializeEntry', () => {
        it('should serialize a basic entry', () => {
            const entry = createEntry();
            const result = EntrySerializer.serializeEntry(entry);

            expect(result).toBe('- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Test task [client:: test-client]');
        });

        it('should serialize entry with project', () => {
            const entry = createEntry({ project: 'MyProject' });
            const result = EntrySerializer.serializeEntry(entry);

            expect(result).toBe('- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Test task [client:: test-client] [project:: MyProject]');
        });

        it('should serialize entry with activity', () => {
            const entry = createEntry({ activity: 'feat' });
            const result = EntrySerializer.serializeEntry(entry);

            expect(result).toBe('- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Test task [client:: test-client] [activity:: feat]');
        });

        it('should serialize entry with linked note', () => {
            const entry = createEntry({ linkedNote: 'Notes/my-note' });
            const result = EntrySerializer.serializeEntry(entry);

            expect(result).toBe('- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Test task [client:: test-client] [[Notes/my-note]]');
        });

        it('should serialize a full entry with all fields', () => {
            const entry = createEntry({
                project: 'Work',
                activity: 'feat',
                linkedNote: 'Notes/task',
            });
            const result = EntrySerializer.serializeEntry(entry);

            expect(result).toBe(
                '- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Test task [client:: test-client] [project:: Work] [activity:: feat] [[Notes/task]]'
            );
        });

        it('should serialize midnight-spanning entry correctly', () => {
            const entry = createEntry({
                date: '2025-01-15',
                start: '23:00',
                end: '02:00',
                startDateTime: new Date(2025, 0, 15, 23, 0),
                endDateTime: new Date(2025, 0, 16, 2, 0),
                durationMinutes: 180,
            });
            const result = EntrySerializer.serializeEntry(entry);

            expect(result).toBe('- [start:: 2025-01-15 23:00] [end:: 2025-01-16 02:00] Test task [client:: test-client]');
        });
    });

    describe('addEntryToContent', () => {
        it('should add entry to existing date section', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Existing entry [client:: test-client]
`;
            const newEntry = createEntry({
                startDateTime: new Date(2025, 0, 15, 11, 0),
                endDateTime: new Date(2025, 0, 15, 12, 0),
                start: '11:00',
                end: '12:00',
                description: 'New entry',
            });

            const result = EntrySerializer.addEntryToContent(content, newEntry);

            expect(result).toContain('- [start:: 2025-01-15 09:00]');
            expect(result).toContain('- [start:: 2025-01-15 11:00]');
            // New entry should come after existing
            expect(result.indexOf('11:00')).toBeGreaterThan(result.indexOf('09:00'));
        });

        it('should insert entry in correct time order', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] First [client:: test-client]
- [start:: 2025-01-15 14:00] [end:: 2025-01-15 15:00] Third [client:: test-client]
`;
            const newEntry = createEntry({
                startDateTime: new Date(2025, 0, 15, 11, 0),
                endDateTime: new Date(2025, 0, 15, 12, 0),
                start: '11:00',
                end: '12:00',
                description: 'Second (inserted)',
            });

            const result = EntrySerializer.addEntryToContent(content, newEntry);
            const lines = result.split('\n');
            const entryLines = lines.filter(l => l.startsWith('- '));

            expect(entryLines[0]).toContain('09:00');
            expect(entryLines[1]).toContain('11:00');
            expect(entryLines[2]).toContain('14:00');
        });

        it('should create new date section if date does not exist', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Existing [client:: test-client]
`;
            const newEntry = createEntry({
                date: '2025-01-16',
                startDateTime: new Date(2025, 0, 16, 9, 0),
                endDateTime: new Date(2025, 0, 16, 10, 0),
                description: 'New day entry',
            });

            const result = EntrySerializer.addEntryToContent(content, newEntry);

            expect(result).toContain('## 2025-01-15');
            expect(result).toContain('## 2025-01-16');
            expect(result).toContain('New day entry');
        });
    });

    describe('updateEntryInContent', () => {
        it('should update entry at correct line', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Original [client:: test-client]
- [start:: 2025-01-15 11:00] [end:: 2025-01-15 12:00] Keep this [client:: test-client]
`;
            const oldEntry = createEntry({ lineNumber: 3 });
            const newEntry = createEntry({ description: 'Updated' });

            const result = EntrySerializer.updateEntryInContent(content, oldEntry, newEntry);

            expect(result).toContain('Updated');
            expect(result).not.toContain('Original');
            expect(result).toContain('Keep this');
        });
    });

    describe('deleteEntryFromContent', () => {
        it('should delete entry at correct line', () => {
            const content = `## 2025-01-15

- [start:: 2025-01-15 09:00] [end:: 2025-01-15 10:00] Delete me [client:: test-client]
- [start:: 2025-01-15 11:00] [end:: 2025-01-15 12:00] Keep me [client:: test-client]
`;
            const entry = createEntry({ lineNumber: 3 });

            const result = EntrySerializer.deleteEntryFromContent(content, entry);

            expect(result).not.toContain('Delete me');
            expect(result).toContain('Keep me');
        });
    });

    describe('round-trip parsing', () => {
        it('should serialize and parse back to same data', () => {
            const original = createEntry({
                project: 'TestProject',
                activity: 'feat',
                linkedNote: 'Notes/test',
            });

            const serialized = EntrySerializer.serializeEntry(original);
            // Remove the leading "- "
            const lineContent = serialized.substring(2);

            // Import EntryParser for round-trip test
            const { EntryParser } = require('../src/data/EntryParser');
            const parsed = EntryParser.parseEntryLine(lineContent, original.date, 1);

            expect(parsed).not.toBeNull();
            expect(parsed!.date).toBe(original.date);
            expect(parsed!.start).toBe(original.start);
            expect(parsed!.end).toBe(original.end);
            expect(parsed!.description).toBe(original.description);
            expect(parsed!.client).toBe(original.client);
            expect(parsed!.project).toBe(original.project);
            expect(parsed!.activity).toBe(original.activity);
            expect(parsed!.linkedNote).toBe(original.linkedNote);
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

            const serialized = EntrySerializer.serializeEntry(original);
            const lineContent = serialized.substring(2);

            const { EntryParser } = require('../src/data/EntryParser');
            const parsed = EntryParser.parseEntryLine(lineContent, original.date, 1);

            expect(parsed).not.toBeNull();
            expect(parsed!.client).toBe(original.client);
            expect(parsed!.durationMinutes).toBe(180);
            expect(parsed!.startDateTime.getDate()).toBe(15);
            expect(parsed!.endDateTime.getDate()).toBe(16);
        });
    });
});
