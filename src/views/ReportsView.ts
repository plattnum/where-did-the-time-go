import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_REPORTS, TimeEntry, TimeTrackerSettings, TimeRangePreset, ProjectReport, TagReport } from '../types';
import { DataManager } from '../data/DataManager';
import { EntryParser } from '../data/EntryParser';

/**
 * Reports view showing time breakdowns by project and tag
 */
export class ReportsView extends ItemView {
    private settings: TimeTrackerSettings;
    private dataManager: DataManager;

    // Current report state
    private selectedPreset: TimeRangePreset = 'this-week';
    private customStartDate: Date | null = null;
    private customEndDate: Date | null = null;
    private projectReports: ProjectReport[] = [];
    private totalMinutes: number = 0;

    // DOM references
    private contentContainer: HTMLElement;
    private rangeSelector: HTMLElement;
    private customDateInputs: HTMLElement;
    private summaryContainer: HTMLElement;
    private reportsContainer: HTMLElement;

    // Expanded projects (for tag breakdown)
    private expandedProjects: Set<string> = new Set();

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
        return VIEW_TYPE_REPORTS;
    }

    getDisplayText(): string {
        return 'Reports';
    }

    getIcon(): string {
        return 'pie-chart';
    }

    async onOpen(): Promise<void> {
        await this.render();
        await this.loadReport();
    }

    async onClose(): Promise<void> {
        // Cleanup if needed
    }

    updateSettings(settings: TimeTrackerSettings): void {
        this.settings = settings;
        this.loadReport();
    }

    async refresh(): Promise<void> {
        await this.loadReport();
    }

    /**
     * Main render function
     */
    private async render(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('time-tracker-reports');

        // Header
        this.renderHeader(container);

        // Content container
        this.contentContainer = container.createDiv('reports-content');

        // Range selector
        this.rangeSelector = this.contentContainer.createDiv('reports-range-selector');
        this.renderRangeSelector();

        // Custom date inputs (hidden by default)
        this.customDateInputs = this.contentContainer.createDiv('reports-custom-dates');
        this.customDateInputs.style.display = 'none';
        this.renderCustomDateInputs();

        // Summary section
        this.summaryContainer = this.contentContainer.createDiv('reports-summary');

        // Reports table
        this.reportsContainer = this.contentContainer.createDiv('reports-table-container');
    }

    /**
     * Render the header
     */
    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('reports-header');

        const titleSection = header.createDiv('reports-header-title');
        titleSection.createEl('h2', { text: 'Time Reports' });

        const controls = header.createDiv('reports-header-controls');

        // Refresh button
        const refreshBtn = controls.createEl('button', {
            text: 'Refresh',
            cls: 'reports-btn',
        });
        refreshBtn.addEventListener('click', () => this.loadReport());
    }

    /**
     * Render time range preset buttons
     */
    private renderRangeSelector(): void {
        this.rangeSelector.empty();

        const presets: { value: TimeRangePreset; label: string }[] = [
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'this-week', label: 'This Week' },
            { value: 'last-week', label: 'Last Week' },
            { value: 'this-month', label: 'This Month' },
            { value: 'last-month', label: 'Last Month' },
            { value: 'custom', label: 'Custom' },
        ];

        for (const preset of presets) {
            const btn = this.rangeSelector.createEl('button', {
                text: preset.label,
                cls: `reports-range-btn ${this.selectedPreset === preset.value ? 'is-active' : ''}`,
            });
            btn.addEventListener('click', () => this.selectPreset(preset.value));
        }
    }

    /**
     * Render custom date inputs
     */
    private renderCustomDateInputs(): void {
        this.customDateInputs.empty();

        const startLabel = this.customDateInputs.createEl('label', { text: 'From: ' });
        const startInput = startLabel.createEl('input', { type: 'date' });
        if (this.customStartDate) {
            startInput.value = EntryParser.getDateString(this.customStartDate);
        }
        startInput.addEventListener('change', (e) => {
            this.customStartDate = new Date((e.target as HTMLInputElement).value);
            this.loadReport();
        });

        const endLabel = this.customDateInputs.createEl('label', { text: 'To: ' });
        const endInput = endLabel.createEl('input', { type: 'date' });
        if (this.customEndDate) {
            endInput.value = EntryParser.getDateString(this.customEndDate);
        }
        endInput.addEventListener('change', (e) => {
            this.customEndDate = new Date((e.target as HTMLInputElement).value);
            this.loadReport();
        });
    }

    /**
     * Select a time range preset
     */
    private selectPreset(preset: TimeRangePreset): void {
        this.selectedPreset = preset;
        this.renderRangeSelector();

        // Show/hide custom date inputs
        if (preset === 'custom') {
            this.customDateInputs.style.display = 'flex';
            // Set default custom range to this week if not set
            if (!this.customStartDate || !this.customEndDate) {
                const { start, end } = this.getDateRange('this-week');
                this.customStartDate = start;
                this.customEndDate = end;
                this.renderCustomDateInputs();
            }
        } else {
            this.customDateInputs.style.display = 'none';
        }

        this.loadReport();
    }

    /**
     * Get date range for a preset
     */
    private getDateRange(preset: TimeRangePreset): { start: Date; end: Date } {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (preset) {
            case 'today':
                return {
                    start: today,
                    end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
                };

            case 'yesterday': {
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                const yesterdayEnd = new Date(yesterday);
                yesterdayEnd.setHours(23, 59, 59, 999);
                return { start: yesterday, end: yesterdayEnd };
            }

            case 'this-week': {
                const dayOfWeek = today.getDay();
                const mondayOffset = this.settings.weekStart === 'monday'
                    ? (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
                    : -dayOfWeek;
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() + mondayOffset);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weekEnd.setHours(23, 59, 59, 999);
                return { start: weekStart, end: weekEnd };
            }

            case 'last-week': {
                const dayOfWeek = today.getDay();
                const mondayOffset = this.settings.weekStart === 'monday'
                    ? (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
                    : -dayOfWeek;
                const thisWeekStart = new Date(today);
                thisWeekStart.setDate(today.getDate() + mondayOffset);
                const lastWeekStart = new Date(thisWeekStart);
                lastWeekStart.setDate(thisWeekStart.getDate() - 7);
                const lastWeekEnd = new Date(lastWeekStart);
                lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
                lastWeekEnd.setHours(23, 59, 59, 999);
                return { start: lastWeekStart, end: lastWeekEnd };
            }

            case 'this-month': {
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                monthEnd.setHours(23, 59, 59, 999);
                return { start: monthStart, end: monthEnd };
            }

            case 'last-month': {
                const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                lastMonthEnd.setHours(23, 59, 59, 999);
                return { start: lastMonthStart, end: lastMonthEnd };
            }

            case 'custom': {
                const customStart = this.customStartDate || today;
                const customEnd = this.customEndDate || today;
                // Set end to end of day (23:59:59.999) so the full day is included
                const customEndEOD = new Date(customEnd);
                customEndEOD.setHours(23, 59, 59, 999);
                return { start: customStart, end: customEndEOD };
            }

            default: {
                // Set end to end of day
                const defaultEnd = new Date(today);
                defaultEnd.setHours(23, 59, 59, 999);
                return { start: today, end: defaultEnd };
            }
        }
    }

    /**
     * Load report data for the selected time range
     */
    private async loadReport(): Promise<void> {
        const { start, end } = this.getDateRange(this.selectedPreset);

        console.log('ReportsView: Loading report for', start.toDateString(), 'to', end.toDateString());

        // Load entries for the date range (includes overlapping entries)
        const entries = await this.dataManager.loadDateRange(start, end);

        console.log('ReportsView: Found', entries.length, 'entries');

        // Calculate reports with effective durations (handles midnight-spanning)
        this.calculateReports(entries, start, end);

        // Render the results
        this.renderSummary(start, end);
        this.renderReportsTable();
    }

    /**
     * Calculate project and tag reports from entries
     * Uses effective duration to handle midnight-spanning entries correctly
     */
    private calculateReports(entries: TimeEntry[], rangeStart: Date, rangeEnd: Date): void {
        // Group by project
        const projectMap = new Map<string, { minutes: number; tagMap: Map<string, number> }>();

        this.totalMinutes = 0;

        for (const entry of entries) {
            // Calculate effective duration within the query range
            // This handles midnight-spanning entries correctly
            const effectiveMinutes = this.dataManager.getEffectiveDuration(entry, rangeStart, rangeEnd);

            if (effectiveMinutes <= 0) continue;

            const projectName = entry.project || '(No Project)';

            if (!projectMap.has(projectName)) {
                projectMap.set(projectName, { minutes: 0, tagMap: new Map() });
            }

            const projectData = projectMap.get(projectName)!;
            projectData.minutes += effectiveMinutes;
            this.totalMinutes += effectiveMinutes;

            // Track tags within this project
            if (entry.tags && entry.tags.length > 0) {
                for (const tag of entry.tags) {
                    const current = projectData.tagMap.get(tag) || 0;
                    projectData.tagMap.set(tag, current + effectiveMinutes);
                }
            } else {
                // Track untagged time
                const current = projectData.tagMap.get('(No Tags)') || 0;
                projectData.tagMap.set('(No Tags)', current + effectiveMinutes);
            }
        }

        // Convert to ProjectReport array
        this.projectReports = [];

        for (const [projectName, data] of projectMap) {
            const projectColor = this.getProjectColor(projectName);
            const percentage = this.totalMinutes > 0
                ? (data.minutes / this.totalMinutes) * 100
                : 0;

            // Build tag breakdown
            const tagBreakdown: TagReport[] = [];
            for (const [tagName, tagMinutes] of data.tagMap) {
                const tagColor = this.getTagColor(tagName);
                tagBreakdown.push({
                    tag: tagName,
                    color: tagColor,
                    totalMinutes: tagMinutes,
                    percentageOfProject: data.minutes > 0
                        ? (tagMinutes / data.minutes) * 100
                        : 0,
                });
            }

            // Sort tags by time descending
            tagBreakdown.sort((a, b) => b.totalMinutes - a.totalMinutes);

            this.projectReports.push({
                project: projectName,
                color: projectColor,
                totalMinutes: data.minutes,
                percentage,
                tagBreakdown,
            });
        }

        // Sort projects by time descending
        this.projectReports.sort((a, b) => b.totalMinutes - a.totalMinutes);
    }

    /**
     * Render the summary section
     */
    private renderSummary(start: Date, end: Date): void {
        this.summaryContainer.empty();

        // Date range label
        const rangeLabel = this.summaryContainer.createDiv('reports-range-label');
        rangeLabel.setText(this.formatDateRange(start, end));

        // Total hours
        const totalCard = this.summaryContainer.createDiv('reports-total-card');
        const totalHours = this.totalMinutes / 60;
        totalCard.createDiv({ text: 'Total Time', cls: 'reports-total-label' });
        totalCard.createDiv({ text: this.formatDuration(this.totalMinutes), cls: 'reports-total-value' });

        // Project count
        const projectCard = this.summaryContainer.createDiv('reports-summary-card');
        projectCard.createDiv({ text: 'Projects', cls: 'reports-summary-label' });
        projectCard.createDiv({ text: String(this.projectReports.length), cls: 'reports-summary-value' });
    }

    /**
     * Render the reports table
     */
    private renderReportsTable(): void {
        this.reportsContainer.empty();

        if (this.projectReports.length === 0) {
            this.reportsContainer.createDiv({
                text: 'No time entries found for this period.',
                cls: 'reports-empty',
            });
            return;
        }

        const table = this.reportsContainer.createEl('table', { cls: 'reports-table' });

        // Header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Project' });
        headerRow.createEl('th', { text: 'Hours', cls: 'reports-col-hours' });
        headerRow.createEl('th', { text: '%', cls: 'reports-col-percent' });
        headerRow.createEl('th', { text: '', cls: 'reports-col-bar' });

        // Body
        const tbody = table.createEl('tbody');

        for (const report of this.projectReports) {
            // Project row
            const row = tbody.createEl('tr', { cls: 'reports-project-row' });
            row.addEventListener('click', () => this.toggleProjectExpand(report.project));

            // Project name with color indicator
            const nameCell = row.createEl('td', { cls: 'reports-project-name' });
            const colorDot = nameCell.createSpan('reports-color-dot');
            colorDot.style.backgroundColor = report.color;

            const expandIcon = nameCell.createSpan('reports-expand-icon');
            expandIcon.setText(this.expandedProjects.has(report.project) ? '▼' : '▶');

            nameCell.createSpan({ text: report.project });

            // Hours
            row.createEl('td', {
                text: this.formatDuration(report.totalMinutes),
                cls: 'reports-col-hours',
            });

            // Percentage
            row.createEl('td', {
                text: `${report.percentage.toFixed(1)}%`,
                cls: 'reports-col-percent',
            });

            // Visual bar
            const barCell = row.createEl('td', { cls: 'reports-col-bar' });
            const bar = barCell.createDiv('reports-bar');
            bar.style.width = `${report.percentage}%`;
            bar.style.backgroundColor = report.color;

            // Tag breakdown rows (if expanded)
            if (this.expandedProjects.has(report.project)) {
                for (const tagReport of report.tagBreakdown) {
                    const tagRow = tbody.createEl('tr', { cls: 'reports-tag-row' });

                    // Tag name (indented)
                    const tagNameCell = tagRow.createEl('td', { cls: 'reports-tag-name' });
                    if (tagReport.color) {
                        const tagDot = tagNameCell.createSpan('reports-color-dot');
                        tagDot.style.backgroundColor = tagReport.color;
                    }
                    tagNameCell.createSpan({ text: `#${tagReport.tag}` });

                    // Hours
                    tagRow.createEl('td', {
                        text: this.formatDuration(tagReport.totalMinutes),
                        cls: 'reports-col-hours',
                    });

                    // Percentage (of project)
                    tagRow.createEl('td', {
                        text: `${tagReport.percentageOfProject.toFixed(1)}%`,
                        cls: 'reports-col-percent',
                    });

                    // Visual bar (relative to project)
                    const tagBarCell = tagRow.createEl('td', { cls: 'reports-col-bar' });
                    const tagBar = tagBarCell.createDiv('reports-bar reports-bar-tag');
                    tagBar.style.width = `${tagReport.percentageOfProject}%`;
                    tagBar.style.backgroundColor = tagReport.color || '#666';
                }
            }
        }
    }

    /**
     * Toggle project expansion to show/hide tag breakdown
     */
    private toggleProjectExpand(project: string): void {
        if (this.expandedProjects.has(project)) {
            this.expandedProjects.delete(project);
        } else {
            this.expandedProjects.add(project);
        }
        this.renderReportsTable();
    }

    // Helper methods

    private formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours === 0) return `${mins}m`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h ${mins}m`;
    }

    private formatDateRange(start: Date, end: Date): string {
        const sameDay = start.toDateString() === end.toDateString();
        const options: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        };

        if (sameDay) {
            return start.toLocaleDateString(undefined, options);
        }

        return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, options)}`;
    }

    private getProjectColor(projectName: string): string {
        if (projectName === '(No Project)') return '#666';
        const project = this.settings.projects.find(p => p.name === projectName || p.id === projectName);
        return project?.color || '#4f46e5';
    }

    private getTagColor(tagName: string): string | undefined {
        if (tagName === '(No Tags)') return undefined;
        const tag = this.settings.tags.find(t => t.name === tagName || t.id === tagName);
        return tag?.color;
    }
}
