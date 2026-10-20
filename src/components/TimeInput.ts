import { TimePickerPopup } from './TimePickerPopup';

/** A locale-independent time control. Values crossing its boundary are always HH:mm. */
export class TimeInput {
    private static nextId = 0;
    readonly inputEl: HTMLDivElement;
    private readonly hours: HTMLInputElement;
    private readonly minutes: HTMLInputElement;
    private readonly period: HTMLSelectElement | null;
    private readonly pickerButton: HTMLButtonElement;
    private popup: TimePickerPopup | null = null;

    constructor(
        container: HTMLElement,
        private readonly use24HourFormat: boolean,
        private readonly label: string,
        value: string,
        private readonly onChange: (value: string) => void,
    ) {
        this.inputEl = container.createDiv('time-picker');
        this.inputEl.setAttribute('role', 'group');
        this.inputEl.setAttribute('aria-label', `${label} time`);

        this.hours = this.createSegment(`${label} hours`, use24HourFormat ? 0 : 1, use24HourFormat ? 23 : 12);
        const separator = this.inputEl.createSpan();
        separator.textContent = ':';
        separator.setAttribute('aria-hidden', 'true');
        this.minutes = this.createSegment(`${label} minutes`, 0, 59);

        this.period = null;
        if (!use24HourFormat) {
            this.period = this.inputEl.createEl('select');
            this.period.setAttribute('aria-label', `${label} AM or PM`);
            for (const period of ['AM', 'PM']) {
                const option = this.period.createEl('option');
                option.value = period;
                option.textContent = period;
            }
            this.period.addEventListener('change', () => this.notifyChange());
        }

        this.pickerButton = this.inputEl.createEl('button');
        this.pickerButton.type = 'button';
        this.pickerButton.className = 'time-picker-toggle';
        this.pickerButton.setAttribute('aria-label', `Choose ${label.toLowerCase()} time`);
        this.pickerButton.setAttribute('aria-haspopup', 'dialog');
        this.pickerButton.setAttribute('aria-expanded', 'false');
        this.pickerButton.setAttribute('aria-controls', `time-picker-popup-${TimeInput.nextId++}`);
        this.pickerButton.title = 'Choose time';
        const icon = this.pickerButton.createSvg('svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        const face = icon.createSvg('circle');
        face.setAttribute('cx', '12');
        face.setAttribute('cy', '12');
        face.setAttribute('r', '9');
        const hands = icon.createSvg('path');
        hands.setAttribute('d', 'M12 6v6l4 2');
        this.pickerButton.addEventListener('click', () => {
            if (this.popup) this.popup.close();
            else this.openPicker();
        });
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.altKey && event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                this.openPicker();
            }
        }, true);

        this.hours.addEventListener('keydown', (event) => {
            if (event.key === ':') {
                event.preventDefault();
                this.minutes.focus();
            }
        });
        this.setValue(value);
    }

    /** Empty means incomplete or invalid, so callers cannot save an old value by mistake. */
    getValue(): string {
        const hours = this.readSegment(this.hours);
        const minutes = this.readSegment(this.minutes);
        if (hours === null || minutes === null) return '';
        const hour24 = this.use24HourFormat ? hours : hours % 12 + (this.period?.value === 'PM' ? 12 : 0);
        return `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /** Programmatic updates (duration edits and magnets) do not emit another change. */
    setValue(value: string): void {
        const match = /^(\d{2}):(\d{2})$/.exec(value);
        const hours = match ? Number(match[1]) : NaN;
        const minutes = match ? Number(match[2]) : NaN;
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            this.hours.value = String(this.use24HourFormat ? hours : hours % 12 || 12).padStart(2, '0');
            this.minutes.value = String(minutes).padStart(2, '0');
            if (this.period) this.period.value = hours >= 12 ? 'PM' : 'AM';
        } else {
            this.hours.value = '';
            this.minutes.value = '';
        }
        this.updateValidity();
        this.popup?.sync();
    }

    destroy(): void {
        this.popup?.close();
    }

    private openPicker(): void {
        if (this.popup) return;
        const segmentColumn = (label: string, input: HTMLInputElement, min: number, max: number) => ({
            label,
            values: Array.from({ length: max - min + 1 }, (_, i) => String(min + i).padStart(2, '0')),
            getValue: () => {
                const value = this.readSegment(input);
                return value === null ? '' : String(value).padStart(2, '0');
            },
            setValue: (value: string) => { input.value = value; this.notifyChange(); },
        });
        const columns = [
            segmentColumn('Hours', this.hours, this.use24HourFormat ? 0 : 1, this.use24HourFormat ? 23 : 12),
            segmentColumn('Minutes', this.minutes, 0, 59),
        ];
        if (this.period) {
            const period = this.period;
            columns.push({
                label: 'AM/PM', values: ['AM', 'PM'],
                getValue: () => period.value,
                setValue: (value: string) => { period.value = value; this.notifyChange(); },
            });
        }
        this.pickerButton.setAttribute('aria-expanded', 'true');
        this.popup = new TimePickerPopup(this.pickerButton, columns, this.label, () => {
            this.popup = null;
            this.pickerButton.setAttribute('aria-expanded', 'false');
        });
    }

    private createSegment(label: string, min: number, max: number): HTMLInputElement {
        const input = this.inputEl.createEl('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.placeholder = '--';
        input.maxLength = 2;
        input.setAttribute('role', 'spinbutton');
        input.setAttribute('aria-label', label);
        input.setAttribute('aria-valuemin', String(min));
        input.setAttribute('aria-valuemax', String(max));
        input.title = `${label} (${min}–${max}). Use up/down arrows to adjust.`;
        input.addEventListener('focus', () => input.select());
        input.addEventListener('input', () => this.notifyChange());
        input.addEventListener('blur', () => {
            const value = this.readSegment(input);
            if (value !== null) input.value = String(value).padStart(2, '0');
        });
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const current = this.readSegment(input);
            const next = current === null ? (event.key === 'ArrowUp' ? min : max)
                : min + (current - min + (event.key === 'ArrowUp' ? 1 : -1) + max - min + 1) % (max - min + 1);
            input.value = String(next).padStart(2, '0');
            input.select();
            this.notifyChange();
        });
        return input;
    }

    private readSegment(input: HTMLInputElement): number | null {
        if (!/^\d{1,2}$/.test(input.value)) return null;
        const value = Number(input.value);
        return value >= Number(input.getAttribute('aria-valuemin')) && value <= Number(input.getAttribute('aria-valuemax'))
            ? value : null;
    }

    private updateValidity(): void {
        for (const input of [this.hours, this.minutes]) {
            const value = this.readSegment(input);
            input.setAttribute('aria-invalid', String(value === null));
            if (value === null) input.removeAttribute('aria-valuenow');
            else input.setAttribute('aria-valuenow', String(value));
        }
    }

    private notifyChange(): void {
        this.updateValidity();
        this.popup?.sync();
        this.onChange(this.getValue());
    }
}
