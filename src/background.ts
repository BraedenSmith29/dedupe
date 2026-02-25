import Pause from "./Pause";
import Settings from "./Settings";

browser.runtime.onStartup.addListener(async () => {
  const pauseStatus = (await Pause.getPause()).pauseStatus;
  if (pauseStatus === 'session') {
    await Pause.unpause();
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'handleManualNewTabRedirect') {
    const existingTab = await findExistingTab(message.url);
    
    if (existingTab) {
      const tabSwitched = await switchToTab(existingTab);
      if (tabSwitched) return;
    }

    await browser.tabs.create({ url: message.url, active: false });
  } else if (message.action === 'updatedSettings') {
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

function isReloadingTab(tab: browser.tabs.Tab, newUrl: string) {
  return tab.url === newUrl;
}

function isDeliberateDuplicateOrOpenedFromHistory(tab: browser.tabs.Tab) {
  return tab.url !== 'about:blank' && tab.url !== 'about:newtab' && tab.url !== 'about:home' && tab.id && newTabs.has(tab.id);
}

function isFirstNavigationInFreshTab(tab: browser.tabs.Tab) {
  return tab.url === 'about:newtab' || tab.url === 'about:home';
}

function isOpenedInNewWindow(tab: browser.tabs.Tab) {
  return tab.url === 'about:blank' && tab.windowId && newWindows.has(tab.windowId) && !isFirstNavigationInFreshTab(tab);
}

function isOpenedInNewTabInSameWindow(tab: browser.tabs.Tab) {
  return tab.url === 'about:blank' && tab.id && newTabs.has(tab.id) && !isOpenedInNewWindow(tab) && !isFirstNavigationInFreshTab(tab);
}

function isRedirect(tab: browser.tabs.Tab) {
  return tab.url !== 'about:blank' && !isOpenedInNewTabInSameWindow(tab) && !isOpenedInNewWindow(tab) && !isFirstNavigationInFreshTab(tab);
}

browser.webRequest.onBeforeRequest.addListener(
  async (requestDetails) => {
    const allowRequest = (tabId: number | null = null, windowId: number | null = null) => {
      if (tabId !== null) newTabs.delete(tabId);
      if (windowId !== null) newWindows.delete(windowId);
      return { cancel: false };
    }

    if (requestDetails.tabId === -1) return allowRequest();

    const currentTab = await browser.tabs.get(requestDetails.tabId).catch(() => null);
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

    const existingTab = await findExistingTab(requestDetails.url, currentTab.id);
    if (!existingTab) return allowRequest(requestDetails.tabId, currentTab.windowId);

    const tabSwitched = await switchToTab(existingTab);
    if (!tabSwitched) return allowRequest(requestDetails.tabId, currentTab.windowId);

    await closeTab(requestDetails.tabId, true);

    return { cancel: true };
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

async function findExistingTab(url: string, currentTabId: number | null = null) {
  const targetUrl = await getComparisonUrl(url);
  return browser.tabs.query({})
    .then(async tabs => {
      for (const tab of tabs) {
        if (tab.url && tab.id !== currentTabId) {
          const tabComparisonUrl = await getComparisonUrl(tab.url);
          if (tabComparisonUrl === targetUrl) {
            return tab;
          }
        }
      }
    })
    .catch(() => null);
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

async function closeTab(tabId: number, noHistory: boolean = false) {
  if (noHistory) {
    await browser.tabs.update(tabId, { url: 'about:blank' });
  }
  await browser.tabs.remove(tabId);
}