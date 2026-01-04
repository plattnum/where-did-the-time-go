import { ItemView, WorkspaceLeaf, Modal, App, setIcon } from 'obsidian';
import { VIEW_TYPE_TIMELINE, TimeEntry, TimeTrackerSettings } from '../types';
import { DataManager } from '../data/DataManager';
import { TableParser } from '../data/TableParser';
import { EntryModal, EntryModalData } from '../modals/EntryModal';
import { Logger } from '../utils/Logger';

/**
 * The main timeline view with infinite scrolling
 */
export class TimelineView extends ItemView {
    private settings: TimeTrackerSettings;
    private dataManager: DataManager;

    // Scroll state
    private centerDate: Date = new Date();
    private visibleDaysBuffer: number = 1; // Days to render before/after visible area (prev day, today, next day)
    private loadedMonths: Set<string> = new Set();
    private entriesByDate: Map<string, TimeEntry[]> = new Map();

    // DOM references
    private timelineContainer: HTMLElement;
    private timelineInner: HTMLElement;
    private rulerContainer: HTMLElement;
    private entriesContainer: HTMLElement;
    private visibleDateLabel: HTMLElement;

    // Dimensions
    private dayHeight: number = 0; // Calculated as 24 * hourHeight
    private resizeObserver: ResizeObserver | null = null;

    // Drag selection state (for creating new entries)
    private isDragging: boolean = false;
    private dragStartY: number = 0;
    private dragCurrentY: number = 0;
    private dragStartDate: Date | null = null;
    private selectionEl: HTMLElement | null = null;
    private dragTooltipEl: HTMLElement | null = null;

    // Entry drag state (for moving/resizing existing entries)
    private entryDragMode: 'none' | 'move' | 'resize-top' | 'resize-bottom' = 'none';
    private entryDragEntry: TimeEntry | null = null;
    private entryDragCard: HTMLElement | null = null;
    private entryDragStartY: number = 0;
    private entryDragOriginalTop: number = 0;
    private entryDragOriginalHeight: number = 0;
    private entryDragTooltipEl: HTMLElement | null = null;

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
        this.dayHeight = 24 * this.settings.hourHeight;
        // Set center to today
        this.centerDate = new Date();
        this.centerDate.setHours(0, 0, 0, 0);
        await this.render();
        // Scroll to show today at dayStartHour
        requestAnimationFrame(() => {
            const targetOffset = this.visibleDaysBuffer * this.dayHeight +
                this.settings.dayStartHour * this.settings.hourHeight;
            this.timelineContainer.scrollTop = targetOffset;
            this.updateVisibleDateLabel();
            Logger.log('onOpen: scrolled to today, offset=', targetOffset);
        });
    }

    async onClose(): Promise<void> {
        // Cleanup resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    updateSettings(settings: TimeTrackerSettings): void {
        this.settings = settings;
        this.dayHeight = 24 * this.settings.hourHeight;
        // Use refresh() to preserve scroll position (if already rendered)
        if (this.timelineContainer) {
            this.refresh();
        }
    }

    async refresh(): Promise<void> {
        Logger.log('refresh: clearing caches and re-rendering');
        // Save current scroll position
        const savedScrollTop = this.timelineContainer?.scrollTop ?? 0;

        // Clear data caches but keep centerDate
        this.loadedMonths.clear();
        this.entriesByDate.clear();

        // Re-render entries only (not full container rebuild)
        await this.loadVisibleRange();
        this.renderVisibleDays();

        // Restore exact scroll position
        if (this.timelineContainer) {
            this.timelineContainer.scrollTop = savedScrollTop;
        }
    }

    /**
     * Main render function - sets up the infinite scroll container
     */
    private async render(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('time-tracker-timeline');

        // Render header
        this.renderHeader(container);

        // Create timeline container
        this.timelineContainer = container.createDiv('timeline-container');
        this.timelineInner = this.timelineContainer.createDiv('timeline-inner');

        // Create ruler (left side)
        this.rulerContainer = this.timelineInner.createDiv('timeline-ruler');

        // Create entries area (right side)
        this.entriesContainer = this.timelineInner.createDiv('timeline-entries');
        // Set CSS variable for 15-min grid lines
        this.entriesContainer.style.setProperty('--tt-hour-height', `${this.settings.hourHeight}px`);

        // Load initial data and render
        await this.loadVisibleRange();
        this.renderVisibleDays();

        // Set up scroll listener
        this.timelineContainer.addEventListener('scroll', () => this.onScroll());

        // Drag to select time range for new entry
        this.entriesContainer.addEventListener('mousedown', (e) => this.handleDragStart(e));
        this.entriesContainer.addEventListener('mousemove', (e) => this.handleDragMove(e));
        this.entriesContainer.addEventListener('mouseup', (e) => this.handleDragEnd(e));
        this.entriesContainer.addEventListener('mouseleave', (e) => this.handleDragCancel(e));

        // Double-click on timeline to create new entry (fallback)
        this.entriesContainer.addEventListener('dblclick', (e) => this.handleTimelineDoubleClick(e));

        // Set up resize observer to update date label on resize
        this.resizeObserver = new ResizeObserver(() => {
            this.updateVisibleDateLabel();
        });
        this.resizeObserver.observe(this.timelineContainer);
    }

    /**
     * Render the header with controls
     */
    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('timeline-header');

        const titleSection = header.createDiv('timeline-header-title');
        titleSection.createEl('h2', { text: 'Timeline' });

        // Visible date range label
        this.visibleDateLabel = titleSection.createSpan('timeline-visible-date');
        this.visibleDateLabel.setText('');

        const controls = header.createDiv('timeline-header-controls');

        // Today button
        const todayBtn = controls.createEl('button', {
            text: 'Today',
            cls: 'timeline-btn',
        });
        todayBtn.addEventListener('click', () => this.scrollToDate(new Date()));

        // Now button - scrolls to current time
        const nowBtn = controls.createEl('button', {
            text: 'Now',
            cls: 'timeline-btn timeline-btn-primary',
        });
        nowBtn.addEventListener('click', () => this.scrollToNow());

        // Navigation buttons (1 day at a time)
        const prevBtn = controls.createEl('button', {
            text: '← Prev',
            cls: 'timeline-btn',
        });
        prevBtn.addEventListener('click', () => this.navigateDays(-1));

        const nextBtn = controls.createEl('button', {
            text: 'Next →',
            cls: 'timeline-btn',
        });
        nextBtn.addEventListener('click', () => this.navigateDays(1));

        // Jump to date - calendar button
        const jumpBtn = controls.createEl('button', {
            cls: 'timeline-btn timeline-jump-btn',
        });
        jumpBtn.setAttribute('title', 'Jump to date');
        setIcon(jumpBtn, 'calendar');

        // Hidden date picker - outside button, visually hidden
        const hiddenDatePicker = controls.createEl('input', {
            type: 'date',
            cls: 'timeline-date-picker-hidden',
        });
        hiddenDatePicker.value = this.formatDateForInput(this.centerDate);
        hiddenDatePicker.addEventListener('change', () => {
            const dateValue = hiddenDatePicker.value;
            if (dateValue) {
                const [year, month, day] = dateValue.split('-').map(Number);
                const selectedDate = new Date(year, month - 1, day);
                this.scrollToDate(selectedDate);
            }
        });

        jumpBtn.addEventListener('click', () => {
            (hiddenDatePicker as any).showPicker?.() || hiddenDatePicker.click();
        });
    }

    /**
     * Handle scroll events for infinite loading
     */
    private async onScroll(): Promise<void> {
        const scrollTop = this.timelineContainer.scrollTop;
        const viewportHeight = this.timelineContainer.clientHeight;
        const totalHeight = (this.visibleDaysBuffer * 2 + 1) * this.dayHeight;

        // Update the visible date label
        this.updateVisibleDateLabel();

        // Edge threshold scales with buffer size (max 3 days, min half a day)
        const edgeThreshold = this.dayHeight * Math.max(0.5, Math.min(this.visibleDaysBuffer, 3));

        if (scrollTop < edgeThreshold) {
            // Near top - shift center date backwards
            await this.shiftCenter(-this.visibleDaysBuffer);
        } else if (scrollTop > totalHeight - viewportHeight - edgeThreshold) {
            // Near bottom - shift center date forwards
            await this.shiftCenter(this.visibleDaysBuffer);
        }
    }

    /**
     * Shift the center date and re-render while maintaining visual position
     */
    private async shiftCenter(days: number): Promise<void> {
        // Save current scroll position relative to center
        const oldScrollTop = this.timelineContainer.scrollTop;

        // Update center date
        this.centerDate.setDate(this.centerDate.getDate() + days);

        // Load new data range
        await this.loadVisibleRange();
        this.renderVisibleDays();

        // Adjust scroll position to compensate for the shift
        const scrollAdjustment = days * this.dayHeight;
        this.timelineContainer.scrollTop = oldScrollTop - scrollAdjustment;

        Logger.log('Shifted center by', days, 'days, new center:', this.centerDate.toDateString());
    }

    /**
     * Update the visible date label based on scroll position
     */
    private updateVisibleDateLabel(): void {
        if (!this.timelineContainer || !this.visibleDateLabel) return;

        const scrollTop = this.timelineContainer.scrollTop;
        const viewportHeight = this.timelineContainer.clientHeight;

        // Calculate which days are visible
        const topOffset = scrollTop;
        const bottomOffset = scrollTop + viewportHeight;

        const topDayIndex = Math.floor(topOffset / this.dayHeight) - this.visibleDaysBuffer;
        const bottomDayIndex = Math.floor(bottomOffset / this.dayHeight) - this.visibleDaysBuffer;

        const topDate = new Date(this.centerDate);
        topDate.setDate(topDate.getDate() + topDayIndex);

        const bottomDate = new Date(this.centerDate);
        bottomDate.setDate(bottomDate.getDate() + bottomDayIndex);

        // Format the label
        const label = this.formatVisibleDateRange(topDate, bottomDate);
        this.visibleDateLabel.setText(label);
    }

    /**
     * Format the visible date range for display
     */
    private formatVisibleDateRange(startDate: Date, endDate: Date): string {
        const sameDay = startDate.toDateString() === endDate.toDateString();
        const sameMonth = startDate.getMonth() === endDate.getMonth() &&
            startDate.getFullYear() === endDate.getFullYear();

        if (sameDay) {
            // Single day: "Mon, Aug 10, 2026"
            return startDate.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        } else if (sameMonth) {
            // Same month: "Mon 10 – Tue 11 Aug 2026"
            const startWd = startDate.toLocaleDateString(undefined, { weekday: 'short' });
            const endWd = endDate.toLocaleDateString(undefined, { weekday: 'short' });
            const month = startDate.toLocaleDateString(undefined, { month: 'short' });
            const year = startDate.getFullYear();
            return `${startWd} ${startDate.getDate()} – ${endWd} ${endDate.getDate()} ${month} ${year}`;
        } else {
            // Different months: "Mon, Aug 10 – Tue, Sep 1, 2026"
            const startPart = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const endPart = endDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            return `${startPart} – ${endPart}`;
        }
    }

    /**
     * Load entries for the visible date range
     */
    private async loadVisibleRange(): Promise<void> {
        const startDate = new Date(this.centerDate);
        startDate.setDate(startDate.getDate() - this.visibleDaysBuffer * 2);

        const endDate = new Date(this.centerDate);
        endDate.setDate(endDate.getDate() + this.visibleDaysBuffer * 2);

        Logger.log('loadVisibleRange: centerDate=', this.centerDate.toDateString(),
            'range=', startDate.toDateString(), 'to', endDate.toDateString());

        // Determine which months need loading
        // We need to include both the start month and end month
        const months = new Set<string>();
        const startMonth = TableParser.getMonthString(startDate);
        const endMonth = TableParser.getMonthString(endDate);

        const current = new Date(startDate);
        current.setDate(1); // Start from first of month to iterate cleanly

        while (TableParser.getMonthString(current) <= endMonth) {
            months.add(TableParser.getMonthString(current));
            current.setMonth(current.getMonth() + 1);
        }

        Logger.log('loadVisibleRange: months to check=', Array.from(months));

        // Load any months we haven't loaded yet
        for (const month of months) {
            if (!this.loadedMonths.has(month)) {
                Logger.log('loadVisibleRange: loading month', month);
                const parsed = await this.dataManager.loadMonth(month);
                this.loadedMonths.add(month);

                Logger.log('loadVisibleRange: loaded', parsed.entries.length, 'entries for', month);
                Logger.log('loadVisibleRange: entriesByDate keys=', Array.from(parsed.entriesByDate.keys()));

                // Merge entries into our map
                for (const [dateStr, entries] of parsed.entriesByDate) {
                    this.entriesByDate.set(dateStr, entries);
                    Logger.log('loadVisibleRange: set', dateStr, 'with', entries.length, 'entries');
                }
            } else {
                Logger.log('loadVisibleRange: month already loaded', month);
            }
        }
    }

    /**
     * Render the visible days in the timeline
     */
    private renderVisibleDays(): void {
        this.rulerContainer.empty();
        this.entriesContainer.empty();

        const totalDays = this.visibleDaysBuffer * 2 + 1;
        const totalHeight = totalDays * this.dayHeight;

        this.timelineInner.style.height = `${totalHeight}px`;

        // Render each day
        for (let i = -this.visibleDaysBuffer; i <= this.visibleDaysBuffer; i++) {
            const date = new Date(this.centerDate);
            date.setDate(date.getDate() + i);
            const dayOffset = (i + this.visibleDaysBuffer) * this.dayHeight;

            this.renderDay(date, dayOffset);
        }
    }

    /**
     * Render a single day with ruler and entries
     */
    private renderDay(date: Date, topOffset: number): void {
        const dateStr = TableParser.getDateString(date);
        const isToday = this.isToday(date);

        // Day header
        const dayHeader = this.entriesContainer.createDiv('timeline-day-header');
        dayHeader.style.top = `${topOffset}px`;
        dayHeader.setText(this.formatDayHeader(date));
        if (isToday) {
            dayHeader.addClass('is-today');
        }

        // Hour lines and labels
        for (let hour = 0; hour < 24; hour++) {
            const hourTop = topOffset + hour * this.settings.hourHeight;

            // Hour label (on ruler)
            const hourLabel = this.rulerContainer.createDiv('timeline-hour-label');
            hourLabel.style.top = `${hourTop}px`;
            hourLabel.setText(this.formatHour(hour));

            // Hour line (on entries area)
            const hourLine = this.entriesContainer.createDiv('timeline-hour-line');
            hourLine.style.top = `${hourTop}px`;
        }

        // Current time indicator
        if (isToday) {
            const now = new Date();
            const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
            const nowTop = topOffset + (minutesSinceMidnight / 60) * this.settings.hourHeight;

            const nowLine = this.entriesContainer.createDiv('timeline-now-line');
            nowLine.style.top = `${nowTop}px`;
        }

        // Render entries for this day
        const entries = this.entriesByDate.get(dateStr) || [];
        if (entries.length > 0) {
            Logger.log('renderDay: rendering', entries.length, 'entries for', dateStr);
        }
        for (const entry of entries) {
            this.renderEntryCard(entry, topOffset);
        }
        // Note: Midnight-spanning entries are rendered as single unified blocks from their start day
        // No need to render continuations - the card extends into the next day's area
    }

    /**
     * Render an entry card with v5 design: Header + Body + Footer
     * Design spec: 200px/hr, responsive by duration (15m/30m/45m/60m+)
     */
    private renderEntryCard(entry: TimeEntry, dayTopOffset: number): void {
        const cardStartMinutes = entry.startDateTime.getHours() * 60 + entry.startDateTime.getMinutes();
        const totalDurationMinutes = entry.durationMinutes;

        const top = dayTopOffset + (cardStartMinutes / 60) * this.settings.hourHeight;
        const height = Math.max((totalDurationMinutes / 60) * this.settings.hourHeight, 50);

        const card = this.entriesContainer.createDiv('timeline-entry-card');
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        card.dataset.entryDate = entry.date;
        card.dataset.entryLine = String(entry.lineNumber);

        // Client color for left bar and header gradient
        const clientColor = this.getClientColor(entry.client);
        card.style.setProperty('--client-color', clientColor);

        // Duration-based layout classes
        const is15m = totalDurationMinutes <= 15;
        if (is15m) {
            card.addClass('entry-15m');
        } else if (totalDurationMinutes <= 30) {
            card.addClass('entry-30m');
        } else if (totalDurationMinutes <= 45) {
            card.addClass('entry-45m');
        } else {
            card.addClass('entry-60m');
        }

        // Tooltip for hover
        const tooltipParts = [
            entry.description || '(No description)',
            `${entry.start} – ${entry.end} (${this.formatDuration(entry.durationMinutes)})`,
            `Client: ${this.getClientName(entry.client)}`,
        ];
        if (entry.project) tooltipParts.push(`Project: ${this.getProjectName(entry.project)}`);
        if (entry.activity) tooltipParts.push(`Activity: ${this.getActivityName(entry.activity)}`);
        if (entry.linkedNote) tooltipParts.push(`Note: ${entry.linkedNote}`);
        card.setAttribute('title', tooltipParts.join('\n'));

        // === HEADER SECTION ===
        const header = card.createDiv('entry-card-header');

        // Time text + duration badge
        const timeText = header.createSpan('entry-time-text');
        timeText.setText(`${entry.start} – ${entry.end}`);
        const durationBadge = header.createSpan('entry-duration-badge');
        durationBadge.setText(this.formatDuration(entry.durationMinutes));

        // 15m layout: Tiny tags inline in header
        if (is15m) {
            const tinyTags = header.createDiv('entry-tiny-tags');

            // Client tag
            const clientTag = tinyTags.createSpan('tiny-tag');
            clientTag.setText(this.getClientName(entry.client).substring(0, 3).toUpperCase());
            clientTag.style.setProperty('--tag-color', clientColor);

            // Project tag
            if (entry.project) {
                const projectTag = tinyTags.createSpan('tiny-tag');
                projectTag.setText(this.getProjectName(entry.project).substring(0, 3).toUpperCase());
                projectTag.style.setProperty('--tag-color', this.getProjectColor(entry.project));
            }

            // Activity tag
            if (entry.activity) {
                const activityTag = tinyTags.createSpan('tiny-tag');
                activityTag.setText(this.getActivityName(entry.activity).substring(0, 3).toUpperCase());
                const actColor = this.getActivityColor(entry.activity);
                if (actColor) activityTag.style.setProperty('--tag-color', actColor);
            }

            // Inline description (truncated)
            const inlineDesc = header.createSpan('entry-inline-desc');
            inlineDesc.setText(entry.description || '');
        }

        // Icons (right side of header)
        const icons = header.createDiv('entry-header-icons');

        // Linked note icon (paperclip)
        if (entry.linkedNote) {
            const noteIcon = icons.createSpan('entry-icon');
            setIcon(noteIcon, 'paperclip');
            noteIcon.setAttribute('title', `Open: ${entry.linkedNote}`);
            noteIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openLinkedNote(entry.linkedNote!);
            });
        }

        // Edit icon (pencil)
        const editIcon = icons.createSpan('entry-icon');
        setIcon(editIcon, 'pencil');
        editIcon.setAttribute('title', 'Edit entry');
        editIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEditModal(entry);
        });

        // Delete icon (trash)
        const deleteIcon = icons.createSpan('entry-icon entry-icon-delete');
        setIcon(deleteIcon, 'trash-2');
        deleteIcon.setAttribute('title', 'Delete entry');
        deleteIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDeleteEntry(entry);
        });

        // === BODY SECTION (30m+ only) ===
        if (!is15m) {
            const body = card.createDiv('entry-card-body');
            const desc = body.createDiv('entry-body-desc');
            if (entry.description) {
                desc.textContent = entry.description;
            }
        }

        // === FOOTER / POWERLINE (30m+ only) ===
        if (!is15m) {
            const footer = card.createDiv('entry-card-footer');

            // Client segment
            const clientSeg = footer.createSpan('powerline-seg');
            clientSeg.setText(this.getClientName(entry.client));
            clientSeg.style.setProperty('--seg-color', clientColor);

            // Project segment
            if (entry.project) {
                const projectSeg = footer.createSpan('powerline-seg');
                projectSeg.setText(this.getProjectName(entry.project));
                projectSeg.style.setProperty('--seg-color', this.getProjectColor(entry.project));
            }

            // Activity segment
            if (entry.activity) {
                const activitySeg = footer.createSpan('powerline-seg');
                activitySeg.setText(this.getActivityName(entry.activity));
                const actColor = this.getActivityColor(entry.activity);
                if (actColor) activitySeg.style.setProperty('--seg-color', actColor);
            }
        }

        // === RESIZE HANDLE ===
        const resizeBottom = card.createDiv('entry-resize-handle entry-resize-bottom');
        resizeBottom.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startEntryDrag(e, entry, card, 'resize-bottom');
        });

        // === DRAG TO MOVE ===
        card.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('entry-resize-handle')) return;
            if (target.closest('.entry-icon')) return;
            e.stopPropagation();
            this.startEntryDrag(e, entry, card, 'move');
        });
    }

    /**
     * Start dragging an entry (move or resize)
     */
    private startEntryDrag(e: MouseEvent, entry: TimeEntry, card: HTMLElement, mode: 'move' | 'resize-top' | 'resize-bottom'): void {
        e.preventDefault();
        this.entryDragMode = mode;
        this.entryDragEntry = entry;
        this.entryDragCard = card;
        this.entryDragStartY = e.clientY;
        this.entryDragOriginalTop = parseFloat(card.style.top);
        this.entryDragOriginalHeight = parseFloat(card.style.height);

        card.addClass('is-dragging');

        // Create tooltip for time feedback
        this.entryDragTooltipEl = this.timelineInner.createDiv('timeline-drag-tooltip');
        this.updateEntryDragTooltip();

        document.addEventListener('mousemove', this.handleEntryDragMove);
        document.addEventListener('mouseup', this.handleEntryDragEnd);
    }

    /**
     * Handle entry drag movement
     */
    private handleEntryDragMove = (e: MouseEvent): void => {
        if (this.entryDragMode === 'none' || !this.entryDragCard) return;

        const deltaY = e.clientY - this.entryDragStartY;

        if (this.entryDragMode === 'move') {
            // Move the whole card
            const newTop = this.entryDragOriginalTop + deltaY;
            this.entryDragCard.style.top = `${newTop}px`;
        } else if (this.entryDragMode === 'resize-top') {
            // Resize from top - adjust both top and height
            const newTop = this.entryDragOriginalTop + deltaY;
            const newHeight = this.entryDragOriginalHeight - deltaY;
            if (newHeight >= 30) { // Minimum height
                this.entryDragCard.style.top = `${newTop}px`;
                this.entryDragCard.style.height = `${newHeight}px`;
            }
        } else if (this.entryDragMode === 'resize-bottom') {
            // Resize from bottom - just adjust height
            const newHeight = this.entryDragOriginalHeight + deltaY;
            if (newHeight >= 30) { // Minimum height
                this.entryDragCard.style.height = `${newHeight}px`;
            }
        }

        // Update tooltip with current times
        this.updateEntryDragTooltip();
    };

    /**
     * End entry drag and save changes
     */
    private handleEntryDragEnd = async (e: MouseEvent): Promise<void> => {
        document.removeEventListener('mousemove', this.handleEntryDragMove);
        document.removeEventListener('mouseup', this.handleEntryDragEnd);

        if (this.entryDragMode === 'none' || !this.entryDragCard || !this.entryDragEntry) {
            this.cleanupEntryDrag();
            return;
        }

        const deltaY = e.clientY - this.entryDragStartY;

        // If barely moved, treat as click (will open edit modal)
        if (Math.abs(deltaY) < 5) {
            this.cleanupEntryDrag();
            return;
        }

        // Calculate new times based on drag
        const entry = this.entryDragEntry;
        const card = this.entryDragCard;

        const newTop = parseFloat(card.style.top);
        const newHeight = parseFloat(card.style.height);

        // Convert pixel positions to times
        const newStartMinutes = (newTop / this.settings.hourHeight) * 60;
        const newDurationMinutes = (newHeight / this.settings.hourHeight) * 60;

        // Calculate which day the entry is now on
        const dayIndex = Math.floor(newTop / this.dayHeight);
        const minutesInDay = newStartMinutes - (dayIndex * 24 * 60);

        // Get the actual date for this position
        const newDate = new Date(this.centerDate);
        newDate.setDate(newDate.getDate() + dayIndex - this.visibleDaysBuffer);

        // Calculate start and end times
        const startHours = Math.floor(minutesInDay / 60) % 24;
        const startMins = Math.round(minutesInDay % 60 / 15) * 15; // Round to 15 min
        const endTotalMins = minutesInDay + newDurationMinutes;
        const endHours = Math.floor(endTotalMins / 60) % 24;
        const endMins = Math.round(endTotalMins % 60 / 15) * 15;

        // Determine end date (might be next day if spans midnight)
        const endDate = new Date(newDate);
        if (endTotalMins >= 24 * 60) {
            endDate.setDate(endDate.getDate() + 1);
        }

        const newStartTime = `${startHours.toString().padStart(2, '0')}:${startMins.toString().padStart(2, '0')}`;
        const newEndTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
        const newDateStr = TableParser.getDateString(newDate);
        const endDateStr = TableParser.getDateString(endDate);

        // Build full datetime strings (required by updateEntry)
        const fullStart = `${newDateStr} ${newStartTime}`;
        const fullEnd = `${endDateStr} ${newEndTime}`;

        try {
            await this.dataManager.updateEntry(entry, {
                date: newDateStr,
                start: fullStart,
                end: fullEnd,
            });
            await this.refresh();
        } catch (err) {
            console.error('Failed to update entry after drag:', err);
            // Revert visual position
            card.style.top = `${this.entryDragOriginalTop}px`;
            card.style.height = `${this.entryDragOriginalHeight}px`;
        }

        this.cleanupEntryDrag();
    };

    /**
     * Clean up entry drag state
     */
    private cleanupEntryDrag(): void {
        if (this.entryDragCard) {
            this.entryDragCard.removeClass('is-dragging');
        }
        if (this.entryDragTooltipEl) {
            this.entryDragTooltipEl.remove();
            this.entryDragTooltipEl = null;
        }
        this.entryDragMode = 'none';
        this.entryDragEntry = null;
        this.entryDragCard = null;
    }

    /**
     * Update the entry drag tooltip with current start/end times
     */
    private updateEntryDragTooltip(): void {
        if (!this.entryDragTooltipEl || !this.entryDragCard) return;

        const newTop = parseFloat(this.entryDragCard.style.top);
        const newHeight = parseFloat(this.entryDragCard.style.height);

        // Convert pixel positions to times
        const newStartMinutes = (newTop / this.settings.hourHeight) * 60;
        const newDurationMinutes = (newHeight / this.settings.hourHeight) * 60;

        // Calculate which day and time
        const dayIndex = Math.floor(newTop / this.dayHeight);
        const minutesInDay = newStartMinutes - (dayIndex * 24 * 60);
        const endMinutesInDay = minutesInDay + newDurationMinutes;

        // Round to 15 minutes
        const startHours = Math.floor(minutesInDay / 60) % 24;
        const startMins = Math.round(minutesInDay % 60 / 15) * 15;
        const endHours = Math.floor(endMinutesInDay / 60) % 24;
        const endMins = Math.round(endMinutesInDay % 60 / 15) * 15;

        const startTime = `${startHours.toString().padStart(2, '0')}:${startMins.toString().padStart(2, '0')}`;
        const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

        this.entryDragTooltipEl.setText(`${startTime} – ${endTime}`);
        // Position tooltip below the card
        this.entryDragTooltipEl.style.top = `${newTop + newHeight + 8}px`;
    }

    /**
     * Scroll to a specific date, positioning dayStartHour at the top
     */
    scrollToDate(date: Date): void {
        this.centerDate = new Date(date);
        this.centerDate.setHours(0, 0, 0, 0);

        this.loadVisibleRange().then(() => {
            this.renderVisibleDays();

            // Position the configured dayStartHour at the top of the viewport
            const targetOffset = this.visibleDaysBuffer * this.dayHeight + this.settings.dayStartHour * this.settings.hourHeight;
            this.timelineContainer.scrollTop = targetOffset;
            this.updateVisibleDateLabel();
        });
    }

    /**
     * Navigate by number of days
     */
    private navigateDays(days: number): void {
        const newDate = new Date(this.centerDate);
        newDate.setDate(newDate.getDate() + days);
        this.scrollToDate(newDate);
    }

    /**
     * Scroll to the current time (now line)
     */
    scrollToNow(): void {
        const now = new Date();
        this.centerDate = new Date(now);
        this.centerDate.setHours(0, 0, 0, 0);

        this.loadVisibleRange().then(() => {
            this.renderVisibleDays();

            // Calculate scroll position to put current time in view
            const currentHour = now.getHours() + now.getMinutes() / 60;
            // Center the now line in the viewport
            const viewportHeight = this.timelineContainer.clientHeight;
            const nowOffset = this.visibleDaysBuffer * this.dayHeight + currentHour * this.settings.hourHeight;
            const targetScroll = nowOffset - (viewportHeight / 2);

            this.timelineContainer.scrollTop = Math.max(0, targetScroll);
            this.updateVisibleDateLabel();
        });
    }

    // Helper methods

    private isToday(date: Date): boolean {
        const today = new Date();
        return date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate();
    }

    private formatDayHeader(date: Date): string {
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
        };
        const formatted = date.toLocaleDateString(undefined, options);
        return this.isToday(date) ? `Today · ${formatted}` : formatted;
    }

    private formatHour(hour: number): string {
        if (this.settings.use24HourFormat) {
            return `${hour.toString().padStart(2, '0')}:00`;
        }
        const h = hour % 12 || 12;
        const ampm = hour < 12 ? 'AM' : 'PM';
        return `${h} ${ampm}`;
    }

    private formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours === 0) return `${mins}m`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h ${mins}m`;
    }

    private formatDateForInput(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getProjectColor(projectId?: string): string {
        if (!projectId) return '#4f46e5';
        const project = this.settings.projects.find(p => p.id === projectId || p.name === projectId);
        return project?.color || '#4f46e5';
    }

    /**
     * Get color for an activity from settings
     */
    private getActivityColor(activityName: string): string | undefined {
        const activity = this.settings.activities.find(a => a.name === activityName || a.id === activityName);
        return activity?.color;
    }

    /**
     * Get display name for a client from settings
     */
    private getClientName(clientId: string): string {
        const client = this.settings.clients.find(c => c.id === clientId || c.name === clientId);
        return client?.name || clientId;
    }

    /**
     * Get color for a client from settings
     */
    private getClientColor(clientId: string): string {
        const client = this.settings.clients.find(c => c.id === clientId || c.name === clientId);
        return client?.color || '#4f46e5';
    }

    /**
     * Get display name for a project from settings
     */
    private getProjectName(projectId: string): string {
        const project = this.settings.projects.find(p => p.id === projectId || p.name === projectId);
        return project?.name || projectId;
    }

    /**
     * Get display name for an activity from settings
     */
    private getActivityName(activityId: string): string {
        const activity = this.settings.activities.find(a => a.id === activityId || a.name === activityId);
        return activity?.name || activityId;
    }

    /**
     * Open a linked note in Obsidian
     */
    private openLinkedNote(notePath: string): void {
        // Add .md if not present
        const fullPath = notePath.endsWith('.md') ? notePath : `${notePath}.md`;
        const file = this.app.vault.getAbstractFileByPath(fullPath);
        if (file) {
            this.app.workspace.openLinkText(notePath, '', false);
        } else {
            Logger.warn('Linked note not found:', fullPath);
        }
    }

    // Modal methods

    /**
     * Open modal to edit an existing entry
     */
    private openEditModal(entry: TimeEntry): void {
        Logger.log('Opening edit modal for entry:', entry);
        const data: EntryModalData = {
            mode: 'edit',
            entry,
        };

        const modal = new EntryModal(
            this.app,
            this.settings,
            this.dataManager,
            data,
            () => this.refresh()
        );
        modal.open();
    }

    /**
     * Open modal to create a new entry
     */
    private openCreateModal(date: Date, startTime?: string): void {
        Logger.log('Opening create modal for date:', date, 'time:', startTime);
        const data: EntryModalData = {
            mode: 'create',
            date,
            startTime,
        };

        const modal = new EntryModal(
            this.app,
            this.settings,
            this.dataManager,
            data,
            () => this.refresh()
        );
        modal.open();
    }

    /**
     * Show confirmation dialog and delete entry if confirmed
     */
    private confirmDeleteEntry(entry: TimeEntry): void {
        new ConfirmDeleteModal(this.app, entry, async () => {
            await this.dataManager.deleteEntry(entry);
            this.refresh();
        }).open();
    }

    /**
     * Handle double-click on timeline to create new entry
     */
    private handleTimelineDoubleClick(e: MouseEvent): void {
        // Don't create if clicking on an entry card
        const target = e.target as HTMLElement;
        if (target.closest('.timeline-entry-card')) {
            return;
        }

        // Calculate click position relative to the inner timeline content
        // getBoundingClientRect already accounts for scroll, so don't add scrollTop
        const rect = this.timelineInner.getBoundingClientRect();
        const clickY = e.clientY - rect.top;

        Logger.log('Double-click debug:', {
            clientY: e.clientY,
            rectTop: rect.top,
            clickY: clickY,
            dayHeight: this.dayHeight,
            visibleDaysBuffer: this.visibleDaysBuffer,
            centerDate: this.centerDate.toISOString(),
        });

        // Determine which day was clicked
        const dayIndex = Math.floor(clickY / this.dayHeight) - this.visibleDaysBuffer;
        const clickedDate = new Date(this.centerDate);
        clickedDate.setDate(clickedDate.getDate() + dayIndex);

        // Determine what time was clicked (within the day)
        const yWithinDay = clickY % this.dayHeight;
        const hoursFromMidnight = yWithinDay / this.settings.hourHeight;
        const hours = Math.floor(hoursFromMidnight);
        const minutes = Math.round((hoursFromMidnight - hours) * 60 / 15) * 15; // Round to 15 min

        const startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        Logger.log('Double-clicked at:', clickedDate.toDateString(), startTime);
        this.openCreateModal(clickedDate, startTime);
    }

    // Drag selection handlers

    /**
     * Handle drag start - begin selecting time range
     */
    private handleDragStart(e: MouseEvent): void {
        // Don't start drag on entry cards
        const target = e.target as HTMLElement;
        if (target.closest('.timeline-entry-card')) {
            return;
        }

        // Only left mouse button
        if (e.button !== 0) return;

        // Prevent multiple drags - if already dragging, ignore
        if (this.isDragging) return;

        // Set dragging flag immediately to prevent race conditions
        this.isDragging = true;

        // Clean up any stale selection element (safety measure)
        if (this.selectionEl) {
            this.selectionEl.remove();
            this.selectionEl = null;
        }

        const rect = this.timelineInner.getBoundingClientRect();
        this.dragStartY = e.clientY - rect.top;
        this.dragCurrentY = this.dragStartY;

        // Calculate the date for this position
        const dayIndex = Math.floor(this.dragStartY / this.dayHeight) - this.visibleDaysBuffer;
        this.dragStartDate = new Date(this.centerDate);
        this.dragStartDate.setDate(this.dragStartDate.getDate() + dayIndex);

        // Create selection element on timelineInner (so positioning matches our Y calculations)
        this.selectionEl = this.timelineInner.createDiv('timeline-drag-selection');

        // Create tooltip for time feedback
        this.dragTooltipEl = this.timelineInner.createDiv('timeline-drag-tooltip');
        this.updateSelectionElement();

        e.preventDefault();
    }

    /**
     * Handle drag move - update selection visual
     */
    private handleDragMove(e: MouseEvent): void {
        if (!this.isDragging || !this.selectionEl) return;

        const rect = this.timelineInner.getBoundingClientRect();
        this.dragCurrentY = e.clientY - rect.top;
        this.updateSelectionElement();
    }

    /**
     * Handle drag end - open create modal with selected time range
     */
    private handleDragEnd(e: MouseEvent): void {
        if (!this.isDragging) return;

        const rect = this.timelineInner.getBoundingClientRect();
        const endY = e.clientY - rect.top;

        // Calculate start and end times
        const minY = Math.min(this.dragStartY, endY);
        const maxY = Math.max(this.dragStartY, endY);

        // Only open modal if drag was significant (more than ~15 min worth)
        const minDrag = this.settings.hourHeight / 4; // 15 minutes
        if (maxY - minY < minDrag) {
            this.cleanupDrag();
            return;
        }

        // Calculate date and times from Y positions
        const dayIndex = Math.floor(minY / this.dayHeight) - this.visibleDaysBuffer;
        const clickedDate = new Date(this.centerDate);
        clickedDate.setDate(clickedDate.getDate() + dayIndex);

        // Calculate times within the day
        const dayTopY = (dayIndex + this.visibleDaysBuffer) * this.dayHeight;
        const startYInDay = minY - dayTopY;
        const endYInDay = maxY - dayTopY;

        const startHours = startYInDay / this.settings.hourHeight;
        const endHours = endYInDay / this.settings.hourHeight;

        // Round to nearest 15 minutes
        const startTime = this.roundToTimeString(startHours);
        const endTime = this.roundToTimeString(endHours);

        Logger.log('Drag selection:', clickedDate.toDateString(), startTime, '-', endTime);

        this.cleanupDrag();
        this.openCreateModalWithRange(clickedDate, startTime, endTime);
    }

    /**
     * Handle drag cancel (mouse leaves container)
     */
    private handleDragCancel(_e: MouseEvent): void {
        if (this.isDragging) {
            this.cleanupDrag();
        }
    }

    /**
     * Update the visual selection element position and tooltip
     */
    private updateSelectionElement(): void {
        if (!this.selectionEl) return;

        const minY = Math.min(this.dragStartY, this.dragCurrentY);
        const maxY = Math.max(this.dragStartY, this.dragCurrentY);
        const height = Math.max(maxY - minY, 10); // Minimum height for visibility

        this.selectionEl.style.top = `${minY}px`;
        this.selectionEl.style.height = `${height}px`;

        // Update tooltip with time range
        if (this.dragTooltipEl) {
            // Calculate times from Y positions
            const dayIndex = Math.floor(minY / this.dayHeight) - this.visibleDaysBuffer;
            const dayTopY = (dayIndex + this.visibleDaysBuffer) * this.dayHeight;
            const startYInDay = minY - dayTopY;
            const endYInDay = maxY - dayTopY;

            const startHours = startYInDay / this.settings.hourHeight;
            const endHours = endYInDay / this.settings.hourHeight;

            const startTime = this.roundToTimeString(startHours);
            const endTime = this.roundToTimeString(endHours);

            this.dragTooltipEl.setText(`${startTime} – ${endTime}`);
            // Position tooltip near the bottom of selection, offset to the right
            this.dragTooltipEl.style.top = `${maxY + 8}px`;
        }
    }

    /**
     * Clean up drag state and selection element
     */
    private cleanupDrag(): void {
        this.isDragging = false;
        if (this.selectionEl) {
            this.selectionEl.remove();
            this.selectionEl = null;
        }
        if (this.dragTooltipEl) {
            this.dragTooltipEl.remove();
            this.dragTooltipEl = null;
        }
        this.dragStartDate = null;
    }

    /**
     * Convert hours (decimal) to HH:mm string, rounded to 15 min
     */
    private roundToTimeString(hours: number): string {
        const totalMinutes = Math.round(hours * 60 / 15) * 15;
        const h = Math.floor(totalMinutes / 60) % 24;
        const m = totalMinutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    /**
     * Open create modal with pre-filled start and end times
     */
    private openCreateModalWithRange(date: Date, startTime: string, endTime: string): void {
        Logger.log('Opening create modal with range:', date, startTime, '-', endTime);
        const data: EntryModalData = {
            mode: 'create',
            date,
            startTime,
            endTime,
        };

        const modal = new EntryModal(
            this.app,
            this.settings,
            this.dataManager,
            data,
            () => this.refresh()
        );
        modal.open();
    }
}

/**
 * Confirmation modal for deleting an entry
 */
class ConfirmDeleteModal extends Modal {
    private entry: TimeEntry;
    private onConfirm: () => Promise<void>;

    constructor(app: App, entry: TimeEntry, onConfirm: () => Promise<void>) {
        super(app);
        this.entry = entry;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('time-tracker-confirm-delete');

        contentEl.createEl('h2', { text: 'Delete Entry' });

        // Show entry details
        const details = contentEl.createDiv('delete-entry-details');
        details.createEl('p', {
            text: `${this.entry.start} – ${this.entry.end}`,
            cls: 'delete-entry-time',
        });
        if (this.entry.description) {
            details.createEl('p', {
                text: this.entry.description,
                cls: 'delete-entry-desc',
            });
        }

        contentEl.createEl('p', {
            text: 'Are you sure you want to delete this entry? This cannot be undone.',
            cls: 'delete-confirm-message',
        });

        // Buttons
        const buttonContainer = contentEl.createDiv('delete-button-container');

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const deleteBtn = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning',
        });
        deleteBtn.addEventListener('click', async () => {
            await this.onConfirm();
            this.close();
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
