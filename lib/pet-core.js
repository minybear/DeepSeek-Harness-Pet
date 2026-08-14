/**
 * dsh-pet — pure pet core (no DOM).
 *
 * Faithful re-implementation of the OpenAI Codex custom-pet package model,
 * reduced to what the DSH web plugin needs. Sources:
 *  - openai/skills  skills/.curated/hatch-pet/references/{codex-pet-contract,animation-rows}.md
 *  - openai/codex   codex-rs/tui/src/pets/{model,frames,ambient}.rs
 *
 * Everything here is side-effect free and Node-testable.
 */

/** V1 default frame grid: 8 columns x 9 rows, 192x208 cells, 1536x1872 atlas. */
export const DEFAULT_FRAME = Object.freeze({ width: 192, height: 208, columns: 8, rows: 9 });

/** The 9 official animation states -> their V1 atlas row. */
export const STATE_ROWS = Object.freeze({
  idle: 0,
  'running-right': 1,
  'running-left': 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8,
});

/** Frames per state (V1 official animation-rows.md "used columns"). */
export const STATE_FRAME_COUNTS = Object.freeze({
  idle: 6,
  'running-right': 8,
  'running-left': 8,
  waving: 4,
  jumping: 5,
  failed: 8,
  waiting: 6,
  running: 6,
  review: 6,
});

/** Per-frame durations in ms (last frame is the hold frame), V1 official table. */
export const STATE_DURATIONS_MS = Object.freeze({
  idle: [280, 110, 110, 140, 140, 320],
  'running-right': [120, 120, 120, 120, 120, 120, 120, 220],
  'running-left': [120, 120, 120, 120, 120, 120, 120, 220],
  waving: [140, 140, 140, 280],
  jumping: [140, 140, 140, 140, 280],
  failed: [140, 140, 140, 140, 140, 140, 140, 240],
  waiting: [150, 150, 150, 150, 150, 260],
  running: [120, 120, 120, 120, 120, 220],
  review: [150, 150, 150, 150, 150, 280],
});

/**
 * Ambient state lifetimes (openai/codex ambient.rs): a session-driven state
 * falls back to idle once it is older than its TTL, even without a newer
 * signal. Running=3min, Failed=1h, Waiting=24h, Review=7d.
 */
export const STATE_TTLS_MS = Object.freeze({
  running: 3 * 60_000,
  failed: 60 * 60_000,
  waiting: 24 * 60 * 60_000,
  review: 7 * 24 * 60 * 60_000,
});

/** Codex state labels (ambient.rs); null means "no bubble". */
export const STATE_LABELS = Object.freeze({
  idle: null,
  'running-right': null,
  'running-left': null,
  waving: 'Hi!',
  jumping: 'Done!',
  failed: 'Blocked',
  waiting: 'Needs input',
  running: 'Running',
  review: 'Ready',
  drag: null,
  eat: 'Yum!',
  play: 'Whee!',
});

const POSITIVE_INT = (v) => Number.isInteger(v) && v > 0;

/**
 * Parse and normalize a pet.json manifest, mirroring openai/codex model.rs
 * defaults and validation. `fallbackId` is the on-disk directory name.
 * Throws on invalid `frame`/`animations` so a broken package fails loud.
 */
export function parsePetJson(json, fallbackId = 'dsh-pet') {
  if (json == null || typeof json !== 'object') {
    throw new Error('pet.json must be a JSON object');
  }
  const id = typeof json.id === 'string' && json.id !== '' ? json.id : fallbackId;
  const displayName = typeof json.displayName === 'string' && json.displayName !== ''
    ? json.displayName
    : id;
  const description = typeof json.description === 'string' ? json.description : '';
  const spritesheetPath = typeof json.spritesheetPath === 'string' && json.spritesheetPath !== ''
    ? json.spritesheetPath
    : 'spritesheet.webp';

  let frame = { ...DEFAULT_FRAME };
  if (json.frame != null) {
    const f = json.frame;
    if (!POSITIVE_INT(f.width) || !POSITIVE_INT(f.height) || !POSITIVE_INT(f.columns) || !POSITIVE_INT(f.rows)) {
      throw new Error('pet.json frame must be { width, height, columns, rows } of positive integers');
    }
    frame = { width: f.width, height: f.height, columns: f.columns, rows: f.rows };
  }

  const totalFrames = frame.columns * frame.rows;
  if (totalFrames > 256) throw new Error('pet.json frame grid exceeds 256 total frames');

  const animations = {};
  if (json.animations != null) {
    for (const [name, spec] of Object.entries(json.animations)) {
      if (spec == null || !Array.isArray(spec.frames) || spec.frames.length === 0) {
        throw new Error(`pet.json animations.${name}.frames must be a non-empty array`);
      }
      const frames = spec.frames.map(Number);
      for (const idx of frames) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= totalFrames) {
          throw new Error(`pet.json animations.${name} frame index ${idx} out of range (0..${totalFrames - 1})`);
        }
      }
      const fps = spec.fps == null ? 8.0 : Number(spec.fps);
      if (!Number.isFinite(fps) || fps <= 0 || fps > 60) {
        throw new Error(`pet.json animations.${name}.fps must satisfy 0 < fps <= 60`);
      }
      const loop = spec.loop !== false;
      const fallback = typeof spec.fallback === 'string' && spec.fallback !== '' ? spec.fallback : 'idle';
      animations[name] = { frames, fps, loop, fallback };
    }
  }

  return {
    id,
    displayName,
    description,
    spritesheetPath,
    frame,
    totalFrames,
    animations,
    spriteVersionNumber: Number.isInteger(json.spriteVersionNumber) ? json.spriteVersionNumber : undefined,
  };
}

/** Resolve the sprite grid dimensions from a normalized pet. */
export function spriteGrid(pet) {
  const { columns, rows, width, height } = pet.frame;
  return { columns, rows, frameWidth: width, frameHeight: height, totalFrames: columns * rows };
}

/** Row-major atlas cell rectangle for a global frame index: index = row*columns + col. */
export function frameRect(index, grid) {
  const col = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return {
    x: col * grid.frameWidth,
    y: row * grid.frameHeight,
    w: grid.frameWidth,
    h: grid.frameHeight,
  };
}

/** Global frame indices for a state row (V1 default table), or a custom animation. */
export function stateFrames(state, pet) {
  const custom = pet.animations[state];
  if (custom) return custom.frames.slice();
  const row = STATE_ROWS[state] ?? STATE_ROWS.idle;
  const count = STATE_FRAME_COUNTS[state] ?? 1;
  const start = row * pet.frame.columns;
  const frames = [];
  for (let i = 0; i < count; i++) frames.push(start + i);
  return frames;
}

/** Frame hold durations for a state (V1 table), or a flat 1/fps per frame for custom animations. */
export function stateDurations(state, pet) {
  const custom = pet.animations[state];
  if (custom) {
    const per = Math.round(1000 / custom.fps);
    return custom.frames.map(() => per);
  }
  const table = STATE_DURATIONS_MS[state] ?? STATE_DURATIONS_MS.idle;
  return table.slice();
}

/** True when a signal first observed at `at` is still alive at `now` under `ttl`. */
function alive(at, ttl, now) {
  return typeof at === 'number' && now - at < ttl;
}

/**
 * Decay session-driven signals by their ambient lifetimes (ambient.rs).
 * Each signal carries the epoch ms when it was first observed; once it is
 * older than its TTL it no longer drives the pet. Signals without a timestamp
 * are treated as fresh (backwards compatible).
 */
export function decaySignals({ running, waiting, error, completed, runningAt, waitingAt, errorAt, completedAt, now = Date.now() }) {
  return {
    running: running === true && (runningAt == null || alive(runningAt, STATE_TTLS_MS.running, now)),
    waiting: waiting === true && (waitingAt == null || alive(waitingAt, STATE_TTLS_MS.waiting, now)),
    error: error != null && (errorAt == null || alive(errorAt, STATE_TTLS_MS.failed, now)) ? error : null,
    completed: completed === true && (completedAt == null || alive(completedAt, STATE_TTLS_MS.review, now)),
  };
}

/**
 * Priority-ordered pet state from session signals plus interaction inputs.
 *
 * Session signals should be pre-decayed (or pass the `*At` timestamps and
 * `now` and the decay is applied here). Interaction states outrank
 * session-driven ones:
 *
 *   drag (direction -> running-right/running-left) > eat > play > waving
 *   > running > failed > waiting > jumping (celebrate) > review > idle
 *
 * `wave` accepts a boolean or an until-timestamp; `celebrateUntil` is the
 * epoch ms until which a just-finished run celebrates.
 */
export function derivePetState(input) {
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const s = (input.runningAt != null || input.waitingAt != null || input.errorAt != null || input.completedAt != null)
    ? decaySignals({ ...input, now })
    : { running: input.running === true, waiting: input.waiting === true, error: input.error ?? null, completed: input.completed === true };

  const waveActive = input.wave === true || (typeof input.waveUntil === 'number' && now < input.waveUntil);
  const celebrateActive = typeof input.celebrateUntil === 'number' && now < input.celebrateUntil;

  if (input.drag) {
    if (input.dragDir > 0) return 'running-right';
    if (input.dragDir < 0) return 'running-left';
    return 'drag';
  }
  if (input.eat) return 'eat';
  if (input.play) return 'play';
  if (waveActive) return 'waving';
  if (s.running) return 'running';
  if (s.error) return 'failed';
  if (s.waiting) return 'waiting';
  if (celebrateActive) return 'jumping';
  if (s.completed) return 'review';
  return 'idle';
}

/**
 * The states this plugin can drive: the 9 Codex V1 atlas rows plus three
 * interaction states supplied by the built-in sprite's custom `animations`
 * (eat / play / drag live on extra atlas rows 9–11).
 */
export const DRIVABLE_STATES = Object.freeze([
  'idle', 'running', 'running-right', 'running-left', 'waiting', 'failed',
  'jumping', 'waving', 'review', 'drag', 'eat', 'play',
]);
