import { App, PluginSettingTab, Setting } from 'obsidian';
import type { TimeTrackerSettings, Project, Tag, Activity } from './types';
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

        // Tags Section
        containerEl.createEl('h2', { text: 'Tags' });
        containerEl.createEl('p', {
            text: 'Define predefined tags for quick selection when creating entries.',
            cls: 'setting-item-description'
        });

        // Tag list
        const tagsContainer = containerEl.createDiv('tags-container');
        this.renderTagsList(tagsContainer);

        // Add new tag button
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Add Tag')
                .setCta()
                .onClick(async () => {
                    const newTag: Tag = {
                        id: `tag-${Date.now()}`,
                        name: 'new-tag',
                        color: this.getRandomColor(),
                    };
                    this.plugin.settings.tags.push(newTag);
                    await this.plugin.saveSettings();
                    this.renderTagsList(tagsContainer);
                }));

        // Activities Section
        containerEl.createEl('h2', { text: 'Activities' });
        containerEl.createEl('p', {
            text: 'Define activity types to classify your work (e.g., feat, fix, meeting). Each entry can have one activity.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Default activity')
            .setDesc('Pre-selected activity when creating new entries')
            .addDropdown(dropdown => {
                dropdown.addOption('', '(None)');
                this.plugin.settings.activities.forEach(a => dropdown.addOption(a.id, a.name));
                dropdown.setValue(this.plugin.settings.defaultActivity);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.defaultActivity = value;
                    await this.plugin.saveSettings();
                });
            });

        // Activity list
        const activitiesContainer = containerEl.createDiv('activities-container');
        this.renderActivitiesList(activitiesContainer);

        // Add new activity button
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Add Activity')
                .setCta()
                .onClick(async () => {
                    const newActivity: Activity = {
                        id: `activity-${Date.now()}`,
                        name: 'New Activity',
                        color: this.getRandomColor(),
                    };
                    this.plugin.settings.activities.push(newActivity);
                    await this.plugin.saveSettings();
                    this.renderActivitiesList(activitiesContainer);
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

    private renderTagsList(container: HTMLElement): void {
        container.empty();

        if (this.plugin.settings.tags.length === 0) {
            container.createEl('p', {
                text: 'No tags defined yet. Add tags to quickly select them when creating entries.',
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.tags.forEach((tag, index) => {
            const tagSetting = new Setting(container)
                .setClass('tag-setting');

            // Color picker (optional)
            tagSetting.addColorPicker(picker => picker
                .setValue(tag.color || '#808080')
                .onChange(async (value) => {
                    tag.color = value;
                    await this.plugin.saveSettings();
                }));

            // Name input
            tagSetting.addText(text => text
                .setValue(tag.name)
                .setPlaceholder('tag-name')
                .onChange(async (value) => {
                    // Slugify the tag name
                    tag.name = this.slugify(value) || 'tag';
                    tag.id = tag.name;
                    await this.plugin.saveSettings();
                }));

            // Delete button
            tagSetting.addExtraButton(button => button
                .setIcon('trash')
                .setTooltip('Delete tag')
                .onClick(async () => {
                    this.plugin.settings.tags.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.renderTagsList(container);
                }));
        });
    }

    private renderActivitiesList(container: HTMLElement): void {
        container.empty();

        if (this.plugin.settings.activities.length === 0) {
            container.createEl('p', {
                text: 'No activities defined yet. Add activities to classify your work.',
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.activities.forEach((activity, index) => {
            const activitySetting = new Setting(container)
                .setClass('activity-setting');

            // Color picker
            activitySetting.addColorPicker(picker => picker
                .setValue(activity.color)
                .onChange(async (value) => {
                    activity.color = value;
                    await this.plugin.saveSettings();
                }));

            // Name input
            activitySetting.addText(text => text
                .setValue(activity.name)
                .setPlaceholder('Activity name')
                .onChange(async (value) => {
                    activity.name = value || 'Activity';
                    activity.id = this.slugify(value) || `activity-${Date.now()}`;
                    await this.plugin.saveSettings();
                }));

            // Delete button
            activitySetting.addExtraButton(button => button
                .setIcon('trash')
                .setTooltip('Delete activity')
                .onClick(async () => {
                    this.plugin.settings.activities.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.renderActivitiesList(container);
                }));
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
