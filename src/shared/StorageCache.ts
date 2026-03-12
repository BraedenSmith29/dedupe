export default abstract class StorageCache<T> {
    private readonly storageKey: string;
    private readonly default: T;

    private cache: T | null = null;
    private readonly onStorageChange: ((changes: T) => void)[] = [];

    private readonly storageChangeListener = (changes: { [key: string]: browser.storage.StorageChange }, area: string): void => {
        if (area !== "local") return;
        const changed = changes[this.storageKey];
        if (!changed) return;

        this.cache = (changed.newValue ?? this.default) as T;
        this.onChange(this.cache);
    };

    protected constructor(storageKey: string, defaultValue: T) {
        this.storageKey = storageKey;
        this.default = defaultValue;
        browser.storage.onChanged.addListener(this.storageChangeListener);
    }

    destroy(): void {
        browser.storage.onChanged.removeListener(this.storageChangeListener);
    }

    async load(): Promise<T | null> {
        try {
            const stored = await browser.storage.local.get(this.storageKey);
            this.cache = stored[this.storageKey] ?? this.default;
        } catch {
            this.cache = this.default;
        }
        return this.cache;
    }
    
    async save(value: T): Promise<void> {
        await browser.storage.local.set({ [this.storageKey]: value });
        this.cache = value;
        this.onChange(this.cache);
    }

    async reset(): Promise<void> {
        await this.save(this.default);
    }

    public clear(): void {
        this.cache = null;
    }

    public getFromCache(): T {
        if (this.cache === null) {
            throw new Error('Cache not loaded');
        }
        return this.cache;
    }

    public addOnChangeListener(callback: (changes: T) => void): void {
        this.onStorageChange.push(callback);
    }

    public removeOnChangeListener(callback: (changes: T) => void): void {
        const index = this.onStorageChange.indexOf(callback);
        if (index !== -1) {
            this.onStorageChange.splice(index, 1);
        }
    }

    private onChange(changes: T): void {
        this.onStorageChange.forEach(callback => callback(changes));
    }
}