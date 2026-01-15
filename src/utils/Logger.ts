/**
 * Debug logger that only outputs when debug mode is enabled in settings
 * Allows users to enable logging to troubleshoot issues
 */
export class Logger {
    private static debugMode = false;
    private static prefix = '[WDTTG]';

    static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        if (enabled) {
            console.debug(this.prefix, 'Debug mode enabled');
        }
    }

    static log(...args: unknown[]): void {
        if (this.debugMode) {
            console.debug(this.prefix, ...args);
        }
    }

    static debug(...args: unknown[]): void {
        if (this.debugMode) {
            console.debug(this.prefix, ...args);
        }
    }

    static warn(...args: unknown[]): void {
        if (this.debugMode) {
            console.warn(this.prefix, ...args);
        }
    }

    static error(...args: unknown[]): void {
        // Always log errors, even without debug mode
        console.error(this.prefix, ...args);
    }
}
