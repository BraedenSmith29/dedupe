import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import TabTracker from "./TabTracker";

browser.runtime.onStartup.addListener(async (): Promise<void> => {
    const pause = await Pause.create();
    if (pause.getPauseStatus() === 'session') {
        await pause.unpause();
    }
});

async function init(): Promise<void> {
    const settings = await Settings.create();
    const pause = await Pause.create();
    await TabTracker.create(settings, pause);
}

void init();