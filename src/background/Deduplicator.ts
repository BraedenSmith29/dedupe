import DedupeCounter from "../shared/DedupeCounter";
import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import { NavigationData, NavigationMethod } from "./navigation";
import TabForgettor from "./TabForgettor";
import WindowTracker from "./WindowTracker";

export default class Deduplicator {
    private readonly settings: Settings;
    private readonly pause: Pause;
    private readonly windowTracker: WindowTracker;
    private readonly dedupeCounter: DedupeCounter;
    private readonly tabForgettor: TabForgettor;

    private constructor(settings: Settings, pause: Pause, windowTracker: WindowTracker, dedupeCounter: DedupeCounter) {
        this.settings = settings;
        this.pause = pause;
        this.windowTracker = windowTracker;
        this.dedupeCounter = dedupeCounter;
        this.tabForgettor = new TabForgettor();
    }

    public destroy(): void {
        this.tabForgettor.destroy();
        this.dedupeCounter.destroy();
    }

    public static async create(settings: Settings, pause: Pause, windowTracker: WindowTracker): Promise<Deduplicator> {
        const dedupeCounter = await DedupeCounter.create();
        return new Deduplicator(settings, pause, windowTracker, dedupeCounter);
    }

    public async deduplicate(navigationData: NavigationData, newUrl: string, method: NavigationMethod): Promise<void> {
        if (this.pause.isPaused() || !this.shouldDeduplicate(method) || this.disabledByDomainList(newUrl)) return;

        const oldTabs = await this.findExistingTabs(newUrl, navigationData.tabId, navigationData.sourceWindowId);
        if (oldTabs.length === 0) return;

        if (method === 'redirect') {
            // Special behavior for redirects
            await this.goBackAndSwitch(navigationData, oldTabs);
        } else {
            switch (this.settings.getSwitchBehavior()) {
                case 'deleteOldAndSwitch':
                    await this.deleteOldAndSwitch(navigationData, method, oldTabs);
                    break;
                case 'deleteOld':
                    await this.deleteOld(navigationData, method, oldTabs, false);
                    break;
                case 'deleteNewAndSwitch':
                    await this.deleteNewAndSwitch(navigationData, method, oldTabs, newUrl);
                    break;
                case 'deleteNew':
                    await this.deleteNew(navigationData, method, newUrl);
                    break;
            }
        }
    }

    private shouldDeduplicate(method: NavigationMethod): boolean {
        switch (method) {
            case 'reload':
            case 'deliberateDuplicateOrHistory':
                return false;
            case 'firstNavigationInFreshTab':
                return this.settings.getCheckWhenFirstNavigationInFreshTab();
            case 'openedInNewWindow':
                return this.settings.getCheckWhenOpeningLinkInNewWindow();
            case 'openedInNewTabInSameWindow':
                return this.settings.getCheckWhenOpeningLinkInNewTab();
            case 'redirect':
                return this.settings.getCheckWhenRedirecting();
        }
    }

    private disabledByDomainList(url: string): boolean {
        try {
            const host = new URL(url).hostname.toLowerCase().replace(/\.+$/, '');

            const inDomainList = this.settings.getDomainList().some((domain) => host === domain || host.endsWith(`.${domain}`));
            const mode = this.settings.getDomainListMode();

            return mode === 'blacklist' ? inDomainList : !inDomainList;
        } catch {
            return false;
        }
    }

    private async findExistingTabs(newUrl: string, currentTabId: number | undefined, sourceWindowId: number): Promise<browser.tabs.Tab[]> {
        const comparisonNewUrl = this.getComparisonUrl(newUrl);

        let query = {};
        if (!this.settings.getDeduplicateInAllWindows()) {
            query = { windowId: sourceWindowId };
        }

        const allTabs = await browser.tabs.query(query);
        const existingTabs = allTabs.filter(tab => {
            if (!tab.url) return false;
            if (tab.id === currentTabId) return false;
            return this.getComparisonUrl(tab.url) === comparisonNewUrl;
        });

        // Sort to priotize pinned tabs, then winows with the sourceWindowId, then most recently active tabs
        return existingTabs.sort((a, b) => {
            if (a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }
            if (a.windowId === sourceWindowId && b.windowId !== sourceWindowId) {
                return -1;
            }
            if (a.windowId !== sourceWindowId && b.windowId === sourceWindowId) {
                return 1;
            }
            return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
        });
    }

    private getComparisonUrl(url: string): string {
        try {
            const parsedUrl = new URL(url);

            if (this.settings.getIgnoreQuery()) {
                parsedUrl.search = '';
            }
            if (this.settings.getIgnoreHash()) {
                parsedUrl.hash = '';
            }

            return parsedUrl.href;
        } catch (e) {
            console.error(`Invalid URL: ${url}`);
            return url;
        }
    }
    
    private async goBackAndSwitch(navigationData: NavigationData, oldTabs: browser.tabs.Tab[]): Promise<void> {
        const tabSwitched = await this.switchToTab(oldTabs[0].id, oldTabs[0].windowId);
        if (!tabSwitched) return;
        await browser.tabs.goBack(navigationData.tabId)
            .then(() => void this.dedupeCounter.increment())
            .catch(error => {
                console.error(`Failed to go back in tab ${navigationData.tabId}:`, error);
            });
    }

    private async deleteOldAndSwitch(navigationData: NavigationData, method: NavigationMethod, oldTabs: browser.tabs.Tab[]): Promise<void> {
        const tabSwitched = await this.switchToTab(navigationData.tabId, navigationData.targetWindowId);
        if (!tabSwitched) return;
        await this.deleteOld(navigationData, method, oldTabs, tabSwitched);
    }
    
    private async deleteOld(navigationData: NavigationData, method: NavigationMethod, oldTabs: browser.tabs.Tab[], tabSwitched: boolean): Promise<void> {
        if (!tabSwitched) {
            await this.stayOnSourceTab(navigationData, method)
        }
        if (method !== 'redirect') {
            await Promise.all(
                oldTabs
                    .filter((existingTab) => existingTab.id !== undefined && !existingTab.pinned)
                    .map((existingTab) => this.closeTab(existingTab.id!, existingTab.url ?? 'about:blank', existingTab.windowId))
            );
        }
    }
    
    private async deleteNewAndSwitch(navigationData: NavigationData, method: NavigationMethod, oldTabs: browser.tabs.Tab[], newUrl: string): Promise<void> {
        const tabSwitched = await this.switchToTab(oldTabs[0].id, oldTabs[0].windowId);
        if (!tabSwitched) return;
        await this.deleteNew(navigationData, method, newUrl);
    }
    
    private async deleteNew(navigationData: NavigationData, method: NavigationMethod, newUrl: string): Promise<void> {
        if (method === 'redirect') {
            await browser.tabs.goBack(navigationData.tabId)
                .catch(error => {
                    console.error(`Failed to go back in tab ${navigationData.tabId}:`, error);
                });
        } else {
            await this.closeTab(navigationData.tabId, newUrl, navigationData.targetWindowId);
        }
    }

    private async stayOnSourceTab(navigationData: NavigationData, method: NavigationMethod): Promise<void> {
        if (method === 'openedInNewWindow') {
            if (this.windowTracker.newWindowNotFocusedYet(navigationData.targetWindowId)) {
                this.overrideNextFocus(navigationData.sourceWindowId);
            } else {
                await browser.windows.update(navigationData.sourceWindowId, { focused: true })
                    .catch(error => {
                        console.error(`Failed to focus source window ${navigationData.sourceWindowId}:`, error);
                    });
            }
        } else if (method === 'openedInNewTabInSameWindow') {
            await browser.tabs.update(navigationData.sourceTabId, { active: true })
                .catch(error => {
                    console.error(`Failed to focus source tab ${navigationData.sourceTabId}:`, error);
                });
        }
    }

    private overrideNextFocus(windowId: number): void {
        const overrideFocusListener = async (focusedWindowId: number): Promise<void> => {
            if (focusedWindowId !== -1) {
                browser.windows.onFocusChanged.removeListener(overrideFocusListener);
                await browser.windows.update(windowId, { focused: true })
                    .catch(error => {
                        console.error(`Failed to focus window ${windowId}:`, error);
                    });
            }
        };
        browser.windows.onFocusChanged.addListener(overrideFocusListener);
    }

    private async switchToTab(tabId: number | undefined, windowId: number | undefined): Promise<boolean> {
        if (tabId !== undefined && windowId !== undefined) {
            try {
                await browser.windows.update(windowId, { focused: true });
                await browser.tabs.update(tabId, { active: true });
                return true;
            } catch (error) {
                console.error(`Failed to switch to tab ${tabId} in window ${windowId}:`, error);
                return false;
            }
        } else {
            return false;
        }
    }

    private async closeTab(tabId: number, targetUrl: string, windowId: number | undefined): Promise<void> {
        if (this.settings.getRemoveDeduplicatedTabsFromHistory() && windowId !== undefined) {
            this.tabForgettor.addTabToForgetQueue(targetUrl, windowId);
        }
        await browser.tabs.remove(tabId)
            .then(() => void this.dedupeCounter.increment())
            .catch(error => {
                console.error(`Failed to remove tab ${tabId}:`, error);
            });
    }
}