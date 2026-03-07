import Pause, { PausedStatus } from "./Pause.js";
import Settings, { SwitchBehavior } from "./Settings.js";

async function init() {

const settings = await Settings.create();
const pause = await Pause.create();

function setupSettingsToggle(): void {
    const settingsToggle = document.getElementById('settingsToggle') as HTMLElement;
    const settingsSection = document.getElementById('settings') as HTMLElement;
    const controlsSection = document.getElementById('controls') as HTMLElement;

    settingsToggle.addEventListener('click', () => {
        settingsSection.hidden = !settingsSection.hidden;
        controlsSection.hidden = !controlsSection.hidden;
        settingsToggle.classList.toggle('selected');
        // Force window resize
        document.documentElement.style.height = 'auto';
    });
}

function setUpPausing(): void {
    const buttons = document.querySelectorAll('.apply-pause');
    buttons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();

            if (btn.classList.contains('selected')) {
                await pause.unpause();
                updatePauseStatus();
                return;
            }

            const duration = btn.getAttribute('data-duration');
            if (!duration) {
                console.error('Pause button missing data-duration attribute');
                return;
            }

            let pauseMinutes;
            if (duration === 'preset0' || duration === 'preset1') {
                const index = parseInt(btn.getAttribute('data-index') || '', 10);
                if (isNaN(index) || (index !== 0 && index !== 1)) {
                    console.error('Invalid data-index value');
                    return;
                }
                pauseMinutes = settings.getPauseTimePreset(index);
            } else if (duration === 'custom') {
                const customDurationInput = document.getElementById('customPauseDuration') as HTMLInputElement;
                pauseMinutes = parseInt(customDurationInput.value, 10);
                if (isNaN(pauseMinutes) || pauseMinutes <= 0) {
                    alert('Please enter a valid number of minutes for custom pause duration.');
                    return;
                }
            }

            const customPauseDurationContainer = document.getElementById('customPauseDurationContainer') as HTMLElement;
            customPauseDurationContainer.hidden = true;

            await pause.setPause({
                pauseStatus: duration as PausedStatus,
                pausedUntil: pauseMinutes ? Date.now() + pauseMinutes * 60000 : null,
            });
            updatePauseStatus();
        });
    });

    const customButton = document.getElementById('custom');
    customButton?.addEventListener('click', async () => {
        const customPauseDurationContainer = document.getElementById('customPauseDurationContainer') as HTMLElement;
        if (customButton.classList.contains('selected') || !customPauseDurationContainer.hidden) {
            await pause.unpause();
            updatePauseStatus();
            customPauseDurationContainer.hidden = true;
        } else {
            customPauseDurationContainer.hidden = false;
        }
    });

    updatePauseStatus();
    setInterval(updatePauseStatus, 1000);
}

function updatePauseStatus(): void {
    const statusBadge = document.getElementById('statusBadge') as HTMLElement;
    const pauseStatusLabel = document.getElementById('pauseStatus') as HTMLElement;
    const buttons = document.querySelectorAll('.pause-btn');

    if (pause.isPaused()) {
        statusBadge.textContent = 'Paused';
        statusBadge.classList.add('paused');

        const pausedUntil = pause.getPausedUntil();
        if (pausedUntil) {
            pauseStatusLabel.textContent = getResumingCountdownText(pausedUntil);
            pauseStatusLabel.hidden = false;
        } else {
            pauseStatusLabel.hidden = true;
        }
    } else {
        statusBadge.textContent = 'Active';
        statusBadge.classList.remove('paused');

        pauseStatusLabel.hidden = true;
    }

    buttons.forEach(btn => {
        const btnDuration = btn.getAttribute('data-duration');
        if (btnDuration === pause.getPauseStatus()) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function getResumingCountdownText(pausedUntil: number): string {
    const remainingSeconds = Math.ceil((pausedUntil - Date.now()) / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    if (hours > 0 && minutes > 0) {
        return `Resuming in ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `Resuming in ${hours}h`;
    } else if (minutes > 0 && seconds > 0) {
        return `Resuming in ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `Resuming in ${minutes}m`;
    } else {
        return `Resuming in ${seconds}s`;
    }
}

type DuplicateTabItem = {
    tabId: number;
    windowId: number;
    index: number;
    title: string;
    url: string;
};

async function getDuplicateTabs(): Promise<DuplicateTabItem[][]> {
    const currentWindowId = await browser.windows.getCurrent().then(w => w.id);

    const tabs = await browser.tabs.query({});
    const sortedTabs = new Map<string, DuplicateTabItem[]>();
    const duplicateUrls: string[] = [];

    for (const tab of tabs) {
        if (!tab.id || !tab.windowId || !tab.url) continue;

        const otherUrls = sortedTabs.get(tab.url) ?? [];
        otherUrls.push({
            tabId: tab.id,
            windowId: tab.windowId,
            title: tab.title || "Untitled",
            url: tab.url,
            index: tab.index,
        });

        otherUrls.sort((a, b) => {
            if (a.windowId === b.windowId) return a.index - b.index;
            if (a.windowId === currentWindowId) return -1;
            if (b.windowId === currentWindowId) return 1;
            return a.windowId - b.windowId;
        })

        sortedTabs.set(tab.url, otherUrls);

        if (otherUrls.length === 2) {
            duplicateUrls.push(tab.url);
        }
    }

    return [...sortedTabs.values()].filter(group => group.length > 1);
}

function updateDuplicateTabsListState(): void {
    const list = document.getElementById('duplicateTabsList') as HTMLUListElement | null;
    const emptyState = document.getElementById('duplicateTabsEmptyState') as HTMLElement | null;
    const deduplicateAllButton = document.getElementById('deduplicateAll') as HTMLButtonElement | null;
    if (!list || !emptyState || !deduplicateAllButton) return;

    emptyState.hidden = list.childNodes.length > 0;
    deduplicateAllButton.disabled = list.childNodes.length === 0;
}

async function renderDuplicateTabs(): Promise<void> {
    const list = document.getElementById('duplicateTabsList') as HTMLUListElement | null;
    const template = document.getElementById('duplicateTabItemTemplate') as HTMLTemplateElement | null;
    const emptyState = document.getElementById('duplicateTabsEmptyState') as HTMLElement | null;
    const deduplicateAllButton = document.getElementById('deduplicateAll') as HTMLButtonElement | null;
    if (!list || !template || !emptyState || !deduplicateAllButton) return;

    const duplicateGroups = await getDuplicateTabs();
    const listItems: HTMLElement[] = [];
    for (const group of duplicateGroups) {
        const currentGroupItems: HTMLElement[] = [];
        for (const item of group) {
            const row = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
            if (!row) continue;

            const title = row.querySelector('.tab-title') as HTMLElement | null;
            const deleteButton = row.querySelector('.tab-delete') as HTMLButtonElement | null;
            if (!title || !deleteButton) continue;

            row.setAttribute('data-tab-id', item.tabId.toString());
            title.textContent = item.title;
            title.setAttribute('aria-label', `Go to tab: ${item.title}`);
            deleteButton.setAttribute('aria-label', `Delete tab: ${item.title}`);

            title.addEventListener('click', () => {
                browser.tabs.update(item.tabId, { active: true });
                browser.windows.update(item.windowId, { focused: true });
            });

            deleteButton.addEventListener('click', () => {
                if (group.length === 2) {
                    currentGroupItems.forEach(i => i.remove());
                } else {
                    row.remove();
                }
                updateDuplicateTabsListState();
                browser.tabs.remove(item.tabId);
            });

            currentGroupItems.push(row);
            listItems.push(row);
        }
    }

    list.replaceChildren(...listItems);
    updateDuplicateTabsListState();
}

function setUpTabDeduplication() {
    const deduplicateAllButton = document.getElementById('deduplicateAll') as HTMLButtonElement | null;
    if (!deduplicateAllButton) return;

    deduplicateAllButton.addEventListener('click', async () => {
        const duplicateTabs = await getDuplicateTabs();
        for (const group of duplicateTabs) {
            // Remove all but the first tab in each group
            group.slice(1).forEach(tab => {
                browser.tabs.remove(tab.tabId);
            });
        }
        document.getElementById('duplicateTabsList')?.replaceChildren();
        updateDuplicateTabsListState();
    });

    renderDuplicateTabs();
    browser.tabs.onCreated.addListener(renderDuplicateTabs);
    browser.tabs.onRemoved.addListener(renderDuplicateTabs);
    browser.tabs.onUpdated.addListener(renderDuplicateTabs);
}

function setDarkMode(): void {
    if (settings.getDarkMode()) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function setUpBasicSettingsHandlers(): void {
    const deduplicateInAllWindows = document.getElementById('deduplicateInAllWindows') as HTMLInputElement;
    const checkWhenRedirecting = document.getElementById('checkWhenRedirecting') as HTMLInputElement;
    const checkWhenOpeningLinkInNewTab = document.getElementById('checkWhenOpeningLinkInNewTab') as HTMLInputElement;
    const checkWhenOpeningLinkInNewWindow = document.getElementById('checkWhenOpeningLinkInNewWindow') as HTMLInputElement;
    const checkWhenFirstNavigationInFreshTab = document.getElementById('checkWhenFirstNavigationInFreshTab') as HTMLInputElement;
    const removeDeduplicatedTabsFromHistory = document.getElementById('removeDeduplicatedTabsFromHistory') as HTMLInputElement;
    const switchBehavior = document.getElementById('switchBehavior') as HTMLSelectElement;
    const ignoreQueryParams = document.getElementById('ignoreQueryParams') as HTMLInputElement;
    const ignoreHash = document.getElementById('ignoreHash') as HTMLInputElement;
    const darkMode = document.getElementById('darkMode') as HTMLInputElement;

    deduplicateInAllWindows.checked = settings.getDeduplicateInAllWindows();
    checkWhenRedirecting.checked = settings.getCheckWhenRedirecting();
    checkWhenOpeningLinkInNewTab.checked = settings.getCheckWhenOpeningLinkInNewTab();
    checkWhenOpeningLinkInNewWindow.checked = settings.getCheckWhenOpeningLinkInNewWindow();
    checkWhenFirstNavigationInFreshTab.checked = settings.getCheckWhenFirstNavigationInFreshTab();
    removeDeduplicatedTabsFromHistory.checked = settings.getRemoveDeduplicatedTabsFromHistory();
    switchBehavior.value = settings.getSwitchBehavior();
    ignoreQueryParams.checked = settings.getIgnoreQuery();
    ignoreHash.checked = settings.getIgnoreHash();
    darkMode.checked = settings.getDarkMode();

    const handleChange = async () => {
        await settings.setSettings({
            deduplicateInAllWindows: deduplicateInAllWindows.checked,
            checkWhenRedirecting: checkWhenRedirecting.checked,
            checkWhenOpeningLinkInNewTab: checkWhenOpeningLinkInNewTab.checked,
            checkWhenOpeningLinkInNewWindow: checkWhenOpeningLinkInNewWindow.checked,
            checkWhenFirstNavigationInFreshTab: checkWhenFirstNavigationInFreshTab.checked,
            removeDeduplicatedTabsFromHistory: removeDeduplicatedTabsFromHistory.checked,
            switchBehavior: switchBehavior.value as SwitchBehavior,
            ignoreQuery: ignoreQueryParams.checked,
            ignoreHash: ignoreHash.checked,
            darkMode: darkMode.checked,
        });
        setDarkMode();
    };

    deduplicateInAllWindows.addEventListener('change', handleChange);
    checkWhenRedirecting.addEventListener('change', handleChange);
    checkWhenOpeningLinkInNewTab.addEventListener('change', handleChange);
    checkWhenOpeningLinkInNewWindow.addEventListener('change', handleChange);
    checkWhenFirstNavigationInFreshTab.addEventListener('change', handleChange);
    removeDeduplicatedTabsFromHistory.addEventListener('change', handleChange);
    switchBehavior.addEventListener('change', handleChange);
    ignoreQueryParams.addEventListener('change', handleChange);
    ignoreHash.addEventListener('change', handleChange);
    darkMode.addEventListener('change', handleChange);
}

function setUpPauseSettingHandler(): void {
    const handleChange = async (event: Event) => {
        const target = event.currentTarget as HTMLInputElement;
        const duration = parseInt(target.value, 10);
        const min = parseInt(target.min, 10);
        const max = parseInt(target.max, 10);
        if (isNaN(duration) || duration < min || duration > max) {
            const errorLabel = target.closest('.setting-item')?.querySelector('.error') as HTMLElement | null;
            if (errorLabel) {
                errorLabel.hidden = false;
            }
            return;
        } else {
            const errorLabel = target.closest('.setting-item')?.querySelector('.error') as HTMLElement | null;
            if (errorLabel) {
                errorLabel.hidden = true;
            }
        }
        const index = parseInt(target.getAttribute('data-index') || '', 10);
        if (isNaN(index) || (index !== 0 && index !== 1)) {
            console.error('Invalid data-index value');
            return;
        }
        await settings.setPauseTimePreset(index, duration);
        setPauseTimePresetButtonLabel(index, duration);
    }

    const pauseTimePreset0 = document.getElementById('pauseTimePreset0') as HTMLInputElement;
    const pauseTimePreset1 = document.getElementById('pauseTimePreset1') as HTMLInputElement;

    pauseTimePreset0.value = settings.getPauseTimePreset(0).toString();
    pauseTimePreset1.value = settings.getPauseTimePreset(1).toString();
    setPauseTimePresetButtonLabel(0, settings.getPauseTimePreset(0));
    setPauseTimePresetButtonLabel(1, settings.getPauseTimePreset(1));

    pauseTimePreset0.addEventListener('input', handleChange);
    pauseTimePreset1.addEventListener('input', handleChange);
}

function setPauseTimePresetButtonLabel(index: number, pauseTimePreset: number): void {
    const pauseTimePresetButton = document.getElementById(`preset${index}`) as HTMLElement;

    const formatPresetLabel = (minutes: number): string => {
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
        }
    }

    pauseTimePresetButton.textContent = formatPresetLabel(pauseTimePreset);
}

function setUpResetSettingsHandler(): void {
    const resetButton = document.getElementById('resetSettings') as HTMLElement;
    resetButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            await settings.reset();
            location.reload();
        }
    });
}

return () => {
    setDarkMode();

    setupSettingsToggle();
    setUpPausing();
    setUpTabDeduplication();

    setUpBasicSettingsHandlers();
    setUpPauseSettingHandler();
    setUpResetSettingsHandler();
}

}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    (await init())();
});