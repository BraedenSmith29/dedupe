import Settings from "./Settings";

export type NavigationAttributes = {
    reload: boolean;
    deliberateDuplicateOrHistory: boolean;
    firstNavigationInFreshTab: boolean;
    openedInNewWindow: boolean;
    openedInNewTabInSameWindow: boolean;
    redirect: boolean;
    shouldDeduplicate: boolean;
};

export default class NavigationClassifier {
    private readonly settings: Settings;

    private readonly newTabs = new Set<number>();
    private readonly newWindows = new Set<number>();

    private readonly onTabCreated = (tab: browser.tabs.Tab) => {
        if (tab.id) this.newTabs.add(tab.id);
    };

    private readonly onTabRemoved = (tabId: number) => {
        this.newTabs.delete(tabId);
    };

    private readonly onWindowCreated = (window: browser.windows.Window) => {
        if (window.id && window.type === 'normal') this.newWindows.add(window.id);
    };

    private readonly onWindowRemoved = (windowId: number) => {
        this.newWindows.delete(windowId);
    };

    public constructor(settings: Settings) {
        this.settings = settings;

        browser.tabs.onCreated.addListener(this.onTabCreated);
        browser.tabs.onRemoved.addListener(this.onTabRemoved);
        browser.windows.onCreated.addListener(this.onWindowCreated);
        browser.windows.onRemoved.addListener(this.onWindowRemoved);
    }

    public destroy() {
        browser.tabs.onCreated.removeListener(this.onTabCreated);
        browser.tabs.onRemoved.removeListener(this.onTabRemoved);
        browser.windows.onCreated.removeListener(this.onWindowCreated);
        browser.windows.onRemoved.removeListener(this.onWindowRemoved);

        this.newTabs.clear();
        this.newWindows.clear();
    }

    private isReloadingTab(tab: browser.tabs.Tab, newUrl: string) {
        return tab.url === newUrl;
    }

    private isDeliberateDuplicateOrOpenedFromHistory(tab: browser.tabs.Tab) {
        return tab.url !== 'about:blank' && tab.url !== 'about:newtab' && tab.url !== 'about:home' && tab.id !== undefined && this.newTabs.has(tab.id);
    }

    private isFirstNavigationInFreshTab(tab: browser.tabs.Tab) {
        return tab.url === 'about:newtab' || tab.url === 'about:home';
    }

    private isLinkOpenedInNewWindow(tab: browser.tabs.Tab) {
        return tab.url === 'about:blank' && tab.windowId !== undefined && this.newWindows.has(tab.windowId) && !this.isFirstNavigationInFreshTab(tab);
    }

    private isLinkOpenedInNewTabInSameWindow(tab: browser.tabs.Tab) {
        return tab.url === 'about:blank' && tab.id !== undefined && this.newTabs.has(tab.id) && !this.isLinkOpenedInNewWindow(tab) && !this.isFirstNavigationInFreshTab(tab);
    }

    private isRedirect(tab: browser.tabs.Tab) {
        return tab.url !== 'about:blank' && !this.isLinkOpenedInNewTabInSameWindow(tab) && !this.isLinkOpenedInNewWindow(tab) && !this.isFirstNavigationInFreshTab(tab);
    }

    public classifyNavigation(targetTab: browser.tabs.Tab, targetUrl: string): NavigationAttributes {
        const navigationType: NavigationAttributes = {
            reload: false,
            deliberateDuplicateOrHistory: false,
            firstNavigationInFreshTab: false,
            openedInNewWindow: false,
            openedInNewTabInSameWindow: false,
            redirect: false,
            shouldDeduplicate: false,
        };

        if (this.isReloadingTab(targetTab, targetUrl)) {
            navigationType.reload = true;
        } else if (this.isDeliberateDuplicateOrOpenedFromHistory(targetTab)) {
            navigationType.deliberateDuplicateOrHistory = true;
        } else if (this.isFirstNavigationInFreshTab(targetTab)) {
            navigationType.firstNavigationInFreshTab = true;
            navigationType.shouldDeduplicate = this.settings.getCheckWhenFirstNavigationInFreshTab();
        } else if (this.isLinkOpenedInNewWindow(targetTab)) {
            navigationType.openedInNewWindow = true;
            navigationType.shouldDeduplicate = this.settings.getCheckWhenOpeningLinkInNewWindow();
        } else if (this.isLinkOpenedInNewTabInSameWindow(targetTab)) {
            navigationType.openedInNewTabInSameWindow = true;
            navigationType.shouldDeduplicate = this.settings.getCheckWhenOpeningLinkInNewTab();
        } else if (this.isRedirect(targetTab)) {
            navigationType.redirect = true;
            navigationType.shouldDeduplicate = this.settings.getCheckWhenRedirecting();
        }

        if (targetTab.id !== undefined) this.newTabs.delete(targetTab.id);
        if (targetTab.windowId !== undefined) this.newWindows.delete(targetTab.windowId);

        return navigationType;
    }
}