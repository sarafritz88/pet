import React, { useState, useEffect, useRef, useCallback } from 'react';
import Pet from './Pet';
import { usePetState } from './usePetState';
import {
  computeWedgeClipPath,
  computeWedgeCentroid,
  computeWedgePathD,
  computeHoverTranslate,
} from './pieGeometry';

/** Fallback only until getAppConstants() resolves; main process is the source of truth. */
const DEFAULT_CONFIG_FALLBACK = {
  idle:     'idle',
  curious:  'win',
  happy:    'jumpSlam',
  sleepy:   'hurt',
  dragging: 'fall',
};

const DEFAULT_ICONS = {
  volume:      '\u{1F50A}',
  pomodoro:    '\u{23F1}\uFE0F',
  timer:       '\u{23F2}\uFE0F',
  link:        '\u{1F517}',
  application: '\u{1F4BB}',
};

const POMODORO_DURATION_SEC = 25 * 60;   // Focus: 25 min
const POMODORO_SHORT_BREAK_SEC = 5 * 60;  // Short break: 5 min
const POMODORO_LONG_BREAK_SEC = 30 * 60;   // Long break: 30 min
const POMODORO_FOCUS_ROUNDS = 4;           // Repeat focus 4 times before long break

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Play a short chime when a timer completes (Web Audio API, no external file). Reuses a single context to avoid leaks and caps. */
let timerSoundContext = null;
function playTimerCompleteSound() {
  try {
    if (!timerSoundContext) timerSoundContext = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = timerSoundContext;
    if (ctx.state === 'suspended') ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    gain.connect(ctx.destination);
    const play = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration);
    };
    const t0 = ctx.currentTime;
    play(523.25, t0, 0.15);
    play(659.25, t0 + 0.15, 0.2);
  } catch {
    // ignore if AudioContext unavailable
  }
}

function resolveIcon(item) {
  if (item.icon) {
    return <img src={item.icon} alt="" />;
  }
  return DEFAULT_ICONS[item.type] ?? '\u2699\uFE0F';
}

/** Display name for pie section hover (e.g. app name from path) */
function getPieItemTitle(item) {
  if (item.type === 'application' && item.appPath) {
    const base = item.appPath.split(/[/\\]/).filter(Boolean).pop() || '';
    return base.replace(/\.(app|exe|lnk)$/i, '') || item.label;
  }
  if (item.type === 'link' && item.url) return item.url;
  return item.label || '';
}

export default function App() {
  const { state, triggerExcited, onClick: onPetClick } = usePetState();
  const [defaultConfig, setDefaultConfig] = useState(DEFAULT_CONFIG_FALLBACK);
  const [animConfig, setAnimConfig] = useState(DEFAULT_CONFIG_FALLBACK);
  const [pieItems,   setPieItems]   = useState([]);
  const [hoveredWedgeIndex, setHoveredWedgeIndex] = useState(null);
  const [petType, setPetType] = useState(null); // null until loaded so Pet doesn't mount with wrong sprite
  const [hidePet, setHidePet] = useState(false);
  const [achievementQueue, setAchievementQueue] = useState([]);
  // Per-item timers: countdown and completion live in each pie slice
  const [timerByItemId, setTimerByItemId] = useState({});
  const timerIntervalRef = useRef(null);
  const pomodoroCountRequestedRef = useRef(new Set());
  const [dismissedExpiredTimerIds, setDismissedExpiredTimerIds] = useState([]);

  const defaultConfigRef = useRef(defaultConfig);
  defaultConfigRef.current = defaultConfig;

  // Load app constants and config from main (single source of truth)
  useEffect(() => {
    window.electronAPI?.getAppConstants?.().then((c) => {
      if (c?.defaultConfig) setDefaultConfig(c.defaultConfig);
    });
    const merge = (cfg) => setAnimConfig(() => ({ ...(defaultConfigRef.current || DEFAULT_CONFIG_FALLBACK), ...cfg }));
    window.electronAPI?.getConfig?.().then(cfg => { if (cfg) merge(cfg); });
    const cleanup = window.electronAPI?.onConfigChanged?.(merge);
    return () => cleanup?.();
  }, []);

  // Pie menu items: main pushes list on load; updates via pie-items-changed
  useEffect(() => {
    const cleanup = window.electronAPI?.onPieItemsChanged(items => {
      setPieItems(items ?? []);
    });
    // Fallback initial load only when still empty (avoids race where stale getPieItems overwrites a fresh update)
    window.electronAPI?.getPieItems().then(items => {
      setPieItems(prev => (prev.length === 0 && Array.isArray(items) && items.length > 0 ? items : prev));
    });
    return () => cleanup?.();
  }, []);

  const timerRestoredRef = useRef(false);
  // Restore persisted timer state on load (adjust remainingSec by elapsed time since save)
  useEffect(() => {
    window.electronAPI?.getTimerState?.().then((payload) => {
      timerRestoredRef.current = true;
      if (!payload?.savedAt || !payload?.timers || typeof payload.timers !== 'object') return;
      const elapsedSec = (Date.now() - payload.savedAt) / 1000;
      const adjusted = {};
      for (const [id, t] of Object.entries(payload.timers)) {
        if (!t || typeof t.remainingSec !== 'number') continue;
        // Paused timers don't consume time while the app is closed
        const newRemaining = t.paused
          ? t.remainingSec
          : Math.max(0, Math.floor(t.remainingSec - elapsedSec));
        adjusted[id] = { ...t, remainingSec: newRemaining };
      }
      if (Object.keys(adjusted).length > 0) setTimerByItemId(adjusted);
    });
  }, []);

  // Persist timer state so it survives reload/crash (skip until restore has run to avoid overwriting with {})
  // Throttled to at most once every 5s — timerByItemId updates every second while timers run,
  // and electron-store writes are synchronous; worst-case data loss on hard crash is 5s.
  const lastTimerPersistRef = useRef(0);
  useEffect(() => {
    if (!timerRestoredRef.current) return;
    const now = Date.now();
    if (now - lastTimerPersistRef.current >= 5000) {
      lastTimerPersistRef.current = now;
      window.electronAPI?.setTimerState?.({ savedAt: now, timers: timerByItemId });
    }
  }, [timerByItemId]);

  // Drop timer state for items no longer in the pie; also clear their ids from dismissed list
  useEffect(() => {
    const ids = new Set((pieItems ?? []).map((it) => it.id));
    setTimerByItemId((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
          pomodoroCountRequestedRef.current.delete(id);
        }
      }
      return changed ? next : prev;
    });
    setDismissedExpiredTimerIds((prev) => (prev.some((id) => !ids.has(id)) ? prev.filter((id) => ids.has(id)) : prev));
  }, [pieItems]);

  // Achievement queue: show one bubble at a time, 4s each, so multiple achievements don't overwrite
  useEffect(() => {
    const cleanup = window.electronAPI?.onAchievement?.(({ achievements = [], totalCoins = 0 }) => {
      setAchievementQueue(prev => [...prev, { achievements, totalCoins }]);
    });
    return () => cleanup?.();
  }, []);
  useEffect(() => {
    if (achievementQueue.length === 0) return;
    const t = setTimeout(() => setAchievementQueue(prev => prev.slice(1)), 4000);
    return () => clearTimeout(t);
  }, [achievementQueue]);

  // Pet state: pull on load and every 60s (schedule changes); also accept push when user saves in Settings
  useEffect(() => {
    const apply = (s) => {
      if (s) {
        setPetType(s.petType ?? 'default');
        setHidePet(!!s.hidePet);
      }
    };
    window.electronAPI?.getPetState?.().then(apply);
    const intervalId = window.electronAPI
      ? setInterval(() => window.electronAPI.getPetState().then(apply), 60 * 1000)
      : null;
    const cleanup = window.electronAPI?.onPetStateChanged?.(({ petType: t, hidePet: h } = {}) => {
      setPetType(t ?? 'default');
      setHidePet(!!h);
    });
    return () => {
      if (intervalId != null) clearInterval(intervalId);
      cleanup?.();
    };
  }, []);

  // Single interval: tick all active timers every second (restart only when running set changes; exclude paused so interval stops when all are paused)
  const runningTimerIds = Object.entries(timerByItemId)
    .filter(([, t]) => t.remainingSec > 0 && !t.paused)
    .map(([id]) => id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!runningTimerIds) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      return;
    }
    if (!timerIntervalRef.current) {
      timerIntervalRef.current = setInterval(() => {
        setTimerByItemId((prev) => {
          let next = { ...prev };
          let changed = false;
          let shouldTriggerExcited = false;
          let shouldPlaySound = false;
          for (const id of Object.keys(next)) {
            const t = next[id];
            if (t.remainingSec <= 0 || t.paused) continue;
            if (t.remainingSec === 1) {
              shouldPlaySound = true;
              if (t.type === 'pomodoro' && (t.phase === 'focus' || t.phase === 'shortBreak' || t.phase === 'longBreak')) {
                if (t.phase === 'focus') shouldTriggerExcited = true;
                next[id] = {
                  ...t,
                  remainingSec: 0,
                  canStartNext: true,
                  completionMessage:
                    t.phase === 'focus'
                      ? 'Complete!'
                      : t.phase === 'shortBreak'
                        ? 'Short break over'
                        : 'Long break over',
                };
              } else {
                if (t.type === 'pomodoro') shouldTriggerExcited = true;
                next[id] = {
                  ...t,
                  remainingSec: 0,
                  completionMessage: t.type === 'pomodoro' ? 'Complete!' : "Time's up!",
                };
              }
              changed = true;
            } else {
              next[id] = { ...t, remainingSec: t.remainingSec - 1 };
              changed = true;
            }
          }
          if (changed && shouldPlaySound) {
            playTimerCompleteSound();
          }
          if (changed && shouldTriggerExcited) {
            setTimeout(() => triggerExcited(), 0);
          }
          return changed ? next : prev;
        });
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    };
  }, [runningTimerIds, triggerExcited]);

  // When a pomodoro focus phase hits 0, request count and set "Pomodoro #N" message
  useEffect(() => {
    for (const [id, t] of Object.entries(timerByItemId)) {
      if (
        t.remainingSec === 0 &&
        t.type === 'pomodoro' &&
        t.phase === 'focus' &&
        t.completionMessage === 'Complete!' &&
        !pomodoroCountRequestedRef.current.has(id)
      ) {
        pomodoroCountRequestedRef.current.add(id);
        window.electronAPI?.incrementPomodoroCount?.().then((count) => {
          setTimerByItemId((prev) =>
            prev[id] ? { ...prev, [id]: { ...prev[id], completionMessage: `Focus complete! Pomodoro #${count}` } } : prev
          );
        });
      }
    }
  }, [timerByItemId]);

  const startTimer = useCallback((item) => {
    const id = item.id;
    setDismissedExpiredTimerIds(prev => prev.filter(x => x !== id));
    if (item.type === 'pomodoro') {
      setTimerByItemId((prev) => ({
        ...prev,
        [id]: {
          remainingSec: POMODORO_DURATION_SEC,
          type: 'pomodoro',
          label: item.label || 'Pomodoro',
          phase: 'focus',
          focusCount: 1,
          canStartNext: false,
          completionMessage: null,
          paused: false,
        },
      }));
    } else {
      const durationSec = Math.max(1, Math.min(999 * 60, (item.durationMinutes ?? 25) * 60));
      setTimerByItemId((prev) => ({
        ...prev,
        [id]: {
          remainingSec: durationSec,
          type: 'timer',
          label: item.label || 'Timer',
          canStartNext: false,
          completionMessage: null,
          paused: false,
        },
      }));
    }
  }, []);

  const stopTimer = useCallback(
    (itemId, e) => {
      e?.stopPropagation?.();
      setDismissedExpiredTimerIds(prev => (prev.includes(itemId) ? prev : [...prev, itemId]));
      pomodoroCountRequestedRef.current.delete(itemId);
      setTimerByItemId((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    },
    []
  );

  const startNextPhase = useCallback((itemId, e) => {
    e?.stopPropagation?.();
    setDismissedExpiredTimerIds(prev => (prev.includes(itemId) ? prev : [...prev, itemId]));
    pomodoroCountRequestedRef.current.delete(itemId);
    setTimerByItemId((prev) => {
      const t = prev[itemId];
      if (!t || t.type !== 'pomodoro' || !t.canStartNext) return prev;
      const phase = t.phase;
      const focusCount = t.focusCount ?? 0;
      if (phase === 'focus') {
        if (focusCount >= POMODORO_FOCUS_ROUNDS) {
          return { ...prev, [itemId]: { ...prev[itemId], remainingSec: POMODORO_LONG_BREAK_SEC, phase: 'longBreak', focusCount: 0, label: 'Long break', canStartNext: false, completionMessage: null, paused: false } };
        }
        return { ...prev, [itemId]: { ...prev[itemId], remainingSec: POMODORO_SHORT_BREAK_SEC, phase: 'shortBreak', label: 'Short break', canStartNext: false, completionMessage: null, paused: false } };
      }
      if (phase === 'shortBreak') {
        const n = focusCount + 1;
        return { ...prev, [itemId]: { ...prev[itemId], remainingSec: POMODORO_DURATION_SEC, phase: 'focus', focusCount: n, label: `Focus ${n}/${POMODORO_FOCUS_ROUNDS}`, canStartNext: false, completionMessage: null, paused: false } };
      }
      return { ...prev, [itemId]: { ...prev[itemId], remainingSec: POMODORO_DURATION_SEC, phase: 'focus', focusCount: 1, label: 'Focus 1/4', canStartNext: false, completionMessage: null, paused: false } };
    });
  }, []);

  // Manual drag
  const dragging = useRef(false);
  const didDrag  = useRef(false);
  const last     = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    didDrag.current  = false;
    last.current = { x: e.screenX, y: e.screenY };
    let dragStarted = false;

    function onMove(e) {
      if (!dragging.current) return;
      const dx = e.screenX - last.current.x;
      const dy = e.screenY - last.current.y;
      last.current = { x: e.screenX, y: e.screenY };
      if (!dragStarted) {
        dragStarted = true;
        didDrag.current = true;
        window.dispatchEvent(new CustomEvent('pet-drag-start'));
      }
      window.electronAPI?.moveWindow(dx, dy);
    }

    function onUp() {
      dragging.current = false;
      if (dragStarted) window.dispatchEvent(new CustomEvent('pet-drag-end'));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, []);

  // Left-click (without drag) triggers pet happy animation, then opens settings
  const handleClick = useCallback(() => {
    if (didDrag.current) return;
    onPetClick?.();
    setTimeout(() => window.electronAPI?.openSettings(), 350);
  }, [onPetClick]);

  // Right-click opens the settings window (and suppress default context menu)
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    window.electronAPI?.openSettings();
  }, []);

  const showPieForExpired = pieItems.some(
    (item) => (timerByItemId[item.id]?.remainingSec === 0) && !dismissedExpiredTimerIds.includes(item.id)
  );

  const toggleTimerPause = useCallback((itemId) => {
    setTimerByItemId((prev) => {
      const t = prev[itemId];
      if (!t || t.remainingSec <= 0) return prev;
      return { ...prev, [itemId]: { ...t, paused: !t.paused } };
    });
  }, []);

  // Pie menu item click
  const handlePieClick = useCallback((e, item) => {
    e.stopPropagation(); // don't bubble to pet-container click (settings)
    if (item.type === 'link' && item.url) {
      window.electronAPI?.openExternal(item.url);
    } else if (item.type === 'volume') {
      window.electronAPI?.openSystemSounds();
    } else if (item.type === 'application' && item.appPath) {
      window.electronAPI?.launchApp(item.appPath);
    } else if (item.type === 'pomodoro' || item.type === 'timer') {
      const timer = timerByItemId[item.id];
      if (timer && timer.remainingSec > 0) {
        toggleTimerPause(item.id);
      } else {
        setDismissedExpiredTimerIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
        if (timer?.type === 'pomodoro' && timer?.canStartNext) {
          startNextPhase(item.id, e);
        } else {
          startTimer(item);
        }
      }
    }
  }, [startTimer, timerByItemId, toggleTimerPause, startNextPhase]);

  const onHoverEnter = useCallback(() => {
    window.dispatchEvent(new CustomEvent('pet-hover-start'));
  }, []);
  const onHoverLeave = useCallback(() => {
    window.dispatchEvent(new CustomEvent('pet-hover-end'));
  }, []);

  return (
    <div
      className={`pet-container${showPieForExpired ? ' has-expired-timer' : ''}`}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      {pieItems.length > 0 && (
        <div className="pie-menu" data-pet={petType === 'default' ? 'squid' : petType}>
          {/* Visual layer: backgrounds + icons (hover look driven by SVG layer) */}
          {pieItems.map((item, i) => {
            const n    = pieItems.length;
            const clip = computeWedgeClipPath(i, n);
            const { tx, ty } = computeHoverTranslate(i, n);
            const { x, y }   = computeWedgeCentroid(i, n);
            const timer     = timerByItemId[item.id];

            const timerFinished = timer && timer.remainingSec === 0;
            const showFinished = timerFinished && showPieForExpired;
            return (
              <div
                key={item.id}
                className={`pie-section${hoveredWedgeIndex === i ? ' pie-section-hovered' : ''}${timer ? ' pie-section-has-timer' : ''}${showFinished ? ' pie-section-timer-finished' : ''}`}
                style={{
                  clipPath: clip,
                  '--hover-tx': `${tx.toFixed(1)}px`,
                  '--hover-ty': `${ty.toFixed(1)}px`,
                  pointerEvents: 'none',
                }}
              >
                <div
                  className={`pie-section-icon${timer && timer.remainingSec > 0 ? ' pie-section-icon-countdown' : ''}${timer?.paused ? ' pie-section-icon-paused' : ''}`}
                  style={{ left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%` }}
                >
                  {timer && timer.remainingSec > 0
                    ? (timer.paused ? `⏸ ${formatTime(timer.remainingSec)}` : formatTime(timer.remainingSec))
                    : resolveIcon(item)}
                </div>
              </div>
            );
          })}
          {/* Hit layer: one SVG path per wedge so each gets its own hover tooltip and click */}
          <svg
            className="pie-menu-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onClick={(e) => {
              const path = e.target.closest('.pie-wedge');
              if (!path) return;
              e.stopPropagation();
              const index = parseInt(path.getAttribute('data-index'), 10);
              if (!Number.isNaN(index) && pieItems[index]) {
                handlePieClick(e, pieItems[index]);
              }
            }}
          >
            {pieItems.map((item, i) => (
              <path
                key={item.id}
                className="pie-wedge"
                data-index={i}
                d={computeWedgePathD(i, pieItems.length)}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => {
                  setHoveredWedgeIndex(i);
                  const id = pieItems[i]?.id;
                  if (id != null) {
                    const t = timerByItemId[id];
                    if (t && t.remainingSec === 0) setDismissedExpiredTimerIds(prev => (prev.includes(id) ? prev : [...prev, id]));
                  }
                }}
                onMouseLeave={() => setHoveredWedgeIndex(null)}
              >
                <title>{getPieItemTitle(item)}</title>
              </path>
            ))}
          </svg>
          {/* Timer overlay: when phase completes, message + Play to start next / Stop */}
          <div className="pie-timer-overlay">
            {pieItems.map((item, i) => {
              const timer = timerByItemId[item.id];
              if (!timer || timer.remainingSec > 0) return null;
              const clip = computeWedgeClipPath(i, pieItems.length);
              const isPomodoro = timer.type === 'pomodoro';
              const playLabel = isPomodoro && timer.canStartNext
                ? (timer.phase === 'focus' ? 'Play break' : 'Play next')
                : null;
              return (
                <div
                  key={item.id}
                  className="pie-section-timer-wrap no-drag"
                  style={{ clipPath: clip }}
                  onMouseEnter={() => setDismissedExpiredTimerIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.target.closest('.pie-section-timer-btn')) return;
                    setDismissedExpiredTimerIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
                    if (isPomodoro && timer.canStartNext) {
                      startNextPhase(item.id, e);
                    } else {
                      startTimer(item);
                    }
                  }}
                >
                  <span className="pie-section-timer-message">{timer.completionMessage ?? "Time's up!"}</span>
                  <div className="pie-section-timer-actions">
                    {timer.canStartNext && (
                      <button
                        type="button"
                        className="pie-section-timer-btn pie-section-timer-btn-start"
                        onClick={(e) => startNextPhase(item.id, e)}
                        title={playLabel ?? 'Start next'}
                        aria-label={playLabel ?? 'Start next'}
                      >
                        ▶ {playLabel ?? 'Play'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="pie-section-timer-btn pie-section-timer-btn-stop"
                      onClick={(e) => stopTimer(item.id, e)}
                      title="Stop"
                      aria-label="Stop"
                    >
                      ⏹
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {hoveredWedgeIndex !== null && pieItems[hoveredWedgeIndex] && (
            <div className="pie-tooltip">
              {getPieItemTitle(pieItems[hoveredWedgeIndex])}
            </div>
          )}
        </div>
      )}
      {!hidePet && petType != null && <Pet state={state} animConfig={animConfig} spriteSet={petType} />}
      {achievementQueue[0] && (
        <div className="achievement-bubble">
          {achievementQueue[0].achievements.map((a, i) => (
            <div key={i} className="achievement-bubble-line">
              {a.message} +{a.coins} 🪙
            </div>
          ))}
          <div className="achievement-bubble-footer">
            Good job! Total: +{achievementQueue[0].totalCoins} 🪙
          </div>
        </div>
      )}
    </div>
  );
}
