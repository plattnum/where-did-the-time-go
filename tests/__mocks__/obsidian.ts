// Mock for Obsidian API - only what we need for testing

export class Notice {
    constructor(message: string) {
        // Mock notice
    }
}

export class TFile {
    path: string = '';
    name: string = '';
    basename: string = '';
    extension: string = 'md';
}

export class TFolder {
    path: string = '';
    name: string = '';
}

export class Vault {
    async read(file: TFile): Promise<string> {
        return '';
    }

    async modify(file: TFile, content: string): Promise<void> {}

    async create(path: string, content: string): Promise<TFile> {
        return new TFile();
    }

    getAbstractFileByPath(path: string): TFile | TFolder | null {
        return null;
    }
}
