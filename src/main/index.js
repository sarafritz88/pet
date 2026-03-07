import { app, BrowserWindow, screen, ipcMain, shell, dialog, powerMonitor, Menu, systemPreferences } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { uIOhook } from 'uiohook-napi';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const store = new Store();

const WINDOW_SIZE   = 300;
const WINDOW_MARGIN = 20;

const DEFAULT_CONFIG = {
  idle:     'idle',
  curious:  'win',
  happy:    'jumpSlam',
  sleepy:   'hurt',
  dragging: 'fall',
};

// ── Profiles (per-profile animConfig + pieMenuItems + schedule) ──────────────
const PROFILES_KEY = 'profiles';

/** "HH:mm" (24h) → minutes since midnight; invalid → null */
function timeToMinutes(str) {
  if (typeof str !== 'string' || !str.trim()) return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return h * 60 + min;
}

/** Current time as minutes since midnight (local). */
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Current weekday: 0 = Sunday, 6 = Saturday (matches Date.getDay()). */
function todayDay() {
  return new Date().getDay();
}

/**
 * Returns the profile that should be active right now.
 * Profiles with both startTime and endTime set define a range (inclusive start, exclusive end).
 * Overnight ranges: end < start means "until next day" (e.g. 22:00–06:00).
 * daysOfWeek: null/undefined/empty = any day; otherwise array of 0–6 (Sun–Sat), profile only matches on those days.
 * First profile with both times null is the default when no scheduled profile matches.
 */
function getActiveProfile(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  const now = nowMinutes();
  const today = todayDay();
  let defaultProfile = null;
  for (const p of profiles) {
    const days = p.daysOfWeek;
    if (Array.isArray(days) && days.length > 0 && !days.includes(today)) continue;
    const start = timeToMinutes(p.startTime);
    const end = timeToMinutes(p.endTime);
    if (start == null && end == null) {
      defaultProfile = defaultProfile ?? p;
      continue;
    }
    if (start == null || end == null) continue;
    const inRange = start <= end
      ? (now >= start && now < end)
      : (now >= start || now < end);
    if (inRange) return p;
  }
  return defaultProfile ?? profiles[0] ?? null;
}

function getProfilesFromStore() {
  const raw = store.get(PROFILES_KEY, null);
  if (Array.isArray(raw) && raw.length > 0) return raw;
  return null;
}

/** Migrate legacy animConfig + pieMenuItems into a single default profile. */
function ensureProfilesExist() {
  if (getProfilesFromStore() != null) return;
  const animConfig = store.get('animConfig', DEFAULT_CONFIG);
  const pieMenuItems = store.get('pieMenuItems', []);
  const defaultProfile = {
    id: `profile-${Date.now()}`,
    name: 'Default',
    startTime: null,
    endTime: null,
    daysOfWeek: null,
    animConfig: { ...DEFAULT_CONFIG, ...animConfig },
    pieMenuItems: Array.isArray(pieMenuItems) ? pieMenuItems : [],
    petType: 'default',
    hidePet: false,
  };
  store.set(PROFILES_KEY, [defaultProfile]);
}

function pushActiveProfileToPet() {
  if (!mainWindow?.webContents) return;
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  if (!Array.isArray(profiles) || profiles.length === 0) {
    mainWindow.webContents.send('config-changed', store.get('animConfig', DEFAULT_CONFIG));
    mainWindow.webContents.send('pie-items-changed', store.get('pieMenuItems', []));
    mainWindow.webContents.send('pet-state-changed', { petType: 'default', hidePet: false });
    return;
  }
  const active = getActiveProfile(profiles);
  if (active) {
    mainWindow.webContents.send('config-changed', active.animConfig ?? DEFAULT_CONFIG);
    mainWindow.webContents.send('pie-items-changed', active.pieMenuItems ?? []);
    mainWindow.webContents.send('pet-state-changed', {
      petType: active.petType ?? 'default',
      hidePet: active.hidePet ?? false,
    });
  }
}

let mainWindow = null;
let settingsWindow = null;

// ── Currency (coins) and achievements ─────────────────────────────────────────
function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function awardCoins(amount, achievements) {
  if (amount <= 0) return;
  const next = store.get('coins', 0) + amount;
  store.set('coins', next);
  mainWindow?.webContents.send('coins-changed', next);
  settingsWindow?.webContents.send('coins-changed', next);
  if (achievements?.length > 0) {
    mainWindow?.webContents.send('achievement', { achievements, totalCoins: amount });
  }
}

function spendCoins(amount) {
  const current = store.get('coins', 0);
  if (current < amount) return false;
  store.set('coins', current - amount);
  mainWindow?.webContents.send('coins-changed', current - amount);
  settingsWindow?.webContents.send('coins-changed', current - amount);
  return true;
}

// ── Unlocked pets (for shop purchases) ───────────────────────────────────────
const PET_UNLOCK_COST = 300;
const DEFAULT_UNLOCKED_PETS = ['default', 'knight']; // dragon and panda start locked

// ── System-wide keystroke counter ────────────────────────────────────────────
// Batched so we only hit the store (and broadcast to the settings window)
// at most once every 500 ms rather than on every single key press.
let pendingKeystrokes    = 0;
let keystrokeFlushTimer  = null;

const flushKeystrokes = () => {
  if (pendingKeystrokes <= 0) {
    keystrokeFlushTimer = null;
    return;
  }
  const today = todayDateStr();
  const oldTotal = store.get('keystrokes', 0);
  const newTotal = oldTotal + pendingKeystrokes;
  store.set('keystrokes', newTotal);
  settingsWindow?.webContents.send('keystrokes-changed', newTotal);
  pendingKeystrokes = 0;
  keystrokeFlushTimer = null;

  // Keystroke-based coin awards
  let coinsToAdd = 0;
  const achievements = [];

  // +10 per 1,000 keystrokes
  const oldThousands = Math.floor(oldTotal / 1000);
  const newThousands = Math.floor(newTotal / 1000);
  const thousandsEarned = newThousands - oldThousands;
  if (thousandsEarned > 0) {
    const amt = thousandsEarned * 10;
    coinsToAdd += amt;
    achievements.push({ message: `${(thousandsEarned * 1000).toLocaleString()} Keystrokes!`, coins: amt });
  }

  // Daily keystroke tracking for 10k milestone
  let lastKeystrokeDate = store.get('lastKeystrokeDate', null);
  let keystrokesToday = store.get('keystrokesToday', 0);
  if (lastKeystrokeDate !== today) {
    keystrokesToday = 0;
    lastKeystrokeDate = today;
  }
  keystrokesToday += (newTotal - oldTotal);
  store.set('lastKeystrokeDate', lastKeystrokeDate);
  store.set('keystrokesToday', keystrokesToday);

  // +75 for 10,000 Keystrokes in a Day milestone
  const prevToday = keystrokesToday - (newTotal - oldTotal);
  if (prevToday < 10000 && keystrokesToday >= 10000) {
    coinsToAdd += 75;
    achievements.push({ message: '10,000 Keystrokes today!', coins: 75 });
  }

  // +25 Daily Streak Bonus (any activity that day)
  let lastStreakDate = store.get('lastStreakDate', null);
  if (lastStreakDate !== today) {
    lastStreakDate = today;
    store.set('lastStreakDate', today);
    coinsToAdd += 25;
    achievements.push({ message: 'Daily streak!', coins: 25 });
  }

  if (coinsToAdd > 0) {
    awardCoins(coinsToAdd, achievements);
  }
};

uIOhook.on('keydown', () => {
  pendingKeystrokes++;
  if (!keystrokeFlushTimer) keystrokeFlushTimer = setTimeout(flushKeystrokes, 500);
});

function createSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }

  settingsWindow = new BrowserWindow({
    width: 380,
    height: 720,
    title: 'Pet Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.center();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + '#settings');
  } else {
    settingsWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { hash: 'settings' },
    );
  }

  settingsWindow.on('closed', () => { settingsWindow = null; });
}

ipcMain.on('open-settings', createSettingsWindow);

/** Close the pet window (plays close animation then app quits via mainWindow 'closed'). */
ipcMain.on('request-quit', () => {
  mainWindow?.close();
});

// ── macOS Accessibility (required for uiohook keystroke counting) ─────────────────────────────
const ACCESSIBILITY_PROMPT_SHOWN_KEY = 'accessibilityPromptShown';

/** Returns { showPrompt, granted }. On macOS, showPrompt is true only once when permission is not granted. */
ipcMain.handle('get-accessibility-prompt-state', () => {
  const isMac = process.platform === 'darwin';
  if (!isMac) return { showPrompt: false, granted: true };
  const granted = systemPreferences.isTrustedAccessibilityClient(false);
  const promptAlreadyShown = store.get(ACCESSIBILITY_PROMPT_SHOWN_KEY, false);
  const showPrompt = !granted && !promptAlreadyShown;
  return { showPrompt, granted };
});

/** Opens System Settings (or System Preferences) to Privacy & Security > Accessibility, and marks the one-time prompt as shown. */
ipcMain.handle('open-accessibility-settings', () => {
  store.set(ACCESSIBILITY_PROMPT_SHOWN_KEY, true);
  if (process.platform !== 'darwin') return;
  // Opens Privacy & Security > Accessibility so the user can enable this app
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
});

/** Dismiss the one-time prompt without opening settings (user can enable later). */
ipcMain.handle('dismiss-accessibility-prompt', () => {
  store.set(ACCESSIBILITY_PROMPT_SHOWN_KEY, true);
});

/** Single source of truth for constants used by renderer (avoids duplication across process boundary). */
ipcMain.handle('get-app-constants', () => ({
  defaultConfig: DEFAULT_CONFIG,
  petUnlockCost: PET_UNLOCK_COST,
}));

ipcMain.handle('get-config', () => {
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  if (profiles != null) {
    const active = getActiveProfile(profiles);
    if (active?.animConfig) return active.animConfig;
  }
  return store.get('animConfig', DEFAULT_CONFIG);
});

ipcMain.handle('set-config', (event, config) => {
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  if (!Array.isArray(profiles) || profiles.length === 0) return;
  const active = getActiveProfile(profiles);
  if (!active) return;
  const idx = profiles.findIndex(p => p.id === active.id);
  if (idx === -1) return;
  const next = profiles.slice();
  next[idx] = { ...next[idx], animConfig: config ?? DEFAULT_CONFIG };
  store.set(PROFILES_KEY, next);
  pushActiveProfileToPet();
});

ipcMain.handle('get-keystrokes', () => store.get('keystrokes', 0));
ipcMain.handle('get-coins', () => store.get('coins', 0));
ipcMain.handle('get-unlocked-pets', () => {
  const stored = store.get('unlockedPets', null);
  const list = Array.isArray(stored) ? stored : [];
  const merged = [...new Set([...list, ...DEFAULT_UNLOCKED_PETS])];
  return merged;
});
ipcMain.handle('unlock-pet', (event, petValue) => {
  const current = store.get('unlockedPets', DEFAULT_UNLOCKED_PETS);
  const unlocked = Array.isArray(current) ? current : [...DEFAULT_UNLOCKED_PETS];
  if (unlocked.includes(petValue)) return { success: true, alreadyUnlocked: true };
  if (!spendCoins(PET_UNLOCK_COST)) return { success: false, reason: 'insufficient_coins' };
  const next = [...unlocked, petValue];
  store.set('unlockedPets', next);
  settingsWindow?.webContents.send('unlocked-pets-changed', next);
  return { success: true };
});

// System idle time in seconds (no mouse/keyboard activity anywhere)
ipcMain.handle('get-system-idle-time', () => powerMonitor.getSystemIdleTime());

// Pet window timer state (persisted so timers survive reload/crash)
const TIMER_STATE_KEY = 'petWindowTimerState';
ipcMain.handle('get-timer-state', () => store.get(TIMER_STATE_KEY, null));
ipcMain.handle('set-timer-state', (event, payload) => {
  if (payload && typeof payload.savedAt === 'number' && payload.timers && typeof payload.timers === 'object') {
    store.set(TIMER_STATE_KEY, payload);
  }
});

// ── Profiles ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-profiles', () => {
  ensureProfilesExist();
  return store.get(PROFILES_KEY, []);
});

ipcMain.handle('get-active-profile-id', () => {
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  const active = getActiveProfile(profiles);
  return active?.id ?? null;
});

/** Return current pet state (petType, hidePet) for the active profile so the pet window can sync on load. */
ipcMain.handle('get-pet-state', () => {
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  const active = getActiveProfile(Array.isArray(profiles) ? profiles : []);
  if (!active) return { petType: 'default', hidePet: false };
  return {
    petType: active.petType ?? 'default',
    hidePet: active.hidePet ?? false,
  };
});

ipcMain.handle('set-profiles', (event, profiles) => {
  if (!Array.isArray(profiles)) return;
  const normalized = profiles.map(p => ({
    ...p,
    petType: p.petType ?? 'default',
    hidePet: p.hidePet ?? false,
  }));
  store.set(PROFILES_KEY, normalized);
  pushActiveProfileToPet();
});

// ── Pie menu items (when using profiles, get/set refer to active profile) ────────
ipcMain.handle('get-pie-items', () => {
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  if (profiles != null) {
    const active = getActiveProfile(profiles);
    if (active && Array.isArray(active.pieMenuItems)) return active.pieMenuItems;
  }
  return store.get('pieMenuItems', []);
});

ipcMain.handle('set-pie-items', (event, items) => {
  if (!Array.isArray(items)) return;
  ensureProfilesExist();
  const profiles = getProfilesFromStore();
  if (!Array.isArray(profiles) || profiles.length === 0) return;
  const active = getActiveProfile(profiles);
  if (!active) return;
  const idx = profiles.findIndex(p => p.id === active.id);
  if (idx === -1) return;
  const next = profiles.slice();
  next[idx] = { ...next[idx], pieMenuItems: items };
  store.set(PROFILES_KEY, next);
  pushActiveProfileToPet();
});

ipcMain.handle('get-pomodoro-count', () => store.get('pomodoroCount', 0));
ipcMain.handle('increment-pomodoro-count', () => {
  const next = store.get('pomodoroCount', 0) + 1;
  store.set('pomodoroCount', next);

  // Pomodoro coin awards
  const today = todayDateStr();
  let lastPomodoroDate = store.get('lastPomodoroDate', null);
  let pomodorosToday = store.get('pomodorosToday', 0);
  if (lastPomodoroDate !== today) {
    pomodorosToday = 1;
    lastPomodoroDate = today;
  } else {
    pomodorosToday += 1;
  }
  store.set('lastPomodoroDate', lastPomodoroDate);
  store.set('pomodorosToday', pomodorosToday);

  let coinsToAdd = 0;
  const achievements = [];

  // +50 base for 1 Pomodoro (25 min)
  coinsToAdd += 50;
  achievements.push({ message: 'Pomodoro complete!', coins: 50 });

  // +15 First Pomodoro of the Day
  if (pomodorosToday === 1) {
    coinsToAdd += 15;
    achievements.push({ message: 'First Pomodoro of the day!', coins: 15 });
  }

  // +50 5-Pomodoro Day milestone
  if (pomodorosToday === 5) {
    coinsToAdd += 50;
    achievements.push({ message: '5-Pomodoro day!', coins: 50 });
  }

  // +25 Daily Streak Bonus (any activity that day)
  let lastStreakDate = store.get('lastStreakDate', null);
  if (lastStreakDate !== today) {
    store.set('lastStreakDate', today);
    coinsToAdd += 25;
    achievements.push({ message: 'Daily streak!', coins: 25 });
  }

  awardCoins(coinsToAdd, achievements);
  return next;
});

ipcMain.on('open-external', (_, url) => {
  if (typeof url !== 'string' || !url.trim()) return;
  const trimmed = url.trim();
  const hasScheme = /^https?:\/\//i.test(trimmed);
  const toOpen = hasScheme ? trimmed : `https://${trimmed}`;
  shell.openExternal(toOpen);
});

// Pick an application (file or .app bundle on macOS)
ipcMain.handle('show-open-dialog-app', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Application',
    properties: ['openFile', 'openDirectory'], // .app on macOS is a directory
  });
  if (result.canceled || result.filePaths.length === 0) return { path: null };
  return { path: result.filePaths[0] };
});

// Launch an application by path
ipcMain.on('launch-app', (_, appPath) => {
  if (typeof appPath !== 'string' || !appPath.trim()) return;
  shell.openPath(appPath.trim()).catch(() => {});
});

// Get app icon as data URL for pie menu (uses system icon for .app / .exe / etc.)
const PIE_ICON_SIZE = 64;
ipcMain.handle('get-app-icon', async (_, appPath) => {
  if (typeof appPath !== 'string' || !appPath.trim()) return null;
  const p = appPath.trim();
  let iconPath = p;
  // On macOS, .app is a directory; getFileIcon often needs the executable path
  if (process.platform === 'darwin' && p.endsWith('.app')) {
    const macosDir = path.join(p, 'Contents', 'MacOS');
    try {
      if (fs.existsSync(macosDir)) {
        const names = fs.readdirSync(macosDir);
        const exe = names.find(n => !n.startsWith('.')) || names[0];
        if (exe) iconPath = path.join(macosDir, exe);
      }
    } catch {
      // keep iconPath as .app path and try anyway
    }
  }
  try {
    const icon = await app.getFileIcon(iconPath, { size: PIE_ICON_SIZE });
    return icon ? icon.toDataURL() : null;
  } catch {
    return null;
  }
});

// Open OS sound/volume settings (platform-specific)
ipcMain.on('open-system-sounds', () => {
  const platform = process.platform;
  if (platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.sound');
  } else if (platform === 'win32') {
    shell.openExternal('ms-settings:sound');
  } else {
    // Linux: try common sound control apps
    exec('pavucontrol 2>/dev/null || gnome-control-center sound 2>/dev/null || true', () => {});
  }
});

// Registered once at module level — avoids duplicate listeners if createWindow
// is ever called more than once (e.g. macOS activate event)
ipcMain.on('move-window', (event, { dx, dy }) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const newX = x + dx;
  const newY = y + dy;
  mainWindow.setPosition(newX, newY);
  store.set('windowX', newX);
  store.set('windowY', newY);
});

const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const defaultX = width - WINDOW_SIZE - WINDOW_MARGIN;
  const defaultY = height - WINDOW_SIZE - WINDOW_MARGIN;
  const savedX = store.get('windowX', defaultX);
  const savedY = store.get('windowY', defaultY);

  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    x: savedX,
    y: savedY,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('windowX', x);
    store.set('windowY', y);
  });

  let readyToClose = false;
  mainWindow.on('close', (e) => {
    if (readyToClose) return;
    e.preventDefault();
    mainWindow.webContents.send('prepare-close');
    ipcMain.once('close-ready', () => {
      readyToClose = true;
      mainWindow.close();
    });
  });

  // Quit the whole app when the pet window closes so no ghost process lingers
  mainWindow.on('closed', () => {
    app.quit();
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

/** One-time migration: backfill coins from existing keystrokes (10 per 1,000). */
function backfillCoinsFromKeystrokes() {
  if (store.get('keystrokeCoinsBackfilled', false)) return;
  const keystrokes = store.get('keystrokes', 0);
  const coinsFromKeystrokes = Math.floor(keystrokes / 1000) * 10;
  if (coinsFromKeystrokes > 0) {
    const current = store.get('coins', 0);
    store.set('coins', current + coinsFromKeystrokes);
    mainWindow?.webContents.send('coins-changed', current + coinsFromKeystrokes);
    settingsWindow?.webContents.send('coins-changed', current + coinsFromKeystrokes);
  }
  store.set('keystrokeCoinsBackfilled', true);
}

app.whenReady().then(() => {
  ensureProfilesExist();
  createWindow();
  backfillCoinsFromKeystrokes();
  uIOhook.start();

  // Set dock icon on macOS (important in dev mode; packaged builds use forge.config.js)
  if (process.platform === 'darwin') {
    const iconPath = path.join(app.isPackaged ? process.resourcesPath : path.resolve(), 'assets/icon.png');
    if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath);
  }

  // Minimal app menu so Cmd+Q (Quit) and Cmd+H (Hide) work on macOS
  const isMac = process.platform === 'darwin';
  const template = isMac
    ? [{ label: app.name, submenu: [{ role: 'hide' }, { role: 'quit' }] }]
    : [{ label: 'File', submenu: [{ role: 'quit' }] }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // No automatic push here; pet window pulls state on load and polls every 60s so we don't overwrite with a stale default

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

  // Flush any pending keystrokes and stop the hook before the process exits
app.on('will-quit', () => {
  if (keystrokeFlushTimer) {
    clearTimeout(keystrokeFlushTimer);
    flushKeystrokes();
  }
  uIOhook.stop();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
