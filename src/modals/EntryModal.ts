import { App, Modal, Setting, DropdownComponent, TextComponent, TextAreaComponent } from 'obsidian';
import { TimeEntry, TimeTrackerSettings } from '../types';
import { DataManager } from '../data/DataManager';
import { EntryParser } from '../data/EntryParser';

/**
 * Mode for the entry modal
 */
export type EntryModalMode = 'create' | 'edit';

/**
 * Data passed when opening the modal
 */
export interface EntryModalData {
    mode: EntryModalMode;
    /** For create mode: the date to create the entry on */
    date?: Date;
    /** For create mode: optional pre-filled start time */
    startTime?: string;
    /** For create mode: optional pre-filled end time (from drag selection) */
    endTime?: string;
    /** For edit mode: the existing entry to edit */
    entry?: TimeEntry;
}

/**
 * Modal for creating or editing time entries
 */
export class EntryModal extends Modal {
    private settings: TimeTrackerSettings;
    private dataManager: DataManager;
    private data: EntryModalData;
    private onSave: () => void;

    // Form values
    private startDateValue: string;
    private startTimeValue: string;
    private endDateValue: string;
    private endTimeValue: string;
    private durationValue: string; // e.g., "1h 30m" or "90m"
    private descriptionValue: string;
    private projectValue: string;
    private tagsValue: string;
    private linkedNoteValue: string;

    // Input references for updating
    private endDateInput: TextComponent | null = null;
    private endTimeInput: TextComponent | null = null;
    private durationInput: TextComponent | null = null;

    constructor(
        app: App,
        settings: TimeTrackerSettings,
        dataManager: DataManager,
        data: EntryModalData,
        onSave: () => void
    ) {
        super(app);
        this.settings = settings;
        this.dataManager = dataManager;
        this.data = data;
        this.onSave = onSave;

        // Initialize form values
        if (data.mode === 'edit' && data.entry) {
            // Use the computed DateTime objects for accuracy
            this.startDateValue = EntryParser.getDateString(data.entry.startDateTime);
            this.startTimeValue = data.entry.start;
            this.endDateValue = EntryParser.getDateString(data.entry.endDateTime);
            this.endTimeValue = data.entry.end;
            this.durationValue = this.formatDurationMinutes(data.entry.durationMinutes);
            this.descriptionValue = data.entry.description;
            this.projectValue = this.resolveProjectName(data.entry.project);
            this.tagsValue = data.entry.tags?.join(', ') || '';
            this.linkedNoteValue = data.entry.linkedNote || '';
        } else {
            // Create mode defaults
            const date = data.date || new Date();
            this.startDateValue = EntryParser.getDateString(date);
            this.startTimeValue = data.startTime || this.getCurrentTimeRounded();

            // Calculate end date/time
            if (data.endTime) {
                // From drag selection - check if end < start (spans midnight)
                const startMins = this.timeToMinutes(this.startTimeValue);
                const endMins = this.timeToMinutes(data.endTime);
                if (endMins < startMins) {
                    // Spans midnight - end date is next day
                    const nextDay = new Date(date);
                    nextDay.setDate(nextDay.getDate() + 1);
                    this.endDateValue = EntryParser.getDateString(nextDay);
                } else {
                    this.endDateValue = this.startDateValue;
                }
                this.endTimeValue = data.endTime;
            } else {
                // Default +1 hour
                this.endDateValue = this.startDateValue;
                this.endTimeValue = this.addHourToTime(this.startTimeValue);
            }

            this.durationValue = this.calculateDurationFromDates();
            this.descriptionValue = '';
            this.projectValue = this.resolveProjectName(this.settings.defaultProject);
            this.tagsValue = '';
            this.linkedNoteValue = '';
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('time-tracker-entry-modal');

        // Title
        const title = this.data.mode === 'edit' ? 'Edit Time Entry' : 'New Time Entry';
        contentEl.createEl('h2', { text: title });

        // Start row: Date and Time
        const startRow = contentEl.createDiv('time-row');

        new Setting(startRow)
            .setName('Start Date')
            .addText((text) => {
                text.setValue(this.startDateValue);
                text.inputEl.type = 'date';
                text.onChange((value) => {
                    this.startDateValue = value;
                    this.recalculateDuration();
                });
            });

        new Setting(startRow)
            .setName('Start Time')
            .addText((text) => {
                text.setValue(this.startTimeValue);
                text.inputEl.type = 'time';
                text.onChange((value) => {
                    this.startTimeValue = value;
                    this.recalculateDuration();
                });
            });

        // End row: Date and Time
        const endRow = contentEl.createDiv('time-row');

        new Setting(endRow)
            .setName('End Date')
            .addText((text) => {
                this.endDateInput = text;
                text.setValue(this.endDateValue);
                text.inputEl.type = 'date';
                text.onChange((value) => {
                    this.endDateValue = value;
                    this.recalculateDuration();
                });
            });

        new Setting(endRow)
            .setName('End Time')
            .addText((text) => {
                this.endTimeInput = text;
                text.setValue(this.endTimeValue);
                text.inputEl.type = 'time';
                text.onChange((value) => {
                    this.endTimeValue = value;
                    this.recalculateDuration();
                });
            });

        // Duration (calculated, also editable)
        new Setting(contentEl)
            .setName('Duration')
            .setDesc('e.g., 1h 30m, 90m, 1.5h - editing this updates end date/time')
            .addText((text) => {
                this.durationInput = text;
                text.setValue(this.durationValue);
                text.setPlaceholder('1h 30m');
                text.inputEl.addClass('duration-input');
                text.onChange((value) => {
                    this.durationValue = value;
                    this.updateEndFromDuration();
                });
            });

        // Project dropdown (before description)
        new Setting(contentEl)
            .setName('Project')
            .addDropdown((dropdown) => {
                // Add empty option
                dropdown.addOption('', '(No project)');

                // Add active projects - use NAME as both value and display
                // This preserves case in the markdown file
                for (const project of this.settings.projects) {
                    if (!project.archived) {
                        dropdown.addOption(project.name, project.name);
                    }
                }

                dropdown.setValue(this.projectValue);
                dropdown.onChange((value) => {
                    this.projectValue = value;
                });
            });

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('What did you work on?')
            .addTextArea((text) => {
                text.setValue(this.descriptionValue);
                text.setPlaceholder('Enter description...');
                text.inputEl.rows = 3;
                text.onChange((value) => {
                    this.descriptionValue = value;
                });
            });

        // Tags
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma-separated tags')
            .addText((text) => {
                text.setValue(this.tagsValue);
                text.setPlaceholder('meeting, planning, dev');
                text.onChange((value) => {
                    this.tagsValue = value;
                });
            });

        // Linked note
        new Setting(contentEl)
            .setName('Linked Note')
            .setDesc('Path to linked note (without [[]])')
            .addText((text) => {
                text.setValue(this.linkedNoteValue);
                text.setPlaceholder('path/to/note');
                text.onChange((value) => {
                    this.linkedNoteValue = value;
                });
            });

        // Button row
        const buttonRow = contentEl.createDiv('modal-button-row');

        // Delete button (only for edit mode)
        if (this.data.mode === 'edit') {
            const deleteBtn = buttonRow.createEl('button', {
                text: 'Delete',
                cls: 'mod-warning',
            });
            deleteBtn.addEventListener('click', () => this.handleDelete());
        }

        // Spacer
        buttonRow.createDiv('button-spacer');

        // Cancel button
        const cancelBtn = buttonRow.createEl('button', {
            text: 'Cancel',
        });
        cancelBtn.addEventListener('click', () => this.close());

        // Save button
        const saveBtn = buttonRow.createEl('button', {
            text: 'Save',
            cls: 'mod-cta',
        });
        saveBtn.addEventListener('click', () => this.handleSave());
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * Handle save button click
     */
    private async handleSave(): Promise<void> {
        // Validate required fields
        if (!this.startDateValue || !this.startTimeValue || !this.endDateValue || !this.endTimeValue) {
            console.error('EntryModal: Missing required fields');
            return;
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.startDateValue) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(this.endDateValue)) {
            console.error('EntryModal: Invalid date format');
            return;
        }

        // Parse tags
        const tags = this.tagsValue
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);

        // Format start and end with explicit date+time: "YYYY-MM-DD HH:mm"
        const startForStorage = `${this.startDateValue} ${this.startTimeValue}`;
        const endForStorage = `${this.endDateValue} ${this.endTimeValue}`;

        console.log('Saving entry:', {
            date: this.startDateValue,
            start: startForStorage,
            end: endForStorage
        });

        try {
            if (this.data.mode === 'edit' && this.data.entry) {
                // Update existing entry
                await this.dataManager.updateEntry(this.data.entry, {
                    date: this.startDateValue,
                    start: startForStorage,
                    end: endForStorage,
                    description: this.descriptionValue,
                    project: this.projectValue || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                    linkedNote: this.linkedNoteValue || undefined,
                });
            } else {
                // Create new entry
                await this.dataManager.createEntry({
                    date: this.startDateValue,
                    start: startForStorage,
                    end: endForStorage,
                    description: this.descriptionValue,
                    project: this.projectValue || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                    linkedNote: this.linkedNoteValue || undefined,
                });
            }

            this.onSave();
            this.close();
        } catch (error) {
            console.error('EntryModal: Error saving entry:', error);
            // The DataManager will show a Notice for overlap errors
        }
    }

    /**
     * Handle delete button click
     */
    private async handleDelete(): Promise<void> {
        if (this.data.mode !== 'edit' || !this.data.entry) {
            return;
        }

        // Confirm delete
        const confirmed = confirm('Are you sure you want to delete this entry?');
        if (!confirmed) {
            return;
        }

        try {
            await this.dataManager.deleteEntry(this.data.entry);
            this.onSave();
            this.close();
        } catch (error) {
            console.error('EntryModal: Error deleting entry:', error);
        }
    }

    /**
     * Get current time rounded to nearest 15 minutes
     */
    private getCurrentTimeRounded(): string {
        const now = new Date();
        const minutes = Math.round(now.getMinutes() / 15) * 15;
        const hours = now.getHours() + (minutes >= 60 ? 1 : 0);
        const adjustedMinutes = minutes % 60;

        return `${hours.toString().padStart(2, '0')}:${adjustedMinutes.toString().padStart(2, '0')}`;
    }

    /**
     * Add one hour to a time string
     */
    private addHourToTime(time: string): string {
        const [hours, minutes] = time.split(':').map(Number);
        const newHours = (hours + 1) % 24;
        return `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Resolve a project ID or name to the actual project name
     * Handles both old lowercase ID format and new name format
     */
    private resolveProjectName(projectIdOrName?: string): string {
        if (!projectIdOrName) return '';

        // First try exact match by name
        const byName = this.settings.projects.find(p => p.name === projectIdOrName);
        if (byName) return byName.name;

        // Then try match by ID (for old entries with lowercased IDs)
        const byId = this.settings.projects.find(p => p.id === projectIdOrName);
        if (byId) return byId.name;

        // Return as-is if no match found
        return projectIdOrName;
    }

    /**
     * Convert HH:mm time string to minutes since midnight
     */
    private timeToMinutes(time: string): number {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }

    /**
     * Format duration in minutes to "Xh Ym" string
     */
    private formatDurationMinutes(minutes: number): string {
        if (minutes < 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    /**
     * Calculate duration from current start/end date+time values
     */
    private calculateDurationFromDates(): string {
        const start = new Date(`${this.startDateValue}T${this.startTimeValue}`);
        const end = new Date(`${this.endDateValue}T${this.endTimeValue}`);
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.round(diffMs / 60000);
        return this.formatDurationMinutes(diffMins);
    }

    /**
     * Recalculate and update duration display when dates/times change
     */
    private recalculateDuration(): void {
        this.durationValue = this.calculateDurationFromDates();
        if (this.durationInput) {
            this.durationInput.setValue(this.durationValue);
        }
    }

    /**
     * Update end date/time based on start + duration
     */
    private updateEndFromDuration(): void {
        const durationMins = this.parseDurationToMinutes(this.durationValue);
        if (durationMins <= 0) return;

        const start = new Date(`${this.startDateValue}T${this.startTimeValue}`);
        const end = new Date(start.getTime() + durationMins * 60000);

        this.endDateValue = EntryParser.getDateString(end);
        this.endTimeValue = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;

        if (this.endDateInput) {
            this.endDateInput.setValue(this.endDateValue);
        }
        if (this.endTimeInput) {
            this.endTimeInput.setValue(this.endTimeValue);
        }
    }

    /**
     * Parse duration string to minutes
     * Accepts: "1h 30m", "1h30m", "90m", "1.5h", "1h", "30m"
     */
    private parseDurationToMinutes(duration: string): number {
        const cleaned = duration.toLowerCase().trim();

        // Try "Xh Ym" or "XhYm" format
        const hhmm = cleaned.match(/(\d+)\s*h\s*(\d+)\s*m/);
        if (hhmm) {
            return parseInt(hhmm[1]) * 60 + parseInt(hhmm[2]);
        }

        // Try "Xh" format
        const hOnly = cleaned.match(/^(\d+(?:\.\d+)?)\s*h$/);
        if (hOnly) {
            return Math.round(parseFloat(hOnly[1]) * 60);
        }

        // Try "Xm" format
        const mOnly = cleaned.match(/^(\d+)\s*m$/);
        if (mOnly) {
            return parseInt(mOnly[1]);
        }

        // Try plain number (assume minutes)
        const plain = cleaned.match(/^(\d+)$/);
        if (plain) {
            return parseInt(plain[1]);
        }

        return 0;
    }
}
