import StorageCache from './StorageCache';

export type SwitchBehavior = 'deleteNew' | 'deleteNewAndSwitch' | 'deleteOld' | 'deleteOldAndSwitch';

interface SettingsData {
    pauseTimePresets: [number, number];
    deduplicateInAllWindows: boolean;
    checkWhenRedirecting: boolean;
    checkWhenOpeningNewTab: boolean;
    checkWhenOpeningNewWindow: boolean;
    checkWhenFirstNavigationInFreshTab: boolean;
    removeDeduplicatedTabsFromHistory: boolean;
    switchBehavior: SwitchBehavior;
    ignoreQuery: boolean;
    ignoreHash: boolean;
    darkMode: boolean;
}

class Settings extends StorageCache<SettingsData> {
    private static readonly STORAGE_KEY = 'dedupeSettings';
    private static readonly DEFAULT_SETTINGS: SettingsData = {
        pauseTimePresets: [1, 5],
        deduplicateInAllWindows: false,
        checkWhenRedirecting: false,
        checkWhenOpeningNewTab: true,
        checkWhenOpeningNewWindow: false,
        checkWhenFirstNavigationInFreshTab: false,
        removeDeduplicatedTabsFromHistory: true,
        switchBehavior: 'deleteNewAndSwitch',
        ignoreQuery: false,
        ignoreHash: false,
        darkMode: false,
    };

    private constructor() {
        super(Settings.STORAGE_KEY, Settings.DEFAULT_SETTINGS);
    }

    static async create(): Promise<Settings> {
        const settings = new Settings();
        await settings.load();
        return settings;
    }

    private static validateSettings(settings: SettingsData): boolean {
        const pauseTimePresetsValidator = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number');
        const booleanValidator = (v: unknown) => typeof v === 'boolean';
        const switchBehaviorValidator = (v: unknown) => ['deleteNew', 'deleteNewAndSwitch', 'deleteOld', 'deleteOldAndSwitch'].includes(v as string);

        if (!pauseTimePresetsValidator(settings.pauseTimePresets)) return false;
        if (!booleanValidator(settings.deduplicateInAllWindows)) return false;
        if (!booleanValidator(settings.checkWhenRedirecting)) return false;
        if (!booleanValidator(settings.checkWhenOpeningNewTab)) return false;
        if (!booleanValidator(settings.checkWhenOpeningNewWindow)) return false;
        if (!booleanValidator(settings.checkWhenFirstNavigationInFreshTab)) return false;
        if (!booleanValidator(settings.removeDeduplicatedTabsFromHistory)) return false;
        if (!switchBehaviorValidator(settings.switchBehavior)) return false;
        if (!booleanValidator(settings.ignoreQuery)) return false;
        if (!booleanValidator(settings.ignoreHash)) return false;
        if (!booleanValidator(settings.darkMode)) return false;

        return true;
    }

    async setSettings(updatedSettings: Partial<SettingsData>): Promise<void> {
        const settings = this.getFromCache();
        const newSettings = { ...settings, ...updatedSettings };
        if (!Settings.validateSettings(newSettings)) {
            throw new Error('Invalid settings data');
        }
        await this.save(newSettings);
    }

    getPauseTimePreset(index: 0 | 1): number {
        if (index < 0 || index > 1) {
            throw new Error('Invalid preset index');
        }
        const settings = this.getFromCache();
        return settings.pauseTimePresets[index];
    }

    async setPauseTimePreset(index: 0 | 1, value: number): Promise<void> {
        if (index < 0 || index > 1) {
            throw new Error('Invalid preset index');
        }
        const settings = this.getFromCache();
        const newPauseTimePresets = [...settings.pauseTimePresets] as [number, number];
        newPauseTimePresets[index] = value;
        await this.setSettings({ pauseTimePresets: newPauseTimePresets });
    }

    getDeduplicateInAllWindows(): boolean {
        const settings = this.getFromCache();
        return settings.deduplicateInAllWindows;
    }

    getCheckWhenRedirecting(): boolean {
        const settings = this.getFromCache();
        return settings.checkWhenRedirecting;
    }

    getCheckWhenOpeningNewTab(): boolean {
        const settings = this.getFromCache();
        return settings.checkWhenOpeningNewTab;
    }

    getCheckWhenOpeningNewWindow(): boolean {
        const settings = this.getFromCache();
        return settings.checkWhenOpeningNewWindow;
    }

    getCheckWhenFirstNavigationInFreshTab(): boolean {
        const settings = this.getFromCache();
        return settings.checkWhenFirstNavigationInFreshTab;
    }

    getRemoveDeduplicatedTabsFromHistory(): boolean {
        const settings = this.getFromCache();
        return settings.removeDeduplicatedTabsFromHistory;
    }

    getSwitchBehavior(): SwitchBehavior {
        const settings = this.getFromCache();
        return settings.switchBehavior;
    }

    getIgnoreQuery(): boolean {
        const settings = this.getFromCache();
        return settings.ignoreQuery;
    }

    getIgnoreHash(): boolean {
        const settings = this.getFromCache();
        return settings.ignoreHash;
    }

    getDarkMode(): boolean {
        const settings = this.getFromCache();
        return settings.darkMode;
    }
}

export default Settings;