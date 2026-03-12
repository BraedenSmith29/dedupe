import StorageCache from "./StorageCache";

export default class DedupeCounter extends StorageCache<number> {
    private static readonly STORAGE_KEY = 'dedupeCounter';
    private static readonly DEFAULT_SETTINGS = 0;

    private constructor() {
        super(DedupeCounter.STORAGE_KEY, DedupeCounter.DEFAULT_SETTINGS);
    }

    public static async create(): Promise<DedupeCounter> {
        const dedupeCounter = new DedupeCounter();
        await dedupeCounter.load();
        return dedupeCounter;
    }

    public async increment(): Promise<void> {
        const currentValue = this.getFromCache();
        const newValue = currentValue + 1;
        await this.save(newValue);
    }
}