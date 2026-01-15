import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { VIEW_TYPE_REPORTS, TimeEntry, TimeTrackerSettings, TimeRangePreset, ProjectReport, ProjectActivityBreakdown, ActivityReport, ClientReport, Client } from '../types';
import { DataManager } from '../data/DataManager';
import { TableParser } from '../data/TableParser';
import { Logger } from '../utils/Logger';
import { InvoiceModal, InvoiceModalData } from '../modals/InvoiceModal';
import { InvoiceGenerator } from '../invoice/InvoiceGenerator';

/** Maximum days allowed for report range to prevent performance issues */
const MAX_REPORT_DAYS = 90;

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
    private activityReports: ActivityReport[] = [];
    private clientReports: ClientReport[] = [];
    private totalMinutes: number = 0;

    // Store current entries and date range for invoice generation
    private currentEntries: TimeEntry[] = [];
    private currentRangeStart: Date | null = null;
    private currentRangeEnd: Date | null = null;

    // DOM references
    private contentContainer: HTMLElement;
    private rangeSelector: HTMLElement;
    private customDateInputs: HTMLElement;
    private summaryContainer: HTMLElement;
    private reportsContainer: HTMLElement;
    private activityContainer: HTMLElement;
    private clientContainer: HTMLElement;

    // Expanded clients (for project breakdown)
    private expandedClients: Set<string> = new Set();
    // Expanded projects within clients (key: "clientId:projectName")
    private expandedClientProjects: Set<string> = new Set();

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

        // Reports table (By Project)
        this.reportsContainer = this.contentContainer.createDiv('reports-table-container');

        // Activity breakdown section
        this.activityContainer = this.contentContainer.createDiv('reports-table-container');

        // Client breakdown section
        this.clientContainer = this.contentContainer.createDiv('reports-table-container');
    }

    /**
     * Render the header
     */
    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('reports-header');

        const titleSection = header.createDiv('reports-header-title');
        titleSection.createEl('h2', { text: 'Time reports' });

        const controls = header.createDiv('reports-header-controls');

        // Export CSV button
        const exportCsvBtn = controls.createEl('button', {
            text: 'Export CSV',
            cls: 'reports-btn',
        });
        exportCsvBtn.addEventListener('click', () => this.exportToCSV());

        // Export JSON button
        const exportJsonBtn = controls.createEl('button', {
            text: 'Export JSON',
            cls: 'reports-btn',
        });
        exportJsonBtn.addEventListener('click', () => this.exportToJSON());

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
            startInput.value = TableParser.getDateString(this.customStartDate);
        }
        startInput.addEventListener('change', (e) => {
            this.customStartDate = new Date((e.target as HTMLInputElement).value);
            this.loadReport();
        });

        const endLabel = this.customDateInputs.createEl('label', { text: 'To: ' });
        const endInput = endLabel.createEl('input', { type: 'date' });
        if (this.customEndDate) {
            endInput.value = TableParser.getDateString(this.customEndDate);
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

        // Check if range exceeds maximum
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > MAX_REPORT_DAYS) {
            new Notice(`Report range limited to ${MAX_REPORT_DAYS} days for performance. Please select a shorter range.`);
            return;
        }

        Logger.log('ReportsView: Loading report for', start.toDateString(), 'to', end.toDateString());

        // Load entries for the date range (includes overlapping entries)
        const entries = await this.dataManager.loadDateRange(start, end);

        Logger.log('ReportsView: Found', entries.length, 'entries');

        // Store for invoice generation
        this.currentEntries = entries;
        this.currentRangeStart = start;
        this.currentRangeEnd = end;

        // Calculate reports with effective durations (handles midnight-spanning)
        this.calculateReports(entries, start, end);
        this.calculateActivityReports(entries, start, end);
        this.calculateClientReports(entries, start, end);

        // Render the results
        this.renderSummary(start, end);
        this.renderClientTable();
    }

    /**
     * Calculate project and activity reports from entries
     * Uses effective duration to handle midnight-spanning entries correctly
     */
    private calculateReports(entries: TimeEntry[], rangeStart: Date, rangeEnd: Date): void {
        // Group by project, with activity breakdown within each project
        const projectMap = new Map<string, { minutes: number; activityMap: Map<string, number> }>();

        this.totalMinutes = 0;

        for (const entry of entries) {
            // Calculate effective duration within the query range
            // This handles midnight-spanning entries correctly
            const effectiveMinutes = this.dataManager.getEffectiveDuration(entry, rangeStart, rangeEnd);

            if (effectiveMinutes <= 0) continue;

            const projectName = entry.project || '(No Project)';

            if (!projectMap.has(projectName)) {
                projectMap.set(projectName, { minutes: 0, activityMap: new Map() });
            }

            const projectData = projectMap.get(projectName)!;
            projectData.minutes += effectiveMinutes;
            this.totalMinutes += effectiveMinutes;

            // Track activity within this project (mutually exclusive - each entry has 0 or 1 activity)
            const activityName = entry.activity || '(No Activity)';
            const current = projectData.activityMap.get(activityName) || 0;
            projectData.activityMap.set(activityName, current + effectiveMinutes);
        }

        // Convert to ProjectReport array
        this.projectReports = [];

        for (const [projectName, data] of projectMap) {
            const projectColor = this.getProjectColor(projectName);
            const percentage = this.totalMinutes > 0
                ? (data.minutes / this.totalMinutes) * 100
                : 0;

            // Build activity breakdown (percentages add up to 100% since activities are mutually exclusive)
            const activityBreakdown: ProjectActivityBreakdown[] = [];
            for (const [activityName, activityMinutes] of data.activityMap) {
                const activityColor = this.getActivityColor(activityName);
                activityBreakdown.push({
                    activity: activityName,
                    color: activityColor,
                    totalMinutes: activityMinutes,
                    percentageOfProject: data.minutes > 0
                        ? (activityMinutes / data.minutes) * 100
                        : 0,
                });
            }

            // Sort activities by time descending
            activityBreakdown.sort((a, b) => b.totalMinutes - a.totalMinutes);

            this.projectReports.push({
                project: projectName,
                color: projectColor,
                totalMinutes: data.minutes,
                percentage,
                activityBreakdown,
            });
        }

        // Sort projects by time descending
        this.projectReports.sort((a, b) => b.totalMinutes - a.totalMinutes);
    }

    /**
     * Calculate activity reports from entries
     * Activities are mutually exclusive so percentages add up to 100%
     */
    private calculateActivityReports(entries: TimeEntry[], rangeStart: Date, rangeEnd: Date): void {
        const activityMap = new Map<string, number>();

        for (const entry of entries) {
            // Calculate effective duration within the query range
            const effectiveMinutes = this.dataManager.getEffectiveDuration(entry, rangeStart, rangeEnd);

            if (effectiveMinutes <= 0) continue;

            const activityName = entry.activity || '(No Activity)';

            const current = activityMap.get(activityName) || 0;
            activityMap.set(activityName, current + effectiveMinutes);
        }

        // Convert to ActivityReport array
        this.activityReports = [];

        for (const [activityName, minutes] of activityMap) {
            const activityColor = this.getActivityColor(activityName);
            const percentage = this.totalMinutes > 0
                ? (minutes / this.totalMinutes) * 100
                : 0;

            this.activityReports.push({
                activity: activityName,
                name: activityName,
                color: activityColor,
                totalMinutes: minutes,
                percentage,
            });
        }

        // Sort activities by time descending
        this.activityReports.sort((a, b) => b.totalMinutes - a.totalMinutes);
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
        totalCard.createDiv({ text: 'Total Time', cls: 'reports-total-label' });
        totalCard.createDiv({ text: this.formatDuration(this.totalMinutes), cls: 'reports-total-value' });

        // Project count
        const projectCard = this.summaryContainer.createDiv('reports-summary-card');
        projectCard.createDiv({ text: 'Projects', cls: 'reports-summary-label' });
        projectCard.createDiv({ text: String(this.projectReports.length), cls: 'reports-summary-value' });

        // Client count
        const clientCard = this.summaryContainer.createDiv('reports-summary-card');
        clientCard.createDiv({ text: 'Clients', cls: 'reports-summary-label' });
        clientCard.createDiv({ text: String(this.clientReports.length), cls: 'reports-summary-value' });
    }

    /**
     * Calculate client reports from entries
     * Groups time by client (using entry.client directly)
     */
    private calculateClientReports(entries: TimeEntry[], rangeStart: Date, rangeEnd: Date): void {
        // Only calculate if there are clients defined
        if (this.settings.clients.length === 0) {
            this.clientReports = [];
            return;
        }

        // Map: clientId -> { minutes, projects: Map<projectName, { minutes, activities: Map<activityName, minutes> }> }
        type ProjectData = { minutes: number; activities: Map<string, number> };
        type ClientData = { minutes: number; projects: Map<string, ProjectData> };
        const clientMap = new Map<string, ClientData>();

        for (const entry of entries) {
            const effectiveMinutes = this.dataManager.getEffectiveDuration(entry, rangeStart, rangeEnd);
            if (effectiveMinutes <= 0) continue;

            const projectName = entry.project || '(No Project)';
            const activityName = entry.activity || '(No Activity)';
            const clientId = entry.client;

            if (!clientMap.has(clientId)) {
                clientMap.set(clientId, { minutes: 0, projects: new Map() });
            }

            const clientData = clientMap.get(clientId)!;
            clientData.minutes += effectiveMinutes;

            if (!clientData.projects.has(projectName)) {
                clientData.projects.set(projectName, { minutes: 0, activities: new Map() });
            }

            const projectData = clientData.projects.get(projectName)!;
            projectData.minutes += effectiveMinutes;

            const currentActivityMinutes = projectData.activities.get(activityName) || 0;
            projectData.activities.set(activityName, currentActivityMinutes + effectiveMinutes);
        }

        // Convert to ClientReport array
        this.clientReports = [];

        let totalClientMinutes = 0;
        for (const [, data] of clientMap) {
            totalClientMinutes += data.minutes;
        }

        for (const [clientId, data] of clientMap) {
            const client = this.settings.clients.find(c => c.id === clientId);
            if (!client) continue;

            const percentage = totalClientMinutes > 0
                ? (data.minutes / totalClientMinutes) * 100
                : 0;

            // Calculate billable amount (hourly rate * hours)
            const billableAmount = client.rate * (data.minutes / 60);

            // Build project breakdown with activity breakdown
            const projectBreakdown: ProjectReport[] = [];
            for (const [projectName, projectData] of data.projects) {
                const projectColor = this.getProjectColor(projectName);

                // Build activity breakdown for this project
                const activityBreakdown: ProjectActivityBreakdown[] = [];
                for (const [activityName, activityMinutes] of projectData.activities) {
                    activityBreakdown.push({
                        activity: activityName,
                        color: this.getActivityColor(activityName),
                        totalMinutes: activityMinutes,
                        percentageOfProject: projectData.minutes > 0
                            ? (activityMinutes / projectData.minutes) * 100
                            : 0,
                    });
                }
                activityBreakdown.sort((a, b) => b.totalMinutes - a.totalMinutes);

                projectBreakdown.push({
                    project: projectName,
                    color: projectColor,
                    totalMinutes: projectData.minutes,
                    percentage: data.minutes > 0 ? (projectData.minutes / data.minutes) * 100 : 0,
                    activityBreakdown,
                });
            }
            projectBreakdown.sort((a, b) => b.totalMinutes - a.totalMinutes);

            this.clientReports.push({
                clientId,
                name: client.name,
                color: client.color,
                rate: client.rate,
                currency: client.currency,
                totalMinutes: data.minutes,
                billableAmount,
                percentage,
                projectBreakdown,
            });
        }

        // Sort clients by time descending
        this.clientReports.sort((a, b) => b.totalMinutes - a.totalMinutes);
    }

    /**
     * Render the client breakdown table (Client → Project → Activity hierarchy)
     */
    private renderClientTable(): void {
        this.clientContainer.empty();

        // Only show if there are client reports
        if (this.clientReports.length === 0) {
            this.clientContainer.createDiv({
                text: 'No time entries found for this period.',
                cls: 'reports-empty',
            });
            return;
        }

        const table = this.clientContainer.createEl('table', { cls: 'reports-table' });

        // Header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Client / project / activity' });
        headerRow.createEl('th', { text: 'Hours', cls: 'reports-col-hours' });
        headerRow.createEl('th', { text: 'Billable', cls: 'reports-col-billable' });
        headerRow.createEl('th', { text: '%', cls: 'reports-col-percent' });
        headerRow.createEl('th', { text: '', cls: 'reports-col-bar' });

        // Body
        const tbody = table.createEl('tbody');

        for (const report of this.clientReports) {
            // Client row
            const row = tbody.createEl('tr', { cls: 'reports-client-row' });
            row.addEventListener('click', () => this.toggleClientExpand(report.clientId));

            const nameCell = row.createEl('td', { cls: 'reports-client-name' });
            const colorDot = nameCell.createSpan('reports-color-dot');
            colorDot.style.backgroundColor = report.color;

            const expandIcon = nameCell.createSpan('reports-expand-icon');
            expandIcon.setText(this.expandedClients.has(report.clientId) ? '▼' : '▶');

            nameCell.createSpan({ text: report.name });

            // Invoice button (show if client has tracked time)
            if (report.totalMinutes > 0) {
                const invoiceBtn = nameCell.createEl('button', {
                    text: 'Invoice',
                    cls: 'reports-invoice-btn',
                });
                invoiceBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInvoiceModal(report.clientId, report.billableAmount);
                });
            }

            row.createEl('td', {
                text: this.formatDuration(report.totalMinutes),
                cls: 'reports-col-hours',
            });

            row.createEl('td', {
                text: this.formatCurrency(report.billableAmount, report.currency),
                cls: 'reports-col-billable',
            });

            row.createEl('td', {
                text: `${report.percentage.toFixed(1)}%`,
                cls: 'reports-col-percent',
            });

            const barCell = row.createEl('td', { cls: 'reports-col-bar' });
            const bar = barCell.createDiv('reports-bar');
            bar.style.width = `${report.percentage}%`;
            bar.style.backgroundColor = report.color;

            // Project rows (if client expanded)
            if (this.expandedClients.has(report.clientId)) {
                for (const projectReport of report.projectBreakdown) {
                    const projectKey = `${report.clientId}:${projectReport.project}`;
                    const projectExpanded = this.expandedClientProjects.has(projectKey);
                    const hasActivities = projectReport.activityBreakdown.length > 0;

                    const projectRow = tbody.createEl('tr', { cls: 'reports-project-nested-row' });
                    if (hasActivities) {
                        projectRow.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.toggleProjectExpand(projectKey);
                        });
                    }

                    const projectNameCell = projectRow.createEl('td', { cls: 'reports-project-nested-name' });
                    const projectDot = projectNameCell.createSpan('reports-color-dot');
                    projectDot.style.backgroundColor = projectReport.color;

                    if (hasActivities) {
                        const projectExpandIcon = projectNameCell.createSpan('reports-expand-icon');
                        projectExpandIcon.setText(projectExpanded ? '▼' : '▶');
                    }

                    projectNameCell.createSpan({ text: projectReport.project });

                    projectRow.createEl('td', {
                        text: this.formatDuration(projectReport.totalMinutes),
                        cls: 'reports-col-hours',
                    });

                    projectRow.createEl('td', { cls: 'reports-col-billable' });

                    projectRow.createEl('td', {
                        text: `${projectReport.percentage.toFixed(1)}%`,
                        cls: 'reports-col-percent',
                    });

                    const projectBarCell = projectRow.createEl('td', { cls: 'reports-col-bar' });
                    const projectBar = projectBarCell.createDiv('reports-bar reports-bar-nested');
                    projectBar.style.width = `${projectReport.percentage}%`;
                    projectBar.style.backgroundColor = projectReport.color;

                    // Activity rows (if project expanded)
                    if (projectExpanded && hasActivities) {
                        for (const activityReport of projectReport.activityBreakdown) {
                            const activityRow = tbody.createEl('tr', { cls: 'reports-activity-nested-row' });

                            const activityNameCell = activityRow.createEl('td', { cls: 'reports-activity-nested-name' });
                            const activityDot = activityNameCell.createSpan('reports-color-dot');
                            activityDot.style.backgroundColor = activityReport.color;
                            activityNameCell.createSpan({ text: activityReport.activity });

                            activityRow.createEl('td', {
                                text: this.formatDuration(activityReport.totalMinutes),
                                cls: 'reports-col-hours',
                            });

                            activityRow.createEl('td', { cls: 'reports-col-billable' });

                            activityRow.createEl('td', {
                                text: `${activityReport.percentageOfProject.toFixed(1)}%`,
                                cls: 'reports-col-percent',
                            });

                            const activityBarCell = activityRow.createEl('td', { cls: 'reports-col-bar' });
                            const activityBar = activityBarCell.createDiv('reports-bar reports-bar-activity');
                            activityBar.style.width = `${activityReport.percentageOfProject}%`;
                            activityBar.style.backgroundColor = activityReport.color;
                        }
                    }
                }
            }
        }

        // Total row
        const totalRow = tbody.createEl('tr', { cls: 'reports-total-row' });
        totalRow.createEl('td', { text: 'Total', cls: 'reports-total-label' });

        let totalMinutes = 0;
        let totalBillable = 0;
        for (const report of this.clientReports) {
            totalMinutes += report.totalMinutes;
            totalBillable += report.billableAmount;
        }

        totalRow.createEl('td', {
            text: this.formatDuration(totalMinutes),
            cls: 'reports-col-hours',
        });

        // Use first client's currency for total (could be mixed currencies)
        const currency = this.clientReports[0]?.currency || 'USD';
        totalRow.createEl('td', {
            text: this.formatCurrency(totalBillable, currency),
            cls: 'reports-col-billable',
        });

        totalRow.createEl('td', { text: '', cls: 'reports-col-percent' });
        totalRow.createEl('td', { text: '', cls: 'reports-col-bar' });
    }

    /**
     * Toggle client expansion to show/hide project breakdown
     */
    private toggleClientExpand(clientId: string): void {
        if (this.expandedClients.has(clientId)) {
            this.expandedClients.delete(clientId);
        } else {
            this.expandedClients.add(clientId);
        }
        this.renderClientTable();
    }

    private toggleProjectExpand(projectKey: string): void {
        if (this.expandedClientProjects.has(projectKey)) {
            this.expandedClientProjects.delete(projectKey);
        } else {
            this.expandedClientProjects.add(projectKey);
        }
        this.renderClientTable();
    }

    /**
     * Open the invoice modal for a client
     */
    private openInvoiceModal(clientId: string, totalAmount: number): void {
        const client = this.settings.clients.find(c => c.id === clientId);
        if (!client) {
            new Notice('Client not found');
            return;
        }

        if (!this.currentRangeStart || !this.currentRangeEnd) {
            new Notice('No date range selected');
            return;
        }

        const modalData: InvoiceModalData = {
            client,
            periodStart: this.currentRangeStart,
            periodEnd: this.currentRangeEnd,
            totalAmount,
        };

        const modal = new InvoiceModal(
            this.app,
            modalData,
            async (result) => {
                await this.generateInvoice(client, result);
            }
        );
        modal.open();
    }

    /**
     * Generate the invoice file
     */
    private async generateInvoice(client: Client, modalResult: import('../modals/InvoiceModal').InvoiceModalResult): Promise<void> {
        if (!this.currentRangeStart || !this.currentRangeEnd) {
            new Notice('No date range selected');
            return;
        }

        try {
            const generator = new InvoiceGenerator(this.app, this.settings, this.dataManager);

            // Generate invoice data
            const invoiceData = generator.generateInvoiceData(
                this.currentEntries,
                client,
                modalResult,
                this.currentRangeStart,
                this.currentRangeEnd
            );

            // Generate markdown
            const markdown = generator.generateMarkdown(invoiceData);

            // Save to file
            const filepath = await generator.saveInvoice(invoiceData, markdown);

            new Notice(`Invoice created: ${filepath}`);

            // Open the file
            const file = this.app.vault.getAbstractFileByPath(filepath);
            if (file) {
                await this.app.workspace.getLeaf().openFile(file as import('obsidian').TFile);
            }
        } catch (error) {
            Logger.log('ReportsView: Error generating invoice', error);
            new Notice(`Error generating invoice: ${error.message}`);
        }
    }

    // Helper methods

    private formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours === 0) return `${mins}m`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h ${mins}m`;
    }

    private formatCurrency(amount: number, currency: string): string {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
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

    private getActivityColor(activityName: string): string {
        if (activityName === '(No Activity)') return '#666';
        const activity = this.settings.activities.find(a => a.name === activityName || a.id === activityName);
        return activity?.color || '#f59e0b';
    }

    /**
     * Export current report data to CSV
     */
    private async exportToCSV(): Promise<void> {
        const { start, end } = this.getDateRange(this.selectedPreset);

        // Load entries for the date range
        const entries = await this.dataManager.loadDateRange(start, end);

        if (entries.length === 0) {
            Logger.log('ReportsView: No entries to export');
            return;
        }

        // Generate CSV content
        const csv = this.generateCSV(entries);

        // Create filename with date range
        const startStr = TableParser.getDateString(start);
        const endStr = TableParser.getDateString(end);
        const filename = `time-entries-${startStr}-to-${endStr}.csv`;

        // Trigger download
        this.downloadCSV(csv, filename);
    }

    /**
     * Generate CSV content from time entries
     */
    private generateCSV(entries: TimeEntry[]): string {
        // CSV headers - Start/End include full datetime since entries can span days
        const headers = ['Start', 'End', 'Duration', 'Description', 'Client', 'Project', 'Activity', 'Notes'];

        // Sort entries by date/time
        const sorted = [...entries].sort((a, b) =>
            a.startDateTime.getTime() - b.startDateTime.getTime()
        );

        // Build rows
        const rows: string[][] = [headers];

        for (const entry of sorted) {
            // Get client name from settings
            const client = this.settings.clients.find(c => c.id === entry.client);
            const clientName = client?.name || entry.client;

            const row = [
                TableParser.formatDateTime(entry.startDateTime),
                TableParser.formatDateTime(entry.endDateTime),
                this.formatDuration(entry.durationMinutes),
                entry.description || '',
                clientName,
                entry.project || '',
                entry.activity || '',
                entry.linkedNote || '',
            ];
            rows.push(row);
        }

        // Convert to CSV string with proper escaping
        return rows.map(row =>
            row.map(cell => this.escapeCSVCell(cell)).join(',')
        ).join('\n');
    }

    /**
     * Escape a cell value for CSV format
     */
    private escapeCSVCell(value: string): string {
        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    /**
     * Trigger browser download of CSV file
     */
    private downloadCSV(content: string, filename: string): void {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        Logger.log('ReportsView: Exported CSV -', filename);
    }

    /**
     * Export current report data to JSON
     */
    private async exportToJSON(): Promise<void> {
        const { start, end } = this.getDateRange(this.selectedPreset);

        // Load entries for the date range
        const entries = await this.dataManager.loadDateRange(start, end);

        if (entries.length === 0) {
            new Notice('No entries to export');
            return;
        }

        // Generate JSON content
        const json = this.generateJSON(entries, start, end);

        // Create filename with date range
        const startStr = TableParser.getDateString(start);
        const endStr = TableParser.getDateString(end);
        const filename = `time-entries-${startStr}-to-${endStr}.json`;

        this.downloadJSON(json, filename);
    }

    /**
     * Generate JSON content from time entries
     */
    private generateJSON(entries: TimeEntry[], start: Date, end: Date): string {
        // Sort entries by date/time
        const sorted = [...entries].sort((a, b) =>
            a.startDateTime.getTime() - b.startDateTime.getTime()
        );

        // Build export object
        const exportData = {
            exportedAt: new Date().toISOString(),
            dateRange: {
                start: TableParser.getDateString(start),
                end: TableParser.getDateString(end),
            },
            totalEntries: sorted.length,
            entries: sorted.map(entry => ({
                date: entry.date,
                start: entry.start,
                end: entry.end,
                durationMinutes: entry.durationMinutes,
                description: entry.description,
                client: entry.client,
                project: entry.project || null,
                activity: entry.activity || null,
                linkedNote: entry.linkedNote || null,
            })),
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Trigger browser download of JSON file
     */
    private downloadJSON(content: string, filename: string): void {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        Logger.log('ReportsView: Exported JSON -', filename);
    }
}
