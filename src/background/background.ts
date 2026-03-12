import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import CommandHandler from "./CommandHandler";
import TabTracker from "./TabTracker";

browser.runtime.onStartup.addListener(async (): Promise<void> => {
    const pause = await Pause.create();
    if (pause.getPauseStatus() === 'session') {
        await pause.unpause();
    }
});

function setProperIcon(pause: Pause): void {
    const pauseStatus = pause.getPauseStatus();
    if (pauseStatus === null) {
        void browser.browserAction.setIcon({
            path: {
                32: '../icons/enabled/icon32.png',
                64: '../icons/enabled/icon64.png',
            }
        });
    } else {
        void browser.browserAction.setIcon({
            path: {
                32: '../icons/paused/icon32.png',
                64: '../icons/paused/icon64.png',
            }
        });
    }
}

function checkForPauseExpiration(pause: Pause, pausedUntil: number | null): void {
    const delta = pausedUntil !== null ? pausedUntil - Date.now() : 0;
    if (delta > 0) {
        setTimeout(async () => {
            if (!pause.isPaused()) {
                await browser.browserAction.setIcon({
                    path: {
                        32: '../icons/enabled/icon32.png',
                        64: '../icons/enabled/icon64.png',
                    }
                });
            }
        }, delta);
    }
}

async function init(): Promise<void> {
    const settings = await Settings.create();
    const pause = await Pause.create();

    setProperIcon(pause);
    checkForPauseExpiration(pause, pause.getPausedUntil());
    pause.addOnChangeListener((pauseData) => checkForPauseExpiration(pause, pauseData.pausedUntil));
    
    await TabTracker.create(settings, pause);
    new CommandHandler(settings, pause);
}

void init();