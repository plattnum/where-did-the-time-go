import { App, TFolder } from 'obsidian';
import { TimeEntry, TimeTrackerSettings, Client, Project, BillFrom } from '../types';
import { InvoiceModalResult } from '../modals/InvoiceModal';
import { DataManager } from '../data/DataManager';
import { Logger } from '../utils/Logger';

/**
 * Line item on an invoice
 */
interface InvoiceLineItem {
    description: string;
    quantity: number; // hours
    unitPrice: number;
    currency: string;
    amount: number;
}

/**
 * Complete invoice data
 */
export interface InvoiceData {
    invoiceNumber: string;
    issueDate: Date;
    dueDate: Date;
    billFrom: BillFrom;
    billTo: {
        name: string;
        address: string;
    };
    lineItems: InvoiceLineItem[];
    currency: string;
    subtotal: number;
    total: number;
}

/**
 * Generates markdown invoices from time entries
 */
export class InvoiceGenerator {
    private app: App;
    private settings: TimeTrackerSettings;
    private dataManager: DataManager;

    constructor(app: App, settings: TimeTrackerSettings, dataManager: DataManager) {
        this.app = app;
        this.settings = settings;
        this.dataManager = dataManager;
    }

    /**
     * Generate invoice data from filtered entries
     */
    generateInvoiceData(
        entries: TimeEntry[],
        client: Client,
        modalResult: InvoiceModalResult,
        rangeStart: Date,
        rangeEnd: Date
    ): InvoiceData {
        // Group entries by project and calculate hours
        const projectHours = new Map<string, number>();

        for (const entry of entries) {
            // Only include entries for this client
            if (entry.client !== client.id) continue;

            // Calculate effective duration within range
            const effectiveMinutes = this.dataManager.getEffectiveDuration(entry, rangeStart, rangeEnd);
            if (effectiveMinutes <= 0) continue;

            const projectName = entry.project || '(No Project)';
            const current = projectHours.get(projectName) || 0;
            projectHours.set(projectName, current + effectiveMinutes);
        }

        // Build line items
        const lineItems: InvoiceLineItem[] = [];

        for (const [projectName, minutes] of projectHours) {
            const hours = minutes / 60;

            // Get hourly rate: project override or client rate
            const project = this.settings.projects.find(
                p => (p.name === projectName || p.id === projectName) && p.clientId === client.id
            );
            const hourlyRate = project?.rateOverride ?? client.rate;
            const amount = hours * hourlyRate;

            // Use project name as description
            const description = projectName;

            lineItems.push({
                description,
                quantity: Math.round(hours * 100) / 100, // Round to 2 decimals
                unitPrice: hourlyRate,
                currency: client.currency,
                amount: Math.round(amount * 100) / 100,
            });
        }

        // Sort by amount descending
        lineItems.sort((a, b) => b.amount - a.amount);

        // Calculate totals
        const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
        const total = subtotal; // No tax for now

        return {
            invoiceNumber: modalResult.invoiceNumber,
            issueDate: modalResult.issueDate,
            dueDate: modalResult.dueDate,
            billFrom: this.settings.billFrom,
            billTo: {
                name: client.name,
                address: client.address || '',
            },
            lineItems,
            currency: client.currency,
            subtotal: Math.round(subtotal * 100) / 100,
            total: Math.round(total * 100) / 100,
        };
    }

    /**
     * Generate markdown content from invoice data
     */
    generateMarkdown(invoice: InvoiceData): string {
        const lines: string[] = [];

        // Title
        lines.push(`# ${invoice.invoiceNumber}`);
        lines.push('');

        // Dates
        lines.push(`Issue date: ${this.formatDate(invoice.issueDate)}`);
        lines.push(`Due date: ${this.formatDate(invoice.dueDate)}`);
        lines.push('');

        // Bill from / Bill to - two column HTML layout
        const billFromAddress = invoice.billFrom.address.split('\n').filter(l => l.trim());
        const billToAddress = invoice.billTo.address.split('\n').filter(l => l.trim());

        lines.push('<div style="display: flex; justify-content: space-between; margin: 20px 0;">');
        lines.push('<div style="flex: 1;">');
        lines.push('<small>Bill from</small><br>');
        lines.push(`<strong>${this.escapeHtml(invoice.billFrom.name)}</strong><br>`);
        for (const line of billFromAddress) {
            lines.push(`${this.escapeHtml(line)}<br>`);
        }
        lines.push('</div>');
        lines.push('<div style="flex: 1; text-align: right;">');
        lines.push('<small>Bill to</small><br>');
        lines.push(`<strong>${this.escapeHtml(invoice.billTo.name)}</strong><br>`);
        for (const line of billToAddress) {
            lines.push(`${this.escapeHtml(line)}<br>`);
        }
        lines.push('</div>');
        lines.push('</div>');
        lines.push('');

        // Line items table - full width HTML
        lines.push('<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">');
        lines.push('<thead>');
        lines.push('<tr style="border-bottom: 1px solid #ccc;">');
        lines.push('<th style="text-align: left; padding: 8px 0;">DESCRIPTION</th>');
        lines.push('<th style="text-align: right; padding: 8px 0;">QUANTITY</th>');
        lines.push('<th style="text-align: right; padding: 8px 0;">UNIT PRICE</th>');
        lines.push('<th style="text-align: right; padding: 8px 0;">AMOUNT</th>');
        lines.push('</tr>');
        lines.push('</thead>');
        lines.push('<tbody>');

        for (const item of invoice.lineItems) {
            const quantity = item.quantity.toFixed(2);
            const unitPrice = this.formatAmount(item.unitPrice, item.currency);
            const amount = this.formatAmount(item.amount, item.currency);

            // Clean up description
            let description = item.description;
            if (description === '(No Project)') {
                description = 'Services';
            }

            lines.push('<tr style="border-bottom: 1px solid #eee;">');
            lines.push(`<td style="text-align: left; padding: 8px 0;">${this.escapeHtml(description)}</td>`);
            lines.push(`<td style="text-align: right; padding: 8px 0;">${quantity}</td>`);
            lines.push(`<td style="text-align: right; padding: 8px 0;">${unitPrice}</td>`);
            lines.push(`<td style="text-align: right; padding: 8px 0;">${amount}</td>`);
            lines.push('</tr>');
        }

        lines.push('</tbody>');
        lines.push('</table>');
        lines.push('');

        // Totals - right aligned HTML
        const subtotalFormatted = this.formatAmount(invoice.subtotal, invoice.currency);
        const totalFormatted = this.formatAmount(invoice.total, invoice.currency);

        lines.push('<div style="text-align: right; margin-top: 20px;">');
        lines.push(`<div>SUBTOTAL: ${subtotalFormatted}</div>`);
        lines.push(`<div><strong>TOTAL: ${totalFormatted}</strong></div>`);
        lines.push('</div>');
        lines.push('');

        return lines.join('\n');
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Save invoice to file
     */
    async saveInvoice(invoice: InvoiceData, markdown: string): Promise<string> {
        // Ensure invoice folder exists
        await this.ensureInvoiceFolder();

        // Generate filename: {invoiceNumber}.md
        const filename = `${this.sanitizeFilename(invoice.invoiceNumber)}.md`;
        const filepath = `${this.settings.invoiceFolder}/${filename}`;

        // Check if file already exists
        const existing = this.app.vault.getAbstractFileByPath(filepath);
        if (existing) {
            throw new Error(`Invoice file already exists: ${filepath}`);
        }

        // Create the file
        await this.app.vault.create(filepath, markdown);

        Logger.log('InvoiceGenerator: Created invoice at', filepath);

        return filepath;
    }

    /**
     * Ensure the invoice folder exists
     */
    private async ensureInvoiceFolder(): Promise<void> {
        const folderPath = this.settings.invoiceFolder;

        // Check if folder exists
        const existing = this.app.vault.getAbstractFileByPath(folderPath);
        if (existing instanceof TFolder) {
            return; // Already exists
        }

        // Create folder (and parent folders if needed)
        await this.app.vault.createFolder(folderPath);
        Logger.log('InvoiceGenerator: Created invoice folder', folderPath);
    }

    // Formatting helpers

    private formatDate(date: Date): string {
        // Format as DD/MM/YYYY to match invoice standard
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    private formatAmount(amount: number, currency: string): string {
        return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    }

    private escapeTableCell(text: string): string {
        // Escape pipe characters in table cells
        return text.replace(/\|/g, '\\|');
    }

    private sanitizeFilename(name: string): string {
        // Remove or replace characters not allowed in filenames
        return name.replace(/[<>:"/\\|?*]/g, '-');
    }
}
