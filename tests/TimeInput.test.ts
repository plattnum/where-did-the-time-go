/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { TimeInput } from '../src/components/TimeInput';
import { installObsidianDomHelpers } from './__mocks__/obsidianDom';

beforeAll(() => installObsidianDomHelpers(Node.prototype));

const controls: TimeInput[] = [];
afterEach(() => {
    for (const control of controls) control.destroy();
    controls.length = 0;
});

function setup(use24HourFormat = true, value = '19:15') {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const onChange = jest.fn();
    const control = new TimeInput(container, use24HourFormat, 'Start', value, onChange);
    controls.push(control);
    const [hours, minutes] = Array.from(container.querySelectorAll('input'));
    return { container, control, hours, minutes, onChange };
}

function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(input: HTMLElement, value: string) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
}

describe('TimeInput', () => {
    function openPicker(container: HTMLElement) {
        const toggle = container.querySelector<HTMLButtonElement>('.time-picker-toggle')!;
        toggle.click();
        const popup = container.querySelector<HTMLElement>('[role="dialog"]')!;
        const lists = Array.from(popup.querySelectorAll<HTMLElement>('[role="listbox"]'));
        const choose = (column: number, value: string) => {
            lists[column].querySelector<HTMLButtonElement>(`[data-value="${value}"]`)!.click();
        };
        return { toggle, popup, lists, choose };
    }

    it('opens a 24-hour popup with all hours and minutes and the current time selected', () => {
        const { container } = setup();
        const { toggle, popup, lists } = openPicker(container);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(popup.id).toBe(toggle.getAttribute('aria-controls'));
        expect(lists).toHaveLength(2);
        expect(lists[0].children).toHaveLength(24);
        expect(lists[1].children).toHaveLength(60);
        expect(document.activeElement?.textContent).toBe('19');
        expect(lists[1].querySelector('[aria-selected="true"]')?.textContent).toBe('15');
    });

    it('updates the entry immediately when hours and minutes are clicked', () => {
        const { container, control, hours, minutes, onChange } = setup();
        const { choose } = openPicker(container);
        choose(0, '20');
        choose(1, '46');
        expect(control.getValue()).toBe('20:46');
        expect(hours.value).toBe('20');
        expect(minutes.value).toBe('46');
        expect(onChange).toHaveBeenLastCalledWith('20:46');
    });

    it('offers 12 hours and AM/PM in 12-hour mode, including noon and midnight', () => {
        const { container, control } = setup(false);
        const { choose, lists } = openPicker(container);
        expect(lists).toHaveLength(3);
        expect(lists[0].children).toHaveLength(12);
        choose(0, '12');
        choose(1, '00');
        choose(2, 'AM');
        expect(control.getValue()).toBe('00:00');
        choose(2, 'PM');
        expect(control.getValue()).toBe('12:00');
    });

    it('keeps popup selections in sync with duration and magnet changes', () => {
        const { container, control } = setup(false);
        const { lists } = openPicker(container);
        control.setValue('00:05');
        expect(lists.map(list => list.querySelector('[aria-selected="true"]')?.textContent)).toEqual(['12', '05', 'AM']);
    });

    it('can fill an incomplete time without silently supplying missing segments', () => {
        const { container, control, hours, minutes, onChange } = setup();
        type(hours, '');
        type(minutes, '');
        const { choose, lists } = openPicker(container);
        expect(lists[0].querySelector('[aria-selected="true"]')).toBeNull();
        choose(0, '20');
        expect(onChange).toHaveBeenLastCalledWith('');
        choose(1, '30');
        expect(control.getValue()).toBe('20:30');
    });

    it('supports keyboard selection, moving between columns, and Enter to finish', () => {
        const { container, control } = setup();
        const { toggle } = openPicker(container);
        key(document.activeElement as HTMLElement, 'ArrowDown');
        expect(control.getValue()).toBe('20:15');
        key(document.activeElement as HTMLElement, 'ArrowRight');
        expect(document.activeElement?.textContent).toBe('15');
        key(document.activeElement as HTMLElement, 'End');
        expect(control.getValue()).toBe('20:59');
        key(document.activeElement as HTMLElement, 'Home');
        expect(control.getValue()).toBe('20:00');
        key(document.activeElement as HTMLElement, 'Enter');
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(toggle);
    });

    it('closes on Escape without forwarding it to the entry modal', () => {
        const { container } = setup();
        const { toggle } = openPicker(container);
        const modalEscape = jest.fn();
        container.addEventListener('keydown', modalEscape);
        key(document.activeElement as HTMLElement, 'Escape');
        expect(modalEscape).not.toHaveBeenCalled();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(toggle);
    });

    it('closes with Done, outside clicks, or focus moving outside', () => {
        const { container } = setup();
        const { popup, toggle } = openPicker(container);
        popup.querySelector<HTMLButtonElement>('.time-picker-done')!.click();
        expect(document.activeElement).toBe(toggle);
        toggle.click();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        toggle.click();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(outside);
    });

    it('opens with Alt+Down without changing the typed time', () => {
        const { hours, control, container } = setup();
        hours.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
        expect(control.getValue()).toBe('19:15');
        expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('closes an existing picker when another is opened and cleans up when destroyed', () => {
        const { container, control } = setup();
        const second = new TimeInput(container, true, 'End', '20:46', () => {});
        controls.push(second);
        const toggles = container.querySelectorAll<HTMLButtonElement>('.time-picker-toggle');
        toggles[0].click();
        toggles[1].click();
        expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
        second.destroy();
        control.destroy();
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        document.dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(false);
    });

    it.each(['en-US', 'nl-NL', 'en-NL'])('uses the plugin setting under %s', (locale) => {
        document.documentElement.lang = locale;
        const { container, control, hours, minutes } = setup();
        expect(hours.type).toBe('text');
        expect(hours.value).toBe('19');
        expect(minutes.value).toBe('15');
        expect(container.querySelector('select')).toBeNull();
        expect(control.getValue()).toBe('19:15');
        const twelveHour = setup(false);
        expect(twelveHour.hours.value).toBe('07');
        expect(twelveHour.container.querySelector('select')?.value).toBe('PM');
        expect(twelveHour.control.getValue()).toBe('19:15');
    });

    it('leaves a typed 2 alone so the user can finish typing 20', () => {
        const { hours, control, onChange } = setup();
        type(hours, '2');
        expect(hours.value).toBe('2');
        type(hours, '20');
        expect(hours.value).toBe('20');
        expect(control.getValue()).toBe('20:15');
        expect(onChange).toHaveBeenLastCalledWith('20:15');
    });

    it('pads valid single digits only when leaving the segment', () => {
        const { hours, minutes, control } = setup();
        hours.focus();
        type(hours, '2');
        minutes.focus();
        expect(hours.value).toBe('02');
        type(minutes, '5');
        expect(minutes.value).toBe('5');
        minutes.blur();
        expect(minutes.value).toBe('05');
        expect(control.getValue()).toBe('02:05');
    });

    it.each(['', '24', '-1', 'a', '123', ' 2'])('rejects invalid 24-hour input %j without keeping the old time', (value) => {
        const { hours, control, onChange } = setup();
        type(hours, value);
        expect(control.getValue()).toBe('');
        expect(hours.getAttribute('aria-invalid')).toBe('true');
        expect(hours.hasAttribute('aria-valuenow')).toBe(false);
        expect(onChange).toHaveBeenLastCalledWith('');
        type(hours, '21');
        expect(hours.getAttribute('aria-invalid')).toBe('false');
        expect(control.getValue()).toBe('21:15');
    });

    it('rejects minutes over 59 and hours outside 1–12 in 12-hour mode', () => {
        const { hours, minutes, control } = setup(false);
        type(minutes, '60');
        expect(control.getValue()).toBe('');
        type(minutes, '59');
        for (const value of ['00', '13', '23']) {
            type(hours, value);
            expect(control.getValue()).toBe('');
        }
    });

    it.each([
        ['00:00', '12', '00', 'AM'],
        ['12:00', '12', '00', 'PM'],
        ['23:59', '11', '59', 'PM'],
        ['01:05', '01', '05', 'AM'],
    ])('round-trips %s in 12-hour mode', (value, hour, minute, period) => {
        const { container, control, hours, minutes } = setup(false, value);
        expect(hours.value).toBe(hour);
        expect(minutes.value).toBe(minute);
        expect(container.querySelector('select')?.value).toBe(period);
        expect(control.getValue()).toBe(value);
    });

    it('converts noon and midnight when AM/PM changes', () => {
        const { container, control, onChange } = setup(false, '00:30');
        const period = container.querySelector('select')!;
        period.value = 'PM';
        period.dispatchEvent(new Event('change'));
        expect(control.getValue()).toBe('12:30');
        expect(onChange).toHaveBeenLastCalledWith('12:30');
        period.value = 'AM';
        period.dispatchEvent(new Event('change'));
        expect(control.getValue()).toBe('00:30');
    });

    it('supports arrow adjustment with independent segment wrapping', () => {
        const { hours, minutes, control } = setup(true, '23:59');
        key(hours, 'ArrowUp');
        expect(control.getValue()).toBe('00:59');
        key(hours, 'ArrowDown');
        key(minutes, 'ArrowUp');
        expect(control.getValue()).toBe('23:00');
        key(minutes, 'ArrowDown');
        expect(control.getValue()).toBe('23:59');
        expect(minutes.getAttribute('aria-valuenow')).toBe('59');
    });

    it('wraps 12-hour hours between 1 and 12 without changing the period', () => {
        const { hours, control } = setup(false, '12:15');
        key(hours, 'ArrowUp');
        expect(control.getValue()).toBe('13:15');
        key(hours, 'ArrowDown');
        expect(control.getValue()).toBe('12:15');
    });

    it('moves to minutes with colon and selects the segment for replacement', () => {
        const { hours, minutes } = setup();
        hours.focus();
        key(hours, ':');
        expect(document.activeElement).toBe(minutes);
        expect(minutes.selectionStart).toBe(0);
        expect(minutes.selectionEnd).toBe(2);
    });

    it('updates the display and period after a duration or magnet update without firing onChange', () => {
        const { control, hours, minutes, container, onChange } = setup(false);
        type(hours, '');
        onChange.mockClear();
        control.setValue('00:05');
        expect(hours.value).toBe('12');
        expect(minutes.value).toBe('05');
        expect(container.querySelector('select')?.value).toBe('AM');
        expect(hours.getAttribute('aria-invalid')).toBe('false');
        expect(control.getValue()).toBe('00:05');
        expect(onChange).not.toHaveBeenCalled();
    });
});
