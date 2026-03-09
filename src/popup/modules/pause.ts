import Pause, { PausedStatus } from "../../Pause";
import Settings from "../../Settings";

function updatePauseStatus(pause: Pause): void {
    const statusBadge = document.getElementById('statusBadge') as HTMLElement;
    const pauseStatusLabel = document.getElementById('pauseStatus') as HTMLElement;
    const buttons = document.querySelectorAll('.pause-btn');

    if (pause.isPaused()) {
        statusBadge.textContent = 'Paused';
        statusBadge.classList.add('paused');

        const pausedUntil = pause.getPausedUntil();
        if (pausedUntil) {
            pauseStatusLabel.textContent = getResumingCountdownText(pausedUntil);
            pauseStatusLabel.hidden = false;
        } else {
            pauseStatusLabel.hidden = true;
        }
    } else {
        statusBadge.textContent = 'Active';
        statusBadge.classList.remove('paused');

        pauseStatusLabel.hidden = true;
    }

    buttons.forEach(btn => {
        const btnDuration = btn.getAttribute('data-duration');
        if (btnDuration === pause.getPauseStatus()) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function getResumingCountdownText(pausedUntil: number): string {
    const remainingSeconds = Math.ceil((pausedUntil - Date.now()) / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    if (hours > 0 && minutes > 0) {
        return `Resuming in ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `Resuming in ${hours}h`;
    } else if (minutes > 0 && seconds > 0) {
        return `Resuming in ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `Resuming in ${minutes}m`;
    } else {
        return `Resuming in ${seconds}s`;
    }
}

export function setUpPausing(settings: Settings, pause: Pause): void {
    const buttons = document.querySelectorAll('.apply-pause');
    buttons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();

            if (btn.classList.contains('selected')) {
                await pause.unpause();
                updatePauseStatus(pause);
                return;
            }

            const duration = btn.getAttribute('data-duration');
            if (!duration) {
                console.error('Pause button missing data-duration attribute');
                return;
            }

            let pauseMinutes;
            if (duration === 'preset0' || duration === 'preset1') {
                const index = parseInt(btn.getAttribute('data-index') || '', 10);
                if (isNaN(index) || (index !== 0 && index !== 1)) {
                    console.error('Invalid data-index value');
                    return;
                }
                pauseMinutes = settings.getPauseTimePreset(index);
            } else if (duration === 'custom') {
                const customDurationInput = document.getElementById('customPauseDuration') as HTMLInputElement;
                pauseMinutes = parseInt(customDurationInput.value, 10);
                if (isNaN(pauseMinutes) || pauseMinutes <= 0) {
                    alert('Please enter a valid number of minutes for custom pause duration.');
                    return;
                }
            }

            const customPauseDurationContainer = document.getElementById('customPauseDurationContainer') as HTMLElement;
            customPauseDurationContainer.hidden = true;

            await pause.setPause({
                pauseStatus: duration as PausedStatus,
                pausedUntil: pauseMinutes ? Date.now() + pauseMinutes * 60000 : null,
            });
            updatePauseStatus(pause);
        });
    });

    const customButton = document.getElementById('custom');
    customButton?.addEventListener('click', async () => {
        const customPauseDurationContainer = document.getElementById('customPauseDurationContainer') as HTMLElement;
        if (customButton.classList.contains('selected') || !customPauseDurationContainer.hidden) {
            await pause.unpause();
            updatePauseStatus(pause);
            customPauseDurationContainer.hidden = true;
        } else {
            customPauseDurationContainer.hidden = false;
        }
    });

    updatePauseStatus(pause);
    setInterval(() => updatePauseStatus(pause), 1000);
}