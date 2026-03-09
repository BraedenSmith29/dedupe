export default class WindowTracker {
    private readonly unfocusedNewWindows: Set<number> = new Set();
    private readonly knownWindows: Set<number> = new Set();
    private currentlyFocusedWindowId: number = -1;

    private onTabCreated = (tab: browser.tabs.Tab): void => {
        if (tab.windowId !== undefined && !this.knownWindows.has(tab.windowId)) {
            this.unfocusedNewWindows.add(tab.windowId);
        }
    }

    private onWindowCreated = (window: browser.windows.Window): void => {
        if (window.id !== undefined && window.type === 'normal') {
            this.knownWindows.add(window.id);
        }
    }

    private onWindowFocusChanged = (windowId: number): void => {
        if (windowId !== -1) {
            this.currentlyFocusedWindowId = windowId;
            this.unfocusedNewWindows.delete(windowId);
        }
    }

    private onWindowRemoved = (windowId: number): void => {
        this.knownWindows.delete(windowId);
        this.unfocusedNewWindows.delete(windowId);
    }

    private constructor() {
        browser.tabs.onCreated.addListener(this.onTabCreated);
        browser.windows.onCreated.addListener(this.onWindowCreated);
        browser.windows.onFocusChanged.addListener(this.onWindowFocusChanged);
        browser.windows.onRemoved.addListener(this.onWindowRemoved);
    }

    public destroy(): void {
        browser.tabs.onCreated.removeListener(this.onTabCreated);
        browser.windows.onCreated.removeListener(this.onWindowCreated);
        browser.windows.onFocusChanged.removeListener(this.onWindowFocusChanged);
        browser.windows.onRemoved.removeListener(this.onWindowRemoved);
    }

    public static async create(): Promise<WindowTracker> {
        const windowTracker = new WindowTracker();
        
        const allWindows = await browser.windows.getAll({ windowTypes: ['normal'] });
        allWindows.forEach(window => {
            if (window.id === undefined) return;

            windowTracker.knownWindows.add(window.id);
            if (window.focused) {
                windowTracker.currentlyFocusedWindowId = window.id;
            }
        });

        return windowTracker;
    }

    public isNewWindow(windowId: number): boolean {
        return !this.knownWindows.has(windowId);
    }

    public newWindowNotFocusedYet(windowId: number): boolean {
        return this.unfocusedNewWindows.has(windowId);
    }

    public getCurrentlyFocusedWindowId(): number {
        return this.currentlyFocusedWindowId;
    }
}