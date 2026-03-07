import Pause from "./Pause";
import Settings from "./Settings";
import TabTracker from "./TabTracker";
import WindowTracker from "./WindowTracker";

async function init() {

const settings = await Settings.create();
const pause = await Pause.create();
const windowTracker = await WindowTracker.create();
const tabTracker = await TabTracker.create(settings, windowTracker);

browser.runtime.onStartup.addListener(async () => {
  // TODO: Make sure this works since it's added in an asynchronous context.
  if (pause.getPauseStatus() === 'session') {
    await pause.unpause();
  }
});

tabTracker.setDeduplicationCandidateFoundListener(async (tabData, targetUrl, method) => {
  if (pause.isPaused()) return;

  // Check if the deduplication method is disabled in settings
  if (method.reload || method.deliberateDuplicateOrHistory) return;
  if (method.firstNavigationInFreshTab && !settings.getCheckWhenFirstNavigationInFreshTab()) return;
  if (method.openedInNewWindow && !settings.getCheckWhenOpeningLinkInNewWindow()) return;
  if (method.openedInNewTabInSameWindow && !settings.getCheckWhenOpeningLinkInNewTab()) return;
  if (method.redirect && !settings.getCheckWhenRedirecting()) return;

  const existingTabs = await findExistingTabs(targetUrl, tabData.tabId, tabData.sourceWindowId);
  if (existingTabs.length === 0) return;

  let tabSwitched = false;
  switch (settings.getSwitchBehavior()) {
    case 'deleteOldAndSwitch':
      tabSwitched = await switchToTab(tabData.tabId, tabData.targetWindowId);
      if (!tabSwitched) return;
    case 'deleteOld':
      if (!tabSwitched && method.openedInNewWindow) {
        if (windowTracker.isNewWindowFocused(tabData.targetWindowId)) {
          await browser.windows.update(tabData.sourceWindowId, { focused: true });
        } else {
          const overrideFocusListener = async (windowId: number) => {
            if (windowId !== -1) {
              await browser.windows.update(tabData.sourceWindowId, { focused: true });
              browser.windows.onFocusChanged.removeListener(overrideFocusListener);
            }
          };
          browser.windows.onFocusChanged.addListener(overrideFocusListener);
        }
      }
      if (!method.redirect) {
        existingTabs.forEach(async (existingTab) => {
          if (existingTab.id && !existingTab.pinned) {
            await closeTab(existingTab.id, existingTab.url ?? 'about:blank');
          }
        });
      }
      return;
    case 'deleteNewAndSwitch':
      tabSwitched = await switchToTab(existingTabs[0].id, existingTabs[0].windowId);
      if (!tabSwitched) return;
    case 'deleteNew':
      if (method.redirect) {
        await browser.tabs.goBack(tabData.tabId);
      } else {
        await closeTab(tabData.tabId, targetUrl)
      }
      return;
    default:
      // Should never reach here since settings are validated, but just in case:
      return;
  }
});

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

async function switchToTab(tabId: number | undefined, windowId: number | undefined): Promise<boolean> {
  if (tabId && windowId) {
    await browser.windows.update(windowId, { focused: true });
    await browser.tabs.update(tabId, { active: true });
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