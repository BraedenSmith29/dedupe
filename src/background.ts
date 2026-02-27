import Pause from "./Pause";
import Settings from "./Settings";

browser.runtime.onStartup.addListener(async () => {
  const pauseStatus = (await Pause.getPause()).pauseStatus;
  if (pauseStatus === 'session') {
    await Pause.unpause();
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'updatedSettings') {
    Settings.clearCache();
  }
});

const newTabs = new Set<number>();
const newWindows = new Set<number>();

browser.tabs.onCreated.addListener((tab) => {
  if (tab.id) newTabs.add(tab.id);
});

browser.tabs.onRemoved.addListener((tabId) => {
  newTabs.delete(tabId);
});

browser.windows.onCreated.addListener((window) => {
  if (window.id && window.type === 'normal') newWindows.add(window.id);
});

browser.windows.onRemoved.addListener((windowId) => {
  newWindows.delete(windowId);
});

let currentFocusedWindowId = -1;

browser.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== -1) {
    currentFocusedWindowId = windowId;
  }
});

function isReloadingTab(tab: browser.tabs.Tab, newUrl: string) {
  return tab.url === newUrl;
}

function isDeliberateDuplicateOrOpenedFromHistory(tab: browser.tabs.Tab) {
  return tab.url !== 'about:blank' && tab.url !== 'about:newtab' && tab.url !== 'about:home' && tab.id !== undefined && newTabs.has(tab.id);
}

function isFirstNavigationInFreshTab(tab: browser.tabs.Tab) {
  return tab.url === 'about:newtab' || tab.url === 'about:home';
}

function isOpenedInNewWindow(tab: browser.tabs.Tab) {
  return tab.url === 'about:blank' && tab.windowId !== undefined && newWindows.has(tab.windowId) && !isFirstNavigationInFreshTab(tab);
}

function isOpenedInNewTabInSameWindow(tab: browser.tabs.Tab) {
  return tab.url === 'about:blank' && tab.id !== undefined && newTabs.has(tab.id) && !isOpenedInNewWindow(tab) && !isFirstNavigationInFreshTab(tab);
}

function isRedirect(tab: browser.tabs.Tab) {
  return tab.url !== 'about:blank' && !isOpenedInNewTabInSameWindow(tab) && !isOpenedInNewWindow(tab) && !isFirstNavigationInFreshTab(tab);
}

// Helps track if a refocus occurs in the middle of a webRequest
let refocusTracker = false;
browser.windows.onFocusChanged.addListener(() => {
  refocusTracker = true;
});

browser.webRequest.onBeforeRequest.addListener(
  async (requestDetails) => {
    const sourceWindowId = currentFocusedWindowId;
    refocusTracker = false;

    const allowRequest = (tabId: number | null = null, windowId: number | null = null) => {
      if (tabId !== null) newTabs.delete(tabId);
      if (windowId !== null) newWindows.delete(windowId);
      return { cancel: false };
    }

    if (requestDetails.tabId === -1) return allowRequest();

    const currentTab = await browser.tabs.get(requestDetails.tabId).catch(() => null) as (browser.tabs.Tab & { id: number } | null);
    if (!currentTab) return allowRequest(requestDetails.tabId);
    
    if (await Pause.isPaused()) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }

    if (isReloadingTab(currentTab, requestDetails.url)) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }
    if (isDeliberateDuplicateOrOpenedFromHistory(currentTab)) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }

    const settings = await Settings.getSettings();
    if (isFirstNavigationInFreshTab(currentTab) && !settings.checkWhenFirstNavigationInFreshTab) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }
    if (isOpenedInNewWindow(currentTab) && !settings.checkWhenOpeningNewWindow) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }
    if (isOpenedInNewTabInSameWindow(currentTab) && !settings.checkWhenOpeningNewTab) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }
    if (isRedirect(currentTab) && !settings.checkWhenRedirecting) {
      return allowRequest(requestDetails.tabId, currentTab.windowId);
    }

    const existingTabs = await findExistingTabs(requestDetails.url, currentTab.id, sourceWindowId);
    if (existingTabs.length === 0) return allowRequest(requestDetails.tabId, currentTab.windowId);

    let tabSwitched = false;
    switch (settings.switchBehavior) {
      case 'deleteOldAndSwitch':
        tabSwitched = await switchToTab(currentTab);
        if (!tabSwitched) return allowRequest(requestDetails.tabId, currentTab.windowId);
      case 'deleteOld':
        if (!tabSwitched && isOpenedInNewWindow(currentTab)) {
          if (refocusTracker) {
            await browser.windows.update(sourceWindowId, { focused: true });
          } else {
            const overrideFocusListener = async (windowId: number) => {
              if (windowId !== -1) {
                await browser.windows.update(sourceWindowId, { focused: true });
                browser.windows.onFocusChanged.removeListener(overrideFocusListener);
              }
            };
            browser.windows.onFocusChanged.addListener(overrideFocusListener);
          }
        }
        if (!isRedirect(currentTab)) {
          existingTabs.forEach(async (existingTab) => {
            if (existingTab.id && !existingTab.pinned) {
              await closeTab(existingTab.id, existingTab.url ?? 'about:blank');
            }
          });
        }
        return allowRequest(requestDetails.tabId, currentTab.windowId);
      case 'deleteNewAndSwitch':
        tabSwitched = await switchToTab(existingTabs[0]);
        if (!tabSwitched) return allowRequest(requestDetails.tabId, currentTab.windowId);
      case 'deleteNew':
        if (!isRedirect(currentTab) && !currentTab.pinned) await closeTab(currentTab.id, requestDetails.url);
        return { cancel: true };
      default:
        // Should never reach here since settings are validated, but just in case:
        return allowRequest(requestDetails.tabId, currentTab.windowId);
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["blocking"]
);

async function getComparisonUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (await Settings.getIgnoreQuery()) {
      parsedUrl.search = '';
    }
    if (await Settings.getIgnoreHash()) {
      parsedUrl.hash = '';
    }

    return parsedUrl.href;
  } catch (e) {
    console.error(`Invalid URL: ${url}`);
    return url;
  }
}

async function findExistingTabs(url: string, currentTabId: number | undefined, sourceWindowId: number) {
  const targetUrl = await getComparisonUrl(url);

  let query = {};
  if (!(await Settings.getDeduplicateInAllWindows())) {
    query = { windowId: sourceWindowId };
  }

  const allTabs = await browser.tabs.query(query);
  const tabMatchMap = await Promise.all(
    allTabs.map(async (tab) => ({
      value: tab,
      include: tab.url && tab.id !== currentTabId ? await getComparisonUrl(tab.url) === targetUrl : false
    }))
  );
  const existingTabs = tabMatchMap.filter((x) => x.include).map((x) => x.value);

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

async function switchToTab(tab: browser.tabs.Tab) {
  if (tab.id && tab.windowId) {
    await browser.windows.update(tab.windowId, { focused: true });
    await browser.tabs.update(tab.id, { active: true });
    return true;
  } else {
    return false;
  }
}

async function closeTab(tabId: number, targetUrl: string) {
  if (!(await Settings.getRemoveDeduplicatedTabsFromHistory())) {
    await browser.tabs.update(tabId, { url: targetUrl });
  }
  await browser.tabs.remove(tabId);
}