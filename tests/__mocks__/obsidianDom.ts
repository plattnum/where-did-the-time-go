/** Minimal Obsidian DOM helpers for each JSDOM window used by the component tests. */
export function installObsidianDomHelpers(nodePrototype: Node): void {
    nodePrototype.createEl = function <K extends keyof HTMLElementTagNameMap>(this: Node, tag: K): HTMLElementTagNameMap[K] {
        const element = this.ownerDocument.createElement(tag);
        this.appendChild(element);
        return element;
    };
    nodePrototype.createSvg = function <K extends keyof SVGElementTagNameMap>(this: Node, tag: K): SVGElementTagNameMap[K] {
        const element = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', tag);
        this.appendChild(element);
        return element;
    };
}
