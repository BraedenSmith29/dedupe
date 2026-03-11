import StorageCache from './StorageCache';

export type PausedStatus = 'session' | 'permanently' | 'preset0' | 'preset1' | 'custom' | null;

interface PauseData {
    pauseStatus: PausedStatus,
    pausedUntil: number | null;
}

class Pause extends StorageCache<PauseData> {
    private static readonly STORAGE_KEY = 'dedupePause';
    private static readonly UNPAUSED: PauseData = {
        pauseStatus: null,
        pausedUntil: null,
    };

    private constructor() {
        super(Pause.STORAGE_KEY, Pause.UNPAUSED);
    }

    static async create(): Promise<Pause> {
        const pause = new Pause();
        await pause.load();
        return pause;
    }

    async unpause(): Promise<void> {
        await this.reset();
        await browser.browserAction.setIcon({
            path: {
                32: '../icons/enabled/icon32.png',
                64: '../icons/enabled/icon64.png',
            }
        });
    }

    private static validatePause(setting: PauseData): boolean {
        const pauseStatusValidator = (v: unknown) => ['session', 'permanently', 'preset0', 'preset1', 'custom', null].includes(v as PausedStatus);
        const pausedUntilValidator = (v: unknown) => typeof v === 'number' || v === null;

        if (!pauseStatusValidator(setting.pauseStatus)) return false;
        if (!pausedUntilValidator(setting.pausedUntil)) return false;

        return true;
    }

    async setPause(updatedPause: PauseData): Promise<void> {
        if (!Pause.validatePause(updatedPause)) {
            throw new Error('Invalid pause data');
        }
        await this.save(updatedPause);
        if (updatedPause.pauseStatus === null) {
            await browser.browserAction.setIcon({
                path: {
                    32: '../icons/enabled/icon32.png',
                    64: '../icons/enabled/icon64.png',
                }
            });
        } else {
            await browser.browserAction.setIcon({
                path: {
                    32: '../icons/paused/icon32.png',
                    64: '../icons/paused/icon64.png',
                }
            });
        }
    }

    private getCurrentPauseData(): PauseData {
        const pause = this.getFromCache();
        
        if (pause.pauseStatus === null || !['preset0', 'preset1', 'custom'].includes(pause.pauseStatus)) {
            return pause;
        }

        if (pause.pausedUntil === null || Date.now() >= pause.pausedUntil) {
            void this.unpause();
            return Pause.UNPAUSED;
        }

        return pause;
    }

    getPauseStatus(): PausedStatus {
        return this.getCurrentPauseData().pauseStatus;
    }

    getPausedUntil(): number | null {
        return this.getCurrentPauseData().pausedUntil;
    }

    isPaused(): boolean {
        return this.getPauseStatus() !== null;
    }
}

export default Pause;