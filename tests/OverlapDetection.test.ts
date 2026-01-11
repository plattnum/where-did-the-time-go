/**
 * Tests for overlap detection logic
 * Pure function version of DataManager.findOverlaps for testing
 */

interface MockEntry {
    start: string;
    end: string;
    startDateTime: Date;
    endDateTime: Date;
}

/**
 * Find overlaps and classify them:
 * - startOverlap: Entry where our START falls inside
 * - endOverlap: Entry where our END falls inside
 * - encompassedEntry: Entry we fully encompass
 */
function findOverlaps(
    start: Date,
    end: Date,
    entries: MockEntry[]
): {
    startOverlap: MockEntry | null;
    endOverlap: MockEntry | null;
    encompassedEntry: MockEntry | null;
} {
    let startOverlap: MockEntry | null = null;
    let endOverlap: MockEntry | null = null;
    let encompassedEntry: MockEntry | null = null;

    for (const entry of entries) {
        // Check for any overlap first
        const overlaps = start < entry.endDateTime && end > entry.startDateTime;
        if (!overlaps) continue;

        // Classify the overlap type
        const startInside = start >= entry.startDateTime && start < entry.endDateTime;
        const endInside = end > entry.startDateTime && end <= entry.endDateTime;

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

// Helper to create mock entries
function createEntry(startStr: string, endStr: string): MockEntry {
    return {
        start: startStr,
        end: endStr,
        startDateTime: new Date(startStr.replace(' ', 'T')),
        endDateTime: new Date(endStr.replace(' ', 'T')),
    };
}

describe('findOverlaps', () => {
    describe('no overlap', () => {
        const entry = createEntry('2026-01-02 10:00', '2026-01-02 11:00');
        const entries = [entry];

        it('should return all null when completely before', () => {
            const start = new Date('2026-01-02T08:00');
            const end = new Date('2026-01-02T09:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBeNull();
            expect(result.endOverlap).toBeNull();
            expect(result.encompassedEntry).toBeNull();
        });

        it('should return all null when completely after', () => {
            const start = new Date('2026-01-02T12:00');
            const end = new Date('2026-01-02T13:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBeNull();
            expect(result.endOverlap).toBeNull();
            expect(result.encompassedEntry).toBeNull();
        });

        it('should return all null when adjacent (end meets start)', () => {
            const start = new Date('2026-01-02T09:00');
            const end = new Date('2026-01-02T10:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBeNull();
            expect(result.endOverlap).toBeNull();
            expect(result.encompassedEntry).toBeNull();
        });
    });

    describe('start inside entry', () => {
        const entry = createEntry('2026-01-02 10:00', '2026-01-02 12:00');
        const entries = [entry];

        it('should detect start overlap when start is inside', () => {
            const start = new Date('2026-01-02T11:00');
            const end = new Date('2026-01-02T13:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBe(entry);
            expect(result.endOverlap).toBeNull();
            expect(result.encompassedEntry).toBeNull();
        });
    });

    describe('end inside entry', () => {
        const entry = createEntry('2026-01-02 10:00', '2026-01-02 12:00');
        const entries = [entry];

        it('should detect end overlap when end is inside', () => {
            const start = new Date('2026-01-02T09:00');
            const end = new Date('2026-01-02T11:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBeNull();
            expect(result.endOverlap).toBe(entry);
            expect(result.encompassedEntry).toBeNull();
        });
    });

    describe('both start and end inside same entry', () => {
        const entry = createEntry('2026-01-02 09:00', '2026-01-02 17:00');
        const entries = [entry];

        it('should detect both start and end overlap', () => {
            const start = new Date('2026-01-02T10:00');
            const end = new Date('2026-01-02T12:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBe(entry);
            expect(result.endOverlap).toBe(entry);
            expect(result.encompassedEntry).toBeNull();
        });
    });

    describe('encompassed entry', () => {
        const entry = createEntry('2026-01-02 10:00', '2026-01-02 11:00');
        const entries = [entry];

        it('should detect encompassed entry when we fully contain it', () => {
            const start = new Date('2026-01-02T09:00');
            const end = new Date('2026-01-02T12:00');
            const result = findOverlaps(start, end, entries);

            expect(result.startOverlap).toBeNull();
            expect(result.endOverlap).toBeNull();
            expect(result.encompassedEntry).toBe(entry);
        });
    });

    describe('user scenario: 17:30-20:30 vs 15:30-17:45 and 18:15-19:15', () => {
        const entries = [
            createEntry('2026-01-02 15:30', '2026-01-02 17:45'),
            createEntry('2026-01-02 18:15', '2026-01-02 19:15'),
        ];

        it('should detect start inside first entry, encompass second', () => {
            const start = new Date('2026-01-02T17:30');
            const end = new Date('2026-01-02T20:30');
            const result = findOverlaps(start, end, entries);

            // 17:30 is inside 15:30-17:45
            expect(result.startOverlap).toBe(entries[0]);
            // 20:30 is NOT inside 18:15-19:15
            expect(result.endOverlap).toBeNull();
            // 18:15-19:15 is encompassed by 17:30-20:30
            expect(result.encompassedEntry).toBe(entries[1]);
        });
    });

    describe('multiple entries', () => {
        const entries = [
            createEntry('2026-01-02 09:00', '2026-01-02 10:00'),
            createEntry('2026-01-02 11:00', '2026-01-02 12:00'),
            createEntry('2026-01-02 14:00', '2026-01-02 15:00'),
        ];

        it('should find first of each type', () => {
            // Start at 09:30, end at 14:30
            const start = new Date('2026-01-02T09:30');
            const end = new Date('2026-01-02T14:30');
            const result = findOverlaps(start, end, entries);

            // 09:30 is inside 09:00-10:00
            expect(result.startOverlap).toBe(entries[0]);
            // 14:30 is inside 14:00-15:00
            expect(result.endOverlap).toBe(entries[2]);
            // 11:00-12:00 is encompassed
            expect(result.encompassedEntry).toBe(entries[1]);
        });
    });

    describe('real data: 18:25-23:46 vs actual entries', () => {
        const entries = [
            createEntry('2026-01-02 15:30', '2026-01-02 17:45'),
            createEntry('2026-01-02 18:15', '2026-01-02 19:15'),
            createEntry('2026-01-02 20:58', '2026-01-02 21:25'),
            createEntry('2026-01-02 21:30', '2026-01-02 21:43'),
            createEntry('2026-01-02 21:45', '2026-01-02 22:15'),
        ];

        it('should correctly classify all overlaps', () => {
            const start = new Date('2026-01-02T18:25');
            const end = new Date('2026-01-02T23:46');
            const result = findOverlaps(start, end, entries);

            // 18:25 is inside 18:15-19:15
            expect(result.startOverlap).toBe(entries[1]);
            // 23:46 is NOT inside any entry
            expect(result.endOverlap).toBeNull();
            // First encompassed is 20:58-21:25
            expect(result.encompassedEntry).toBe(entries[2]);
        });
    });
});
