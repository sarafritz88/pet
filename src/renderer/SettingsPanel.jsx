import React, { useState, useEffect } from 'react';
import Pet, { CLIP_OPTIONS, KNIGHT_CLIP_OPTIONS, DRAGON_CLIP_OPTIONS, PANDA_CLIP_OPTIONS } from './Pet';
import './SettingsPanel.css';

const STATES = [
  { key: 'idle',     label: 'Idle' },
  { key: 'curious',  label: 'Curious (Hover)' },
  { key: 'happy',    label: 'Happy (Click)' },
  { key: 'sleepy',   label: 'Sleepy (Inactive)' },
  { key: 'dragging', label: 'Dragging' },
];

/** Fallback until getAppConstants() resolves; main process is the source of truth. */
const DEFAULT_CONFIG_FALLBACK = {
  idle:     'idle',
  curious:  'win',
  happy:    'jumpSlam',
  sleepy:   'hurt',
  dragging: 'fall',
};
const PET_UNLOCK_COST_FALLBACK = 300;

const PET_TYPES = [
  { value: 'default', label: 'Squid' },
  { value: 'knight',  label: 'Knight' },
  { value: 'dragon', label: 'Dragon' },
  { value: 'panda',  label: 'Panda' },
];

/** Clip names for shop hover (random second animation); exclude idle and death/die/kill. */
const SHOP_HOVER_CLIPS = {
  default: ['walk', 'legLift', 'fall', 'jump', 'jumpSlam', 'inkSquirt', 'hurt', 'win'],
  knight:  ['WALK', 'RUN', 'JUMP', 'HURT', 'ATTACK 1', 'ATTACK 2', 'ATTACK 3', 'DEFEND'],
  dragon:  ['RUN', 'ATTACK 1', 'ATTACK 2', 'HURT'],
  panda:   ['Happy', 'PandaWave', 'PandaResting', 'Yoga'],
};
function randomHoverClip(petValue) {
  const list = SHOP_HOVER_CLIPS[petValue];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

const DEFAULT_KNIGHT_CONFIG = {
  idle:     'IDLE',
  curious:  'IDLE',
  happy:    'ATTACK 1',
  sleepy:   'HURT',
  dragging: 'DEFEND',
};

const DEFAULT_DRAGON_CONFIG = {
  idle:     'IDLE',
  curious:  'IDLE',
  happy:    'ATTACK 1',
  sleepy:   'HURT',
  dragging: 'RUN',
};

const DEFAULT_PANDA_CONFIG = {
  idle:     'PandaIdle',
  curious:  'PandaWave',
  happy:    'Happy',
  sleepy:   'PandaSleep',
  dragging: 'PandaResting',
};

const PIE_ITEM_TYPES = [
  { value: 'volume',      label: 'System Volume Control', icon: '\u{1F50A}' },
  { value: 'pomodoro',    label: 'Pomodoro Timer (25 min)', icon: '\u{23F1}\uFE0F' },
  { value: 'timer',       label: 'Timer (custom)',       icon: '\u{23F2}\uFE0F' },
  { value: 'link',        label: 'Link',                  icon: '\u{1F517}' },
  { value: 'application', label: 'Application',           icon: '\u{1F4BB}' },
];

const MAX_PIE_ITEMS = 8;

function defaultIcon(type) {
  return PIE_ITEM_TYPES.find(t => t.value === type)?.icon ?? '\u2699\uFE0F';
}

function formatDays(days) {
  if (!Array.isArray(days) || days.length === 0) return '';
  if (days.length === 7) return '';
  const labels = days.slice().sort((a, b) => a - b).map(d => DAYS_OF_WEEK[d].label);
  return labels.join(', ') + ' ';
}

function formatSchedule(profile) {
  const s = profile.startTime?.trim();
  const e = profile.endTime?.trim();
  const daysStr = formatDays(profile.daysOfWeek ?? []);
  if (!s && !e) {
    return daysStr ? `${daysStr}only` : 'Default (when no other schedule matches)';
  }
  if (s && e) return `${daysStr}${s} – ${e}`;
  if (s) return `${daysStr}From ${s}`;
  return `${daysStr}Until ${e}`;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function createDefaultProfile(defaultConfig) {
  return {
    id: `profile-${Date.now()}`,
    name: 'New Profile',
    startTime: null,
    endTime: null,
    daysOfWeek: null,
    animConfig: { ...(defaultConfig ?? DEFAULT_CONFIG_FALLBACK) },
    pieMenuItems: [],
    petType: 'default',
    hidePet: false,
  };
}

const TAB_SHOP = 'shop';
const TAB_SETTINGS = 'settings';

export default function SettingsPanel() {
  const [activeTab, setActiveTab] = useState(TAB_SHOP);
  const [appConstants, setAppConstants] = useState({
    defaultConfig: DEFAULT_CONFIG_FALLBACK,
    petUnlockCost: PET_UNLOCK_COST_FALLBACK,
  });
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [keystrokes, setKeystrokes] = useState(0);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [coins, setCoins] = useState(0);
  const [unlockedPets, setUnlockedPets] = useState(['default', 'knight']);
  const [activeProfileId, setActiveProfileId] = useState(null);

  // Shop: which pet frame is hovered and which random clip to show
  const [shopHoveredPet, setShopHoveredPet] = useState(null);
  const [shopHoverClip, setShopHoverClip] = useState(null);

  // Days-of-week section collapsed by default
  const [daysSectionOpen, setDaysSectionOpen] = useState(false);

  // macOS: one-time first-launch prompt when Accessibility permission is not granted (needed for keystroke counting)
  const [accessibilityPrompt, setAccessibilityPrompt] = useState({ showPrompt: false, granted: true });

  // Add pie-item form (for the selected profile)
  const [newType, setNewType] = useState('volume');
  const [newUrl, setNewUrl] = useState('');
  const [newAppPath, setNewAppPath] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newDurationMinutes, setNewDurationMinutes] = useState(15);

  // Load macOS Accessibility prompt state (one-time first-launch)
  useEffect(() => {
    window.electronAPI?.getAccessibilityPromptState?.().then((state) => {
      if (state) setAccessibilityPrompt(state);
    });
  }, []);

  // Load app constants from main (single source of truth)
  useEffect(() => {
    window.electronAPI?.getAppConstants?.().then((c) => {
      if (c?.defaultConfig != null || c?.petUnlockCost != null) {
        setAppConstants(prev => ({
          defaultConfig: c.defaultConfig ?? prev.defaultConfig,
          petUnlockCost: c.petUnlockCost ?? prev.petUnlockCost,
        }));
      }
    });
  }, []);

  // Load profiles and select the one that's currently active (so dropdown matches what the pet shows)
  useEffect(() => {
    window.electronAPI?.getProfiles().then(list => {
      const next = Array.isArray(list) && list.length > 0 ? list : [createDefaultProfile(appConstants.defaultConfig)];
      setProfiles(next);
      if (next.length > 0 && (!list || list.length === 0)) {
        window.electronAPI?.setProfiles(next);
      }
      window.electronAPI?.getActiveProfileId?.().then(activeId => {
        setActiveProfileId(activeId ?? null);
        if (activeId && next.some(p => p.id === activeId)) {
          setSelectedId(activeId);
        } else if (next.length > 0) {
          setSelectedId(next[0].id);
        }
      });
    });
  }, [appConstants.defaultConfig]);

  // Refresh active profile id when profiles change (schedule may have changed)
  useEffect(() => {
    if (!profiles.length) return;
    window.electronAPI?.getActiveProfileId?.().then(id => setActiveProfileId(id ?? null));
  }, [profiles]);

  // Persist profiles whenever they change (and we have at least one)
  const saveProfiles = (next) => {
    const list = next?.length ? next : profiles;
    if (list.length === 0) return;
    setProfiles(list);
    window.electronAPI?.setProfiles(list);
  };

  // Load keystroke count and subscribe to live updates
  useEffect(() => {
    window.electronAPI?.getKeystrokes().then(setKeystrokes);
    const cleanup = window.electronAPI?.onKeystrokesChanged(setKeystrokes);
    return () => cleanup?.();
  }, []);

  // Load Pomodoro count (persisted in main)
  useEffect(() => {
    window.electronAPI?.getPomodoroCount?.().then((n) => {
      if (typeof n === 'number') setPomodoroCount(n);
    });
  }, []);

  // Load coins and subscribe to live updates
  useEffect(() => {
    window.electronAPI?.getCoins?.().then((n) => {
      if (typeof n === 'number') setCoins(n);
    });
    const cleanup = window.electronAPI?.onCoinsChanged?.(setCoins);
    return () => cleanup?.();
  }, []);

  // Load unlocked pets and subscribe to changes
  useEffect(() => {
    window.electronAPI?.getUnlockedPets?.().then((list) => {
      if (Array.isArray(list)) setUnlockedPets(list);
    });
    const cleanup = window.electronAPI?.onUnlockedPetsChanged?.(setUnlockedPets);
    return () => cleanup?.();
  }, []);

  const selectedProfile = profiles.find(p => p.id === selectedId);
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const activePetType = activeProfile?.petType ?? 'default';
  const unlockedPetSet = new Set(unlockedPets);
  const availablePets = PET_TYPES.filter(({ value }) => unlockedPetSet.has(value));

  // If selected profile has a locked pet, reset to default
  useEffect(() => {
    if (!selectedProfile || unlockedPets.length === 0) return;
    const pt = selectedProfile.petType ?? 'default';
    if (!unlockedPetSet.has(pt)) {
      updateProfile(selectedProfile.id, { petType: 'default', animConfig: { ...appConstants.defaultConfig } });
    }
  }, [selectedProfile?.id, selectedProfile?.petType, unlockedPets.join(','), appConstants.defaultConfig]);

  const updateProfile = (id, patch) => {
    const next = profiles.map(p => p.id === id ? { ...p, ...patch } : p);
    saveProfiles(next);
  };

  const handleProfileName = (id, name) => updateProfile(id, { name: name || 'Unnamed' });
  const handleProfileStartTime = (id, startTime) => updateProfile(id, { startTime: startTime || null });
  const handleProfileEndTime = (id, endTime) => updateProfile(id, { endTime: endTime || null });
  const handleProfileDaysOfWeek = (id, daysOfWeek) => {
    const arr = Array.isArray(daysOfWeek) ? daysOfWeek : null;
    updateProfile(id, { daysOfWeek: arr?.length === 0 ? null : arr ?? null });
  };
  const toggleProfileDay = (id, day) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    const current = profile.daysOfWeek ?? null;
    const isAll = !current || current.length === 0;
    const base = isAll ? [0, 1, 2, 3, 4, 5, 6] : [...current];
    const has = base.includes(day);
    const next = has ? base.filter(d => d !== day) : [...base, day].sort((a, b) => a - b);
    handleProfileDaysOfWeek(id, next.length === 7 || next.length === 0 ? null : next);
  };

  const handlePetType = (id, petType) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    const defaultConfig = petType === 'dragon'
      ? DEFAULT_DRAGON_CONFIG
      : petType === 'knight'
        ? DEFAULT_KNIGHT_CONFIG
        : petType === 'panda'
          ? DEFAULT_PANDA_CONFIG
          : appConstants.defaultConfig;
    const nextConfig = { ...defaultConfig, ...(profile.animConfig ?? {}) };
    updateProfile(id, { petType, animConfig: nextConfig });
  };
  const handleHidePet = (id, hidePet) => updateProfile(id, { hidePet: !!hidePet });

  const handleChange = (profileId, stateKey, clipName) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    const animConfig = { ...(profile.animConfig ?? appConstants.defaultConfig), [stateKey]: clipName };
    updateProfile(profileId, { animConfig });
  };

  const addPieItem = async (profileId) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile || profile.pieMenuItems.length >= MAX_PIE_ITEMS) return;

    let icon = newIcon.trim() || null;
    if (newType === 'application' && newAppPath.trim() && !icon) {
      const dataUrl = await window.electronAPI?.getAppIcon(newAppPath.trim());
      if (dataUrl) icon = dataUrl;
    }

    const typeLabel = PIE_ITEM_TYPES.find(t => t.value === newType)?.label ?? newType;
    const name = newItemName.trim();
    const label =
      newType === 'timer'
        ? (name || `Timer (${newDurationMinutes} min)`)
        : newType === 'pomodoro'
          ? (name || 'Pomodoro')
          : newType === 'link'
            ? (name || typeLabel)
            : newType === 'application'
              ? (name || typeLabel)
              : typeLabel;
    const item = {
      id:      Date.now().toString(),
      type:    newType,
      label,
      url:     newType === 'link' ? newUrl.trim() : null,
      appPath: newType === 'application' ? newAppPath.trim() : null,
      icon,
      ...(newType === 'timer' && { durationMinutes: Math.max(1, Math.min(999, newDurationMinutes)) }),
    };

    const pieMenuItems = [...(profile.pieMenuItems ?? []), item];
    updateProfile(profileId, { pieMenuItems });
    setNewUrl('');
    setNewAppPath('');
    setNewIcon('');
    setNewItemName('');
  };

  const browseForApp = async () => {
    const { path: chosen } = await window.electronAPI?.showOpenDialogForApp() ?? {};
    if (chosen) setNewAppPath(chosen);
  };

  const removePieItem = (profileId, itemId) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    const pieMenuItems = (profile.pieMenuItems ?? []).filter(item => item.id !== itemId);
    updateProfile(profileId, { pieMenuItems });
  };

  const addProfile = () => {
    const newProfile = createDefaultProfile(appConstants.defaultConfig);
    const next = [...profiles, newProfile];
    saveProfiles(next);
    setSelectedId(newProfile.id);
  };

  const deleteProfile = (id) => {
    if (profiles.length <= 1) return;
    const next = profiles.filter(p => p.id !== id);
    saveProfiles(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  // Hydrate app icons for pie items that don't have one (selected profile only)
  useEffect(() => {
    if (!selectedProfile?.pieMenuItems?.length) return;
    const needsIcon = selectedProfile.pieMenuItems.filter(
      item => item.type === 'application' && item.appPath && !item.icon
    );
    if (needsIcon.length === 0) return;
    let cancelled = false;
    const profileId = selectedProfile.id;
    (async () => {
      const pieMenuItems = [...selectedProfile.pieMenuItems];
      for (const item of needsIcon) {
        if (cancelled) break;
        const dataUrl = await window.electronAPI?.getAppIcon(item.appPath);
        if (dataUrl) {
          const i = pieMenuItems.findIndex(x => x.id === item.id);
          if (i !== -1) pieMenuItems[i] = { ...pieMenuItems[i], icon: dataUrl };
        }
      }
      if (!cancelled) updateProfile(profileId, { pieMenuItems });
    })();
    return () => { cancelled = true; };
  }, [selectedProfile?.id, selectedProfile?.pieMenuItems?.length]);

  const shopAnimConfig = (petValue) => {
    if (petValue === 'dragon') return DEFAULT_DRAGON_CONFIG;
    if (petValue === 'knight') return DEFAULT_KNIGHT_CONFIG;
    if (petValue === 'panda') return DEFAULT_PANDA_CONFIG;
    return appConstants.defaultConfig;
  };

  const handleOpenAccessibilitySettings = () => {
    window.electronAPI?.openAccessibilitySettings?.();
    setAccessibilityPrompt((prev) => ({ ...prev, showPrompt: false }));
  };

  const handleDismissAccessibilityPrompt = () => {
    window.electronAPI?.dismissAccessibilityPrompt?.();
    setAccessibilityPrompt((prev) => ({ ...prev, showPrompt: false }));
  };

  return (
    <div className="settings-panel">
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeTab === TAB_SHOP ? 'settings-tab-active' : ''}`}
          onClick={() => setActiveTab(TAB_SHOP)}
        >
          Shop
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === TAB_SETTINGS ? 'settings-tab-active' : ''}`}
          onClick={() => setActiveTab(TAB_SETTINGS)}
        >
          Settings
        </button>
        <button
          type="button"
          className="settings-tab settings-tab-close-app"
          onClick={() => window.electronAPI?.quitApp?.()}
          title="Close app (pet will play close animation)"
        >
          Close app
        </button>
      </div>

      {accessibilityPrompt.showPrompt && (
        <div className="settings-accessibility-banner" role="status">
          <p className="settings-accessibility-banner-text">
            Keystroke counting and coins require <strong>Accessibility</strong> permission on macOS. Without it, your totals will stay at zero. Open System Settings and turn on access for this app.
          </p>
          <div className="settings-accessibility-banner-actions">
            <button
              type="button"
              className="settings-accessibility-banner-btn settings-accessibility-banner-btn-primary"
              onClick={handleOpenAccessibilitySettings}
            >
              Open System Settings
            </button>
            <button
              type="button"
              className="settings-accessibility-banner-btn settings-accessibility-banner-btn-dismiss"
              onClick={handleDismissAccessibilityPrompt}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {activeTab === TAB_SHOP && (
        <div className="settings-tab-pane shop-pane">
          <div className="shop-coins-row">
            <span className="shop-coins-label">Coins</span>
            <span className="shop-coins-count">{coins.toLocaleString()} 🪙</span>
          </div>
          <div className="stats-row">
            <div className="keystroke-section">
              <span className="keystroke-label">Total Keystrokes</span>
              <span className="keystroke-count">{keystrokes.toLocaleString()}</span>
            </div>
            <div className="pomodoro-section">
              <span className="pomodoro-label">Pomodoros completed</span>
              <span className="pomodoro-count">{pomodoroCount}</span>
            </div>
          </div>
          <h2>Pets</h2>
          <div className="shop-pet-grid">
            {PET_TYPES.map(({ value, label }) => {
              const isLocked = !unlockedPetSet.has(value);
              const isActive = value === activePetType;
              return (
                <div
                  key={value}
                  className={`shop-pet-frame ${isLocked ? 'shop-pet-frame-locked' : ''}${isActive ? ' shop-pet-frame-active' : ''}`}
                  onMouseEnter={() => {
                    if (!isLocked) {
                      setShopHoveredPet(value);
                      setShopHoverClip(randomHoverClip(value));
                    }
                  }}
                  onMouseLeave={() => {
                    setShopHoveredPet(null);
                    setShopHoverClip(null);
                  }}
                  onClick={async () => {
                    if (isLocked) {
                      const result = await window.electronAPI?.unlockPet?.(value);
                      if (result?.success && !result?.alreadyUnlocked) {
                        setUnlockedPets(prev => [...prev, value]);
                      }
                      return;
                    }
                    if (!activeProfileId) return;
                    handlePetType(activeProfileId, value);
                  }}
                >
                  <div className="shop-pet-preview">
                    <Pet
                      state="idle"
                      animConfig={shopAnimConfig(value)}
                      spriteSet={value}
                      previewClip={!isLocked && shopHoveredPet === value ? shopHoverClip : null}
                    />
                    {isLocked && (
                      <div className="shop-pet-lock-overlay">
                        <span className="shop-pet-lock-icon">🔒</span>
                        <span className="shop-pet-unlock-price">{appConstants.petUnlockCost} 🪙</span>
                      </div>
                    )}
                  </div>
                  <span className="shop-pet-name">{label}</span>
                </div>
              );
            })}
          </div>
          <p className="shop-settings-link-wrap">
            <button
              type="button"
              className="shop-settings-link"
              onClick={() => setActiveTab(TAB_SETTINGS)}
            >
              Open Settings
            </button>
            <span className="shop-settings-link-hint"> to manage profiles, pie menu, and animation.</span>
          </p>
        </div>
      )}

      {activeTab === TAB_SETTINGS && profiles.length === 0 && (
        <div className="settings-tab-pane">Loading profiles…</div>
      )}

      {activeTab === TAB_SETTINGS && profiles.length > 0 && (
        <div className="settings-tab-pane">
      <h2>Profiles</h2>
      <p className="profiles-hint">Each profile can have its own schedule and pie menu. The first matching schedule is used.</p>

      <div className="profile-list">
        {profiles.map(p => (
          <div
            key={p.id}
            className={`profile-card ${selectedId === p.id ? 'profile-card-selected' : ''}`}
            onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
          >
            <div className="profile-card-header">
              <span className="profile-name">{p.name || 'Unnamed'}</span>
              <span className="profile-schedule">{formatSchedule(p)}</span>
              <div className="profile-actions">
                <button
                  type="button"
                  className="profile-btn profile-btn-delete"
                  onClick={e => { e.stopPropagation(); deleteProfile(p.id); }}
                  disabled={profiles.length <= 1}
                  title="Delete profile"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="profile-add-btn" onClick={addProfile}>
        + Add profile
      </button>

      {selectedProfile && (
        <div className="profile-editor">
          <h3>Edit profile: {selectedProfile.name || 'Unnamed'}</h3>

          <div className="setting-row">
            <label>Name</label>
            <input
              type="text"
              className="profile-name-input"
              value={selectedProfile.name || ''}
              onChange={e => handleProfileName(selectedProfile.id, e.target.value)}
              placeholder="Profile name"
            />
          </div>

          <div className="setting-row">
            <label>Active from</label>
            <input
              type="time"
              className="profile-time-input"
              value={selectedProfile.startTime ?? ''}
              onChange={e => handleProfileStartTime(selectedProfile.id, e.target.value || null)}
            />
          </div>
          <div className="setting-row">
            <label>Active until</label>
            <input
              type="time"
              className="profile-time-input"
              value={selectedProfile.endTime ?? ''}
              onChange={e => handleProfileEndTime(selectedProfile.id, e.target.value || null)}
            />
          </div>
          <p className="profile-time-hint">Leave both empty for “Default” (used when no other schedule matches).</p>

          <div className="profile-days-toggle-wrap">
            <button
              type="button"
              className="profile-days-toggle"
              onClick={() => setDaysSectionOpen(open => !open)}
              aria-expanded={daysSectionOpen}
            >
              <span className="profile-days-toggle-label">Days of week</span>
              <span className="profile-days-toggle-summary">
                {(function () {
                  const days = selectedProfile.daysOfWeek ?? null;
                  const str = formatDays(Array.isArray(days) && days.length ? days : []);
                  return str.trim() || 'Every day';
                })()}
              </span>
              <span className={`profile-days-chevron ${daysSectionOpen ? 'profile-days-chevron-open' : ''}`} aria-hidden>▼</span>
            </button>
            {daysSectionOpen && (
              <div className="profile-days-dropdown">
                <div className="profile-days-row" aria-label="Days of week">
                  {DAYS_OF_WEEK.map(({ value, label }) => {
                    const days = selectedProfile.daysOfWeek ?? null;
                    const isAll = !days || days.length === 0;
                    const checked = isAll || (Array.isArray(days) && days.includes(value));
                    return (
                      <label key={value} className="profile-day-chip">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProfileDay(selectedProfile.id, value)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="profile-time-hint">Leave all checked (or none) for every day.</p>
              </div>
            )}
          </div>

          <div className="setting-row">
            <label>Pet</label>
            <select
              value={(unlockedPetSet.has(selectedProfile.petType ?? 'default') ? selectedProfile.petType : 'default') ?? 'default'}
              onChange={e => handlePetType(selectedProfile.id, e.target.value)}
            >
              {availablePets.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="setting-row setting-row-checkbox">
            <label htmlFor="hide-pet">Hide pet (pie menu only)</label>
            <input
              id="hide-pet"
              type="checkbox"
              checked={!!selectedProfile.hidePet}
              onChange={e => handleHidePet(selectedProfile.id, e.target.checked)}
            />
          </div>



          <h2 className="pie-heading editor-section">Pie Menu Items</h2>
          {(!selectedProfile.pieMenuItems || selectedProfile.pieMenuItems.length === 0) && (
            <p className="pie-empty">No items yet. Add one below.</p>
          )}
          {selectedProfile.pieMenuItems?.map(item => (
            <div key={item.id} className="pie-item-row">
              <span className="pie-item-icon">
                {item.icon
                  ? <img src={item.icon} alt="" className="pie-item-custom-icon" />
                  : defaultIcon(item.type)}
              </span>
              <span className="pie-item-label">{item.label}</span>
              {item.type === 'link' && item.url && (
                <span className="pie-item-url" title={item.url}>{item.url}</span>
              )}
              {item.type === 'application' && item.appPath && (
                <span className="pie-item-url" title={item.appPath}>
                  {item.appPath.split(/[/\\]/).pop()}
                </span>
              )}
              {item.type === 'timer' && item.durationMinutes != null && (
                <span className="pie-item-duration">{item.durationMinutes} min</span>
              )}
              <button
                type="button"
                className="pie-item-remove"
                onClick={() => removePieItem(selectedProfile.id, item.id)}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}

          <div className="pie-item-add">
            <div className="pie-add-row">
              <select value={newType} onChange={e => setNewType(e.target.value)}>
                {PIE_ITEM_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                className="pie-add-btn"
                onClick={() => addPieItem(selectedProfile.id)}
                disabled={
                  (selectedProfile.pieMenuItems?.length ?? 0) >= MAX_PIE_ITEMS ||
                  (newType === 'link' && !newUrl.trim()) ||
                  (newType === 'application' && !newAppPath.trim()) ||
                  (newType === 'timer' && (!newDurationMinutes || newDurationMinutes < 1))
                }
              >
                + Add
              </button>
            </div>
            {newType === 'link' && (
              <>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  className="pie-input"
                />
                <input
                  type="text"
                  placeholder="Icon URL (optional)"
                  value={newIcon}
                  onChange={e => setNewIcon(e.target.value)}
                  className="pie-input"
                />
              </>
            )}
            {(newType === 'pomodoro' || newType === 'timer') && (
              <input
                type="text"
                placeholder={newType === 'pomodoro' ? 'Name (e.g. Deep work)' : 'Name (e.g. Break)'}
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                className="pie-input"
              />
            )}
            {newType === 'timer' && (
              <div className="pie-add-row">
                <label htmlFor="new-timer-duration" className="pie-duration-label">Duration (minutes)</label>
                <input
                  id="new-timer-duration"
                  type="number"
                  min={1}
                  max={999}
                  value={newDurationMinutes}
                  onChange={e => setNewDurationMinutes(parseInt(e.target.value, 10) || 15)}
                  className="pie-input pie-input-number"
                />
              </div>
            )}
            {newType === 'application' && (
              <>
                <div className="pie-add-row">
                  <input
                    type="text"
                    readOnly
                    placeholder="No application selected"
                    value={newAppPath}
                    className="pie-input"
                  />
                  <button type="button" className="pie-browse-btn" onClick={browseForApp}>
                    Browse…
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Icon URL (optional)"
                  value={newIcon}
                  onChange={e => setNewIcon(e.target.value)}
                  className="pie-input"
                />
              </>
            )}
          </div>
          {(selectedProfile.pieMenuItems?.length ?? 0) >= MAX_PIE_ITEMS && (
            <p className="pie-cap-note">Maximum of {MAX_PIE_ITEMS} items reached.</p>
          )}
                    <h2 className="editor-section">Animation Settings</h2>
          {STATES.map(({ key, label }) => {
            const pt = selectedProfile.petType ?? 'default';
            const isKnight = pt === 'knight';
            const isDragon = pt === 'dragon';
            const isPanda = pt === 'panda';
            const options = isDragon ? DRAGON_CLIP_OPTIONS : (isKnight ? KNIGHT_CLIP_OPTIONS : (isPanda ? PANDA_CLIP_OPTIONS : CLIP_OPTIONS));
            const defaultConfig = isDragon ? DEFAULT_DRAGON_CONFIG : (isKnight ? DEFAULT_KNIGHT_CONFIG : (isPanda ? DEFAULT_PANDA_CONFIG : appConstants.defaultConfig));
            return (
              <div key={key} className="setting-row">
                <label>{label}</label>
                <select
                  value={(selectedProfile.animConfig ?? defaultConfig)[key] ?? defaultConfig[key]}
                  onChange={e => handleChange(selectedProfile.id, key, e.target.value)}
                >
                  {options.map(({ value, label: optLabel }) => (
                    <option key={value} value={value}>{optLabel}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
