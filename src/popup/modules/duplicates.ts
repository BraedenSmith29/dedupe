import Settings from "../../shared/Settings";

type DuplicateTabItem = {
    tabId: number;
    windowId: number;
    index: number;
    title: string;
    url: string;
};

async function getDuplicateTabs(settings: Settings): Promise<DuplicateTabItem[][]> {
    const currentWindowId = await browser.windows.getCurrent().then(w => w.id);

    const tabs = await browser.tabs.query({});
    const sortedTabs = new Map<string, DuplicateTabItem[]>();

    for (const tab of tabs) {
        if (!tab.id || !tab.windowId || !tab.url) continue;
        if (disabledByDomainList(settings, tab.url)) continue;

        const otherUrls = sortedTabs.get(tab.url) ?? [];
        otherUrls.push({
            tabId: tab.id,
            windowId: tab.windowId,
            title: tab.title || 'Untitled',
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
    }

    return [...sortedTabs.values()].filter(group => group.length > 1);
}

function disabledByDomainList(settings: Settings, url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase().replace(/\.+$/, '');

        const inDomainList = settings.getDomainList().some((domain) => host === domain || host.endsWith(`.${domain}`));
        const mode = settings.getDomainListMode();

        return mode === 'blacklist' ? inDomainList : !inDomainList;
    } catch {
        return false;
    }
}

function updateDuplicateTabsListState(): void {
    const list = document.getElementById('duplicateTabsList') as HTMLUListElement | null;
    const emptyState = document.getElementById('duplicateTabsEmptyState') as HTMLElement | null;
    const deduplicateAllButton = document.getElementById('deduplicateAll') as HTMLButtonElement | null;
    if (!list || !emptyState || !deduplicateAllButton) return;

    emptyState.hidden = list.childNodes.length > 0;
    deduplicateAllButton.disabled = list.childNodes.length === 0;
}

async function renderDuplicateTabs(settings: Settings): Promise<void> {
    const list = document.getElementById('duplicateTabsList') as HTMLUListElement | null;
    const template = document.getElementById('duplicateTabItemTemplate') as HTMLTemplateElement | null;
    const emptyState = document.getElementById('duplicateTabsEmptyState') as HTMLElement | null;
    const deduplicateAllButton = document.getElementById('deduplicateAll') as HTMLButtonElement | null;
    if (!list || !template || !emptyState || !deduplicateAllButton) return;

    const duplicateGroups = await getDuplicateTabs(settings);
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

            title.addEventListener('click', async (): Promise<void> => {
                await browser.windows.update(item.windowId, { focused: true })
                    .catch(error => {
                        console.error(`Failed to focus window ${item.windowId}:`, error);
                    });
                await browser.tabs.update(item.tabId, { active: true })
                    .catch(error => {
                        console.error(`Failed to activate tab ${item.tabId}:`, error);
                    });
            });

            deleteButton.addEventListener('click', async (): Promise<void> => {
                if (group.length === 2) {
                    currentGroupItems.forEach(i => i.remove());
                } else {
                    row.remove();
                }
                updateDuplicateTabsListState();
                await browser.tabs.remove(item.tabId)
                    .catch(error => {
                        console.error(`Failed to remove tab ${item.tabId}:`, error);
                    });
            });

            currentGroupItems.push(row);
            listItems.push(row);
        }
    }

    list.replaceChildren(...listItems);
    updateDuplicateTabsListState();
}

export function setUpTabDeduplication(settings: Settings): void {
    const deduplicateAllButton = document.getElementById('deduplicateAll') as HTMLButtonElement | null;
    if (!deduplicateAllButton) return;

    deduplicateAllButton.addEventListener('click', async (): Promise<void> => {
        const duplicateTabs = await getDuplicateTabs(settings);
        
        await Promise.all(
            duplicateTabs.flatMap(group => 
                group
                .slice(1)
                .map(tab => browser.tabs.remove(tab.tabId))
            )
        );

        document.getElementById('duplicateTabsList')?.replaceChildren();
        updateDuplicateTabsListState();
    });

    void renderDuplicateTabs(settings);
    browser.tabs.onCreated.addListener(() => void renderDuplicateTabs(settings));
    browser.tabs.onRemoved.addListener(() => void renderDuplicateTabs(settings));
    browser.tabs.onUpdated.addListener(() => void renderDuplicateTabs(settings));
    settings.addOnChangeListener(() => void renderDuplicateTabs(settings));
}