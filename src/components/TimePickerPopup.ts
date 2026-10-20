interface TimePickerColumn {
    label: string;
    values: string[];
    getValue: () => string;
    setValue: (value: string) => void;
}

/** Scrollable time choices shared by mouse, touch, and keyboard users. */
export class TimePickerPopup {
    private readonly element: HTMLDivElement;
    private readonly lists: HTMLDivElement[] = [];
    private readonly cleanup: (() => void)[] = [];

    constructor(
        private readonly anchor: HTMLButtonElement,
        private readonly columns: TimePickerColumn[],
        label: string,
        private readonly onClose: () => void,
    ) {
        const doc = anchor.ownerDocument;
        this.element = anchor.parentElement.createDiv('time-picker-popup');
        this.element.id = anchor.getAttribute('aria-controls')!;
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-label', `Choose ${label.toLowerCase()} time`);

        const choices = this.element.createDiv('time-picker-columns');
        columns.forEach((column, columnIndex) => {
            const section = choices.createDiv('time-picker-column');
            const heading = section.createDiv('time-picker-column-heading');
            heading.textContent = column.label;
            const list = section.createDiv('time-picker-options');
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', column.label);
            this.lists.push(list);
            column.values.forEach((value, index) => {
                const option = list.createEl('button');
                option.type = 'button';
                option.textContent = value;
                option.dataset.value = value;
                option.setAttribute('role', 'option');
                option.addEventListener('click', () => {
                    column.setValue(value);
                    this.sync();
                });
                option.addEventListener('keydown', (event) => {
                    let nextIndex: number;
                    switch (event.key) {
                        case 'ArrowUp': nextIndex = (index + column.values.length - 1) % column.values.length; break;
                        case 'ArrowDown': nextIndex = (index + 1) % column.values.length; break;
                        case 'Home': nextIndex = 0; break;
                        case 'End': nextIndex = column.values.length - 1; break;
                        case 'ArrowLeft':
                        case 'ArrowRight': {
                            event.preventDefault();
                            const nextColumn = (columnIndex + (event.key === 'ArrowRight' ? 1 : -1) + columns.length) % columns.length;
                            this.lists[nextColumn].querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
                            return;
                        }
                        case 'Enter':
                            event.preventDefault();
                            event.stopPropagation();
                            option.click();
                            this.close(true);
                            return;
                        default: return;
                    }
                    event.preventDefault();
                    const next = list.children[nextIndex] as HTMLButtonElement;
                    next.click();
                    next.focus();
                });
            });
        });
        const done = this.element.createEl('button');
        done.type = 'button';
        done.className = 'time-picker-done';
        done.textContent = 'Done';
        done.addEventListener('click', () => this.close(true));

        // Top-layer presentation avoids clipping by the entry modal's scroll container.
        if (typeof this.element.showPopover === 'function') {
            this.element.setAttribute('popover', 'manual');
            this.element.showPopover();
            const rect = anchor.getBoundingClientRect();
            const width = this.element.offsetWidth;
            const height = this.element.offsetHeight;
            const viewport = doc.documentElement;
            const left = Math.max(8, Math.min(rect.right - width, viewport.clientWidth - width - 8));
            const top = rect.bottom + height + 8 <= viewport.clientHeight
                ? rect.bottom + 4 : Math.max(8, rect.top - height - 4);
            this.element.style.setProperty('--time-picker-left', `${left}px`);
            this.element.style.setProperty('--time-picker-top', `${top}px`);
        } else {
            this.element.classList.add('time-picker-popup-fallback');
        }
        this.sync();
        this.lists[0].querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();

        const dismissOutside = (event: Event) => {
            if (!event.composedPath().includes(anchor.parentElement)) this.close();
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.close(true);
        };
        const dismissOnScroll = (event: Event) => {
            if (!event.composedPath().includes(this.element)) this.close();
        };
        const dismissOnResize = () => this.close();
        doc.addEventListener('pointerdown', dismissOutside, true);
        doc.addEventListener('focusin', dismissOutside);
        doc.addEventListener('keydown', escape, true);
        doc.addEventListener('scroll', dismissOnScroll, true);
        doc.defaultView?.addEventListener('resize', dismissOnResize);
        this.cleanup.push(() => {
            doc.removeEventListener('pointerdown', dismissOutside, true);
            doc.removeEventListener('focusin', dismissOutside);
            doc.removeEventListener('keydown', escape, true);
            doc.removeEventListener('scroll', dismissOnScroll, true);
            doc.defaultView?.removeEventListener('resize', dismissOnResize);
        });
    }

    sync(): void {
        this.columns.forEach((column, index) => {
            const list = this.lists[index];
            const value = column.getValue();
            const hasSelection = column.values.includes(value);
            Array.from(list.children).forEach((child, optionIndex) => {
                const option = child as HTMLButtonElement;
                const selected = option.dataset.value === value;
                option.setAttribute('aria-selected', String(selected));
                option.tabIndex = selected || (!hasSelection && optionIndex === 0) ? 0 : -1;
                if (selected) list.scrollTop = option.offsetTop - (list.clientHeight - option.offsetHeight) / 2;
            });
        });
    }

    close(returnFocus = false): void {
        for (const cleanup of this.cleanup) cleanup();
        this.cleanup.length = 0;
        this.element.remove();
        this.onClose();
        if (returnFocus && this.anchor.isConnected) this.anchor.focus();
    }
}
