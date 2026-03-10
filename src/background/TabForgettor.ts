interface TabForgetRecord {
    count: number;
    timeoutCancel: number;
    deletedSessions: Set<string>;
}

export default class TabForgettor {
    private readonly tabsToForget: Map<string, TabForgetRecord> = new Map();

    private getForgetKey(url: string, windowId: number): string {
        return `${url}::${windowId}`;
    }

    private readonly checkForClosedTab = async (): Promise<void> => {
        if (this.tabsToForget.size === 0) return;

        const recentlyClosed = await browser.sessions.getRecentlyClosed()
            .catch((error) => {
                console.error('Failed to get recently closed tabs:', error);
                return [];
            });

        recentlyClosed.sort((a, b) => b.lastModified - a.lastModified);

        for (const session of recentlyClosed) {
            const tabData = session.tab;
            if (!tabData?.sessionId || tabData.windowId === undefined || !tabData.url) continue;

            if (this.tabsToForget.has(this.getForgetKey(tabData.url, tabData.windowId))) {
                void this.forgetTab(tabData.url, tabData.windowId, tabData.sessionId);
            } else {
                return;
            }
        }
    };

    constructor() {
        browser.sessions.onChanged.addListener(this.checkForClosedTab);
    }

    public destroy(): void {
        browser.sessions.onChanged.removeListener(this.checkForClosedTab);
    }

    public addTabToForgetQueue(url: string, windowId: number): void {
        const key = this.getForgetKey(url, windowId);
        const record = this.tabsToForget.get(key);
        if (record) {
            record.count++;
            clearTimeout(record.timeoutCancel);
            record.timeoutCancel = setTimeout(() => {
                this.tabsToForget.delete(key);
            }, 1000);
        } else {
            const timeoutCancel = setTimeout(() => {
                this.tabsToForget.delete(key);
            }, 1000);
            this.tabsToForget.set(key, { count: 1, timeoutCancel, deletedSessions: new Set() });
        }
    }

    private async forgetTab(url: string, windowId: number, sessionId: string): Promise<void> {
        const key = this.getForgetKey(url, windowId);
        const record = this.tabsToForget.get(key);
        if (!record || record.deletedSessions.has(sessionId)) return;

        record.count--;
        record.deletedSessions.add(sessionId);
        if (record.count <= 0) {
            clearTimeout(record.timeoutCancel);
            this.tabsToForget.delete(key);
        }

        await browser.sessions.forgetClosedTab(windowId, sessionId)
            .catch((error) => {
                console.error(`Failed to forget closed tab session ${sessionId}:`, error);
            });
    }
}