import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import type { Project, Activity, BillFrom, TimeTrackerSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import type WhereDidTheTimeGoPlugin from '../main';
import { ClientModal } from './modals/ClientModal';

const BILL_FROM_PREFIX = 'billFrom.';

type SettingKey = keyof TimeTrackerSettings | `billFrom.${keyof BillFrom}`;

/** Converts control values back into the stored settings shape. */
const NORMALIZERS: Partial<Record<SettingKey, (value: unknown) => unknown>> = {
    timeTrackingFolder: (value) => value || DEFAULT_SETTINGS.timeTrackingFolder,
    invoiceFolder: (value) => value || DEFAULT_SETTINGS.invoiceFolder,
    dayStartHour: (value) => parseInt(value as string),
    dayEndHour: (value) => parseInt(value as string),
    descriptionMaxLength: (value) => Math.max(0, Math.trunc(value as number) || 0),
};

export class TimeTrackerSettingTab extends PluginSettingTab {
    plugin: WhereDidTheTimeGoPlugin;
    private expandedClients: Set<string> = new Set();
    private clientsContainer: HTMLElement | null = null;

    constructor(app: App, plugin: WhereDidTheTimeGoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
        const billingEnabled = () => this.plugin.settings.enableBilling;
        const dayStartOptions: Record<string, string> = {};
        for (let i = 0; i <= 12; i++) {
            dayStartOptions[i.toString()] = `${i}:00`;
        }
        const dayEndOptions: Record<string, string> = {};
        for (let i = 18; i <= 24; i++) {
            dayEndOptions[i.toString()] = i === 24 ? '24:00 (midnight)' : `${i}:00`;
        }

        return [
            {
                type: 'group',
                heading: 'Storage',
                items: [
                    {
                        name: 'Time tracking folder',
                        desc: 'Folder where time entries will be stored (relative to vault root)',
                        control: { type: 'text', key: 'timeTrackingFolder', placeholder: 'Enter folder name' },
                    },
                    {
                        name: 'Auto-create folder',
                        desc: 'Automatically create the time tracking folder if it doesn\'t exist',
                        control: { type: 'toggle', key: 'autoCreateFolder' },
                    },
                    {
                        name: 'Hide tables in reading view',
                        desc: 'Wrap data tables in %% comment markers to hide them in reading view. Disable to see raw table data.',
                        control: { type: 'toggle', key: 'hideTablesInPreview' },
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Timeline display',
                items: [
                    {
                        name: 'Hour height',
                        desc: 'Height in pixels for each hour in the timeline view',
                        control: { type: 'slider', key: 'hourHeight', min: 200, max: 240, step: 10 },
                    },
                    {
                        name: 'Day start hour',
                        desc: 'First hour to display in the timeline (0-23)',
                        control: { type: 'dropdown', key: 'dayStartHour', options: dayStartOptions },
                    },
                    {
                        name: 'Day end hour',
                        desc: 'Last hour to display in the timeline (0-23)',
                        control: { type: 'dropdown', key: 'dayEndHour', options: dayEndOptions },
                    },
                    {
                        name: '24-hour format',
                        desc: 'Use 24-hour time format instead of 12-hour',
                        control: { type: 'toggle', key: 'use24HourFormat' },
                    },
                    {
                        name: 'Description max length',
                        desc: 'Maximum characters for entry descriptions (0 = no limit)',
                        control: { type: 'number', key: 'descriptionMaxLength', placeholder: '200', min: 0 },
                    },
                    {
                        name: 'Week start',
                        desc: 'First day of the week',
                        control: { type: 'dropdown', key: 'weekStart', options: { monday: 'Monday', sunday: 'Sunday' } },
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Billing',
                items: [
                    {
                        name: 'Enable billing and invoicing',
                        desc: 'Show client rates, billable amounts in reports, and invoice generation. Turning this off hides them without deleting any saved billing details.',
                        control: { type: 'toggle', key: 'enableBilling' },
                    },
                    {
                        name: 'Invoice folder',
                        desc: 'Folder where invoices will be saved (created automatically)',
                        visible: billingEnabled,
                        control: { type: 'text', key: 'invoiceFolder', placeholder: 'Enter folder path' },
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Bill from',
                visible: billingEnabled,
                items: [
                    {
                        name: 'Name',
                        desc: 'Your name or business name, as it appears on invoices',
                        control: { type: 'text', key: 'billFrom.name', placeholder: 'Enter name' },
                    },
                    {
                        name: 'Address',
                        desc: 'Your billing address (multi-line), as it appears on invoices',
                        control: { type: 'textarea', key: 'billFrom.address', placeholder: 'Enter address' },
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Clients',
                items: [
                    {
                        name: 'Add client',
                        desc: this.plugin.settings.enableBilling
                            ? 'Define clients for billing. Projects can be assigned to clients for invoicing.'
                            : 'Define clients to group your time. Projects and activities belong to a client.',
                        aliases: ['Projects', 'Activities'],
                        render: (setting) => {
                            setting.addButton(button => button
                                .setButtonText('Add client')
                                .setCta()
                                .onClick(() => this.openNewClientModal()));
                        },
                    },
                    {
                        // The client cards are custom UI, so this row only hosts them.
                        name: 'Client list',
                        searchable: false,
                        render: (setting) => {
                            setting.settingEl.addClass('clients-setting-item');
                            const container = setting.settingEl.createDiv('clients-container');
                            this.clientsContainer = container;
                            this.renderClientsList(container);
                            return () => {
                                if (this.clientsContainer === container) this.clientsContainer = null;
                            };
                        },
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Developer',
                items: [
                    {
                        name: 'Debug mode',
                        desc: 'Enable verbose logging to the developer console (useful for troubleshooting)',
                        control: { type: 'toggle', key: 'debugMode' },
                    },
                ],
            },
        ];
    }

    getControlValue(key: string): unknown {
        const settings = this.plugin.settings;
        if (key.startsWith(BILL_FROM_PREFIX)) {
            return settings.billFrom[key.slice(BILL_FROM_PREFIX.length) as keyof BillFrom];
        }
        // Dropdown controls carry strings, but these settings are stored as numbers.
        if (key === 'dayStartHour' || key === 'dayEndHour') return String(settings[key]);
        return settings[key as keyof TimeTrackerSettings];
    }

    /** Saves through the plugin so views, the logger, and the data manager see the change. */
    async setControlValue(key: string, value: unknown): Promise<void> {
        const settings = this.plugin.settings;
        const normalized = NORMALIZERS[key as SettingKey]?.(value) ?? value;
        if (key.startsWith(BILL_FROM_PREFIX)) {
            settings.billFrom[key.slice(BILL_FROM_PREFIX.length) as keyof BillFrom] = normalized as string;
        } else {
            (settings as unknown as Record<string, unknown>)[key] = normalized;
        }
        await this.plugin.saveSettings();
        // Client descriptions and rate badges depend on billing, so rebuild those rows.
        if (key === 'enableBilling') this.update();
    }

    private openNewClientModal(): void {
        const modal = new ClientModal(
            this.app,
            { mode: 'create', enableBilling: this.plugin.settings.enableBilling },
            (client) => {
                this.plugin.settings.clients.push(client);
                void this.plugin.saveSettings().then(() => {
                    if (this.clientsContainer) this.renderClientsList(this.clientsContainer);
                });
            }
        );
        modal.open();
    }

    private renderClientsList(container: HTMLElement): void {
        container.empty();

        if (this.plugin.settings.clients.length === 0) {
            container.createEl('p', {
                text: this.plugin.settings.enableBilling
                    ? 'No clients defined yet. Add a client to start tracking billable time.'
                    : 'No clients defined yet. Add a client to start tracking time.',
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.clients.forEach((client, clientIndex) => {
            const isExpanded = this.expandedClients.has(client.id);

            // Client card container
            const clientCard = container.createDiv('client-card');
            if (client.archived) clientCard.addClass('is-archived');

            // Client header row (clickable to expand)
            const clientHeader = clientCard.createDiv('client-header');
            clientHeader.addEventListener('click', () => {
                if (isExpanded) {
                    this.expandedClients.delete(client.id);
                } else {
                    this.expandedClients.add(client.id);
                }
                this.renderClientsList(container);
            });

            // Expand icon
            const expandIcon = clientHeader.createSpan('client-expand-icon');
            expandIcon.setText(isExpanded ? '▼' : '▶');

            // Color dot
            const colorDot = clientHeader.createSpan('client-color-dot');
            colorDot.style.backgroundColor = client.color;

            // Client name
            clientHeader.createSpan({ text: client.name, cls: 'client-name' });

            // Rate badge (always hourly)
            if (this.plugin.settings.enableBilling) {
                const rateDisplay = `${client.currency} ${client.rate}/hr`;
                clientHeader.createSpan({ text: rateDisplay, cls: 'client-rate-badge' });
            }

            // Edit button (stops propagation)
            const editBtn = clientHeader.createEl('button', { cls: 'client-edit-btn' });
            editBtn.setText('Edit');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const modal = new ClientModal(
                    this.app,
                    { mode: 'edit', client, enableBilling: this.plugin.settings.enableBilling },
                    (updatedClient) => {
                        this.plugin.settings.clients[clientIndex] = updatedClient;
                        void this.plugin.saveSettings().then(() => {
                            this.renderClientsList(container);
                        });
                    },
                    () => {
                        // Delete client - also delete orphaned projects/activities
                        this.plugin.settings.projects = this.plugin.settings.projects.filter(
                            p => p.clientId !== client.id
                        );
                        this.plugin.settings.activities = this.plugin.settings.activities.filter(
                            a => a.clientId !== client.id
                        );
                        this.plugin.settings.clients.splice(clientIndex, 1);
                        void this.plugin.saveSettings().then(() => {
                            this.renderClientsList(container);
                        });
                    }
                );
                modal.open();
            });

            // Expanded content: Projects and Activities
            if (isExpanded) {
                const expandedContent = clientCard.createDiv('client-expanded');

                // Projects section
                const projectsSection = expandedContent.createDiv('client-section');
                const projectsHeader = projectsSection.createDiv('client-section-header');
                projectsHeader.createSpan({ text: 'Projects', cls: 'client-section-title' });

                const addProjectBtn = projectsHeader.createEl('button', { text: 'Add', cls: 'client-add-btn' });
                addProjectBtn.addEventListener('click', () => {
                    const newProject: Project = {
                        id: `project-${Date.now()}`,
                        name: 'New project',
                        color: this.getRandomColor(),
                        archived: false,
                        clientId: client.id,
                    };
                    this.plugin.settings.projects.push(newProject);
                    void this.plugin.saveSettings().then(() => {
                        this.renderClientsList(container);
                    });
                });

                // List projects for this client
                const clientProjects = this.plugin.settings.projects.filter(p => p.clientId === client.id);
                if (clientProjects.length === 0) {
                    projectsSection.createEl('p', { text: 'No projects yet', cls: 'client-empty-text' });
                } else {
                    const projectsList = projectsSection.createDiv('client-items-list');
                    clientProjects.forEach((project, _projectIndex) => {
                        const actualIndex = this.plugin.settings.projects.indexOf(project);
                        this.renderProjectItem(projectsList, project, actualIndex, container);
                    });
                }

                // Activities section
                const activitiesSection = expandedContent.createDiv('client-section');
                const activitiesHeader = activitiesSection.createDiv('client-section-header');
                activitiesHeader.createSpan({ text: 'Activities', cls: 'client-section-title' });

                const addActivityBtn = activitiesHeader.createEl('button', { text: 'Add', cls: 'client-add-btn' });
                addActivityBtn.addEventListener('click', () => {
                    const newActivity: Activity = {
                        id: `activity-${Date.now()}`,
                        name: 'New activity',
                        color: this.getRandomColor(),
                        clientId: client.id,
                    };
                    this.plugin.settings.activities.push(newActivity);
                    void this.plugin.saveSettings().then(() => {
                        this.renderClientsList(container);
                    });
                });

                // List activities for this client
                const clientActivities = this.plugin.settings.activities.filter(a => a.clientId === client.id);
                if (clientActivities.length === 0) {
                    activitiesSection.createEl('p', { text: 'No activities yet', cls: 'client-empty-text' });
                } else {
                    const activitiesList = activitiesSection.createDiv('client-items-list');
                    clientActivities.forEach((activity) => {
                        const actualIndex = this.plugin.settings.activities.indexOf(activity);
                        this.renderActivityItem(activitiesList, activity, actualIndex, container);
                    });
                }
            }
        });
    }

    /**
     * Render a single project item within a client
     */
    private renderProjectItem(container: HTMLElement, project: Project, index: number, parentContainer: HTMLElement): void {
        const item = container.createDiv('client-item');
        if (project.archived) item.addClass('is-archived');

        // Color picker
        const colorPicker = item.createEl('input', { type: 'color', cls: 'client-item-color' });
        colorPicker.value = project.color;
        colorPicker.addEventListener('change', () => {
            project.color = colorPicker.value;
            void this.plugin.saveSettings();
        });

        // Name input
        const nameInput = item.createEl('input', { type: 'text', cls: 'client-item-name' });
        nameInput.value = project.name;
        nameInput.addEventListener('change', () => {
            project.name = nameInput.value;
            project.id = this.slugify(nameInput.value);
            void this.plugin.saveSettings();
        });

        // Archive toggle
        const archiveBtn = item.createEl('button', {
            text: project.archived ? '↩' : '📦',
            cls: 'client-item-btn',
        });
        archiveBtn.title = project.archived ? 'Unarchive' : 'Archive';
        archiveBtn.addEventListener('click', () => {
            project.archived = !project.archived;
            void this.plugin.saveSettings().then(() => {
                this.renderClientsList(parentContainer);
            });
        });

        // Delete button
        const deleteBtn = item.createEl('button', { text: '🗑', cls: 'client-item-btn' });
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', () => {
            this.plugin.settings.projects.splice(index, 1);
            void this.plugin.saveSettings().then(() => {
                this.renderClientsList(parentContainer);
            });
        });
    }

    /**
     * Render a single activity item within a client
     */
    private renderActivityItem(container: HTMLElement, activity: Activity, index: number, parentContainer: HTMLElement): void {
        const item = container.createDiv('client-item');

        // Color picker
        const colorPicker = item.createEl('input', { type: 'color', cls: 'client-item-color' });
        colorPicker.value = activity.color;
        colorPicker.addEventListener('change', () => {
            activity.color = colorPicker.value;
            void this.plugin.saveSettings();
        });

        // Name input
        const nameInput = item.createEl('input', { type: 'text', cls: 'client-item-name' });
        nameInput.value = activity.name;
        nameInput.addEventListener('change', () => {
            activity.name = nameInput.value;
            activity.id = this.slugify(nameInput.value);
            void this.plugin.saveSettings();
        });

        // Delete button
        const deleteBtn = item.createEl('button', { text: '🗑', cls: 'client-item-btn' });
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', () => {
            this.plugin.settings.activities.splice(index, 1);
            void this.plugin.saveSettings().then(() => {
                this.renderClientsList(parentContainer);
            });
        });
    }

    private slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }

    private getRandomColor(): string {
        const colors = [
            '#4f46e5', // Indigo
            '#059669', // Emerald
            '#e11d48', // Rose
            '#f59e0b', // Amber
            '#8b5cf6', // Violet
            '#06b6d4', // Cyan
            '#84cc16', // Lime
            '#f97316', // Orange
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}
