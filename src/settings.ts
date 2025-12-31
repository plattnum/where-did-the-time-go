import { App, PluginSettingTab, Setting } from 'obsidian';
import type { TimeTrackerSettings, Project } from './types';
import type WhereDidTheTimeGoPlugin from '../main';

export class TimeTrackerSettingTab extends PluginSettingTab {
    plugin: WhereDidTheTimeGoPlugin;

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

        // Timeline Display Settings
        containerEl.createEl('h2', { text: 'Timeline Display' });

        new Setting(containerEl)
            .setName('Hour height')
            .setDesc('Height in pixels for each hour in the timeline view')
            .addSlider(slider => slider
                .setLimits(40, 120, 10)
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
            .setName('Show description')
            .setDesc('Show entry descriptions in timeline cards')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDescription)
                .onChange(async (value) => {
                    this.plugin.settings.showDescription = value;
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

        // Projects Section
        containerEl.createEl('h2', { text: 'Projects' });

        new Setting(containerEl)
            .setName('Default project')
            .setDesc('Pre-selected project when creating new entries')
            .addDropdown(dropdown => {
                dropdown.addOption('', '(None)');
                this.plugin.settings.projects
                    .filter(p => !p.archived)
                    .forEach(p => dropdown.addOption(p.id, p.name));
                dropdown.setValue(this.plugin.settings.defaultProject);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.defaultProject = value;
                    await this.plugin.saveSettings();
                });
            });

        // Project list
        const projectsContainer = containerEl.createDiv('projects-container');
        this.renderProjectsList(projectsContainer);

        // Add new project button
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Add Project')
                .setCta()
                .onClick(async () => {
                    const newProject: Project = {
                        id: `project-${Date.now()}`,
                        name: 'New Project',
                        color: this.getRandomColor(),
                        archived: false,
                    };
                    this.plugin.settings.projects.push(newProject);
                    await this.plugin.saveSettings();
                    this.renderProjectsList(projectsContainer);
                }));
    }

    private renderProjectsList(container: HTMLElement): void {
        container.empty();

        this.plugin.settings.projects.forEach((project, index) => {
            const projectSetting = new Setting(container)
                .setClass('project-setting');

            // Color picker
            projectSetting.addColorPicker(picker => picker
                .setValue(project.color)
                .onChange(async (value) => {
                    project.color = value;
                    await this.plugin.saveSettings();
                }));

            // Name input
            projectSetting.addText(text => text
                .setValue(project.name)
                .onChange(async (value) => {
                    project.name = value;
                    // Update ID to be a slug of the name
                    project.id = this.slugify(value);
                    await this.plugin.saveSettings();
                }));

            // Archive toggle
            projectSetting.addToggle(toggle => toggle
                .setTooltip(project.archived ? 'Unarchive' : 'Archive')
                .setValue(!project.archived)
                .onChange(async (value) => {
                    project.archived = !value;
                    await this.plugin.saveSettings();
                    this.renderProjectsList(container);
                }));

            // Delete button (only if not the last project)
            if (this.plugin.settings.projects.length > 1) {
                projectSetting.addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Delete project')
                    .onClick(async () => {
                        this.plugin.settings.projects.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.renderProjectsList(container);
                    }));
            }

            // Visual indicator if archived
            if (project.archived) {
                projectSetting.settingEl.addClass('is-archived');
                projectSetting.setDesc('(Archived)');
            }
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
