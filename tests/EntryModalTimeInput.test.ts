import { jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { App } from 'obsidian';
import { TimeInput } from '../src/components/TimeInput';
import { DataManager } from '../src/data/DataManager';
import { EntryModal } from '../src/modals/EntryModal';
import { DEFAULT_SETTINGS } from '../src/types';
import { installObsidianDomHelpers } from './__mocks__/obsidianDom';

function setup(use24HourFormat = true) {
    const dom = new JSDOM();
    installObsidianDomHelpers(dom.window.Node.prototype);
    const doc = dom.window.document;
    const createEntry = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const dataManager = {
        createEntry,
        findAdjacentEntries: async (): ReturnType<DataManager['findAdjacentEntries']> => ({ previous: null, next: null }),
    } as unknown as DataManager;
    const modal = new EntryModal({} as App, { ...DEFAULT_SETTINGS, use24HourFormat }, dataManager,
        { mode: 'create', date: new Date(2026, 6, 23), startTime: '19:15', endTime: '20:46' }, () => {});
    modal['clientValue'] = 'client';
    const start = new TimeInput(doc.body, use24HourFormat, 'Start', '19:15', (value) => {
        modal['startTimeValue'] = value;
        modal['recalculateDuration']();
    });
    const end = new TimeInput(doc.body, use24HourFormat, 'End', '20:46', (value) => {
        modal['endTimeValue'] = value;
        modal['recalculateDuration']();
    });
    modal['startTimeInput'] = start;
    modal['endTimeInput'] = end;
    const save = doc.createElement('button');
    save.toggleClass = (names, enabled) => {
        for (const name of typeof names === 'string' ? [names] : names) save.classList.toggle(name, enabled);
    };
    modal['saveButton'] = save;
    const type = (control: TimeInput, value: string) => {
        const hours = control.inputEl.querySelector('input')!;
        hours.value = value;
        hours.dispatchEvent(new dom.window.Event('input'));
    };
    return { modal, start, end, save, createEntry, type };
}

describe('EntryModal custom time integration', () => {
    it.each([true, false])('stores canonical times with 24-hour setting %s', async (use24HourFormat) => {
        const { modal, createEntry } = setup(use24HourFormat);
        await modal['handleSave']();
        expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({
            start: '2026-07-23 19:15', end: '2026-07-23 20:46',
        }));
    });

    it('disables saving during an incomplete edit and recovers when typing finishes', async () => {
        const { modal, start, save, createEntry, type } = setup();
        type(start, '');
        expect(save.disabled).toBe(true);
        expect(modal['durationValue']).toBe('');
        await modal['handleSave']();
        expect(createEntry).not.toHaveBeenCalled();
        type(start, '20');
        expect(save.disabled).toBe(false);
        expect(modal['durationValue']).toBe('31m');
        await modal['handleSave']();
        expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({ start: '2026-07-23 20:15' }));
    });

    it('repairs an incomplete end time via duration, including crossing midnight in 12-hour mode', () => {
        const { modal, end, save, type } = setup(false);
        type(end, '');
        expect(save.disabled).toBe(true);
        modal['durationValue'] = '300';
        modal['updateEndFromDuration']();
        expect(end.getValue()).toBe('00:15');
        expect(end.inputEl.querySelector('select')?.value).toBe('AM');
        expect(modal['endDateValue']).toBe('2026-07-24');
        expect(modal['durationValue']).toBe('300');
        expect(save.disabled).toBe(false);
    });
});
