import Pause from "./Pause";
import Settings, { SwitchBehavior } from "./Settings";

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

    const existingTab = await findExistingTab(requestDetails.url, currentTab.id, sourceWindowId);
    if (!existingTab) return allowRequest(requestDetails.tabId, currentTab.windowId);

    let switchBehavior: SwitchBehavior;
    if (currentTab.windowId === existingTab.windowId || isOpenedInNewWindow(currentTab)) {
      switchBehavior = settings.onDuplicateTabFoundInSameWindow;
    } else {
      switchBehavior = settings.onDuplicateTabFoundInOtherWindow;
    }

    let tabSwitched = false;
    switch (switchBehavior) {
      case 'deleteOldAndSwitch':
        tabSwitched = await switchToTab(currentTab);
        if (!tabSwitched) return allowRequest(requestDetails.tabId, currentTab.windowId);
      case 'deleteOld':
        if (!tabSwitched && isOpenedInNewWindow(currentTab)) {
          if (refocusTracker) {
            await browser.windows.update(sourceWindowId, { focused: true });
          } else {
            const overrideFocusListener = async () => {
              await browser.windows.update(sourceWindowId, { focused: true });
              browser.windows.onFocusChanged.removeListener(overrideFocusListener);
            };
            browser.windows.onFocusChanged.addListener(overrideFocusListener);
          }
        }
        if (!isRedirect(currentTab)) await closeTab(existingTab.id, existingTab.url ?? 'about:blank');
        return allowRequest(requestDetails.tabId, currentTab.windowId);
      case 'deleteNewAndSwitch':
        tabSwitched = await switchToTab(existingTab);
        if (!tabSwitched) return allowRequest(requestDetails.tabId, currentTab.windowId);
      case 'deleteNew':
        if (!isRedirect(currentTab)) await closeTab(currentTab.id, requestDetails.url);
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

async function findExistingTab(url: string, currentTabId: number | undefined, sourceWindowId: number) {
  const targetUrl = await getComparisonUrl(url);

  let query = {};
  if (!(await Settings.getDeduplicateInAllWindows())) {
    query = { windowId: sourceWindowId };
  }

  const allTabs = await browser.tabs.query(query);
  for (const tab of allTabs) {
    if (tab.url && tab.id !== currentTabId) {
      const tabComparisonUrl = await getComparisonUrl(tab.url);
      if (tabComparisonUrl === targetUrl) {
        return tab as browser.tabs.Tab & { id: number };
      }
    }
  }

  return null;
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