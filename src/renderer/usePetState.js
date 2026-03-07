import { useReducer, useEffect, useRef } from 'react';

const IDLE = 'idle';
const CURIOUS = 'curious';
const HAPPY = 'happy';
const SLEEPY = 'sleepy';

const SLEEP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const HAPPY_TIMEOUT_MS = 5000; // 5 seconds
const SLEEP_CHECK_INTERVAL_MS = 10000; // check every 10s

function reducer(state, action) {
  switch (action.type) {
    case 'CURSOR_ENTER':
      if (state === IDLE) return CURIOUS;
      return state;
    case 'CURSOR_LEAVE':
      if (state === CURIOUS) return IDLE;
      return state;
    case 'CLICK':
      if (state === CURIOUS || state === IDLE) return HAPPY;
      return state;
    case 'HAPPY_TIMEOUT':
      if (state === HAPPY) return IDLE;
      return state;
    case 'SLEEP':
      if (state === IDLE) return SLEEPY;
      return state;
    case 'WAKE':
      if (state === SLEEPY) return IDLE;
      return state;
    case 'TRIGGER_HAPPY':
      return HAPPY;
    default:
      return state;
  }
}

export function usePetState() {
  const [state, dispatch] = useReducer(reducer, IDLE);

  // Happy → Idle after 5s
  useEffect(() => {
    if (state !== HAPPY) return;
    const t = setTimeout(() => dispatch({ type: 'HAPPY_TIMEOUT' }), HAPPY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [state]);

  // Idle → Sleepy after 10min of system-wide user inactivity (no mouse/keyboard anywhere)
  const SLEEP_IDLE_SECONDS = SLEEP_TIMEOUT_MS / 1000;
  useEffect(() => {
    const checkSystemIdle = async () => {
      try {
        const idleSeconds = await window.electronAPI?.getSystemIdleTime?.();
        if (typeof idleSeconds !== 'number') return;
        if (idleSeconds >= SLEEP_IDLE_SECONDS) {
          dispatch({ type: 'SLEEP' });
        } else {
          dispatch({ type: 'WAKE' });
        }
      } catch {
        // ignore if API unavailable (e.g. in non-Electron context)
      }
    };
    const interval = setInterval(checkSystemIdle, SLEEP_CHECK_INTERVAL_MS);
    checkSystemIdle();
    return () => clearInterval(interval);
  }, []);

  return {
    state,
    onCursorEnter: () => dispatch({ type: 'CURSOR_ENTER' }),
    onCursorLeave: () => dispatch({ type: 'CURSOR_LEAVE' }),
    onClick: () => dispatch({ type: 'CLICK' }),
    /** Trigger the excited/happy animation (e.g. when a timer completes). */
    triggerExcited: () => dispatch({ type: 'TRIGGER_HAPPY' }),
  };
}
