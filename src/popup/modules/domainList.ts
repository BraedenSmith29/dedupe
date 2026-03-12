import Settings from "../../shared/Settings";

function normalizeDomain(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    try {
        const parsed = new URL(candidate);
        const host = parsed.hostname.replace(/\.+$/, '');
        if (!host) {
            return null;
        }
        return host;
    } catch {
        return null;
    }
}

async function renderDomainList(settings: Settings): Promise<void> {
    const list = document.getElementById('domainList') as HTMLUListElement | null;
    const template = document.getElementById('domainListItemTemplate') as HTMLTemplateElement | null;
    const emptyState = document.getElementById('domainListEmptyState') as HTMLElement | null;
    if (!list || !template || !emptyState) {
        return;
    }

    const domains = settings.getDomainList();
    const listItems: HTMLElement[] = domains.map((domain): HTMLElement | null => {
        const row = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
        if (!row) {
            return null;
        }

        const domainLabel = row.querySelector('.domain-item-label') as HTMLElement | null;
        const removeButton = row.querySelector('.tab-delete') as HTMLButtonElement | null;
        if (!domainLabel || !removeButton) {
            return null;
        }

        domainLabel.textContent = domain;
        removeButton.setAttribute('aria-label', `Remove domain: ${domain}`);
        removeButton.addEventListener('click', async (): Promise<void> => {
            const updatedList = settings.getDomainList().filter(item => item !== domain);
            await settings.setSettings({ domainList: updatedList });
            await renderDomainList(settings);
        });
        return row;
    }).filter((item): item is HTMLElement => item !== null);

    list.replaceChildren(...listItems);
    emptyState.hidden = list.childNodes.length > 0;
}

function setUpDomainListModeToggle(settings: Settings): void {
    const toggle = document.getElementById('domainListModeToggle') as HTMLInputElement | null;
    const description = document.getElementById('domainListModeDescription') as HTMLElement | null;
    if (!toggle || !description) {
        return;
    }

    const updateDescription = (isWhitelist: boolean): void => {
        description.textContent = isWhitelist
            ? 'Only listed domains are included in deduplication (whitelist mode).'
            : 'Listed domains are excluded from deduplication (blacklist mode).';
    };

    const currentIsWhitelist = settings.getDomainListMode() === 'whitelist';
    toggle.checked = currentIsWhitelist;
    updateDescription(currentIsWhitelist);

    toggle.addEventListener('change', async (): Promise<void> => {
        const nextMode = toggle.checked ? 'whitelist' : 'blacklist';
        await settings.setSettings({ domainListMode: nextMode });
        updateDescription(toggle.checked);
    });
}

function setUpDomainListHandlers(settings: Settings): void {
    const domainEntryForm = document.getElementById('domainEntryForm') as HTMLFormElement | null;
    const domainEntry = document.getElementById('domainEntry') as HTMLInputElement | null;
    const domainEntryError = document.getElementById('domainEntryError') as HTMLElement | null;
    if (!domainEntryForm || !domainEntry || !domainEntryError) {
        return;
    }

    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
            const domain = normalizeDomain(activeTab.url);
            if (domain) {
                domainEntry.value = domain;
            }
        }
    });

    domainEntryForm.addEventListener('submit', async (event: SubmitEvent): Promise<void> => {
        event.preventDefault();
        const domain = normalizeDomain(domainEntry.value);
        const existingDomains = settings.getDomainList();

        if (!domain || existingDomains.includes(domain)) {
            domainEntryError.textContent = !domain ? 'Please enter a valid domain.' : 'This domain is already in the list.';
            domainEntryError.hidden = false;
            return;
        }

        domainEntryError.hidden = true;
        const updatedList = [...existingDomains, domain].sort();
        await settings.setSettings({ domainList: updatedList });
        domainEntry.value = '';
        await renderDomainList(settings);
    });

    domainEntry.addEventListener('input', (): void => {
        domainEntryError.hidden = true;
    });

    void renderDomainList(settings);
}

export function setUpDomainList(settings: Settings): void {
    setUpDomainListModeToggle(settings);
    setUpDomainListHandlers(settings);
}
