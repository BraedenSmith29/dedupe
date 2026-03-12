import Pause from "../shared/Pause";
import Settings from "../shared/Settings";
import { setUpTabDeduplication } from "./modules/duplicates";
import { setUpPausing } from "./modules/pause";
import { setUpSettings } from "./modules/settings";

async function init(): Promise<void> {
    const settings = await Settings.create();
    const pause = await Pause.create();

    setUpPausing(settings, pause);
    setUpTabDeduplication(settings);
    setUpSettings(settings);
}

document.addEventListener("DOMContentLoaded", init);