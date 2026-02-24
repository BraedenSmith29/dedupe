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

browser.webRequest.onBeforeRequest.addListener(
  async (requestDetails) => {
    if (requestDetails.tabId === -1) return { cancel: false };

    const currentTab = await browser.tabs.get(requestDetails.tabId).catch(() => null);
    if (!currentTab) return { cancel: false };
    if (currentTab.url !== 'about:blank') return { cancel: false };
    
    const existingTab = await findExistingTab(requestDetails.url);
    if (!existingTab) return { cancel: false };

    const tabSwitched = await switchToTab(existingTab);
    if (!tabSwitched) return { cancel: false };

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

async function findExistingTab(url: string) {
  const targetUrl = await getComparisonUrl(url);
  return browser.tabs.query({})
    .then(async tabs => {
      for (const tab of tabs) {
        if (tab.url) {
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