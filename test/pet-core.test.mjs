import assert from 'node:assert/strict';
import {
  DEFAULT_FRAME,
  STATE_ROWS,
  STATE_FRAME_COUNTS,
  STATE_TTLS_MS,
  STATE_LABELS,
  DRIVABLE_STATES,
  parsePetJson,
  spriteGrid,
  frameRect,
  stateFrames,
  stateDurations,
  decaySignals,
  derivePetState,
  STAT_DECAY_PER_HOUR,
  STAT_RESTORE,
  STAT_LOW_THRESHOLD,
  decayStats,
  feedStats,
  playStats,
  statHint,
} from '../lib/pet-core.js';

// --- official contract minimal manifest ------------------------------------
{
  const pet = parsePetJson({
    id: 'pet-name',
    displayName: 'Pet Name',
    description: 'One short sentence.',
    spritesheetPath: 'spritesheet.webp',
  });
  assert.equal(pet.id, 'pet-name');
  assert.equal(pet.displayName, 'Pet Name');
  assert.equal(pet.spritesheetPath, 'spritesheet.webp');
  assert.deepEqual(pet.frame, { ...DEFAULT_FRAME });
  assert.equal(pet.totalFrames, 72);
}

// --- defaults/fallbacks ------------------------------------------------------
{
  const pet = parsePetJson({}, 'my-dir');
  assert.equal(pet.id, 'my-dir');
  assert.equal(pet.displayName, 'my-dir');
  assert.equal(pet.description, '');
  assert.equal(pet.spritesheetPath, 'spritesheet.webp');
}

// --- grid + frame rect (row-major) ------------------------------------------
{
  const pet = parsePetJson({});
  const grid = spriteGrid(pet);
  assert.deepEqual(grid, { columns: 8, rows: 9, frameWidth: 192, frameHeight: 208, totalFrames: 72 });
  assert.deepEqual(frameRect(0, grid), { x: 0, y: 0, w: 192, h: 208 });
  assert.deepEqual(frameRect(8, grid), { x: 0, y: 208, w: 192, h: 208 }); // row 1 col 0
  assert.deepEqual(frameRect(64, grid), { x: 0, y: 1664, w: 192, h: 208 }); // row 8 col 0 = review
  assert.deepEqual(frameRect(71, grid), { x: 1344, y: 1664, w: 192, h: 208 }); // row 8 col 7
}

// --- state frames follow V1 rows ---------------------------------------------
{
  const pet = parsePetJson({});
  assert.deepEqual(stateFrames('idle', pet), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(stateFrames('running-right', pet), [8, 9, 10, 11, 12, 13, 14, 15]); // row 1
  assert.deepEqual(stateFrames('running-left', pet), [16, 17, 18, 19, 20, 21, 22, 23]); // row 2
  assert.deepEqual(stateFrames('running', pet), [56, 57, 58, 59, 60, 61]); // row 7
  assert.deepEqual(stateFrames('review', pet), [64, 65, 66, 67, 68, 69]); // row 8
  assert.deepEqual(stateFrames('jumping', pet), [32, 33, 34, 35, 36]); // row 4
}

// --- custom frame grid + animations ------------------------------------------
{
  const pet = parsePetJson({
    displayName: 'Tall',
    spritesheetPath: 'spritesheet.webp',
    frame: { width: 384, height: 104, columns: 4, rows: 18 },
  });
  assert.equal(pet.totalFrames, 72);
  const grid = spriteGrid(pet);
  assert.equal(grid.columns, 4);
  // row-major still holds for the custom grid
  assert.deepEqual(frameRect(5, grid), { x: 384, y: 104, w: 384, h: 104 });
}

{
  const pet = parsePetJson({
    displayName: 'Custom',
    animations: { idle: { frames: [0], fps: 2.0, loop: false, fallback: 'idle' } },
  });
  assert.deepEqual(stateFrames('idle', pet), [0]);
  assert.deepEqual(stateDurations('idle', pet), [500]);
  assert.equal(pet.animations.idle.loop, false);
}

// --- validation: bad fps / bad frame index / bad grid ------------------------
{
  assert.throws(() => parsePetJson({ animations: { a: { frames: [0], fps: 999 } } }), /fps/);
  assert.throws(() => parsePetJson({ animations: { a: { frames: [72] } } }), /out of range/);
  assert.throws(() => parsePetJson({ animations: { a: { frames: [] } } }), /non-empty/);
  assert.throws(() => parsePetJson({ frame: { width: 0, height: 208, columns: 8, rows: 9 } }), /positive integers/);
  assert.throws(() => parsePetJson(null), /JSON object/);
}

// --- state machine: session-driven priority -----------------------------------
{
  const now = Date.now();
  assert.equal(derivePetState({ running: true, waiting: false, error: null }), 'running');
  assert.equal(derivePetState({ running: false, waiting: false, error: 'boom' }), 'failed');
  assert.equal(derivePetState({ running: false, waiting: true, error: null }), 'waiting');
  assert.equal(derivePetState({ running: false, waiting: false, error: null, completed: true }), 'review');
  assert.equal(derivePetState({ running: false, waiting: false, error: null, celebrateUntil: now + 1000 }), 'jumping');
  assert.equal(derivePetState({ running: false, waiting: false, error: null, celebrateUntil: now - 1 }), 'idle');
  // celebrate (jumping) outranks completed (review): a just-finished run celebrates first
  assert.equal(derivePetState({ completed: true, celebrateUntil: now + 1000 }), 'jumping');
  // interaction states outrank session-driven ones
  assert.equal(derivePetState({ running: true, drag: true }), 'drag');
  assert.equal(derivePetState({ running: true, eat: true }), 'eat');
  assert.equal(derivePetState({ running: true, play: true }), 'play');
  assert.equal(derivePetState({ running: true, wave: true }), 'waving');
  assert.equal(derivePetState({ running: true, waveUntil: now + 500 }), 'waving');
  assert.equal(derivePetState({ running: true, waveUntil: now - 1 }), 'running');
}

// --- drag direction drives the official locomotion rows (ambient.rs) -----------
{
  assert.equal(derivePetState({ drag: true, dragDir: 1 }), 'running-right');
  assert.equal(derivePetState({ drag: true, dragDir: -1 }), 'running-left');
  assert.equal(derivePetState({ drag: true, dragDir: 0 }), 'drag');
}

// --- ambient state lifetimes (Running 3min / Failed 1h / Waiting 24h / Review 7d)
{
  const now = Date.now();
  // fresh signals behave as before
  assert.equal(derivePetState({ running: true, runningAt: now - 1000, now }), 'running');
  assert.equal(derivePetState({ error: 'boom', errorAt: now - 1000, now }), 'failed');
  assert.equal(derivePetState({ waiting: true, waitingAt: now - 1000, now }), 'waiting');
  assert.equal(derivePetState({ completed: true, completedAt: now - 1000, now }), 'review');
  // stale signals decay to idle
  assert.equal(derivePetState({ running: true, runningAt: now - STATE_TTLS_MS.running - 1, now }), 'idle');
  assert.equal(derivePetState({ error: 'boom', errorAt: now - STATE_TTLS_MS.failed - 1, now }), 'idle');
  assert.equal(derivePetState({ waiting: true, waitingAt: now - STATE_TTLS_MS.waiting - 1, now }), 'idle');
  assert.equal(derivePetState({ completed: true, completedAt: now - STATE_TTLS_MS.review - 1, now }), 'idle');
  // a decayed running signal unblocks nothing; a live error still wins over a stale run
  assert.equal(
    derivePetState({ running: true, runningAt: now - STATE_TTLS_MS.running - 1, error: 'x', errorAt: now, now }),
    'failed',
  );
}

// --- decaySignals standalone ----------------------------------------------------
{
  const now = Date.now();
  assert.deepEqual(decaySignals({ running: true, now }), { running: true, waiting: false, error: null, completed: false });
  assert.deepEqual(
    decaySignals({ running: true, runningAt: now - STATE_TTLS_MS.running - 1, error: 'e', errorAt: now, now }),
    { running: false, waiting: false, error: 'e', completed: false },
  );
  // boolean-ish inputs are normalized
  assert.deepEqual(decaySignals({ waiting: false, error: null, now }), { running: false, waiting: false, error: null, completed: false });
}

// --- labels: every drivable state has a defined label entry ----------------------
{
  for (const state of DRIVABLE_STATES) {
    assert.ok(Object.prototype.hasOwnProperty.call(STATE_LABELS, state), `STATE_LABELS missing ${state}`);
  }
  // official ambient.rs labels
  assert.equal(STATE_LABELS.running, 'Running');
  assert.equal(STATE_LABELS.waiting, 'Needs input');
  assert.equal(STATE_LABELS.review, 'Ready');
  assert.equal(STATE_LABELS.failed, 'Blocked');
}

// --- custom animations drive the extended interaction states -------------------
{
  const pet = parsePetJson({
    frame: { width: 96, height: 104, columns: 8, rows: 12 },
    animations: {
      eat: { frames: [72, 73, 74, 75], fps: 6 },
      play: { frames: [80, 81, 82, 83], fps: 6 },
      drag: { frames: [88, 89], fps: 4 },
    },
  });
  assert.equal(pet.totalFrames, 96);
  assert.deepEqual(stateFrames('eat', pet), [72, 73, 74, 75]);
  assert.deepEqual(stateDurations('eat', pet), [167, 167, 167, 167]);
  assert.deepEqual(stateFrames('drag', pet), [88, 89]);
  // on a pet WITHOUT the extra rows the interaction states degrade to the idle row (single hold frame)
  const official = parsePetJson({});
  assert.deepEqual(stateFrames('eat', official), [0]);
}

// --- consistency: every STATE_ROWS key has frames & durations ------------------
{
  for (const state of Object.keys(STATE_ROWS)) {
    const pet = parsePetJson({});
    const frames = stateFrames(state, pet);
    const durs = stateDurations(state, pet);
    assert.equal(frames.length, STATE_FRAME_COUNTS[state], `frame count ${state}`);
    assert.equal(durs.length, frames.length, `duration count ${state}`);
  }
}

// --- care stats: wall-clock decay, restore, clamps, hints ----------------------
{
  const HOUR = 3_600_000;
  const t0 = 1_700_000_000_000;
  // fresh record defaults to full stats
  assert.deepEqual(decayStats(null, t0), { hunger: 100, mood: 100, updatedAt: t0 });
  // 4h decay: hunger 100 - 4*12.5 = 50, mood 100 - 4*(100/6) ≈ 33.3
  const d = decayStats({ hunger: 100, mood: 100, updatedAt: t0 }, t0 + 4 * HOUR);
  assert.equal(d.hunger, 50);
  assert.equal(d.mood, 33.3);
  assert.equal(d.updatedAt, t0 + 4 * HOUR);
  // decay clamps at 0 (never negative), future timestamps are ignored
  const d2 = decayStats({ hunger: 5, mood: 5, updatedAt: t0 }, t0 + 10 * HOUR);
  assert.equal(d2.hunger, 0);
  assert.equal(d2.mood, 0);
  const d3 = decayStats({ hunger: 42, mood: 42, updatedAt: t0 }, t0 - HOUR);
  assert.equal(d3.hunger, 42);
  // feed/play restore (decay applied first), capped at 100
  const fed = feedStats({ hunger: 85, mood: 10, updatedAt: t0 }, t0);
  assert.equal(fed.hunger, 100);
  assert.equal(fed.mood, 10);
  const played = playStats({ hunger: 10, mood: 60, updatedAt: t0 }, t0 + 2 * HOUR);
  assert.equal(played.hunger, 0); // 10 - 2*12.5 -> clamped
  assert.equal(played.mood, 51.7); // 60 - 2*(100/6) + 25 = 51.66… -> rounded to 1dp
  // hints: hunger outranks boredom, nothing when both fine
  assert.equal(statHint({ hunger: 100, mood: 100, updatedAt: t0 }, t0), null);
  assert.equal(statHint({ hunger: STAT_LOW_THRESHOLD - 1, mood: 5, updatedAt: t0 }, t0), 'hungry');
  assert.equal(statHint({ hunger: 90, mood: STAT_LOW_THRESHOLD - 1, updatedAt: t0 }, t0), 'bored');
  // hint boundary: exactly at threshold is NOT low
  assert.equal(statHint({ hunger: STAT_LOW_THRESHOLD, mood: STAT_LOW_THRESHOLD, updatedAt: t0 }, t0), null);
}

console.log('pet-core: all assertions passed');
