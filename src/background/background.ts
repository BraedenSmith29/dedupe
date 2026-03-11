import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import CommandHandler from "./CommandHandler";
import TabTracker from "./TabTracker";

browser.runtime.onStartup.addListener(async (): Promise<void> => {
    const pause = await Pause.create();
    if (pause.getPauseStatus() === 'session') {
        await pause.unpause();
    } else if (pause.isPaused()) {
        await browser.browserAction.setIcon({
            path: {
                32: '../icons/paused/icon32.png',
                64: '../icons/paused/icon64.png',
            }
        });
    }
});

browser.runtime.onInstalled.addListener(async (details): Promise<void> => {
    const pause = await Pause.create();
    if (pause.isPaused()) {
        await browser.browserAction.setIcon({
            path: {
                32: '../icons/paused/icon32.png',
                64: '../icons/paused/icon64.png',
            }
        });
    }
});

async function init(): Promise<void> {
    const settings = await Settings.create();
    const pause = await Pause.create();
    
    await TabTracker.create(settings, pause);
    new CommandHandler(settings, pause);
}

void init();