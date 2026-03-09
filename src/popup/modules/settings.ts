import Settings, { SwitchBehavior } from "../../shared/Settings";

function applyDarkMode(settings: Settings): void {
    if (settings.getDarkMode()) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function setUpSettingsToggle(): void {
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

function setUpBasicSettingsHandlers(settings: Settings): void {
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
        applyDarkMode(settings);
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

function setUpPauseSettingHandler(settings: Settings): void {
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

function setUpResetSettingsHandler(settings: Settings): void {
    const resetButton = document.getElementById('resetSettings') as HTMLElement;
    resetButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            await settings.reset();
            location.reload();
        }
    });
}

export function setUpSettings(settings: Settings): void {
    applyDarkMode(settings);
    setUpSettingsToggle();
    setUpBasicSettingsHandlers(settings);
    setUpPauseSettingHandler(settings);
    setUpResetSettingsHandler(settings);
}