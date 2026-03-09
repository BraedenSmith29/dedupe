import Deduplicator from "./Deduplicator";
import { NavigationData, NavigationMethod } from "./navigation";
import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import WindowTracker from "./WindowTracker";

interface TabData {
    tabId: number;
    url: string | undefined;
    status: string | undefined;
}

export default class TabTracker {
    private readonly windowTracker: WindowTracker;
    private readonly deduplicator: Deduplicator;

    private readonly allTabs: Map<number, TabData> = new Map();
    private readonly navigatingTabs: Map<number, NavigationData> = new Map();

    private onTabCreated = (tab: browser.tabs.Tab) => {
        if (tab.id === undefined || tab.windowId === undefined) return;

        if (tab.url !== 'about:newtab' && tab.url !== 'about:home') {
            this.navigatingTabs.set(tab.id, {
                tabId: tab.id,
                newTab: true,
                newWindow: this.windowTracker.isNewWindow(tab.windowId),
                sourceWindowId: this.windowTracker.getCurrentlyFocusedWindowId(),
                targetWindowId: tab.windowId,
            });
        }

        this.updateTabData(tab);
    }

    private onTabRemoved = (tabId: number) => {
        this.allTabs.delete(tabId);
        this.navigatingTabs.delete(tabId);
    }

    private onTabUpdated = (tabId: number, changeInfo: browser.tabs._OnUpdatedChangeInfo, tab: browser.tabs.Tab) => {
        if (tab.id === undefined || tab.windowId === undefined) return;
        if (changeInfo.url === undefined && changeInfo.status === undefined) return;
        const newUrl = changeInfo.url;
        const newStatus = changeInfo.status;

        const previousTabInfo = this.allTabs.get(tabId);
        if (!previousTabInfo) return this.onTabCreated(tab);
        this.updateTabData(tab);

        if (previousTabInfo.status === 'complete' && newStatus === 'loading') {
            this.navigatingTabs.set(tabId, {
                tabId: tabId,
                newTab: false,
                newWindow: false,
                sourceWindowId: tab.windowId,
                targetWindowId: tab.windowId,
            });
        }
        
        // Only bother with the rest if the tab is navigating
        const navigationData = this.navigatingTabs.get(tabId);
        if (!navigationData) return;
        
        if (newUrl) {
            const navigationMethod = this.classifyNavigation(navigationData, previousTabInfo.url, newUrl);
            if (navigationMethod) {
                this.deduplicator.deduplicate(navigationData, newUrl, navigationMethod);
            }
        }

        if (newStatus === 'complete') {
            this.navigatingTabs.delete(tabId);
        }
    }

    private constructor(settings: Settings, pause: Pause, windowTracker: WindowTracker) {
        this.windowTracker = windowTracker;
        this.deduplicator = new Deduplicator(settings, pause, windowTracker);

        browser.tabs.onCreated.addListener(this.onTabCreated);
        browser.tabs.onRemoved.addListener(this.onTabRemoved);
        browser.tabs.onUpdated.addListener(this.onTabUpdated);
    }

    public destroy(): void {
        this.windowTracker.destroy();

        browser.tabs.onCreated.removeListener(this.onTabCreated);
        browser.tabs.onRemoved.removeListener(this.onTabRemoved);
        browser.tabs.onUpdated.removeListener(this.onTabUpdated);
    }

    public static async create(settings: Settings, pause: Pause): Promise<TabTracker> {
        const windowTracker = await WindowTracker.create();
        const tabTracker = new TabTracker(settings, pause, windowTracker);

        const allTabs = await browser.tabs.query({});
        allTabs.forEach(tab => {
            if (tab.id !== undefined && tab.windowId !== undefined) {
                tabTracker.allTabs.set(tab.id, {
                    tabId: tab.id,
                    url: tab.url,
                    status: tab.status,
                });
            }
        });

        return tabTracker;
    }

    private updateTabData(tab: browser.tabs.Tab): void {
        this.allTabs.set(tab.id!, {
            tabId: tab.id!,
            url: tab.url,
            status: tab.url === 'about:blank' ? 'loading' : tab.status, // Don't like this
        });
    }

    private classifyNavigation(navigationData: NavigationData, previousUrl: string | undefined, newUrl: string): NavigationMethod | null {
        if (navigationData.newTab) {
            if (!this.isEmptyOrDefaultUrl(previousUrl)) {
                return 'deliberateDuplicateOrHistory';
            } else if (navigationData.newWindow) {
                return 'openedInNewWindow';
            } else {
                return 'openedInNewTabInSameWindow';
            }
        } else {
            if (newUrl === previousUrl) {
                return 'reload';
            } else if (!this.isEmptyOrDefaultUrl(newUrl) && (previousUrl === 'about:newtab' || previousUrl === 'about:home')) {
                return 'firstNavigationInFreshTab';
            } else if (!this.isEmptyOrDefaultUrl(newUrl)) {
                return 'redirect';
            }
        }

        return null;
    }

    private isEmptyOrDefaultUrl(url: string | undefined): url is undefined | '' | 'about:blank' | 'about:newtab' | 'about:home' {
        return url === undefined || url === '' || url === 'about:blank' || url === 'about:newtab' || url === 'about:home';
    }
}