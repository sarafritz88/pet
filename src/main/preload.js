const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Close animation
  onPrepareClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('prepare-close', handler);
    return () => ipcRenderer.off('prepare-close', handler);
  },
  closeReady: () => ipcRenderer.send('close-ready'),

  // Window dragging
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),

  // Settings window
  openSettings: () => ipcRenderer.send('open-settings'),
  quitApp: () => ipcRenderer.send('request-quit'),

  // macOS Accessibility (one-time first-launch prompt for keystroke counting)
  getAccessibilityPromptState: () => ipcRenderer.invoke('get-accessibility-prompt-state'),
  openAccessibilitySettings: () => ipcRenderer.invoke('open-accessibility-settings'),
  dismissAccessibilityPrompt: () => ipcRenderer.invoke('dismiss-accessibility-prompt'),

  // App constants (single source of truth from main)
  getAppConstants: () => ipcRenderer.invoke('get-app-constants'),

  // Animation config
  getConfig:       ()       => ipcRenderer.invoke('get-config'),
  setConfig:       (config) => ipcRenderer.invoke('set-config', config),
  onConfigChanged: (callback) => {
    const handler = (_, config) => callback(config);
    ipcRenderer.on('config-changed', handler);
    return () => ipcRenderer.off('config-changed', handler);
  },

  // Coins (currency for unlocking pets)
  getCoins: () => ipcRenderer.invoke('get-coins'),
  getUnlockedPets: () => ipcRenderer.invoke('get-unlocked-pets'),
  unlockPet: (petValue) => ipcRenderer.invoke('unlock-pet', petValue),
  onUnlockedPetsChanged: (callback) => {
    const handler = (_, pets) => callback(pets);
    ipcRenderer.on('unlocked-pets-changed', handler);
    return () => ipcRenderer.off('unlocked-pets-changed', handler);
  },
  onCoinsChanged: (callback) => {
    const handler = (_, coins) => callback(coins);
    ipcRenderer.on('coins-changed', handler);
    return () => ipcRenderer.off('coins-changed', handler);
  },
  onAchievement: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('achievement', handler);
    return () => ipcRenderer.off('achievement', handler);
  },

  // Keystroke counter (read-only from renderer — counting is done system-wide in main)
  getKeystrokes:       ()      => ipcRenderer.invoke('get-keystrokes'),
  getSystemIdleTime:   ()      => ipcRenderer.invoke('get-system-idle-time'),
  onKeystrokesChanged: (callback) => {
    const handler = (_, count) => callback(count);
    ipcRenderer.on('keystrokes-changed', handler);
    return () => ipcRenderer.off('keystrokes-changed', handler);
  },

  // Profiles (per-profile schedule + animConfig + pieMenuItems)
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  setProfiles: (profiles) => ipcRenderer.invoke('set-profiles', profiles),
  getActiveProfileId: () => ipcRenderer.invoke('get-active-profile-id'),

  // Pet state (per active profile: pet type + hide pet)
  getPetState: () => ipcRenderer.invoke('get-pet-state'),
  onPetStateChanged: (callback) => {
    const handler = (_, state) => callback(state);
    ipcRenderer.on('pet-state-changed', handler);
    return () => ipcRenderer.off('pet-state-changed', handler);
  },

  // Pie menu items
  getPieItems:       ()      => ipcRenderer.invoke('get-pie-items'),
  setPieItems:       (items) => ipcRenderer.invoke('set-pie-items', items),
  getPomodoroCount:  ()      => ipcRenderer.invoke('get-pomodoro-count'),
  incrementPomodoroCount: () => ipcRenderer.invoke('increment-pomodoro-count'),

  onPieItemsChanged: (callback) => {
    const handler = (_, items) => callback(items);
    ipcRenderer.on('pie-items-changed', handler);
    return () => ipcRenderer.off('pie-items-changed', handler);
  },

  // Timer state (persisted so timers survive reload)
  getTimerState: () => ipcRenderer.invoke('get-timer-state'),
  setTimerState: (payload) => ipcRenderer.invoke('set-timer-state', payload),

  // External links
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // System sounds / volume settings
  openSystemSounds: () => ipcRenderer.send('open-system-sounds'),

  // Application launcher (picker + launch)
  showOpenDialogForApp: () => ipcRenderer.invoke('show-open-dialog-app'),
  launchApp: (appPath) => ipcRenderer.send('launch-app', appPath),
  getAppIcon: (appPath) => ipcRenderer.invoke('get-app-icon', appPath),
});
