import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TimeTrackerSettings, DEFAULT_SETTINGS, VIEW_TYPE_TIMELINE } from './src/types';
import { TimeTrackerSettingTab } from './src/settings';
import { DataManager } from './src/data/DataManager';
import { TimelineView } from './src/views/TimelineView';

export default class WhereDidTheTimeGoPlugin extends Plugin {
    settings: TimeTrackerSettings;
    dataManager: DataManager;

    async onload(): Promise<void> {
        console.log('Loading Where Did The Time Go plugin');

        // Load settings
        await this.loadSettings();

        // Initialize data manager
        this.dataManager = new DataManager(this.app.vault, this.settings);

        // Register the timeline view
        this.registerView(
            VIEW_TYPE_TIMELINE,
            (leaf) => new TimelineView(leaf, this.settings, this.dataManager)
        );

        // Add ribbon icon to open timeline
        this.addRibbonIcon('clock', 'Open Timeline', () => {
            this.activateTimelineView();
        });

        // Add command to open timeline
        this.addCommand({
            id: 'open-timeline',
            name: 'Open Timeline',
            callback: () => {
                this.activateTimelineView();
            },
        });

        // Add settings tab
        this.addSettingTab(new TimeTrackerSettingTab(this.app, this));

        // Watch for file changes to invalidate cache
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.path.startsWith(this.settings.timeTrackingFolder)) {
                    // Invalidate cache for this file
                    const monthMatch = file.name.match(/^(\d{4}-\d{2})\.md$/);
                    if (monthMatch) {
                        this.dataManager.invalidateMonth(monthMatch[1]);
                        // Refresh open timeline views
                        this.refreshTimelineViews();
                    }
                }
            })
        );
    }

    onunload(): void {
        console.log('Unloading Where Did The Time Go plugin');
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        // Update data manager with new settings
        if (this.dataManager) {
            this.dataManager.updateSettings(this.settings);
        }
        // Refresh timeline views
        this.refreshTimelineViews();
    }

    /**
     * Activate or focus the timeline view
     */
    async activateTimelineView(): Promise<void> {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);

        if (leaves.length > 0) {
            // View already exists, focus it
            leaf = leaves[0];
        } else {
            // Create new leaf in the right sidebar or main area
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE_TIMELINE,
                    active: true,
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    /**
     * Refresh all open timeline views
     */
    private refreshTimelineViews(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);
        for (const leaf of leaves) {
            const view = leaf.view as TimelineView;
            if (view && view.refresh) {
                view.refresh();
            }
        }
    }
}
