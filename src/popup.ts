import Pause, { PausedStatus } from "./Pause.js";
import Settings, { SwitchBehavior } from "./Settings.js";

function setupSettingsToggle(): void {
  const settingsToggle = document.getElementById('settingsToggle') as HTMLElement;
  const settingsSection = document.getElementById('settings') as HTMLElement;
  const controlsSection = document.getElementById('controls') as HTMLElement;

  settingsToggle.addEventListener('click', () => {
    settingsSection.hidden = !settingsSection.hidden;
    controlsSection.hidden = !controlsSection.hidden;
    settingsToggle.classList.toggle('selected');
    // Force window resize
    document.documentElement.style.height = 'auto';
  });
}

async function setUpPausing(): Promise<void> {
  const buttons = document.querySelectorAll('.apply-pause');
  buttons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      if (btn.classList.contains('selected')) {
        await Pause.unpause();
        await updatePauseStatus();
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
        if (isNaN(index) || index < 0) {
          console.error('Invalid data-index value');
          return;
        }
        pauseMinutes = await Settings.getPauseTimePreset(index);
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

      await Pause.setPause({
        pauseStatus: duration as PausedStatus,
        pausedUntil: pauseMinutes ? Date.now() + pauseMinutes * 60000 : null,
      });
      await updatePauseStatus();
    });
  });
  
  const customButton = document.getElementById('custom');
  customButton?.addEventListener('click', async () => {
    const customPauseDurationContainer = document.getElementById('customPauseDurationContainer') as HTMLElement;
    if (customButton.classList.contains('selected') || !customPauseDurationContainer.hidden) {
      await Pause.unpause();
      await updatePauseStatus();
      customPauseDurationContainer.hidden = true;
    } else {
      customPauseDurationContainer.hidden = false;
    }
  });

  await updatePauseStatus();
  setInterval(updatePauseStatus, 1000);
}

async function updatePauseStatus(): Promise<void> {
  const statusBadge = document.getElementById('statusBadge') as HTMLElement;
  const pauseStatusLabel = document.getElementById('pauseStatus') as HTMLElement;
  const buttons = document.querySelectorAll('.pause-btn');
  
  const currentPauseData = await Pause.getCurrentPauseData();

  if (currentPauseData.isCurrentlyPaused) {
    statusBadge.textContent = 'Paused';
    statusBadge.classList.add('paused');

    if (currentPauseData.pausedUntil) {
      pauseStatusLabel.textContent = getResumingCountdownText(currentPauseData.pausedUntil);
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
    if (btnDuration === currentPauseData.pauseStatus) {
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

async function setDarkMode(): Promise<void> {
  if (await Settings.getDarkMode()) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

async function setUpBasicSettingsHandlers(): Promise<void> {
  const deduplicateInAllWindows = document.getElementById('deduplicateInAllWindows') as HTMLInputElement;
  const checkWhenRedirecting = document.getElementById('checkWhenRedirecting') as HTMLInputElement;
  const checkWhenOpeningNewTab = document.getElementById('checkWhenOpeningNewTab') as HTMLInputElement;
  const checkWhenOpeningNewWindow = document.getElementById('checkWhenOpeningNewWindow') as HTMLInputElement;
  const checkWhenFirstNavigationInFreshTab = document.getElementById('checkWhenFirstNavigationInFreshTab') as HTMLInputElement;
  const removeDeduplicatedTabsFromHistory = document.getElementById('removeDeduplicatedTabsFromHistory') as HTMLInputElement;
  const sameWindowBehavior = document.getElementById('sameWindowBehavior') as HTMLSelectElement;
  const otherWindowBehavior = document.getElementById('otherWindowBehavior') as HTMLSelectElement;
  const ignoreQueryParams = document.getElementById('ignoreQueryParams') as HTMLInputElement;
  const ignoreHash = document.getElementById('ignoreHash') as HTMLInputElement;
  const darkMode = document.getElementById('darkMode') as HTMLInputElement;

  const settings = await Settings.getSettings();
  deduplicateInAllWindows.checked = settings.deduplicateInAllWindows;
  checkWhenRedirecting.checked = settings.checkWhenRedirecting;
  checkWhenOpeningNewTab.checked = settings.checkWhenOpeningNewTab;
  checkWhenOpeningNewWindow.checked = settings.checkWhenOpeningNewWindow;
  checkWhenFirstNavigationInFreshTab.checked = settings.checkWhenFirstNavigationInFreshTab;
  removeDeduplicatedTabsFromHistory.checked = settings.removeDeduplicatedTabsFromHistory;
  sameWindowBehavior.value = settings.onDuplicateTabFoundInSameWindow;
  otherWindowBehavior.value = settings.onDuplicateTabFoundInOtherWindow;
  ignoreQueryParams.checked = settings.ignoreQuery;
  ignoreHash.checked = settings.ignoreHash;
  darkMode.checked = settings.darkMode;

  (otherWindowBehavior.closest('.setting-item') as HTMLElement).hidden = !settings.deduplicateInAllWindows;

  const handleChange = async () => {
    await Settings.setSettings({
      deduplicateInAllWindows: deduplicateInAllWindows.checked,
      checkWhenRedirecting: checkWhenRedirecting.checked,
      checkWhenOpeningNewTab: checkWhenOpeningNewTab.checked,
      checkWhenOpeningNewWindow: checkWhenOpeningNewWindow.checked,
      checkWhenFirstNavigationInFreshTab: checkWhenFirstNavigationInFreshTab.checked,
      removeDeduplicatedTabsFromHistory: removeDeduplicatedTabsFromHistory.checked,
      onDuplicateTabFoundInSameWindow: sameWindowBehavior.value as SwitchBehavior,
      onDuplicateTabFoundInOtherWindow: otherWindowBehavior.value as SwitchBehavior,
      ignoreQuery: ignoreQueryParams.checked,
      ignoreHash: ignoreHash.checked,
      darkMode: darkMode.checked,
    });
    (otherWindowBehavior.closest('.setting-item') as HTMLElement).hidden = !deduplicateInAllWindows.checked;
    await setDarkMode();
  };

  deduplicateInAllWindows.addEventListener('change', handleChange);
  checkWhenRedirecting.addEventListener('change', handleChange);
  checkWhenOpeningNewTab.addEventListener('change', handleChange);
  checkWhenOpeningNewWindow.addEventListener('change', handleChange);
  checkWhenFirstNavigationInFreshTab.addEventListener('change', handleChange);
  removeDeduplicatedTabsFromHistory.addEventListener('change', handleChange);
  sameWindowBehavior.addEventListener('change', handleChange);
  otherWindowBehavior.addEventListener('change', handleChange);
  ignoreQueryParams.addEventListener('change', handleChange);
  ignoreHash.addEventListener('change', handleChange);
  darkMode.addEventListener('change', handleChange);
}

async function setUpPauseSettingHandler(): Promise<void> {
  const handleChange = async (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    const duration = parseInt(target.value, 10);
    const min = parseInt(target.min, 10);
    const max = parseInt(target.max, 10);
    if (isNaN(duration) || duration < min || duration > max) {
      const errorLabel = target.closest('.setting-item')?.querySelector('.error') as HTMLElement | null;
      if (errorLabel) {
        errorLabel.hidden = false;
      }
      return;
    } else {
      const errorLabel = target.closest('.setting-item')?.querySelector('.error') as HTMLElement | null;
      if (errorLabel) {
        errorLabel.hidden = true;
      }
    }
    const index = parseInt(target.getAttribute('data-index') || '', 10);
    if (isNaN(index) || index < 0) {
      console.error('Invalid data-index value');
      return;
    }
    await Settings.setPauseTimePreset(index, duration);
    setPauseTimePresetButtonLabel(index, duration);
  }

  const pauseTimePreset0 = document.getElementById('pauseTimePreset0') as HTMLInputElement;
  const pauseTimePreset1 = document.getElementById('pauseTimePreset1') as HTMLInputElement;

  const settings = await Settings.getSettings();
  pauseTimePreset0.value = settings.pauseTimePresets[0].toString();
  pauseTimePreset1.value = settings.pauseTimePresets[1].toString();
  setPauseTimePresetButtonLabel(0, settings.pauseTimePresets[0]);
  setPauseTimePresetButtonLabel(1, settings.pauseTimePresets[1]);
  
  pauseTimePreset0.addEventListener('input', handleChange);
  pauseTimePreset1.addEventListener('input', handleChange);
}

function setPauseTimePresetButtonLabel(index: number, pauseTimePreset: number): void {
  const pauseTimePresetButton = document.getElementById(`preset${index}`) as HTMLElement;

  const formatPresetLabel = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
    }
  }

  pauseTimePresetButton.textContent = formatPresetLabel(pauseTimePreset);
}

function setUpResetSettingsHandler(): void {
  const resetButton = document.getElementById('resetSettings') as HTMLElement;
  resetButton.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      await Settings.reset();
      location.reload();
    }
  });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  setupSettingsToggle();
  await setUpPausing();

  await setDarkMode();
  await setUpBasicSettingsHandlers();
  await setUpPauseSettingHandler();
  setUpResetSettingsHandler();
});
  