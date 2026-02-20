export type PausedStatus = 'session' | 'permanently' | 'preset0' | 'preset1' | 'custom' | null;

interface PauseData {
    pauseStatus: PausedStatus,
    pausedUntil: number | null;
}

class Pause {
    private static readonly STORAGE_KEY = 'dedupePause';
    private static readonly UNPAUSED: PauseData = {
        pauseStatus: null,
        pausedUntil: null,
    };

    private static cache: PauseData | null = null;

    static async load(): Promise<PauseData> {
        try {
            const stored = await browser.storage.local.get(this.STORAGE_KEY);
            return stored[this.STORAGE_KEY] || this.UNPAUSED;
        } catch {
            return this.UNPAUSED;
        }
    }

    static async save(pause: PauseData): Promise<void> {
        this.cache = pause;
        await browser.storage.local.set({ [this.STORAGE_KEY]: pause });
    }

    static async unpause(): Promise<void> {
        await this.save(this.UNPAUSED);
    }

    static async getPause(): Promise<PauseData> {
        if (this.cache) {
            return this.cache;
        }
        const pause = await this.load();
        this.cache = pause;
        return pause;
    }

    private static validatePause(setting: PauseData): boolean {
        const pauseStatusValidator = (v: unknown) => ['session', 'permanently', 'preset0', 'preset1', 'custom', null].includes(v as PausedStatus);
        const pausedUntilValidator = (v: unknown) => typeof v === 'number' || v === null;

        if (!pauseStatusValidator(setting.pauseStatus)) return false;
        if (!pausedUntilValidator(setting.pausedUntil)) return false;

        return true;
    }

    static async setPause(updatedPause: PauseData): Promise<void> {
        if (!this.validatePause(updatedPause)) {
            throw new Error('Invalid pause data');
        }
        await this.save(updatedPause);
    }

    private static async checkForUnpause(): Promise<void> {
        const pause = await this.getPause();
        
        if (pause.pauseStatus === null || !['preset0', 'preset1', 'custom'].includes(pause.pauseStatus)) {
            return;
        }

        if (pause.pausedUntil === null || Date.now() >= pause.pausedUntil) {
            await this.unpause();
        }
    }

    static async getCurrentPauseData(): Promise<PauseData & { isCurrentlyPaused: boolean }> {
        await this.checkForUnpause();
        const pause = await this.getPause();
        return {...pause, isCurrentlyPaused: pause.pauseStatus !== null};
    }
}

export default Pause;