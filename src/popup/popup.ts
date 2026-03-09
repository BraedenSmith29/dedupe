import Pause from "../Pause.js";
import Settings from "../Settings.js";
import { setUpTabDeduplication } from "./modules/duplicates.js";
import { setUpPausing } from "./modules/pause.js";
import { setUpSettings } from "./modules/settings.js";

async function init(): Promise<void> {
    const settings = await Settings.create();
    const pause = await Pause.create();

    setUpPausing(settings, pause);
    setUpTabDeduplication();
    setUpSettings(settings);
}

document.addEventListener("DOMContentLoaded", () => {
    init();
});