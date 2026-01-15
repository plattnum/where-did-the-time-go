import { App, Modal, Setting, Notice } from 'obsidian';
import { Client } from '../types';

/**
 * Payment terms options
 */
export type PaymentTerms = 'Due on receipt' | 'Net 15' | 'Net 30' | 'Net 45' | 'Net 60';

/**
 * Data passed to the invoice modal
 */
export interface InvoiceModalData {
    /** Client being invoiced */
    client: Client;
    /** Start date of the invoice period */
    periodStart: Date;
    /** End date of the invoice period */
    periodEnd: Date;
    /** Total billable amount */
    totalAmount: number;
}

/**
 * Result from the invoice modal
 */
export interface InvoiceModalResult {
    /** User-provided invoice number */
    invoiceNumber: string;
    /** Issue date */
    issueDate: Date;
    /** Payment terms */
    paymentTerms: PaymentTerms;
    /** Calculated due date */
    dueDate: Date;
}

/**
 * Modal for collecting invoice details before generation
 */
export class InvoiceModal extends Modal {
    private data: InvoiceModalData;
    private onGenerate: (result: InvoiceModalResult) => void;

    // Form values
    private invoiceNumber: string = '';
    private issueDate: Date;
    private paymentTerms: PaymentTerms = 'Net 30';
    private dueDate: Date;

    // DOM references for dynamic updates
    private dueDateDisplay: HTMLElement;

    constructor(
        app: App,
        data: InvoiceModalData,
        onGenerate: (result: InvoiceModalResult) => void
    ) {
        super(app);
        this.data = data;
        this.onGenerate = onGenerate;

        // Initialize with defaults
        this.issueDate = new Date();
        this.dueDate = this.calculateDueDate(this.issueDate, this.paymentTerms);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('invoice-modal');

        // Title
        contentEl.createEl('h2', { text: 'Generate invoice' });

        // Client info (read-only)
        const clientInfo = contentEl.createDiv('invoice-client-info');
        clientInfo.createEl('strong', { text: this.data.client.name });
        clientInfo.createEl('span', {
            text: ` • ${this.formatDateRange(this.data.periodStart, this.data.periodEnd)}`,
            cls: 'invoice-period',
        });
        clientInfo.createEl('span', {
            text: ` • ${this.formatCurrency(this.data.totalAmount, this.data.client.currency)}`,
            cls: 'invoice-amount',
        });

        // Invoice Number (required)
        new Setting(contentEl)
            .setName('Invoice number')
            .setDesc('Unique identifier for this invoice')
            .addText(text => text
                .setPlaceholder('Enter invoice number')
                .setValue(this.invoiceNumber)
                .onChange(value => {
                    this.invoiceNumber = value;
                }));

        // Issue Date
        new Setting(contentEl)
            .setName('Issue date')
            .setDesc('Date the invoice is issued')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.formatDateForInput(this.issueDate));
                text.onChange(value => {
                    // Parse as local date to avoid timezone issues
                    const [year, month, day] = value.split('-').map(Number);
                    this.issueDate = new Date(year, month - 1, day);
                    this.updateDueDate();
                });
            });

        // Payment Terms
        new Setting(contentEl)
            .setName('Payment terms')
            .setDesc('When payment is due')
            .addDropdown(dropdown => dropdown
                .addOption('Due on receipt', 'Due on receipt')
                .addOption('Net 15', 'Net 15')
                .addOption('Net 30', 'Net 30')
                .addOption('Net 45', 'Net 45')
                .addOption('Net 60', 'Net 60')
                .setValue(this.paymentTerms)
                .onChange(value => {
                    this.paymentTerms = value as PaymentTerms;
                    this.updateDueDate();
                }));

        // Due Date (calculated, read-only display)
        const dueDateSetting = new Setting(contentEl)
            .setName('Due date')
            .setDesc('Automatically calculated from issue date and terms');

        this.dueDateDisplay = dueDateSetting.controlEl.createDiv('invoice-due-date');
        this.dueDateDisplay.setText(this.formatDateDisplay(this.dueDate));

        // Button row
        const buttonRow = contentEl.createDiv('modal-button-row');

        // Cancel button
        const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        // Generate button
        const generateBtn = buttonRow.createEl('button', {
            text: 'Generate invoice',
            cls: 'mod-cta',
        });
        generateBtn.addEventListener('click', () => this.handleGenerate());
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * Update the due date based on issue date and terms
     */
    private updateDueDate(): void {
        this.dueDate = this.calculateDueDate(this.issueDate, this.paymentTerms);
        if (this.dueDateDisplay) {
            this.dueDateDisplay.setText(this.formatDateDisplay(this.dueDate));
        }
    }

    /**
     * Calculate due date from issue date and payment terms
     */
    private calculateDueDate(issueDate: Date, terms: PaymentTerms): Date {
        const due = new Date(issueDate);

        switch (terms) {
            case 'Due on receipt':
                // Due immediately
                break;
            case 'Net 15':
                due.setDate(due.getDate() + 15);
                break;
            case 'Net 30':
                due.setDate(due.getDate() + 30);
                break;
            case 'Net 45':
                due.setDate(due.getDate() + 45);
                break;
            case 'Net 60':
                due.setDate(due.getDate() + 60);
                break;
        }

        return due;
    }

    /**
     * Handle generate button click
     */
    private handleGenerate(): void {
        // Validate
        if (!this.invoiceNumber.trim()) {
            new Notice('Invoice number is required');
            return;
        }

        const result: InvoiceModalResult = {
            invoiceNumber: this.invoiceNumber.trim(),
            issueDate: this.issueDate,
            paymentTerms: this.paymentTerms,
            dueDate: this.dueDate,
        };

        this.onGenerate(result);
        this.close();
    }

    // Formatting helpers

    private formatDateForInput(date: Date): string {
        // Use local date components to avoid timezone shift
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateDisplay(date: Date): string {
        return date.toLocaleDateString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }

    private formatDateRange(start: Date, end: Date): string {
        const options: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        };
        return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, options)}`;
    }

    private formatCurrency(amount: number, currency: string): string {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    }
}
