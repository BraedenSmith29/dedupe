export default abstract class StorageCache<T> {
    private readonly storageKey: string;
    private readonly default: T;

    private cache: T | null = null;

    private readonly settingsChangeListener = (changes: { [key: string]: browser.storage.StorageChange }, area: string): void => {
        if (area !== "local") return;
        const changed = changes[this.storageKey];
        if (!changed) return;

        this.cache = changed.newValue ?? this.default;
    };

    protected constructor(storageKey: string, defaultValue: T) {
        this.storageKey = storageKey;
        this.default = defaultValue;
        browser.storage.onChanged.addListener(this.settingsChangeListener);
    }

    destroy(): void {
        browser.storage.onChanged.removeListener(this.settingsChangeListener);
    }

    async load(): Promise<T | null> {
        try {
            const stored = await browser.storage.local.get(this.storageKey);
            this.cache = stored[this.storageKey] || this.default;
        } catch {
            this.cache = this.default;
        }
        return this.cache;
    }
    
    async save(value: T): Promise<void> {
        this.cache = value;
        await browser.storage.local.set({ [this.storageKey]: value });
    }

    async reset(): Promise<void> {
        await this.save(this.default);
    }

    clear(): void {
        this.cache = null;
    }

    getFromCache(): T {
        if (!this.cache) {
            throw new Error('Cache not loaded');
        }
        return this.cache;
    }
}