import { jest } from '@jest/globals';
import type { App, SettingDefinitionItem } from 'obsidian';
import type WhereDidTheTimeGoPlugin from '../main';
import { TimeTrackerSettingTab } from '../src/settings';
import { DEFAULT_SETTINGS, TimeTrackerSettings } from '../src/types';

function createTab(overrides: Partial<TimeTrackerSettings> = {}) {
    const plugin = {
        settings: structuredClone({ ...DEFAULT_SETTINGS, ...overrides }),
        saveSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const tab = new TimeTrackerSettingTab({} as App, plugin as unknown as WhereDidTheTimeGoPlugin);
    const update = jest.spyOn(tab, 'update');
    return { tab, plugin, update };
}

function controlKeys(items: SettingDefinitionItem[]): string[] {
    return items.flatMap((item) => {
        if ('items' in item && item.items) return controlKeys(item.items);
        return 'control' in item && item.control ? [item.control.key] : [];
    });
}

describe('TimeTrackerSettingTab declarative settings', () => {
    it('round-trips every control without changing stored settings', async () => {
        const { tab, plugin } = createTab();
        const keys = controlKeys(tab.getSettingDefinitions());
        expect(keys).toHaveLength(14);
        for (const key of keys) {
            const value = tab.getControlValue(key);
            expect(value).not.toBeUndefined();
            await tab.setControlValue(key, value);
        }
        expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('stores hour dropdown values as numbers', async () => {
        const { tab, plugin } = createTab();
        expect(tab.getControlValue('dayStartHour')).toBe('6');
        await tab.setControlValue('dayEndHour', '24');
        expect(plugin.settings.dayEndHour).toBe(24);
    });

    it('reads and writes bill-from details', async () => {
        const { tab, plugin } = createTab();
        await tab.setControlValue('billFrom.address', '1 Main St\nSpringfield');
        expect(tab.getControlValue('billFrom.address')).toBe('1 Main St\nSpringfield');
        expect(plugin.settings.billFrom).toEqual({ name: '', address: '1 Main St\nSpringfield' });
    });

    it('falls back to default folders when cleared', async () => {
        const { tab, plugin } = createTab({ timeTrackingFolder: 'Work', invoiceFolder: 'Work/Invoices' });
        await tab.setControlValue('timeTrackingFolder', '');
        await tab.setControlValue('invoiceFolder', '');
        expect(plugin.settings.timeTrackingFolder).toBe(DEFAULT_SETTINGS.timeTrackingFolder);
        expect(plugin.settings.invoiceFolder).toBe(DEFAULT_SETTINGS.invoiceFolder);
    });

    it('keeps description max length a non-negative integer', async () => {
        const { tab, plugin } = createTab();
        await tab.setControlValue('descriptionMaxLength', -5);
        expect(plugin.settings.descriptionMaxLength).toBe(0);
        await tab.setControlValue('descriptionMaxLength', 120.7);
        expect(plugin.settings.descriptionMaxLength).toBe(120);
    });

    it('saves through the plugin and rebuilds only when billing changes', async () => {
        const { tab, plugin, update } = createTab();
        await tab.setControlValue('debugMode', true);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
        await tab.setControlValue('enableBilling', false);
        expect(plugin.settings.enableBilling).toBe(false);
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('describes clients for the current billing mode', () => {
        const describeClients = (tab: TimeTrackerSettingTab) => {
            const clients = tab.getSettingDefinitions().find((item) => 'heading' in item && item.heading === 'Clients');
            const items = clients && 'items' in clients ? clients.items ?? [] : [];
            return items[0] && 'desc' in items[0] ? items[0].desc : undefined;
        };
        expect(describeClients(createTab().tab)).toMatch(/billing/);
        expect(describeClients(createTab({ enableBilling: false }).tab)).toMatch(/group your time/);
    });
});
