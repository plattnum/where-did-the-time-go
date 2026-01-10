import { App, PluginSettingTab, Setting } from 'obsidian';
import type { TimeTrackerSettings, Project, Activity, Client } from './types';
import type WhereDidTheTimeGoPlugin from '../main';
import { ClientModal } from './modals/ClientModal';

export class TimeTrackerSettingTab extends PluginSettingTab {
    plugin: WhereDidTheTimeGoPlugin;
    private expandedClients: Set<string> = new Set();

    constructor(app: App, plugin: WhereDidTheTimeGoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Where Did The Time Go?' });
        containerEl.createEl('p', {
            text: 'Configure your time tracking settings.',
            cls: 'setting-item-description'
        });

        // Storage Settings
        containerEl.createEl('h2', { text: 'Storage' });

        new Setting(containerEl)
            .setName('Time tracking folder')
            .setDesc('Folder where time entries will be stored (relative to vault root)')
            .addText(text => text
                .setPlaceholder('TimeTracking')
                .setValue(this.plugin.settings.timeTrackingFolder)
                .onChange(async (value) => {
                    this.plugin.settings.timeTrackingFolder = value || 'TimeTracking';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-create folder')
            .setDesc('Automatically create the time tracking folder if it doesn\'t exist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCreateFolder)
                .onChange(async (value) => {
                    this.plugin.settings.autoCreateFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Hide tables in reading view')
            .setDesc('Wrap data tables in %% comment markers to hide them in reading view. Disable to see raw table data.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideTablesInPreview)
                .onChange(async (value) => {
                    this.plugin.settings.hideTablesInPreview = value;
                    await this.plugin.saveSettings();
                }));

        // Timeline Display Settings
        containerEl.createEl('h2', { text: 'Timeline Display' });

        new Setting(containerEl)
            .setName('Hour height')
            .setDesc('Height in pixels for each hour in the timeline view')
            .addSlider(slider => slider
                .setLimits(200, 240, 10)
                .setValue(this.plugin.settings.hourHeight)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.hourHeight = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Day start hour')
            .setDesc('First hour to display in the timeline (0-23)')
            .addDropdown(dropdown => {
                for (let i = 0; i <= 12; i++) {
                    dropdown.addOption(i.toString(), `${i}:00`);
                }
                dropdown.setValue(this.plugin.settings.dayStartHour.toString());
                dropdown.onChange(async (value) => {
                    this.plugin.settings.dayStartHour = parseInt(value);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Day end hour')
            .setDesc('Last hour to display in the timeline (0-23)')
            .addDropdown(dropdown => {
                for (let i = 18; i <= 24; i++) {
                    dropdown.addOption(i.toString(), i === 24 ? '24:00 (midnight)' : `${i}:00`);
                }
                dropdown.setValue(this.plugin.settings.dayEndHour.toString());
                dropdown.onChange(async (value) => {
                    this.plugin.settings.dayEndHour = parseInt(value);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('24-hour format')
            .setDesc('Use 24-hour time format (e.g., 14:00) instead of 12-hour (e.g., 2:00 PM)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.use24HourFormat)
                .onChange(async (value) => {
                    this.plugin.settings.use24HourFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Description max length')
            .setDesc('Maximum characters for entry descriptions (0 = no limit)')
            .addText(text => text
                .setValue(this.plugin.settings.descriptionMaxLength.toString())
                .setPlaceholder('200')
                .onChange(async (value) => {
                    const num = parseInt(value) || 0;
                    this.plugin.settings.descriptionMaxLength = Math.max(0, num);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Week start')
            .setDesc('First day of the week')
            .addDropdown(dropdown => dropdown
                .addOption('monday', 'Monday')
                .addOption('sunday', 'Sunday')
                .setValue(this.plugin.settings.weekStart)
                .onChange(async (value: 'monday' | 'sunday') => {
                    this.plugin.settings.weekStart = value;
                    await this.plugin.saveSettings();
                }));

        // Bill From Section (for invoices)
        containerEl.createEl('h2', { text: 'Bill From' });
        containerEl.createEl('p', {
            text: 'Your billing information that appears on invoices.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Name')
            .setDesc('Your name or business name')
            .addText(text => text
                .setPlaceholder('Your Name / Business Name')
                .setValue(this.plugin.settings.billFrom.name)
                .onChange(async (value) => {
                    this.plugin.settings.billFrom.name = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Address')
            .setDesc('Your billing address (multi-line)')
            .addTextArea(textarea => textarea
                .setPlaceholder('123 Main Street\nCity, State 12345\nCountry')
                .setValue(this.plugin.settings.billFrom.address)
                .onChange(async (value) => {
                    this.plugin.settings.billFrom.address = value;
                    await this.plugin.saveSettings();
                }));

        // Clients Section
        containerEl.createEl('h2', { text: 'Clients' });
        containerEl.createEl('p', {
            text: 'Define clients for billing. Projects can be assigned to clients for invoicing.',
            cls: 'setting-item-description'
        });

        // Client list
        const clientsContainer = containerEl.createDiv('clients-container');
        this.renderClientsList(clientsContainer);

        // Add new client button
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Add Client')
                .setCta()
                .onClick(() => {
                    const modal = new ClientModal(
                        this.app,
                        { mode: 'create' },
                        async (client) => {
                            this.plugin.settings.clients.push(client);
                            await this.plugin.saveSettings();
                            this.renderClientsList(clientsContainer);
                        }
                    );
                    modal.open();
                }));

        // Developer Settings
        containerEl.createEl('h2', { text: 'Developer' });

        new Setting(containerEl)
            .setName('Debug mode')
            .setDesc('Enable verbose logging to the developer console (useful for troubleshooting)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));
    }

    private renderClientsList(container: HTMLElement): void {
        container.empty();

        if (this.plugin.settings.clients.length === 0) {
            container.createEl('p', {
                text: 'No clients defined yet. Add a client to start tracking billable time.',
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

            // Rate badge
            const rateDisplay = client.rateType === 'hourly'
                ? `${client.currency} ${client.rate}/hr`
                : `${client.currency} ${client.rate}/day`;
            clientHeader.createSpan({ text: rateDisplay, cls: 'client-rate-badge' });

            // Edit button (stops propagation)
            const editBtn = clientHeader.createEl('button', { cls: 'client-edit-btn' });
            editBtn.setText('Edit');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const modal = new ClientModal(
                    this.app,
                    { mode: 'edit', client },
                    async (updatedClient) => {
                        this.plugin.settings.clients[clientIndex] = updatedClient;
                        await this.plugin.saveSettings();
                        this.renderClientsList(container);
                    },
                    async () => {
                        // Delete client - also delete orphaned projects/activities
                        this.plugin.settings.projects = this.plugin.settings.projects.filter(
                            p => p.clientId !== client.id
                        );
                        this.plugin.settings.activities = this.plugin.settings.activities.filter(
                            a => a.clientId !== client.id
                        );
                        this.plugin.settings.clients.splice(clientIndex, 1);
                        await this.plugin.saveSettings();
                        this.renderClientsList(container);
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

                const addProjectBtn = projectsHeader.createEl('button', { text: '+ Add', cls: 'client-add-btn' });
                addProjectBtn.addEventListener('click', async () => {
                    const newProject: Project = {
                        id: `project-${Date.now()}`,
                        name: 'New Project',
                        color: this.getRandomColor(),
                        archived: false,
                        clientId: client.id,
                    };
                    this.plugin.settings.projects.push(newProject);
                    await this.plugin.saveSettings();
                    this.renderClientsList(container);
                });

                // List projects for this client
                const clientProjects = this.plugin.settings.projects.filter(p => p.clientId === client.id);
                if (clientProjects.length === 0) {
                    projectsSection.createEl('p', { text: 'No projects yet', cls: 'client-empty-text' });
                } else {
                    const projectsList = projectsSection.createDiv('client-items-list');
                    clientProjects.forEach((project, projectIndex) => {
                        const actualIndex = this.plugin.settings.projects.indexOf(project);
                        this.renderProjectItem(projectsList, project, actualIndex, container);
                    });
                }

                // Activities section
                const activitiesSection = expandedContent.createDiv('client-section');
                const activitiesHeader = activitiesSection.createDiv('client-section-header');
                activitiesHeader.createSpan({ text: 'Activities', cls: 'client-section-title' });

                const addActivityBtn = activitiesHeader.createEl('button', { text: '+ Add', cls: 'client-add-btn' });
                addActivityBtn.addEventListener('click', async () => {
                    const newActivity: Activity = {
                        id: `activity-${Date.now()}`,
                        name: 'New Activity',
                        color: this.getRandomColor(),
                        clientId: client.id,
                    };
                    this.plugin.settings.activities.push(newActivity);
                    await this.plugin.saveSettings();
                    this.renderClientsList(container);
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
        colorPicker.addEventListener('change', async () => {
            project.color = colorPicker.value;
            await this.plugin.saveSettings();
        });

        // Name input
        const nameInput = item.createEl('input', { type: 'text', cls: 'client-item-name' });
        nameInput.value = project.name;
        nameInput.addEventListener('change', async () => {
            project.name = nameInput.value;
            project.id = this.slugify(nameInput.value);
            await this.plugin.saveSettings();
        });

        // Archive toggle
        const archiveBtn = item.createEl('button', {
            text: project.archived ? '↩' : '📦',
            cls: 'client-item-btn',
        });
        archiveBtn.title = project.archived ? 'Unarchive' : 'Archive';
        archiveBtn.addEventListener('click', async () => {
            project.archived = !project.archived;
            await this.plugin.saveSettings();
            this.renderClientsList(parentContainer);
        });

        // Delete button
        const deleteBtn = item.createEl('button', { text: '🗑', cls: 'client-item-btn' });
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            this.plugin.settings.projects.splice(index, 1);
            await this.plugin.saveSettings();
            this.renderClientsList(parentContainer);
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
        colorPicker.addEventListener('change', async () => {
            activity.color = colorPicker.value;
            await this.plugin.saveSettings();
        });

        // Name input
        const nameInput = item.createEl('input', { type: 'text', cls: 'client-item-name' });
        nameInput.value = activity.name;
        nameInput.addEventListener('change', async () => {
            activity.name = nameInput.value;
            activity.id = this.slugify(nameInput.value);
            await this.plugin.saveSettings();
        });

        // Delete button
        const deleteBtn = item.createEl('button', { text: '🗑', cls: 'client-item-btn' });
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            this.plugin.settings.activities.splice(index, 1);
            await this.plugin.saveSettings();
            this.renderClientsList(parentContainer);
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
