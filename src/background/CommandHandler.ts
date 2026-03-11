import Pause from "../shared/Pause";
import Settings from "../shared/Settings";

export default class CommandHandler {
    private readonly settings: Settings;
    private readonly pause: Pause;

    private readonly onCommand = (command: string): void => {
        if (command === 'toggle-pause') {
            void this.togglePause();
        } else if (command === 'detach-tabs') {
            void this.detachTabs();
        }
    }

    constructor(settings: Settings, pause: Pause) {
        this.settings = settings;
        this.pause = pause;

        browser.commands.onCommand.addListener(this.onCommand);
    }

    public destroy(): void {
        browser.commands.onCommand.removeListener(this.onCommand);
    }

    private async togglePause(): Promise<void> {
        if (this.pause.isPaused()) {
            await this.pause.unpause();
        } else {
            const pauseType = this.settings.getPauseKeybindBehavior();
            if (pauseType === 'showMenu') {
                // This must be done synchronously. Ensure nothing is awaited before this line.
                await browser.browserAction.openPopup();
            } else {
                let pauseMinutes;
                if (pauseType === 'preset0') {
                    pauseMinutes = this.settings.getPauseTimePreset(0);
                } else if (pauseType === 'preset1') {
                    pauseMinutes = this.settings.getPauseTimePreset(1);
                }
    
                await this.pause.setPause({
                    pauseStatus: pauseType,
                    pausedUntil: pauseMinutes ? Date.now() + pauseMinutes * 60000 : null,
                });
            }

        }
    }

    private async detachTabs(): Promise<void> {
        const highlightedTabs = await browser.tabs.query({
            highlighted: true,
            windowId: browser.windows.WINDOW_ID_CURRENT
        }).then(tabs => tabs.map(tab => tab.id).filter(tabId => tabId !== undefined));
        
        if (highlightedTabs.length === 0) return;
        const window = await browser.windows.create( { tabId: highlightedTabs[0] });
        if (highlightedTabs.length > 1) {
            await browser.tabs.move(highlightedTabs.slice(1), { windowId: window.id, index: -1 });
        }
    }
}