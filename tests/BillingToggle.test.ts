import { JSDOM } from 'jsdom';
import { App, WorkspaceLeaf } from 'obsidian';
import { DataManager } from '../src/data/DataManager';
import { ClientModal } from '../src/modals/ClientModal';
import { ReportsView } from '../src/views/ReportsView';
import { ClientReport, DEFAULT_SETTINGS } from '../src/types';

type ElOptions = { text?: string; cls?: string } | string;

/** Obsidian DOM helpers needed by ReportsView's table rendering. */
function installReportDomHelpers(nodePrototype: Node, elementPrototype: HTMLElement): void {
    nodePrototype.createEl = function (this: Node, tag: string, options?: ElOptions) {
        const element = this.ownerDocument!.createElement(tag);
        if (typeof options === 'string') {
            element.className = options;
        } else if (options) {
            if (options.cls) element.className = options.cls;
            if (options.text !== undefined) element.textContent = options.text;
        }
        this.appendChild(element);
        return element;
    } as Node['createEl'];
    nodePrototype.createDiv = function (this: Node, options?: ElOptions) {
        return this.createEl('div', options as never);
    } as Node['createDiv'];
    nodePrototype.createSpan = function (this: Node, options?: ElOptions) {
        return this.createEl('span', options as never);
    } as Node['createSpan'];
    elementPrototype.setText = function (this: HTMLElement, text: string) {
        this.textContent = text;
    } as HTMLElement['setText'];
    nodePrototype.empty = function (this: Node) {
        while (this.firstChild) this.removeChild(this.firstChild);
    };
}

function renderClientTable(enableBilling: boolean): HTMLElement {
    const dom = new JSDOM();
    installReportDomHelpers(dom.window.Node.prototype, dom.window.HTMLElement.prototype);
    const container = dom.window.document.createElement('div');

    const view = new ReportsView({} as WorkspaceLeaf, { ...DEFAULT_SETTINGS, enableBilling }, {} as DataManager);
    const report: ClientReport = {
        clientId: 'acme',
        name: 'Acme',
        color: '#4f46e5',
        rate: 220,
        currency: 'USD',
        totalMinutes: 90,
        billableAmount: 330,
        percentage: 100,
        projectBreakdown: [{
            project: 'Website',
            color: '#059669',
            totalMinutes: 90,
            percentage: 100,
            activityBreakdown: [{ activity: 'Dev', color: '#e11d48', totalMinutes: 90, percentageOfProject: 100 }],
        }],
    };
    view['clientContainer'] = container;
    view['clientReports'] = [report];
    // Expand client and project so nested rows are rendered too
    view['expandedClients'].add('acme');
    view['expandedClientProjects'].add('acme:Website');
    view['renderClientTable']();
    return container;
}

describe('Billing toggle', () => {
    test('is enabled by default so existing users see no change', () => {
        expect(DEFAULT_SETTINGS.enableBilling).toBe(true);
    });

    test('reports show billable column, amounts and invoice button when enabled', () => {
        const container = renderClientTable(true);

        expect(container.querySelector('th.reports-col-billable')?.textContent).toBe('Billable');
        expect(container.querySelector('.reports-invoice-btn')).not.toBeNull();
        expect(container.textContent).toContain('$330.00');
    });

    test('reports hide billable column, amounts and invoice button when disabled', () => {
        const container = renderClientTable(false);

        expect(container.querySelector('.reports-col-billable')).toBeNull();
        expect(container.querySelector('.reports-invoice-btn')).toBeNull();
        expect(container.textContent).not.toContain('$');
        // Every row keeps the same column count as the header
        const headerCells = container.querySelectorAll('thead th').length;
        expect(headerCells).toBe(4);
        for (const row of Array.from(container.querySelectorAll('tbody tr'))) {
            expect(row.querySelectorAll('td').length).toBe(headerCells);
        }
    });

    test('new clients get no rate when billing is disabled', () => {
        const withBilling = new ClientModal({} as App, { mode: 'create' }, () => {});
        const withoutBilling = new ClientModal({} as App, { mode: 'create', enableBilling: false }, () => {});

        expect(withBilling['rateValue']).toBe(100);
        expect(withoutBilling['rateValue']).toBe(0);
    });
});
