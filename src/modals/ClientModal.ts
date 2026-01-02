import { App, Modal, Setting, Notice } from 'obsidian';
import { Client } from '../types';

/**
 * Mode for the client modal
 */
export type ClientModalMode = 'create' | 'edit';

/**
 * Data passed when opening the modal
 */
export interface ClientModalData {
    mode: ClientModalMode;
    /** For edit mode: the existing client to edit */
    client?: Client;
}

/**
 * Modal for creating or editing clients
 */
export class ClientModal extends Modal {
    private data: ClientModalData;
    private onSave: (client: Client) => void;
    private onDelete?: () => void;

    // Form values
    private nameValue: string;
    private colorValue: string;
    private rateValue: number;
    private currencyValue: string;
    private rateTypeValue: 'hourly' | 'daily';
    private addressValue: string;
    private emailValue: string;
    private taxIdValue: string;
    private paymentTermsValue: string;
    private notesValue: string;

    constructor(
        app: App,
        data: ClientModalData,
        onSave: (client: Client) => void,
        onDelete?: () => void
    ) {
        super(app);
        this.data = data;
        this.onSave = onSave;
        this.onDelete = onDelete;

        // Initialize form values
        if (data.mode === 'edit' && data.client) {
            this.nameValue = data.client.name;
            this.colorValue = data.client.color;
            this.rateValue = data.client.rate;
            this.currencyValue = data.client.currency;
            this.rateTypeValue = data.client.rateType;
            this.addressValue = data.client.address || '';
            this.emailValue = data.client.email || '';
            this.taxIdValue = data.client.taxId || '';
            this.paymentTermsValue = data.client.paymentTerms || '';
            this.notesValue = data.client.notes || '';
        } else {
            // Defaults for new client
            this.nameValue = '';
            this.colorValue = this.getRandomColor();
            this.rateValue = 100;
            this.currencyValue = 'USD';
            this.rateTypeValue = 'hourly';
            this.addressValue = '';
            this.emailValue = '';
            this.taxIdValue = '';
            this.paymentTermsValue = 'Net 30';
            this.notesValue = '';
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('client-modal');

        // Title
        contentEl.createEl('h2', {
            text: this.data.mode === 'edit' ? 'Edit Client' : 'Add Client',
        });

        // Name
        new Setting(contentEl)
            .setName('Client Name')
            .setDesc('Display name for this client')
            .addText(text => text
                .setPlaceholder('Acme Corp')
                .setValue(this.nameValue)
                .onChange(value => {
                    this.nameValue = value;
                }));

        // Color
        new Setting(contentEl)
            .setName('Color')
            .setDesc('Color for UI display')
            .addColorPicker(picker => picker
                .setValue(this.colorValue)
                .onChange(value => {
                    this.colorValue = value;
                }));

        // Billing section header
        contentEl.createEl('h3', { text: 'Billing' });

        // Rate
        new Setting(contentEl)
            .setName('Rate')
            .setDesc('Billing rate for this client')
            .addText(text => text
                .setPlaceholder('100')
                .setValue(this.rateValue.toString())
                .onChange(value => {
                    const num = parseFloat(value);
                    if (!isNaN(num) && num >= 0) {
                        this.rateValue = num;
                    }
                }));

        // Currency
        new Setting(contentEl)
            .setName('Currency')
            .setDesc('Currency code')
            .addDropdown(dropdown => dropdown
                .addOption('USD', 'USD - US Dollar')
                .addOption('EUR', 'EUR - Euro')
                .addOption('GBP', 'GBP - British Pound')
                .addOption('CAD', 'CAD - Canadian Dollar')
                .addOption('AUD', 'AUD - Australian Dollar')
                .addOption('JPY', 'JPY - Japanese Yen')
                .addOption('CHF', 'CHF - Swiss Franc')
                .addOption('INR', 'INR - Indian Rupee')
                .setValue(this.currencyValue)
                .onChange(value => {
                    this.currencyValue = value;
                }));

        // Rate type
        new Setting(contentEl)
            .setName('Rate Type')
            .setDesc('How the rate is calculated')
            .addDropdown(dropdown => dropdown
                .addOption('hourly', 'Hourly')
                .addOption('daily', 'Daily')
                .setValue(this.rateTypeValue)
                .onChange(value => {
                    this.rateTypeValue = value as 'hourly' | 'daily';
                }));

        // Invoice details section header
        contentEl.createEl('h3', { text: 'Invoice Details' });

        // Address (textarea)
        new Setting(contentEl)
            .setName('Billing Address')
            .setDesc('Multi-line address for invoices')
            .addTextArea(textarea => textarea
                .setPlaceholder('123 Main Street\nSuite 400\nSan Francisco, CA 94102')
                .setValue(this.addressValue)
                .onChange(value => {
                    this.addressValue = value;
                }));

        // Email
        new Setting(contentEl)
            .setName('Email')
            .setDesc('Invoice recipient email')
            .addText(text => text
                .setPlaceholder('billing@example.com')
                .setValue(this.emailValue)
                .onChange(value => {
                    this.emailValue = value;
                }));

        // Tax ID
        new Setting(contentEl)
            .setName('Tax ID')
            .setDesc('VAT number or tax ID')
            .addText(text => text
                .setPlaceholder('VAT123456789')
                .setValue(this.taxIdValue)
                .onChange(value => {
                    this.taxIdValue = value;
                }));

        // Payment terms
        new Setting(contentEl)
            .setName('Payment Terms')
            .setDesc('When payment is due')
            .addDropdown(dropdown => dropdown
                .addOption('Due on receipt', 'Due on receipt')
                .addOption('Net 15', 'Net 15')
                .addOption('Net 30', 'Net 30')
                .addOption('Net 45', 'Net 45')
                .addOption('Net 60', 'Net 60')
                .setValue(this.paymentTermsValue)
                .onChange(value => {
                    this.paymentTermsValue = value;
                }));

        // Notes (textarea)
        new Setting(contentEl)
            .setName('Notes')
            .setDesc('Internal notes about this client')
            .addTextArea(textarea => textarea
                .setPlaceholder('Optional internal notes...')
                .setValue(this.notesValue)
                .onChange(value => {
                    this.notesValue = value;
                }));

        // Button row
        const buttonRow = contentEl.createDiv('modal-button-row');

        // Delete button (only in edit mode)
        if (this.data.mode === 'edit' && this.onDelete) {
            const deleteBtn = buttonRow.createEl('button', {
                text: 'Delete',
                cls: 'mod-warning',
            });
            deleteBtn.addEventListener('click', () => {
                this.onDelete!();
                this.close();
            });
        }

        // Spacer
        buttonRow.createDiv('button-spacer');

        // Cancel button
        const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        // Save button
        const saveBtn = buttonRow.createEl('button', {
            text: 'Save',
            cls: 'mod-cta',
        });
        saveBtn.addEventListener('click', () => this.handleSave());
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    private handleSave(): void {
        // Validate
        if (!this.nameValue.trim()) {
            new Notice('Client name is required');
            return;
        }

        if (this.rateValue < 0) {
            new Notice('Rate must be a positive number');
            return;
        }

        // Build client object
        const client: Client = {
            id: this.data.mode === 'edit' && this.data.client
                ? this.data.client.id
                : this.slugify(this.nameValue),
            name: this.nameValue.trim(),
            color: this.colorValue,
            archived: this.data.mode === 'edit' && this.data.client
                ? this.data.client.archived
                : false,
            rate: this.rateValue,
            currency: this.currencyValue,
            rateType: this.rateTypeValue,
            address: this.addressValue.trim() || undefined,
            email: this.emailValue.trim() || undefined,
            taxId: this.taxIdValue.trim() || undefined,
            paymentTerms: this.paymentTermsValue,
            notes: this.notesValue.trim() || undefined,
        };

        this.onSave(client);
        this.close();
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
