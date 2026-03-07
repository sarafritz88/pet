import React, { useRef, useEffect } from 'react';
import characterSheet from '../../assets/CharacterSheet.png';
import knightIdle from '../../assets/KnightSprites/with_outline/IDLE.png';
import knightWalk from '../../assets/KnightSprites/with_outline/WALK.png';
import knightRun from '../../assets/KnightSprites/with_outline/RUN.png';
import knightJump from '../../assets/KnightSprites/with_outline/JUMP.png';
import knightHurt from '../../assets/KnightSprites/with_outline/HURT.png';
import knightDeath from '../../assets/KnightSprites/with_outline/DEATH.png';
import knightAttack1 from '../../assets/KnightSprites/with_outline/ATTACK 1.png';
import knightAttack2 from '../../assets/KnightSprites/with_outline/ATTACK 2.png';
import knightAttack3 from '../../assets/KnightSprites/with_outline/ATTACK 3.png';
import knightDefend from '../../assets/KnightSprites/with_outline/DEFEND.png';
import dragonIdle from '../../assets/dragonSprites/with_outline/IDLE.png';
import dragonRun from '../../assets/dragonSprites/with_outline/RUN.png';
import dragonAttack1 from '../../assets/dragonSprites/with_outline/ATTACK 1.png';
import dragonAttack2 from '../../assets/dragonSprites/with_outline/ATTACK 2.png';
import dragonHurt from '../../assets/dragonSprites/with_outline/HURT.png';
import dragonDeath from '../../assets/dragonSprites/with_outline/DEATH.png';
import pandaIdle from '../../assets/panda/PandaIdle.png';
import pandaHappy from '../../assets/panda/Happy.png';
import pandaWave from '../../assets/panda/PandaWave.png';
import pandaSleep from '../../assets/panda/PandaSleep.png';
import pandaCry from '../../assets/panda/PandaCry.png';
import pandaResting from '../../assets/panda/PandaResting.png';
import pandaEating from '../../assets/panda/PandaEating.png';
import pandaIdleBlinking from '../../assets/panda/PandaIdleBlinking.png';
import pandaSitting from '../../assets/panda/PandaSitting.png';
import pandaSoFull from '../../assets/panda/PandaSoFull.png';
import pandaTalkingSitting from '../../assets/panda/PandaTalkingSitting.png';
import pandaThinking from '../../assets/panda/PandaThinking.png';
import pandaYoga1 from '../../assets/panda/PandaYoga1.png';
import pandaYoga2 from '../../assets/panda/PandaYoga2.png';
import pandaYoga3 from '../../assets/panda/PandaYoga3.png';

const NATIVE_FRAME = 820;
const DISPLAY_SIZE = 160;
/** Squid: draw slightly smaller and centered so he doesn’t look like he’s peeking out the top */
const SQUID_INSET = 10;
const SQUID_DRAW_SIZE = DISPLAY_SIZE - SQUID_INSET * 2;
const SQUID_DRAW_X = SQUID_INSET;
const SQUID_DRAW_Y = SQUID_INSET;
/** Knight: draw slightly larger than canvas so he fills the frame (cropped at edges) */
const KNIGHT_DRAW_SIZE = 172;
const KNIGHT_DRAW_X = (DISPLAY_SIZE - KNIGHT_DRAW_SIZE) / 2;
const KNIGHT_DRAW_Y = (DISPLAY_SIZE - KNIGHT_DRAW_SIZE) / 2;
/** Dragon: 48x64 px native; draw wider (168x192) with nearest-neighbor for sharp pixel art; slightly cropped in 160px canvas */
const DRAGON_DRAW_WIDTH = 192;
const DRAGON_DRAW_HEIGHT = 144;
const DRAGON_DRAW_X = (DISPLAY_SIZE - DRAGON_DRAW_WIDTH) / 2;
const DRAGON_DRAW_Y = (DISPLAY_SIZE - DRAGON_DRAW_HEIGHT) / 2;
/** Panda: 64x64 px per frame; draw at 2.5x (160x160) to fill canvas */
const PANDA_DRAW_SIZE = 160;
const PANDA_DRAW_X = 0;
const PANDA_DRAW_Y = 0;

// Sprite sheet row layout (0-indexed):
//  0 → Idle (frames 0-3) + Walking (frames 4-6)  [7 frames total]
//  1 → Leg Lift (0-4) + Fall (5-6)
//  2 → Jump (0-7)
//  3 → JumpSlam (0-6)
//  4 → InkSquirt (0-6)
//  5 → Attack Down (0-3) + Attack Up (4-7)
//  6 → Hurt (0-1) + Die (2-4)
//  7 → Win (0-3)
const CLIPS = {
  idle:      { row: 0, startFrame: 0, frames: 4, fps: 8  },
  walk:      { row: 0, startFrame: 4, frames: 3, fps: 10 },
  legLift:   { row: 1, startFrame: 0, frames: 5, fps: 10 },
  fall:      { row: 1, startFrame: 5, frames: 2, fps: 10 },
  jump:      { row: 2, startFrame: 0, frames: 8, fps: 10 },
  jumpSlam:  { row: 3, startFrame: 0, frames: 7, fps: 12 },
  inkSquirt: { row: 4, startFrame: 0, frames: 7, fps: 12 },
  hurt:      { row: 6, startFrame: 0, frames: 2, fps: 8  },
  die:       { row: 6, startFrame: 2, frames: 3, fps: 6  },
  win:       { row: 7, startFrame: 0, frames: 4, fps: 12 },
};

// Knight: each file is a horizontal sprite sheet (one row = one animation, multiple frames left-to-right).
// Frame counts derived from sheet widths (96px per frame to match WALK/RUN): 672→7, 768→8, 480→5, 384→4, 1152→12, 576→6.
const KNIGHT_NAMES = ['IDLE', 'WALK', 'RUN', 'JUMP', 'HURT', 'DEATH', 'ATTACK 1', 'ATTACK 2', 'ATTACK 3', 'DEFEND'];
const KNIGHT_FRAME_COUNTS = {
  'IDLE': 7, 'WALK': 8, 'RUN': 8, 'JUMP': 5, 'HURT': 4, 'DEATH': 12,
  'ATTACK 1': 6, 'ATTACK 2': 5, 'ATTACK 3': 6, 'DEFEND': 6,
};
const KNIGHT_CLIPS = Object.fromEntries(
  KNIGHT_NAMES.map(name => [name, {
    imageKey: name,
    frames: KNIGHT_FRAME_COUNTS[name] ?? 4,
    fps: name === 'IDLE' ? 8 : 10,
  }])
);

const KNIGHT_URLS = {
  'IDLE': knightIdle,
  'WALK': knightWalk,
  'RUN': knightRun,
  'JUMP': knightJump,
  'HURT': knightHurt,
  'DEATH': knightDeath,
  'ATTACK 1': knightAttack1,
  'ATTACK 2': knightAttack2,
  'ATTACK 3': knightAttack3,
  'DEFEND': knightDefend,
};

// Dragon: 48x64 px per frame, horizontal sheets. Idle 9, Run 8, Attack 1 13, Attack 2 17, Hurt 4, Death 7.
const DRAGON_NAMES = ['IDLE', 'RUN', 'ATTACK 1', 'ATTACK 2', 'HURT', 'DEATH'];
const DRAGON_FRAME_COUNTS = { 'IDLE': 9, 'RUN': 8, 'ATTACK 1': 13, 'ATTACK 2': 17, 'HURT': 4, 'DEATH': 7 };
const DRAGON_CLIPS = Object.fromEntries(
  DRAGON_NAMES.map(name => [name, {
    imageKey: name,
    frames: DRAGON_FRAME_COUNTS[name] ?? 4,
    fps: name === 'IDLE' ? 8 : 10,
  }])
);
const DRAGON_URLS = {
  'IDLE': dragonIdle,
  'RUN': dragonRun,
  'ATTACK 1': dragonAttack1,
  'ATTACK 2': dragonAttack2,
  'HURT': dragonHurt,
  'DEATH': dragonDeath,
};

// Panda: 64x64 px per frame, horizontal sheets. Frame counts from sheet width/64.
const PANDA_NAMES = [
  'PandaIdle', 'Happy', 'PandaWave', 'PandaSleep', 'PandaCry', 'PandaResting',
  'PandaEating', 'PandaIdleBlinking', 'PandaSitting', 'PandaSoFull', 'PandaTalkingSitting',
  'PandaThinking', 'PandaYoga1', 'PandaYoga2', 'PandaYoga3',
];
/** Yoga is a single option that plays PandaYoga1 → PandaYoga2 → PandaYoga3 in a loop. */
export const PANDA_YOGA_SEQUENCE = ['PandaYoga1', 'PandaYoga2', 'PandaYoga3'];
const PANDA_FRAME_COUNTS = {
  PandaIdle: 4, Happy: 4, PandaWave: 12, PandaSleep: 4, PandaCry: 4, PandaResting: 7,
  PandaEating: 12, PandaIdleBlinking: 12, PandaSitting: 4, PandaSoFull: 4, PandaTalkingSitting: 6,
  PandaThinking: 12, PandaYoga1: 3, PandaYoga2: 3, PandaYoga3: 3,
};
const PANDA_CLIPS = Object.fromEntries(
  PANDA_NAMES.map(name => [name, {
    imageKey: name,
    frames: PANDA_FRAME_COUNTS[name] ?? 4,
    fps: name === 'PandaIdle' ? 8 : 10,
  }])
);
const PANDA_URLS = {
  PandaIdle: pandaIdle,
  Happy: pandaHappy,
  PandaWave: pandaWave,
  PandaSleep: pandaSleep,
  PandaCry: pandaCry,
  PandaResting: pandaResting,
  PandaEating: pandaEating,
  PandaIdleBlinking: pandaIdleBlinking,
  PandaSitting: pandaSitting,
  PandaSoFull: pandaSoFull,
  PandaTalkingSitting: pandaTalkingSitting,
  PandaThinking: pandaThinking,
  PandaYoga1: pandaYoga1,
  PandaYoga2: pandaYoga2,
  PandaYoga3: pandaYoga3,
};

/** Load multiple images as ImageBitmaps. namesArray = list of keys, urlsMap = key -> url. Returns Promise<Record<key, ImageBitmap> | null> (null if no URLs). */
function loadBitmaps(namesArray, urlsMap) {
  const urls = namesArray.map(name => urlsMap[name]).filter(Boolean);
  if (urls.length === 0) return Promise.resolve(null);
  return Promise.all(
    urls.map(url =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => createImageBitmap(img).then(resolve).catch(reject);
        img.onerror = reject;
        img.src = url;
      })
    )
  ).then(bitmaps => {
    const namesWithUrls = namesArray.filter(n => urlsMap[n]);
    return Object.fromEntries(namesWithUrls.map((name, i) => [name, bitmaps[i]]));
  });
}

/** All clip options for settings dropdowns — one source of truth so every animation is always available. */
export const CLIP_OPTIONS = Object.keys(CLIPS).map(key => ({
  value: key,
  label: key === 'jumpSlam' ? 'Jump Slam' : key === 'inkSquirt' ? 'Ink Squirt' : key.charAt(0).toUpperCase() + key.slice(1),
}));
export const KNIGHT_CLIP_OPTIONS = KNIGHT_NAMES.map(name => ({
  value: name,
  label: name === 'ATTACK 1' ? 'Attack 1' : name === 'ATTACK 2' ? 'Attack 2' : name === 'ATTACK 3' ? 'Attack 3' : name.charAt(0) + name.slice(1).toLowerCase(),
}));
export const DRAGON_CLIP_OPTIONS = DRAGON_NAMES.map(name => ({
  value: name,
  label: name === 'ATTACK 1' ? 'Attack 1' : name === 'ATTACK 2' ? 'Attack 2' : name.charAt(0) + name.slice(1).toLowerCase(),
}));
const PANDA_LABELS = {
  PandaIdle: 'Idle', Happy: 'Happy', PandaWave: 'Wave', PandaSleep: 'Sleep', PandaCry: 'Cry', PandaResting: 'Resting',
  PandaEating: 'Eating', PandaIdleBlinking: 'Idle Blinking', PandaSitting: 'Sitting', PandaSoFull: 'So Full',
  PandaTalkingSitting: 'Talking Sitting', PandaThinking: 'Thinking', PandaYoga1: 'Yoga 1', PandaYoga2: 'Yoga 2', PandaYoga3: 'Yoga 3',
};
// One "Yoga" option that plays Yoga1 → Yoga2 → Yoga3 in a loop; exclude the three individual yoga clips from the dropdown.
export const PANDA_CLIP_OPTIONS = [
  ...PANDA_NAMES.filter(n => !PANDA_YOGA_SEQUENCE.includes(n)).map(name => ({ value: name, label: PANDA_LABELS[name] ?? name })),
  { value: 'Yoga', label: 'Yoga' },
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function Pet({ state = 'idle', animConfig, spriteSet = 'default', previewClip = null }) {
  const canvasRef      = useRef(null);
  const stateRef       = useRef(state);
  stateRef.current     = state;
  const animConfigRef  = useRef(animConfig);
  animConfigRef.current = animConfig;
  const previewClipRef = useRef(previewClip);
  previewClipRef.current = previewClip;

  const hoverRef = useRef(false);

  const isKnight = spriteSet === 'knight';
  const isDragon = spriteSet === 'dragon';
  const isPanda = spriteSet === 'panda';
  const clips = isPanda ? PANDA_CLIPS : (isDragon ? DRAGON_CLIPS : (isKnight ? KNIGHT_CLIPS : CLIPS));
  const defaultClipNames = isPanda
    ? { idle: 'PandaIdle', curious: 'PandaWave', happy: 'Happy', sleepy: 'PandaSleep', dragging: 'PandaResting' }
    : isDragon
      ? { idle: 'IDLE', curious: 'IDLE', happy: 'ATTACK 1', sleepy: 'HURT', dragging: 'RUN' }
      : isKnight
        ? { idle: 'IDLE', curious: 'IDLE', happy: 'ATTACK 1', sleepy: 'HURT', dragging: 'DEFEND' }
        : { idle: 'idle', curious: 'win', happy: 'jumpSlam', sleepy: 'hurt', dragging: 'fall' };
  const idleKey = isPanda ? 'PandaIdle' : (isKnight || isDragon) ? 'IDLE' : 'idle';
  const walkKey = isPanda ? 'PandaIdle' : (isKnight ? 'WALK' : (isDragon ? 'RUN' : 'walk'));
  const hurtKey = isPanda ? 'PandaCry' : (isKnight || isDragon) ? 'HURT' : 'hurt';
  const dieKey = isPanda ? 'PandaSleep' : (isKnight || isDragon) ? 'DEATH' : 'die';
  const startupClip = isPanda ? PANDA_CLIPS.PandaIdle : (isDragon ? DRAGON_CLIPS.IDLE : (isKnight ? KNIGHT_CLIPS.IDLE : CLIPS.inkSquirt));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // ── Clip player state ───────────────────────────────────────────────────
    let clip        = startupClip;
    let localFrame  = 0;
    let loopsDone   = 0;
    let targetLoops = 1;
    let onClipEnd   = null;
    let isHolding   = false; // hold on last frame (used after die in sleepy)
    let lastTick    = 0;

    // Idle walking rhythm
    let idleLoopsDone       = 0;
    let idleLoopsBeforeWalk = rand(3, 7);
    let isWalking           = false;
    let walkLoopsDone       = 0;
    let walkTarget          = 0;

    // Flow control
    let prevState    = null;
    let lastConfig   = animConfigRef.current; // track config reference for live updates
    let startupDone  = false;
    let isClosing    = false;
    let isDragging   = false;
    let bitmap       = null;
    let knightBitmaps = null;
    let dragonBitmaps = null;
    let pandaBitmaps = null;
    let rafId;
    let cancelled    = false; // set true on cleanup so stale async callbacks don't start a new RAF
    let lastPreviewClip = null; // when set, we're showing a specific clip (e.g. shop hover)
    let yogaSubIndex   = 0;
    let yogaCancelled  = false;

    const onDragStart  = () => { isDragging = true; };
    const onDragEnd    = () => { isDragging = false; };
    const onHoverStart = () => { hoverRef.current = true; };
    const onHoverEnd   = () => { hoverRef.current = false; };
    window.addEventListener('pet-drag-start',  onDragStart);
    window.addEventListener('pet-drag-end',    onDragEnd);
    window.addEventListener('pet-hover-start', onHoverStart);
    window.addEventListener('pet-hover-end',   onHoverEnd);

    // ── playClip: switch to a clip immediately ──────────────────────────────
    function playClip(c, loops, onEnd = null) {
      yogaCancelled = true; // stop any running Yoga sequence
      clip        = c;
      localFrame  = 0;
      loopsDone   = 0;
      targetLoops = loops;
      onClipEnd   = onEnd;
      isHolding   = false;
      lastTick    = performance.now(); // reset timing only on an actual clip switch
    }

    function playNextYoga() {
      if (yogaCancelled) return;
      const subClip = clips[PANDA_YOGA_SEQUENCE[yogaSubIndex]];
      if (!subClip) return;
      clip = subClip;
      localFrame = 0;
      loopsDone = 0;
      targetLoops = 1;
      onClipEnd = () => {
        if (yogaCancelled) return;
        yogaSubIndex = (yogaSubIndex + 1) % PANDA_YOGA_SEQUENCE.length;
        playNextYoga();
      };
      isHolding = false;
      lastTick = performance.now();
    }

    // ── enterState: choose clips for a pet state ────────────────────────────
    function enterState(s) {
      isWalking           = false;
      idleLoopsDone       = 0;
      idleLoopsBeforeWalk = rand(3, 7);

      // Look up configured clip name, fall back to built-in defaults
      const clipName  = animConfigRef.current?.[s] ?? defaultClipNames[s];
      if (clipName === 'Yoga' && isPanda) {
        yogaCancelled = false;
        yogaSubIndex  = 0;
        playNextYoga();
        return;
      }
      const c         = clips[clipName] ?? clips[idleKey];

      switch (s) {
        case 'dragging':
          if (clip !== c) {
            playClip(c, Infinity);
          } else {
            targetLoops = Infinity;
            onClipEnd   = null;
            isHolding   = false;
          }
          break;
        case 'sleepy': {
          const hurtClip = clips[hurtKey];
          const dieClip = clips[dieKey];
          if (c === hurtClip && dieClip) {
            playClip(hurtClip, 3, () =>
              playClip(dieClip, 1, () => { isHolding = true; })
            );
          } else {
            playClip(c, Infinity);
          }
          break;
        }
        default:
          playClip(c, Infinity);
      }
    }

    // ── Main rAF loop ───────────────────────────────────────────────────────
    function tick(timestamp) {
      // Preview clip override (e.g. shop hover) — takes precedence over state machine
      const preview = previewClipRef.current;
      if (startupDone && !isClosing) {
        if (preview && typeof preview === 'string' && (preview === 'Yoga' && isPanda || clips[preview])) {
          if (lastPreviewClip !== preview) {
            lastPreviewClip = preview;
            if (preview === 'Yoga' && isPanda) {
              yogaCancelled = false;
              yogaSubIndex  = 0;
              playNextYoga();
            } else {
              playClip(clips[preview], Infinity);
            }
          }
        } else {
          if (lastPreviewClip != null) {
            lastPreviewClip = null;
            enterState('idle');
          }
          // State machine — only when not in preview mode
          const base          = stateRef.current;
          const current       = isDragging
            ? 'dragging'
            : (hoverRef.current && base === 'idle' ? 'curious' : base);
          const configChanged = animConfigRef.current !== lastConfig;
          if (configChanged) lastConfig = animConfigRef.current;
          if (current !== prevState || configChanged) {
            prevState = current;
            enterState(current);
          }
        }
      }

      // Advance frame (skip if holding on last frame)
      if (!isHolding && timestamp - lastTick >= 1000 / clip.fps) {
        lastTick = timestamp;
        localFrame++;

        if (localFrame >= clip.frames) {
          localFrame = 0;
          loopsDone++;

          // Idle walking rhythm (Squid only — knight/dragon/panda stay on IDLE; skip when preview clip is active)
          if (startupDone && !isClosing && lastPreviewClip == null && prevState === 'idle' && !isKnight && !isDragon && !isPanda) {
            if (!isWalking) {
              idleLoopsDone++;
              if (idleLoopsDone >= idleLoopsBeforeWalk) {
                isWalking     = true;
                walkLoopsDone = 0;
                walkTarget    = rand(1, 2);
                playClip(clips[walkKey], Infinity);
              }
            } else {
              walkLoopsDone++;
              if (walkLoopsDone >= walkTarget) {
                isWalking           = false;
                idleLoopsDone       = 0;
                idleLoopsBeforeWalk = rand(3, 7);
                playClip(clips[idleKey], Infinity);
              }
            }
          }

          // Finite clip completion
          if (targetLoops !== Infinity && loopsDone >= targetLoops) {
            const cb = onClipEnd;
            onClipEnd = null;
            if (cb) cb();
            // If the callback set isHolding, park on the last frame
            if (isHolding) localFrame = clip.frames - 1;
          }
        }
      }

      // Draw
      const sheetBitmaps = isPanda ? pandaBitmaps : (isKnight ? knightBitmaps : isDragon ? dragonBitmaps : null);
      if (sheetBitmaps && clip.imageKey && sheetBitmaps[clip.imageKey]) {
        const bmp = sheetBitmaps[clip.imageKey];
        const nFrames = Math.max(1, clip.frames || 1);
        const frameWidth = bmp.width / nFrames;
        const srcX = Math.min(Math.floor(localFrame) * frameWidth, bmp.width - frameWidth);
        ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
        const dstW = isPanda ? PANDA_DRAW_SIZE : (isDragon ? DRAGON_DRAW_WIDTH : (isKnight ? KNIGHT_DRAW_SIZE : DISPLAY_SIZE));
        const dstH = isPanda ? PANDA_DRAW_SIZE : (isDragon ? DRAGON_DRAW_HEIGHT : (isKnight ? KNIGHT_DRAW_SIZE : DISPLAY_SIZE));
        const dstX = isPanda ? PANDA_DRAW_X : (isDragon ? DRAGON_DRAW_X : (isKnight ? KNIGHT_DRAW_X : 0));
        const dstY = isPanda ? PANDA_DRAW_Y : (isDragon ? DRAGON_DRAW_Y : (isKnight ? KNIGHT_DRAW_Y : 0));
        if (isKnight || isDragon || isPanda) {
          ctx.imageSmoothingEnabled = false;
          ctx.imageSmoothingQuality = 'low';
        }
        ctx.drawImage(
          bmp,
          srcX, 0, frameWidth, bmp.height,
          dstX, dstY, dstW, dstH
        );
        if (isKnight || isDragon || isPanda) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }
      } else if (bitmap && clip.row != null) {
        ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(
          bitmap,
          (clip.startFrame + localFrame) * NATIVE_FRAME,
          clip.row * NATIVE_FRAME,
          NATIVE_FRAME, NATIVE_FRAME,
          SQUID_DRAW_X, SQUID_DRAW_Y,
          SQUID_DRAW_SIZE, SQUID_DRAW_SIZE,
        );
        ctx.globalCompositeOperation = 'source-over';
      }

      rafId = requestAnimationFrame(tick);
    }

    // ── Close animation ─────────────────────────────────────────────────────
    let cleanupClose = null;
    if (window.electronAPI?.onPrepareClose) {
      cleanupClose = window.electronAPI.onPrepareClose(() => {
        isClosing = true;
        playClip(clips[dieKey], 1, () => window.electronAPI.closeReady());
        lastTick = performance.now();
      });
    }

    // ── Load image(s) and start ─────────────────────────────────────────────
    function startLoop() {
      startupDone = true;
      const base    = stateRef.current;
      const current = hoverRef.current && base === 'idle' ? 'curious' : base;
      prevState     = current;
      enterState(current);
      rafId = requestAnimationFrame(tick);
    }

    if (isPanda) {
      loadBitmaps(PANDA_NAMES, PANDA_URLS)
        .then(result => {
          if (cancelled) return;
          pandaBitmaps = result ?? {};
          startLoop();
        })
        .catch(() => { if (!cancelled) startLoop(); });
    } else if (isDragon) {
      loadBitmaps(DRAGON_NAMES, DRAGON_URLS)
        .then(result => {
          if (cancelled) return;
          dragonBitmaps = result ?? {};
          startLoop();
        })
        .catch(() => { if (!cancelled) startLoop(); });
    } else if (isKnight) {
      loadBitmaps(KNIGHT_NAMES, KNIGHT_URLS)
        .then(result => {
          if (cancelled) return;
          knightBitmaps = result ?? {};
          startLoop();
        })
        .catch(() => { if (!cancelled) startLoop(); });
    } else {
      const img = new Image();
      img.src = characterSheet;
      img.decode()
        .then(() => createImageBitmap(img))
        .then(bmp => {
          if (cancelled) { bmp.close(); return; }
          bitmap = bmp;
          Object.values(CLIPS).forEach(c => {
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(
              bmp,
              c.startFrame * NATIVE_FRAME, c.row * NATIVE_FRAME,
              NATIVE_FRAME, NATIVE_FRAME,
              0, 0, DISPLAY_SIZE, DISPLAY_SIZE,
            );
          });
          playClip(CLIPS.inkSquirt, 1, () => startLoop());
          rafId = requestAnimationFrame(tick);
        })
        .catch(() => { if (!cancelled) { startLoop(); rafId = requestAnimationFrame(tick); } });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      bitmap?.close();
      if (knightBitmaps) Object.values(knightBitmaps).forEach(b => b?.close());
      if (dragonBitmaps) Object.values(dragonBitmaps).forEach(b => b?.close());
      if (pandaBitmaps) Object.values(pandaBitmaps).forEach(b => b?.close());
      cleanupClose?.();
      window.removeEventListener('pet-drag-start',  onDragStart);
      window.removeEventListener('pet-drag-end',    onDragEnd);
      window.removeEventListener('pet-hover-start', onHoverStart);
      window.removeEventListener('pet-hover-end',   onHoverEnd);
    };
  }, [spriteSet]);

  return (
    <canvas
      ref={canvasRef}
      width={DISPLAY_SIZE}
      height={DISPLAY_SIZE}
      className="no-drag"
      style={{ display: 'block' }}
    />
  );
}
