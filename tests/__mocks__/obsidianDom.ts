/** Minimal Obsidian DOM helpers for each JSDOM window used by the component tests. */
export function installObsidianDomHelpers(nodePrototype: Node): void {
    nodePrototype.createEl = function <K extends keyof HTMLElementTagNameMap>(this: Node, tag: K, cls?: string): HTMLElementTagNameMap[K] {
        const element = this.ownerDocument.createElement(tag);
        if (cls) element.className = cls;
        this.appendChild(element);
        return element;
    };
    nodePrototype.createDiv = function (this: Node, cls?: string): HTMLDivElement {
        return this.createEl('div', cls);
    };
    nodePrototype.createSpan = function (this: Node, cls?: string): HTMLSpanElement {
        return this.createEl('span', cls);
    };
    nodePrototype.createSvg = function <K extends keyof SVGElementTagNameMap>(this: Node, tag: K): SVGElementTagNameMap[K] {
        const element = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', tag);
        this.appendChild(element);
        return element;
    };
}
