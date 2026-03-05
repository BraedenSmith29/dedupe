import NavigationClassifier from "./NavigationClassifier";
import Pause from "./Pause";
import Settings from "./Settings";

async function init() {

const settings = await Settings.create();
const pause = await Pause.create();
const navigationClassifier = new NavigationClassifier(settings);

browser.runtime.onStartup.addListener(async () => {
  // TODO: Make sure this works since it's added in an asynchronous context.
  if (pause.getPauseStatus() === 'session') {
    await pause.unpause();
  }
});

let currentFocusedWindowId = -1;

browser.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== -1) {
    currentFocusedWindowId = windowId;
  }
});

// Helps track if a refocus occurs in the middle of a webRequest
let refocusTracker = false;
browser.windows.onFocusChanged.addListener(() => {
  refocusTracker = true;
});

browser.webRequest.onBeforeRequest.addListener(
  async (requestDetails) => {
    const sourceWindowId = currentFocusedWindowId;
    refocusTracker = false;

    const allowRequest = { cancel: false };
    const denyRequest = { cancel: true };

    if (requestDetails.tabId === -1) return allowRequest;

    const currentTab = await browser.tabs.get(requestDetails.tabId).catch(() => null) as (browser.tabs.Tab & { id: number } | null);
    if (!currentTab) return allowRequest;
    
    if (pause.isPaused()) {
      return allowRequest;
    }

    const navigationType = navigationClassifier.classifyNavigation(currentTab, requestDetails.url);
    if (!navigationType.shouldDeduplicate) {
      return allowRequest;
    }

    const existingTabs = await findExistingTabs(requestDetails.url, currentTab.id, sourceWindowId);
    if (existingTabs.length === 0) return allowRequest;

    let tabSwitched = false;
    switch (settings.getSwitchBehavior()) {
      case 'deleteOldAndSwitch':
        tabSwitched = await switchToTab(currentTab);
        if (!tabSwitched) return allowRequest;
      case 'deleteOld':
        if (!tabSwitched && navigationType.openedInNewWindow) {
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
        if (!navigationType.redirect) {
          existingTabs.forEach(async (existingTab) => {
            if (existingTab.id && !existingTab.pinned) {
              await closeTab(existingTab.id, existingTab.url ?? 'about:blank');
            }
          });
        }
        return allowRequest;
      case 'deleteNewAndSwitch':
        tabSwitched = await switchToTab(existingTabs[0]);
        if (!tabSwitched) return allowRequest;
      case 'deleteNew':
        if (!navigationType.redirect && !currentTab.pinned) await closeTab(currentTab.id, requestDetails.url);
        return denyRequest;
      default:
        // Should never reach here since settings are validated, but just in case:
        return allowRequest;
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["blocking"]
);

function getComparisonUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (settings.getIgnoreQuery()) {
      parsedUrl.search = '';
    }
    if (settings.getIgnoreHash()) {
      parsedUrl.hash = '';
    }

    return parsedUrl.href;
  } catch (e) {
    console.error(`Invalid URL: ${url}`);
    return url;
  }
}

async function findExistingTabs(url: string, currentTabId: number | undefined, sourceWindowId: number) {
  const targetUrl = getComparisonUrl(url);

  let query = {};
  if (!settings.getDeduplicateInAllWindows()) {
    query = { windowId: sourceWindowId };
  }

  const allTabs = await browser.tabs.query(query);
  const existingTabs = allTabs.filter(tab => {
    if (!tab.url) return false;
    if (tab.id === currentTabId) return false;
    return getComparisonUrl(tab.url) === targetUrl;
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
  if (!settings.getRemoveDeduplicatedTabsFromHistory()) {
    await browser.tabs.update(tabId, { url: targetUrl });
  }
  await browser.tabs.remove(tabId);
}

}

init();