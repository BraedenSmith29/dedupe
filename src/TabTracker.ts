import Settings from "./Settings";
import WindowTracker from "./WindowTracker";

export interface Possibilities {
    reload?: boolean;
    deliberateDuplicateOrHistory?: boolean;
    firstNavigationInFreshTab?: boolean;
    openedInNewWindow?: boolean;
    openedInNewTabInSameWindow?: boolean;
    redirect?: boolean;
}

interface Tab {
    tabId: number;
    url: string | undefined;
    status: string | undefined;
}

interface LifecycleData {
    tabId: number;
    newTab: boolean; // <- same as initiatedBy
    newWindow: boolean;
    sourceWindowId: number;
    targetWindowId: number;
}

// As soon as we get a url or get complete, we say that's all we're gonna get
// This is all initiated when we either get a new tab or get a loading state

export default class TabTracker {
    private readonly settings: Settings;
    private readonly windowTracker: WindowTracker;

    private onDeduplicationCandidateFound: (tab: LifecycleData, targetUrl: string, method: Possibilities) => void = () => {};
    public setDeduplicationCandidateFoundListener(listener: (tab: LifecycleData, targetUrl: string, method: Possibilities) => void) {
        this.onDeduplicationCandidateFound = listener;
    }

    private readonly tabs: Map<number, Tab> = new Map();
    private readonly tabsToWatch: Map<number, LifecycleData> = new Map();

    private onTabCreated = (tab: browser.tabs.Tab) => {
        if (tab.id === undefined || tab.windowId === undefined) return;

        if (tab.url !== 'about:newtab' && tab.url !== 'about:home') {
            this.tabsToWatch.set(tab.id, {
                tabId: tab.id,
                newTab: true,
                newWindow: this.windowTracker.isNewWindow(tab.windowId),
                sourceWindowId: this.windowTracker.getCurrentlyFocusedWindowId(),
                targetWindowId: tab.windowId,
            });
        }

        this.updateTabInfo(tab);
    }

    private onTabRemoved = (tabId: number) => {
        this.tabs.delete(tabId);
        this.tabsToWatch.delete(tabId);
    }

    private onTabUpdated = (tabId: number, changeInfo: browser.tabs._OnUpdatedChangeInfo, tab: browser.tabs.Tab) => {
        const timestamp = Date.now();

        if (tab.id === undefined || tab.windowId === undefined) return;
        if (changeInfo.url === undefined && changeInfo.status === undefined) return;
        const newUrl = changeInfo.url;
        const newStatus = changeInfo.status;

        const previousTabInfo = this.tabs.get(tabId);
        if (!previousTabInfo) return this.onTabCreated(tab);

        if (previousTabInfo.status === 'complete') {
            if (newStatus === 'loading') {
                this.tabsToWatch.set(tabId, {
                    tabId: tabId,
                    newTab: false,
                    newWindow: false,
                    sourceWindowId: tab.windowId,
                    targetWindowId: tab.windowId,
                });
            } else if (newStatus === 'complete') {
                console.warn('Got complete status again without loading. Kinda weird but will ignore.');
            } else {
                console.error('Unexpectedly changed URL without loading:', tabId);
            }
        } else {
            const lifecycleData = this.tabsToWatch.get(tabId);
            if (lifecycleData) {
                if (lifecycleData.newTab) {
                    if (!this.isEmptyOrDefaultUrl(previousTabInfo.url)) {
                        // This is opened from history or manual duplicate.
                        this.tabsToWatch.delete(tabId);
                    } else if (lifecycleData.newWindow) {
                        // Opened link in new window
                        if (newUrl) {
                            this.tabsToWatch.delete(tabId);
                            this.onDeduplicationCandidateFound(lifecycleData, newUrl, { openedInNewWindow: true });
                        }
                    } else {
                        // Opened link in new tab in same window
                        if (newUrl) {
                            this.tabsToWatch.delete(tabId);
                            this.onDeduplicationCandidateFound(lifecycleData, newUrl, { openedInNewTabInSameWindow: true });
                        }
                    }
                } else {
                    // Not a new tab, just a navigation
                    if (newUrl === previousTabInfo.url) {
                        // This is a reload
                        this.tabsToWatch.delete(tabId);
                    } else if (!this.isEmptyOrDefaultUrl(newUrl) && (previousTabInfo.url === 'about:newtab' || previousTabInfo.url === 'about:home')) {
                        // This is a navigation from a fresh new tab page, likely from a bookmark or the address bar
                        this.tabsToWatch.delete(tabId);
                        this.onDeduplicationCandidateFound(lifecycleData, newUrl, { firstNavigationInFreshTab: true });
                    } else if (!this.isEmptyOrDefaultUrl(newUrl)) {
                        // This is likely a redirect or a navigation from a loaded page
                        this.tabsToWatch.delete(tabId);
                        this.onDeduplicationCandidateFound(lifecycleData, newUrl, { redirect: true });
                    }
                }
            }
        }

        if (newStatus === 'complete') {
            this.tabsToWatch.delete(tabId);
        }

        this.updateTabInfo(tab);
    }

    private constructor(settings: Settings, windowTracker: WindowTracker) {
        this.settings = settings;
        this.windowTracker = windowTracker;

        browser.tabs.onCreated.addListener(this.onTabCreated);
        browser.tabs.onRemoved.addListener(this.onTabRemoved);
        browser.tabs.onUpdated.addListener(this.onTabUpdated);
    }

    public destroy(): void {
        browser.tabs.onCreated.removeListener(this.onTabCreated);
        browser.tabs.onRemoved.removeListener(this.onTabRemoved);
        browser.tabs.onUpdated.removeListener(this.onTabUpdated);
    }

    public static async create(settings: Settings, windowTracker: WindowTracker): Promise<TabTracker> {
        const tracker = new TabTracker(settings, windowTracker);

        const allTabs = await browser.tabs.query({});
        allTabs.forEach(tab => {
            if (tab.id !== undefined && tab.windowId !== undefined) {
                tracker.tabs.set(tab.id, {
                    tabId: tab.id,
                    url: tab.url,
                    status: tab.status,
                });
            }
        });

        return tracker;
    }

    private updateTabInfo(tab: browser.tabs.Tab): void {
        this.tabs.set(tab.id!, {
            tabId: tab.id!,
            url: tab.url,
            status: tab.url === 'about:blank' ? 'loading' : tab.status, // Don't like this
        });
    }

    private isEmptyOrDefaultUrl(url: string | undefined): url is undefined | '' | 'about:blank' | 'about:newtab' | 'about:home' {
        return url === undefined || url === '' || url === 'about:blank' || url === 'about:newtab' || url === 'about:home';
    }
}