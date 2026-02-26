export type SwitchBehavior = 'deleteNew' | 'deleteNewAndSwitch' | 'deleteOld' | 'deleteOldAndSwitch';

interface SettingsData {
    pauseTimePresets: [number, number];
    deduplicateInAllWindows: boolean;
    checkWhenRedirecting: boolean;
    checkWhenOpeningNewTab: boolean;
    checkWhenOpeningNewWindow: boolean;
    checkWhenFirstNavigationInFreshTab: boolean;
    removeDeduplicatedTabsFromHistory: boolean;
    onDuplicateTabFoundInSameWindow: SwitchBehavior;
    onDuplicateTabFoundInOtherWindow: SwitchBehavior;
    ignoreQuery: boolean;
    ignoreHash: boolean;
    darkMode: boolean;
}

class Settings {
    private static readonly STORAGE_KEY = 'dedupeSettings';
    private static readonly DEFAULT_SETTINGS: SettingsData = {
        pauseTimePresets: [1, 5],
        deduplicateInAllWindows: false,
        checkWhenRedirecting: false,
        checkWhenOpeningNewTab: true,
        checkWhenOpeningNewWindow: false,
        checkWhenFirstNavigationInFreshTab: false,
        removeDeduplicatedTabsFromHistory: true,
        onDuplicateTabFoundInSameWindow: 'deleteNewAndSwitch',
        onDuplicateTabFoundInOtherWindow: 'deleteNewAndSwitch',
        ignoreQuery: false,
        ignoreHash: false,
        darkMode: false,
    };

    private static cache: SettingsData | null = null;

    static clearCache() {
        this.cache = null;
    }

    static async load(): Promise<SettingsData> {
        try {
            const stored = await browser.storage.local.get(this.STORAGE_KEY);
            return stored[this.STORAGE_KEY] || this.DEFAULT_SETTINGS;
        } catch {
            return this.DEFAULT_SETTINGS;
        }
    }

    static async save(settings: SettingsData): Promise<void> {
        this.cache = settings;
        // Notify background script to update settings immediately
        browser.runtime.sendMessage({ action: 'updatedSettings' });
        await browser.storage.local.set({ [this.STORAGE_KEY]: settings });
    }

    static async reset(): Promise<void> {
        await this.save(this.DEFAULT_SETTINGS);
    }

    static async getSettings(): Promise<SettingsData> {
        if (this.cache) {
            return this.cache;
        }
        const settings = await this.load();
        this.cache = settings;
        return settings;
    }

    private static validateSettings(setting: SettingsData): boolean {
        const pauseTimePresetsValidator = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number');
        const booleanValidator = (v: unknown) => typeof v === 'boolean';
        const switchBehaviorValidator = (v: unknown) => ['deleteNew', 'deleteNewAndSwitch', 'deleteOld', 'deleteOldAndSwitch'].includes(v as string);

        if (!pauseTimePresetsValidator(setting.pauseTimePresets)) return false;
        if (!booleanValidator(setting.deduplicateInAllWindows)) return false;
        if (!booleanValidator(setting.checkWhenRedirecting)) return false;
        if (!booleanValidator(setting.checkWhenOpeningNewTab)) return false;
        if (!booleanValidator(setting.checkWhenOpeningNewWindow)) return false;
        if (!booleanValidator(setting.checkWhenFirstNavigationInFreshTab)) return false;
        if (!booleanValidator(setting.removeDeduplicatedTabsFromHistory)) return false;
        if (!switchBehaviorValidator(setting.onDuplicateTabFoundInSameWindow)) return false;
        if (!switchBehaviorValidator(setting.onDuplicateTabFoundInOtherWindow)) return false;
        if (!booleanValidator(setting.ignoreQuery)) return false;
        if (!booleanValidator(setting.ignoreHash)) return false;
        if (!booleanValidator(setting.darkMode)) return false;

        return true;
    }

    static async setSettings(updatedSettings: Partial<SettingsData>): Promise<void> {
        const settings = await this.getSettings();
        const newSettings = { ...settings, ...updatedSettings };
        if (!this.validateSettings(newSettings)) {
            throw new Error('Invalid settings data');
        }
        await this.save(newSettings);
    }

    static async getPauseTimePresets(): Promise<[number, number]> {
        const settings = await this.getSettings();
        return settings.pauseTimePresets;
    }

    static async setPauseTimePresets(pauseTimePresets: [number, number]): Promise<void> {
        await this.setSettings({ pauseTimePresets });
    }

    static async getPauseTimePreset(index: number): Promise<number> {
        if (index < 0 || index > 1) {
            throw new Error('Invalid preset index');
        }
        const settings = await this.getSettings();
        return settings.pauseTimePresets[index];
    }

    static async setPauseTimePreset(index: number, value: number): Promise<void> {
        if (index < 0 || index > 1) {
            throw new Error('Invalid preset index');
        }
        const settings = await this.getSettings();
        const newPauseTimePresets = [...settings.pauseTimePresets] as [number, number];
        newPauseTimePresets[index] = value;
        await this.setSettings({ pauseTimePresets: newPauseTimePresets });
    }

    static async getDeduplicateInAllWindows(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.deduplicateInAllWindows;
    }

    static async setDeduplicateInAllWindows(deduplicateInAllWindows: boolean): Promise<void> {
        await this.setSettings({ deduplicateInAllWindows });
    }

    static async getCheckWhenRedirecting(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.checkWhenRedirecting;
    }

    static async setCheckWhenRedirecting(checkWhenRedirecting: boolean): Promise<void> {
        await this.setSettings({ checkWhenRedirecting });
    }

    static async getCheckWhenOpeningNewTab(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.checkWhenOpeningNewTab;
    }

    static async setCheckWhenOpeningNewTab(checkWhenOpeningNewTab: boolean): Promise<void> {
        await this.setSettings({ checkWhenOpeningNewTab });
    }

    static async getCheckWhenOpeningNewWindow(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.checkWhenOpeningNewWindow;
    }

    static async setCheckWhenOpeningNewWindow(checkWhenOpeningNewWindow: boolean): Promise<void> {
        await this.setSettings({ checkWhenOpeningNewWindow });
    }

    static async getCheckWhenFirstNavigationInFreshTab(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.checkWhenFirstNavigationInFreshTab;
    }

    static async setCheckWhenFirstNavigationInFreshTab(checkWhenFirstNavigationInFreshTab: boolean): Promise<void> {
        await this.setSettings({ checkWhenFirstNavigationInFreshTab });
    }

    static async getRemoveDeduplicatedTabsFromHistory(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.removeDeduplicatedTabsFromHistory;
    }

    static async setRemoveDeduplicatedTabsFromHistory(removeDeduplicatedTabsFromHistory: boolean): Promise<void> {
        await this.setSettings({ removeDeduplicatedTabsFromHistory });
    }

    static async getOnDuplicateTabFoundInSameWindow(): Promise<SwitchBehavior> {
        const settings = await this.getSettings();
        return settings.onDuplicateTabFoundInSameWindow;
    }

    static async setOnDuplicateTabFoundInSameWindow(onDuplicateTabFoundInSameWindow: SwitchBehavior): Promise<void> {
        await this.setSettings({ onDuplicateTabFoundInSameWindow });
    }

    static async getOnDuplicateTabFoundInOtherWindow(): Promise<SwitchBehavior> {
        const settings = await this.getSettings();
        return settings.onDuplicateTabFoundInOtherWindow;
    }

    static async setOnDuplicateTabFoundInOtherWindow(onDuplicateTabFoundInOtherWindow: SwitchBehavior): Promise<void> {
        await this.setSettings({ onDuplicateTabFoundInOtherWindow });
    }

    static async getIgnoreQuery(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.ignoreQuery;
    }

    static async setIgnoreQuery(ignoreQuery: boolean): Promise<void> {
        await this.setSettings({ ignoreQuery });
    }

    static async getIgnoreHash(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.ignoreHash;
    }

    static async setIgnoreHash(ignoreHash: boolean): Promise<void> {
        await this.setSettings({ ignoreHash });
    }

    static async getDarkMode(): Promise<boolean> {
        const settings = await this.getSettings();
        return settings.darkMode;
    }

    static async setDarkMode(darkMode: boolean): Promise<void> {
        await this.setSettings({ darkMode });
    }
}

export default Settings;