import { TimeEntry } from '../src/types';

// We need to test getEffectiveDuration, but it's a method on DataManager
// which requires Vault. Let's extract the logic to a pure function for testing.

/**
 * Calculate effective duration of an entry within a date range
 * This is the same logic as DataManager.getEffectiveDuration
 */
function getEffectiveDuration(
    entry: { startDateTime: Date; endDateTime: Date },
    rangeStart: Date,
    rangeEnd: Date
): number {
    // Clamp entry times to the range
    const effectiveStart = entry.startDateTime < rangeStart ? rangeStart : entry.startDateTime;
    const effectiveEnd = entry.endDateTime > rangeEnd ? rangeEnd : entry.endDateTime;

    // Calculate duration in minutes
    const durationMs = effectiveEnd.getTime() - effectiveStart.getTime();
    return Math.max(0, Math.round(durationMs / 60000));
}

describe('getEffectiveDuration', () => {
    describe('same-day entries', () => {
        it('should return full duration when entry is within range', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 9, 0),  // 9:00
                endDateTime: new Date(2025, 0, 15, 10, 0),   // 10:00
            };
            const rangeStart = new Date(2025, 0, 15, 0, 0);   // Start of day
            const rangeEnd = new Date(2025, 0, 15, 23, 59, 59, 999);  // End of day

            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(60);
        });

        it('should return 0 when entry is completely outside range', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 9, 0),
                endDateTime: new Date(2025, 0, 15, 10, 0),
            };
            const rangeStart = new Date(2025, 0, 16, 0, 0);  // Next day
            const rangeEnd = new Date(2025, 0, 16, 23, 59, 59, 999);

            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(0);
        });
    });

    describe('midnight-spanning entries', () => {
        // Entry: Jan 15 22:00 → Jan 16 02:00 (4 hours total)
        const midnightEntry = {
            startDateTime: new Date(2025, 0, 15, 22, 0),
            endDateTime: new Date(2025, 0, 16, 2, 0),
        };

        it('should return hours on first day only when querying first day', () => {
            const rangeStart = new Date(2025, 0, 15, 0, 0);
            const rangeEnd = new Date(2025, 0, 15, 23, 59, 59, 999);

            // Should get 2 hours (22:00 → 23:59:59)
            expect(getEffectiveDuration(midnightEntry, rangeStart, rangeEnd)).toBe(120);
        });

        it('should return hours on second day only when querying second day', () => {
            const rangeStart = new Date(2025, 0, 16, 0, 0);
            const rangeEnd = new Date(2025, 0, 16, 23, 59, 59, 999);

            // Should get 2 hours (00:00 → 02:00)
            expect(getEffectiveDuration(midnightEntry, rangeStart, rangeEnd)).toBe(120);
        });

        it('should return full duration when querying both days', () => {
            const rangeStart = new Date(2025, 0, 15, 0, 0);
            const rangeEnd = new Date(2025, 0, 16, 23, 59, 59, 999);

            // Should get full 4 hours
            expect(getEffectiveDuration(midnightEntry, rangeStart, rangeEnd)).toBe(240);
        });
    });

    describe('entry: Jan 15 23:00 → Jan 16 03:00 (4 hours)', () => {
        const entry = {
            startDateTime: new Date(2025, 0, 15, 23, 0),
            endDateTime: new Date(2025, 0, 16, 3, 0),
        };

        it('should return 1 hour for Jan 15 only', () => {
            const rangeStart = new Date(2025, 0, 15, 0, 0);
            const rangeEnd = new Date(2025, 0, 15, 23, 59, 59, 999);

            // 23:00 → 23:59:59 = ~1 hour
            const result = getEffectiveDuration(entry, rangeStart, rangeEnd);
            expect(result).toBeGreaterThanOrEqual(59);
            expect(result).toBeLessThanOrEqual(60);
        });

        it('should return 3 hours for Jan 16 only', () => {
            const rangeStart = new Date(2025, 0, 16, 0, 0);
            const rangeEnd = new Date(2025, 0, 16, 23, 59, 59, 999);

            // 00:00 → 03:00 = 3 hours
            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(180);
        });
    });

    describe('edge cases', () => {
        it('should handle entry that starts before range', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 6, 0),  // 6:00
                endDateTime: new Date(2025, 0, 15, 10, 0),   // 10:00
            };
            // Range starts at 8:00
            const rangeStart = new Date(2025, 0, 15, 8, 0);
            const rangeEnd = new Date(2025, 0, 15, 23, 59, 59, 999);

            // Should get 2 hours (8:00 → 10:00)
            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(120);
        });

        it('should handle entry that ends after range', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 20, 0),  // 20:00
                endDateTime: new Date(2025, 0, 15, 23, 0),    // 23:00
            };
            // Range ends at 22:00
            const rangeStart = new Date(2025, 0, 15, 0, 0);
            const rangeEnd = new Date(2025, 0, 15, 22, 0);

            // Should get 2 hours (20:00 → 22:00)
            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(120);
        });

        it('should handle entry completely containing range', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 6, 0),   // 6:00
                endDateTime: new Date(2025, 0, 15, 18, 0),    // 18:00
            };
            // Range is 10:00 → 14:00
            const rangeStart = new Date(2025, 0, 15, 10, 0);
            const rangeEnd = new Date(2025, 0, 15, 14, 0);

            // Should get 4 hours (clamped to range)
            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(240);
        });

        it('should return 0 for entry ending exactly at range start', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 8, 0),
                endDateTime: new Date(2025, 0, 15, 10, 0),
            };
            const rangeStart = new Date(2025, 0, 15, 10, 0);
            const rangeEnd = new Date(2025, 0, 15, 18, 0);

            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(0);
        });

        it('should return 0 for entry starting exactly at range end', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 15, 18, 0),
                endDateTime: new Date(2025, 0, 15, 20, 0),
            };
            const rangeStart = new Date(2025, 0, 15, 10, 0);
            const rangeEnd = new Date(2025, 0, 15, 18, 0);

            expect(getEffectiveDuration(entry, rangeStart, rangeEnd)).toBe(0);
        });
    });

    describe('week and month boundaries', () => {
        // Entry spanning week boundary (Sunday night into Monday)
        it('should split correctly across week boundary', () => {
            // Jan 12, 2025 is a Sunday
            const entry = {
                startDateTime: new Date(2025, 0, 12, 22, 0),  // Sunday 22:00
                endDateTime: new Date(2025, 0, 13, 2, 0),     // Monday 02:00
            };

            // Query just Sunday
            const sundayStart = new Date(2025, 0, 12, 0, 0);
            const sundayEnd = new Date(2025, 0, 12, 23, 59, 59, 999);
            expect(getEffectiveDuration(entry, sundayStart, sundayEnd)).toBe(120); // 2 hours

            // Query just Monday
            const mondayStart = new Date(2025, 0, 13, 0, 0);
            const mondayEnd = new Date(2025, 0, 13, 23, 59, 59, 999);
            expect(getEffectiveDuration(entry, mondayStart, mondayEnd)).toBe(120); // 2 hours
        });

        // Entry spanning month boundary
        it('should split correctly across month boundary', () => {
            const entry = {
                startDateTime: new Date(2025, 0, 31, 22, 0),  // Jan 31 22:00
                endDateTime: new Date(2025, 1, 1, 2, 0),      // Feb 1 02:00
            };

            // Query just January
            const janStart = new Date(2025, 0, 31, 0, 0);
            const janEnd = new Date(2025, 0, 31, 23, 59, 59, 999);
            expect(getEffectiveDuration(entry, janStart, janEnd)).toBe(120); // 2 hours

            // Query just February
            const febStart = new Date(2025, 1, 1, 0, 0);
            const febEnd = new Date(2025, 1, 1, 23, 59, 59, 999);
            expect(getEffectiveDuration(entry, febStart, febEnd)).toBe(120); // 2 hours
        });
    });
});
