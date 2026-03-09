import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import TabTracker from "./TabTracker";

async function init() {

const settings = await Settings.create();
const pause = await Pause.create();
await TabTracker.create(settings, pause);

browser.runtime.onStartup.addListener(async () => {
    // TODO: Make sure this works since it's added in an asynchronous context.
    if (pause.getPauseStatus() === 'session') {
        await pause.unpause();
    }
});

}

init();