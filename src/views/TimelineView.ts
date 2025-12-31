import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_TIMELINE, TimeEntry, TimeTrackerSettings } from '../types';
import { DataManager } from '../data/DataManager';
import { EntryParser } from '../data/EntryParser';

/**
 * The main timeline view for displaying time entries
 */
export class TimelineView extends ItemView {
    private settings: TimeTrackerSettings;
    private dataManager: DataManager;
    private entries: TimeEntry[] = [];
    private currentDate: Date = new Date();

    constructor(
        leaf: WorkspaceLeaf,
        settings: TimeTrackerSettings,
        dataManager: DataManager
    ) {
        super(leaf);
        this.settings = settings;
        this.dataManager = dataManager;
    }

    getViewType(): string {
        return VIEW_TYPE_TIMELINE;
    }

    getDisplayText(): string {
        return 'Timeline';
    }

    getIcon(): string {
        return 'clock';
    }

    async onOpen(): Promise<void> {
        await this.render();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Update settings and re-render
     */
    updateSettings(settings: TimeTrackerSettings): void {
        this.settings = settings;
        this.render();
    }

    /**
     * Refresh the view (reload data and re-render)
     */
    async refresh(): Promise<void> {
        await this.render();
    }

    /**
     * Main render function
     */
    private async render(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('time-tracker-timeline');

        // Load today's entries
        this.entries = await this.dataManager.loadTodayEntries();

        // Debug logging
        console.log('Timeline render - Current date:', this.currentDate);
        console.log('Timeline render - Entries loaded:', this.entries.length);
        console.log('Timeline render - Entries:', this.entries);

        // Render header
        this.renderHeader(container);

        // Render timeline
        const timelineContainer = container.createDiv('timeline-container');
        this.renderTimeline(timelineContainer);
    }

    /**
     * Render the header with date and controls
     */
    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('timeline-header');

        // Title
        const titleSection = header.createDiv('timeline-header-title');
        const dateStr = this.formatDate(this.currentDate);
        titleSection.createEl('h2', { text: dateStr });

        // Controls
        const controls = header.createDiv('timeline-header-controls');

        // Today button
        const todayBtn = controls.createEl('button', {
            text: 'Today',
            cls: 'timeline-btn',
        });
        todayBtn.addEventListener('click', () => {
            this.currentDate = new Date();
            this.render();
        });

        // Previous day
        const prevBtn = controls.createEl('button', {
            text: '←',
            cls: 'timeline-btn',
        });
        prevBtn.addEventListener('click', () => {
            this.currentDate.setDate(this.currentDate.getDate() - 1);
            this.render();
        });

        // Next day
        const nextBtn = controls.createEl('button', {
            text: '→',
            cls: 'timeline-btn',
        });
        nextBtn.addEventListener('click', () => {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            this.render();
        });
    }

    /**
     * Render the timeline with time ruler and entries
     */
    private renderTimeline(container: HTMLElement): void {
        const timeline = container.createDiv('timeline-inner');

        // Create the time ruler (left side)
        const ruler = timeline.createDiv('timeline-ruler');
        this.renderTimeRuler(ruler);

        // Create the entries area (right side)
        const entriesArea = timeline.createDiv('timeline-entries');

        // Render hour lines
        this.renderHourLines(entriesArea);

        // Render entry cards
        this.renderEntryCards(entriesArea);
    }

    /**
     * Render the time ruler with hour labels
     */
    private renderTimeRuler(container: HTMLElement): void {
        const { dayStartHour, dayEndHour, hourHeight } = this.settings;

        for (let hour = dayStartHour; hour <= dayEndHour; hour++) {
            const hourLabel = container.createDiv('timeline-hour-label');
            hourLabel.style.top = `${(hour - dayStartHour) * hourHeight}px`;
            hourLabel.style.height = `${hourHeight}px`;

            const timeStr = this.settings.use24HourFormat
                ? `${hour.toString().padStart(2, '0')}:00`
                : this.formatHour12(hour);

            hourLabel.setText(timeStr);
        }
    }

    /**
     * Render hour separator lines
     */
    private renderHourLines(container: HTMLElement): void {
        const { dayStartHour, dayEndHour, hourHeight } = this.settings;

        for (let hour = dayStartHour; hour <= dayEndHour; hour++) {
            const line = container.createDiv('timeline-hour-line');
            line.style.top = `${(hour - dayStartHour) * hourHeight}px`;
        }
    }

    /**
     * Render entry cards positioned by time
     */
    private renderEntryCards(container: HTMLElement): void {
        for (const entry of this.entries) {
            const card = this.createEntryCard(entry);
            container.appendChild(card);
        }
    }

    /**
     * Create a single entry card
     */
    private createEntryCard(entry: TimeEntry): HTMLElement {
        const { dayStartHour, hourHeight } = this.settings;

        // Calculate position and height
        const startHour = entry.startDateTime.getHours() + entry.startDateTime.getMinutes() / 60;
        const endHour = entry.endDateTime.getHours() + entry.endDateTime.getMinutes() / 60;

        const top = (startHour - dayStartHour) * hourHeight;
        const height = Math.max((endHour - startHour) * hourHeight, 30); // Min height 30px

        // Create card element
        const card = document.createElement('div');
        card.addClass('timeline-entry-card');
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;

        // Get project color
        const projectColor = this.getProjectColor(entry.project);
        card.style.setProperty('--project-color', projectColor);

        // Card content
        const header = card.createDiv('entry-card-header');

        const title = header.createDiv('entry-card-title');
        title.setText(entry.description || '(No description)');

        const time = header.createDiv('entry-card-time');
        time.setText(`${entry.start} – ${entry.end}`);

        // Meta row (project, tags)
        const meta = card.createDiv('entry-card-meta');

        if (entry.project) {
            const projectChip = meta.createSpan('entry-chip project-chip');
            projectChip.setText(entry.project);
        }

        if (entry.tags && entry.tags.length > 0) {
            for (const tag of entry.tags) {
                const tagChip = meta.createSpan('entry-chip tag-chip');
                tagChip.setText(`#${tag}`);
            }
        }

        // Duration
        const durationStr = this.formatDuration(entry.durationMinutes);
        const durationEl = meta.createSpan('entry-duration');
        durationEl.setText(durationStr);

        // Click handler (for future editing)
        card.addEventListener('click', () => {
            // TODO: Open edit modal
            console.log('Edit entry:', entry);
        });

        return card;
    }

    /**
     * Get the color for a project
     */
    private getProjectColor(projectId?: string): string {
        if (!projectId) return '#4f46e5'; // Default indigo

        const project = this.settings.projects.find(p => p.id === projectId || p.name === projectId);
        return project?.color || '#4f46e5';
    }

    /**
     * Format a date for display
     */
    private formatDate(date: Date): string {
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        };
        return date.toLocaleDateString(undefined, options);
    }

    /**
     * Format hour in 12-hour format
     */
    private formatHour12(hour: number): string {
        const h = hour % 12 || 12;
        const ampm = hour < 12 ? 'AM' : 'PM';
        return `${h} ${ampm}`;
    }

    /**
     * Format duration in human-readable format
     */
    private formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours === 0) {
            return `${mins}m`;
        } else if (mins === 0) {
            return `${hours}h`;
        } else {
            return `${hours}h ${mins}m`;
        }
    }
}
