import { App, Modal, Setting, DropdownComponent, TextComponent, TextAreaComponent, Notice, FuzzySuggestModal, TFile, setIcon } from 'obsidian';
import { TimeEntry, TimeTrackerSettings } from '../types';
import { DataManager } from '../data/DataManager';
import { TableParser } from '../data/TableParser';
import { Logger } from '../utils/Logger';

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
    private clientValue: string;
    private projectValue: string;
    private activityValue: string;
    private linkedNoteValue: string;

    // Dropdown references for cascading updates
    private projectDropdown: DropdownComponent | null = null;
    private activityDropdown: DropdownComponent | null = null;

    // Cleanup handlers
    private cleanupHandlers: (() => void)[] = [];

    // Input references for updating
    private endDateInput: TextComponent | null = null;
    private endTimeInput: TextComponent | null = null;
    private durationInput: TextComponent | null = null;
    private startDateInput: TextComponent | null = null;
    private startTimeInput: TextComponent | null = null;

    // Overlap validation UI
    private saveButton: HTMLButtonElement | null = null;
    private warningBanner: HTMLElement | null = null;
    private startOverlap: TimeEntry | null = null;
    private endOverlap: TimeEntry | null = null;
    private encompassedEntry: TimeEntry | null = null;

    // Snap hints for adjacent entries
    private previousEntry: TimeEntry | null = null;
    private nextEntry: TimeEntry | null = null;
    private startSnapHint: HTMLElement | null = null;
    private endSnapHint: HTMLElement | null = null;

    // Validation request counter to prevent race conditions
    private validationRequestId: number = 0;

    // Duration validation state
    private hasInvalidDuration: boolean = false;

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
            this.startDateValue = TableParser.getDateString(data.entry.startDateTime);
            this.startTimeValue = data.entry.start;
            this.endDateValue = TableParser.getDateString(data.entry.endDateTime);
            this.endTimeValue = data.entry.end;
            this.durationValue = this.formatDurationMinutes(data.entry.durationMinutes);
            this.descriptionValue = data.entry.description;
            this.clientValue = data.entry.client;
            this.projectValue = this.resolveProjectName(data.entry.project);
            this.activityValue = this.resolveActivityName(data.entry.activity);
            this.linkedNoteValue = data.entry.linkedNote || '';
        } else {
            // Create mode defaults
            const date = data.date || new Date();
            this.startDateValue = TableParser.getDateString(date);
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
                    this.endDateValue = TableParser.getDateString(nextDay);
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
            // Default to first active client
            const activeClients = this.settings.clients.filter(c => !c.archived);
            this.clientValue = activeClients.length > 0 ? activeClients[0].id : '';
            this.projectValue = this.resolveProjectName(this.settings.defaultProject);
            this.activityValue = this.resolveActivityName(this.settings.defaultActivity);
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

        // Start row: Date and Time with magnet button
        const startRow = contentEl.createDiv('time-row');

        const startSetting = new Setting(startRow)
            .setName('Start')
            .addText((text) => {
                this.startDateInput = text;
                text.setValue(this.startDateValue);
                text.inputEl.type = 'date';
                text.onChange((value) => {
                    this.startDateValue = value;
                    this.recalculateDuration();
                    this.validateOverlap();
                    this.findAdjacentEntries();
                });
            })
            .addText((text) => {
                this.startTimeInput = text;
                text.setValue(this.startTimeValue);
                text.inputEl.type = 'time';
                text.onChange((value) => {
                    this.startTimeValue = value;
                    this.recalculateDuration();
                    this.validateOverlap();
                    this.findAdjacentEntries();
                });
            });

        // Magnet button for start (snap to end of previous entry)
        this.startSnapHint = startSetting.controlEl.createEl('button', {
            cls: 'time-magnet-btn',
        });
        setIcon(this.startSnapHint, 'magnet');
        this.startSnapHint.style.display = 'none'; // Hidden until adjacent entry found
        this.startSnapHint.addEventListener('click', (e) => {
            e.preventDefault();
            this.snapStartToPrevious();
        });

        // Duration row (between start and end)
        new Setting(contentEl)
            .setName('Duration')
            .addText((text) => {
                this.durationInput = text;
                text.setValue(this.durationValue);
                text.setPlaceholder('1h 30m');
                text.inputEl.addClass('duration-input');
                text.onChange((value) => {
                    this.durationValue = value;
                    this.updateEndFromDuration();
                    this.validateOverlap();
                });
            });

        // End row: Date and Time with magnet button
        const endRow = contentEl.createDiv('time-row');

        const endSetting = new Setting(endRow)
            .setName('End')
            .addText((text) => {
                this.endDateInput = text;
                text.setValue(this.endDateValue);
                text.inputEl.type = 'date';
                text.onChange((value) => {
                    this.endDateValue = value;
                    this.recalculateDuration();
                    this.validateOverlap();
                    this.findAdjacentEntries();
                });
            })
            .addText((text) => {
                this.endTimeInput = text;
                text.setValue(this.endTimeValue);
                text.inputEl.type = 'time';
                text.onChange((value) => {
                    this.endTimeValue = value;
                    this.recalculateDuration();
                    this.validateOverlap();
                    this.findAdjacentEntries();
                });
            });

        // Magnet button for end (snap to start of next entry)
        this.endSnapHint = endSetting.controlEl.createEl('button', {
            cls: 'time-magnet-btn',
        });
        setIcon(this.endSnapHint, 'magnet');
        this.endSnapHint.style.display = 'none'; // Hidden until adjacent entry found
        this.endSnapHint.addEventListener('click', (e) => {
            e.preventDefault();
            this.snapEndToNext();
        });

        // Overlap warning banner (hidden by default)
        this.warningBanner = contentEl.createDiv('overlap-warning-banner');
        this.warningBanner.style.display = 'none';

        // Client dropdown (required)
        new Setting(contentEl)
            .setName('Client')
            .addDropdown((dropdown) => {
                for (const client of this.settings.clients) {
                    if (!client.archived) {
                        dropdown.addOption(client.id, client.name);
                    }
                }
                dropdown.setValue(this.clientValue);
                dropdown.onChange((value) => {
                    this.clientValue = value;
                    this.updateProjectDropdown();
                    this.updateActivityDropdown();
                });
            });

        // Project dropdown
        new Setting(contentEl)
            .setName('Project')
            .addDropdown((dropdown) => {
                this.projectDropdown = dropdown;
                this.populateProjectDropdown(dropdown);
                dropdown.setValue(this.projectValue);
                dropdown.onChange((value) => {
                    this.projectValue = value;
                });
            });

        // Activity dropdown
        new Setting(contentEl)
            .setName('Activity')
            .addDropdown((dropdown) => {
                this.activityDropdown = dropdown;
                this.populateActivityDropdown(dropdown);
                dropdown.setValue(this.activityValue);
                dropdown.onChange((value) => {
                    this.activityValue = value;
                });
            });

        // Description with character counter in label
        const maxLen = this.settings.descriptionMaxLength;
        const descSetting = new Setting(contentEl);

        // Create label with counter
        const descLabel = descSetting.nameEl;
        descLabel.setText('Description ');
        const counterEl = descLabel.createSpan('description-counter');
        const updateCounter = (len: number) => {
            if (maxLen > 0) {
                counterEl.setText(`(${len}/${maxLen})`);
                counterEl.toggleClass('is-over-limit', len > maxLen);
                counterEl.toggleClass('is-near-limit', len > maxLen * 0.8 && len <= maxLen);
            }
        };
        updateCounter(this.descriptionValue.length);

        descSetting.addTextArea((text) => {
            text.setValue(this.descriptionValue);
            text.setPlaceholder('What did you work on?');
            text.inputEl.rows = 3;

            text.onChange((value) => {
                let cleaned = value;
                if (maxLen > 0 && cleaned.length > maxLen) {
                    cleaned = cleaned.substring(0, maxLen);
                    text.setValue(cleaned);
                }
                this.descriptionValue = cleaned;
                updateCounter(cleaned.length);
            });
        });

        // Linked note
        const linkedNoteSetting = new Setting(contentEl)
            .setName('Linked Note');

        let linkedNoteInput: TextComponent;
        linkedNoteSetting.addText((text) => {
            linkedNoteInput = text;
            text.setValue(this.linkedNoteValue);
            text.setPlaceholder('path/to/note');
            text.onChange((value) => {
                this.linkedNoteValue = value;
            });
        });

        // Browse existing notes button
        linkedNoteSetting.addButton((btn) => {
            btn.setButtonText('Browse')
                .setTooltip('Select an existing note')
                .onClick(() => {
                    new NoteSuggestModal(this.app, (file) => {
                        // Remove .md extension for the link
                        const path = file.path.replace(/\.md$/, '');
                        linkedNoteInput.setValue(path);
                        this.linkedNoteValue = path;
                    }).open();
                });
        });

        // Create new note button
        linkedNoteSetting.addButton((btn) => {
            btn.setButtonText('Create New')
                .setTooltip('Create a new linked note')
                .onClick(() => {
                    this.showCreateNoteInput(contentEl, linkedNoteInput);
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
        this.saveButton = buttonRow.createEl('button', {
            text: 'Save',
            cls: 'mod-cta',
        });
        this.saveButton.addEventListener('click', () => this.handleSave());

        // Check for overlaps and find adjacent entries on initial load
        this.validateOverlap();
        this.findAdjacentEntries();
    }

    onClose(): void {
        // Run cleanup handlers
        for (const handler of this.cleanupHandlers) {
            handler();
        }
        this.cleanupHandlers = [];

        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * Handle save button click
     */
    private async handleSave(): Promise<void> {
        // Validate required fields
        if (!this.startDateValue || !this.startTimeValue || !this.endDateValue || !this.endTimeValue) {
            Logger.error('EntryModal: Missing required fields');
            return;
        }

        // Validate client is selected
        if (!this.clientValue) {
            new Notice('Please select a client');
            return;
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.startDateValue) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(this.endDateValue)) {
            Logger.error('EntryModal: Invalid date format');
            return;
        }

        // Validate end time is after start time (prevents negative durations)
        const startDateTime = new Date(`${this.startDateValue}T${this.startTimeValue}`);
        const endDateTime = new Date(`${this.endDateValue}T${this.endTimeValue}`);
        if (endDateTime <= startDateTime) {
            new Notice('End time must be after start time');
            return;
        }

        // Format start and end with explicit date+time: "YYYY-MM-DD HH:mm"
        const startForStorage = `${this.startDateValue} ${this.startTimeValue}`;
        const endForStorage = `${this.endDateValue} ${this.endTimeValue}`;

        Logger.log('Saving entry:', {
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
                    client: this.clientValue,
                    project: this.projectValue || undefined,
                    activity: this.activityValue || undefined,
                    linkedNote: this.linkedNoteValue || undefined,
                });
            } else {
                // Create new entry
                await this.dataManager.createEntry({
                    date: this.startDateValue,
                    start: startForStorage,
                    end: endForStorage,
                    description: this.descriptionValue,
                    client: this.clientValue,
                    project: this.projectValue || undefined,
                    activity: this.activityValue || undefined,
                    linkedNote: this.linkedNoteValue || undefined,
                });
            }

            this.onSave();
            this.close();
        } catch (error) {
            Logger.error('EntryModal: Error saving entry:', error);
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
            Logger.error('EntryModal: Error deleting entry:', error);
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
     * Resolve an activity ID or name to the actual activity name
     * Handles both lowercase ID format and display name format
     */
    private resolveActivityName(activityIdOrName?: string): string {
        if (!activityIdOrName) return '';

        // First try exact match by name
        const byName = this.settings.activities.find(a => a.name === activityIdOrName);
        if (byName) return byName.name;

        // Then try match by ID (for lowercased slugs)
        const byId = this.settings.activities.find(a => a.id === activityIdOrName);
        if (byId) return byId.name;

        // Return as-is if no match found
        return activityIdOrName;
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
        const start = new Date(`${this.startDateValue}T${this.startTimeValue}`);
        const end = new Date(`${this.endDateValue}T${this.endTimeValue}`);
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.round(diffMs / 60000);

        // Track invalid duration state
        this.hasInvalidDuration = diffMins <= 0;

        this.durationValue = this.formatDurationMinutes(diffMins);
        if (this.durationInput) {
            this.durationInput.setValue(this.durationValue);
            // Add visual error state for invalid duration
            this.durationInput.inputEl.toggleClass('time-input-error', this.hasInvalidDuration);
        }

        // Update save button state
        this.updateSaveButtonState();
    }

    /**
     * Update end date/time based on start + duration
     */
    private updateEndFromDuration(): void {
        const durationMins = this.parseDurationToMinutes(this.durationValue);
        if (durationMins <= 0) return;

        const start = new Date(`${this.startDateValue}T${this.startTimeValue}`);
        const end = new Date(start.getTime() + durationMins * 60000);

        this.endDateValue = TableParser.getDateString(end);
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

    /**
     * Show the create note input UI
     */
    private showCreateNoteInput(contentEl: HTMLElement, linkedNoteInput: TextComponent): void {
        // Create inline input row
        const createNoteRow = contentEl.createDiv('create-note-row');

        const maxLength = 80;
        const defaultName = `${this.startDateValue}-`;

        // Full filename input (user can edit everything including date)
        const nameInput = createNoteRow.createEl('input', {
            type: 'text',
            placeholder: 'note-name',
            cls: 'create-note-slug',
            value: defaultName,
        });
        nameInput.maxLength = maxLength;

        // Character counter
        const counterSpan = createNoteRow.createSpan('create-note-counter');
        counterSpan.setText(`${defaultName.length}/${maxLength}`);

        nameInput.addEventListener('input', () => {
            // Sanitize: only allow lowercase, numbers, hyphens
            const cursorPos = nameInput.selectionStart || 0;
            nameInput.value = nameInput.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
                .replace(/-+/g, '-');
            nameInput.selectionStart = nameInput.selectionEnd = Math.min(cursorPos, nameInput.value.length);
            counterSpan.setText(`${nameInput.value.length}/${maxLength}`);
        });

        // Create button
        const createBtn = createNoteRow.createEl('button', {
            text: 'Create',
            cls: 'mod-cta',
        });

        // Cancel button
        const cancelBtn = createNoteRow.createEl('button', {
            text: 'Cancel',
        });

        createBtn.addEventListener('click', async () => {
            const noteName = nameInput.value.trim().replace(/^-+|-+$/g, '');
            if (!noteName) {
                new Notice('Please enter a note name');
                return;
            }

            try {
                const notePath = await this.createLinkedNote(noteName);
                linkedNoteInput.setValue(notePath);
                this.linkedNoteValue = notePath;
                createNoteRow.remove();
                new Notice('Note created!');
            } catch (err) {
                new Notice(`Failed to create note: ${err}`);
            }
        });

        cancelBtn.addEventListener('click', () => {
            createNoteRow.remove();
        });

        // Focus the input and position cursor at end
        nameInput.focus();
        nameInput.selectionStart = nameInput.selectionEnd = nameInput.value.length;
    }

    /**
     * Create a linked note in the Notes subfolder
     */
    private async createLinkedNote(slug: string): Promise<string> {
        const vault = this.app.vault;
        const notesFolder = `${this.settings.timeTrackingFolder}/Notes`;
        const notePath = `${notesFolder}/${slug}.md`;

        // Ensure Notes subfolder exists
        const folder = vault.getAbstractFileByPath(notesFolder);
        if (!folder) {
            await vault.createFolder(notesFolder);
        }

        // Check if note already exists
        const existing = vault.getAbstractFileByPath(notePath);
        if (existing) {
            throw new Error('Note already exists');
        }

        // Create note with template content
        const content = this.generateNoteTemplate(slug);
        await vault.create(notePath, content);

        // Return path without .md extension for the linkedNote field
        return `${notesFolder}/${slug}`;
    }

    /**
     * Generate template content for a new linked note
     * Loosely coupled - no properties that would need updating if entry changes
     */
    private generateNoteTemplate(_noteName: string): string {
        // Just a blank note - user can add whatever they want
        return '';
    }

    /**
     * Populate project dropdown with projects for the selected client
     */
    private populateProjectDropdown(dropdown: DropdownComponent): void {
        // Clear existing options
        dropdown.selectEl.empty();

        // Add empty option
        dropdown.addOption('', '(No project)');

        // Add projects belonging to the selected client
        for (const project of this.settings.projects) {
            if (!project.archived && project.clientId === this.clientValue) {
                dropdown.addOption(project.name, project.name);
            }
        }
    }

    /**
     * Update project dropdown when client changes
     */
    private updateProjectDropdown(): void {
        if (!this.projectDropdown) return;

        this.populateProjectDropdown(this.projectDropdown);

        // Reset selection if current project doesn't belong to new client
        const currentProject = this.settings.projects.find(
            p => p.name === this.projectValue && p.clientId === this.clientValue
        );
        if (!currentProject) {
            this.projectValue = '';
        }
        this.projectDropdown.setValue(this.projectValue);
    }

    /**
     * Populate activity dropdown with activities for the selected client
     */
    private populateActivityDropdown(dropdown: DropdownComponent): void {
        // Clear existing options
        dropdown.selectEl.empty();

        // Add empty option
        dropdown.addOption('', '(No activity)');

        // Add activities belonging to the selected client
        for (const activity of this.settings.activities) {
            if (activity.clientId === this.clientValue) {
                dropdown.addOption(activity.name, activity.name);
            }
        }
    }

    /**
     * Update activity dropdown when client changes
     */
    private updateActivityDropdown(): void {
        if (!this.activityDropdown) return;

        this.populateActivityDropdown(this.activityDropdown);

        // Reset selection if current activity doesn't belong to new client
        const currentActivity = this.settings.activities.find(
            a => a.name === this.activityValue && a.clientId === this.clientValue
        );
        if (!currentActivity) {
            this.activityValue = '';
        }
        this.activityDropdown.setValue(this.activityValue);
    }

    /**
     * Validate overlap with existing entries and update UI
     * Uses request ID to prevent race conditions from concurrent async calls
     */
    private async validateOverlap(): Promise<void> {
        // Increment and capture request ID to handle race conditions
        const requestId = ++this.validationRequestId;

        // Read directly from inputs to ensure we validate what the user sees
        const startDate = this.startDateInput ? this.startDateInput.getValue() : this.startDateValue;
        const startTime = this.startTimeInput ? this.startTimeInput.getValue() : this.startTimeValue;
        const endDate = this.endDateInput ? this.endDateInput.getValue() : this.endDateValue;
        const endTime = this.endTimeInput ? this.endTimeInput.getValue() : this.endTimeValue;

        // Build datetime from current values
        const startDateTime = new Date(`${startDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);

        // Check for invalid dates
        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            Logger.log('EntryModal: Invalid dates, skipping overlap check');
            // Only update if this is still the latest request
            if (requestId !== this.validationRequestId) return;
            this.startOverlap = null;
            this.endOverlap = null;
            this.encompassedEntry = null;
            this.updateOverlapUI();
            return;
        }

        Logger.log('EntryModal: Checking conflicts for', {
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            requestId
        });

        // Check for overlaps (exclude self in edit mode)
        const excludeEntry = this.data.mode === 'edit' ? this.data.entry : undefined;

        // Find all overlaps classified by type
        const result = await this.dataManager.findOverlaps(startDateTime, endDateTime, excludeEntry);

        // Race condition guard: only apply results if this is still the latest request
        if (requestId !== this.validationRequestId) {
            Logger.log('EntryModal: Discarding stale validation result', { requestId, currentId: this.validationRequestId });
            return;
        }

        this.startOverlap = result.startOverlap;
        this.endOverlap = result.endOverlap;
        this.encompassedEntry = result.encompassedEntry;

        Logger.log('EntryModal: startOverlap =', this.startOverlap
            ? `${this.startOverlap.start} - ${this.startOverlap.end}` : 'null');
        Logger.log('EntryModal: endOverlap =', this.endOverlap
            ? `${this.endOverlap.start} - ${this.endOverlap.end}` : 'null');
        Logger.log('EntryModal: encompassedEntry =', this.encompassedEntry
            ? `${this.encompassedEntry.start} - ${this.encompassedEntry.end}` : 'null');

        this.updateOverlapUI();
    }

    /**
     * Update UI based on overlap state
     */
    private updateOverlapUI(): void {
        const hasStartOverlap = this.startOverlap !== null;
        const hasEndOverlap = this.endOverlap !== null;
        const hasEncompassed = this.encompassedEntry !== null;
        const hasAnyConflict = hasStartOverlap || hasEndOverlap || hasEncompassed;

        // Red border on start inputs if start is inside an entry
        if (this.startDateInput?.inputEl) {
            this.startDateInput.inputEl.toggleClass('time-input-error', hasStartOverlap);
        }
        if (this.startTimeInput?.inputEl) {
            this.startTimeInput.inputEl.toggleClass('time-input-error', hasStartOverlap);
        }

        // Red border on end inputs if end is inside an entry
        if (this.endDateInput?.inputEl) {
            this.endDateInput.inputEl.toggleClass('time-input-error', hasEndOverlap);
        }
        if (this.endTimeInput?.inputEl) {
            this.endTimeInput.inputEl.toggleClass('time-input-error', hasEndOverlap);
        }

        // Update warning banner
        if (this.warningBanner) {
            if (hasAnyConflict) {
                this.warningBanner.style.display = 'block';
                this.warningBanner.empty();

                const icon = this.warningBanner.createSpan('overlap-warning-icon');
                icon.setText('⚠️');

                const textContainer = this.warningBanner.createDiv('overlap-warning-messages');

                // Show start overlap (START is inside this entry)
                if (hasStartOverlap) {
                    const entry = this.startOverlap!;
                    const entryLabel = this.formatEntryLabel(entry);
                    const msg = textContainer.createDiv('overlap-message');
                    msg.setText(`Start overlaps with ${entryLabel} (${entry.start} – ${entry.end})`);
                }

                // Show end overlap (END is inside this entry)
                if (hasEndOverlap) {
                    const entry = this.endOverlap!;
                    const entryLabel = this.formatEntryLabel(entry);
                    const msg = textContainer.createDiv('overlap-message');
                    msg.setText(`End overlaps with ${entryLabel} (${entry.start} – ${entry.end})`);
                }

                // Show encompassed entry (we fully contain this entry)
                if (hasEncompassed) {
                    const entry = this.encompassedEntry!;
                    const entryLabel = this.formatEntryLabel(entry);
                    const msg = textContainer.createDiv('overlap-message');
                    msg.setText(`Conflicts with ${entryLabel} (${entry.start} – ${entry.end})`);
                }

                // Show invalid duration warning
                if (this.hasInvalidDuration) {
                    const msg = textContainer.createDiv('overlap-message');
                    msg.setText('End time must be after start time');
                }
            } else if (this.hasInvalidDuration) {
                // Show only duration warning
                this.warningBanner.style.display = 'block';
                this.warningBanner.empty();

                const icon = this.warningBanner.createSpan('overlap-warning-icon');
                icon.setText('⚠️');

                const textContainer = this.warningBanner.createDiv('overlap-warning-messages');
                const msg = textContainer.createDiv('overlap-message');
                msg.setText('End time must be after start time');
            } else {
                this.warningBanner.style.display = 'none';
            }
        }

        // Update save button state
        this.updateSaveButtonState();
    }

    /**
     * Update save button enabled/disabled state based on all validation
     */
    private updateSaveButtonState(): void {
        const hasAnyConflict = this.startOverlap !== null ||
            this.endOverlap !== null ||
            this.encompassedEntry !== null;
        const cannotSave = hasAnyConflict || this.hasInvalidDuration;

        if (this.saveButton) {
            this.saveButton.disabled = cannotSave;
            this.saveButton.toggleClass('is-disabled', cannotSave);
        }
    }

    /**
     * Get client display name from client ID
     */
    private getClientName(clientId: string): string {
        const client = this.settings.clients.find(c => c.id === clientId);
        return client?.name || clientId;
    }

    /**
     * Format entry label as CLIENT > PROJECT > ACTIVITY
     */
    private formatEntryLabel(entry: TimeEntry): string {
        const parts: string[] = [];

        // Client (always present)
        const clientName = this.getClientName(entry.client);
        parts.push(clientName);

        // Project (if present)
        if (entry.project) {
            parts.push(entry.project);
        }

        // Activity (if present)
        if (entry.activity) {
            parts.push(entry.activity);
        }

        return parts.join(' > ');
    }
    /**
     * Check if two entries are same (helper for filtering)
     */
    private isSameEntry(a: TimeEntry, b: TimeEntry): boolean {
        return (
            a.startDateTime.getTime() === b.startDateTime.getTime() &&
            a.endDateTime.getTime() === b.endDateTime.getTime() &&
            a.description === b.description
        );
    }

    /**
     * Find adjacent entries (previous ending before start, next starting after end)
     */
    private async findAdjacentEntries(): Promise<void> {
        const startDateTime = new Date(`${this.startDateValue}T${this.startTimeValue}`);
        const endDateTime = new Date(`${this.endDateValue}T${this.endTimeValue}`);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            this.previousEntry = null;
            this.nextEntry = null;
            this.updateMagnetButtons();
            return;
        }

        const excludeEntry = this.data.mode === 'edit' ? this.data.entry : undefined;
        const { previous, next } = await this.dataManager.findAdjacentEntries(startDateTime, endDateTime, excludeEntry);

        this.previousEntry = previous;
        this.nextEntry = next;
        this.updateMagnetButtons();
    }

    /**
     * Update magnet button visibility and tooltips
     */
    private updateMagnetButtons(): void {
        // Start magnet - snaps to end of previous entry
        if (this.startSnapHint) {
            if (this.previousEntry) {
                this.startSnapHint.style.display = 'inline-flex';
                const prevEnd = this.previousEntry.end;
                const prevClient = this.getClientName(this.previousEntry.client);
                this.startSnapHint.setAttribute('aria-label', `Snap to ${prevEnd} (end of ${prevClient})`);
            } else {
                this.startSnapHint.style.display = 'none';
            }
        }

        // End magnet - snaps to start of next entry
        if (this.endSnapHint) {
            if (this.nextEntry) {
                this.endSnapHint.style.display = 'inline-flex';
                const nextStart = this.nextEntry.start;
                const nextClient = this.getClientName(this.nextEntry.client);
                this.endSnapHint.setAttribute('aria-label', `Snap to ${nextStart} (start of ${nextClient})`);
            } else {
                this.endSnapHint.style.display = 'none';
            }
        }
    }

    /**
     * Snap start time to end of previous entry
     */
    private snapStartToPrevious(): void {
        if (!this.previousEntry) return;

        // Use the previous entry's end date/time
        this.startDateValue = TableParser.getDateString(this.previousEntry.endDateTime);
        this.startTimeValue = this.previousEntry.end;

        if (this.startDateInput) {
            this.startDateInput.setValue(this.startDateValue);
        }
        if (this.startTimeInput) {
            this.startTimeInput.setValue(this.startTimeValue);
        }

        this.recalculateDuration();
        this.validateOverlap();
        this.findAdjacentEntries();
    }

    /**
     * Snap end time to start of next entry
     */
    private snapEndToNext(): void {
        if (!this.nextEntry) return;

        // Use the next entry's start date/time
        this.endDateValue = TableParser.getDateString(this.nextEntry.startDateTime);
        this.endTimeValue = this.nextEntry.start;

        if (this.endDateInput) {
            this.endDateInput.setValue(this.endDateValue);
        }
        if (this.endTimeInput) {
            this.endTimeInput.setValue(this.endTimeValue);
        }

        this.recalculateDuration();
        this.validateOverlap();
        this.findAdjacentEntries();
    }
}

/**
 * Modal for selecting an existing note via fuzzy search
 */
class NoteSuggestModal extends FuzzySuggestModal<TFile> {
    private onSelect: (file: TFile) => void;

    constructor(app: App, onSelect: (file: TFile) => void) {
        super(app);
        this.onSelect = onSelect;
        this.setPlaceholder('Search for a note...');
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getItemText(file: TFile): string {
        return file.path;
    }

    onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(file);
    }
}
