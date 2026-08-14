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
    return custom.frames.map((_, i) => (i === custom.frames.length - 1 ? per : per));
  }
  const table = STATE_DURATIONS_MS[state] ?? STATE_DURATIONS_MS.idle;
  return table.slice();
}

/**
 * Priority-ordered pet state from a session snapshot plus interaction inputs.
 * `celebrateUntil` (epoch ms) makes a just-finished run celebrate before
 * settling back to idle. `drag`/`eat`/`play` are transient interaction states
 * that outrank the session-driven ones.
 */
export function derivePetState({ running, waiting, error, celebrateUntil, wave, drag, eat, play }) {
  if (drag) return 'drag';
  if (eat) return 'eat';
  if (play) return 'play';
  if (wave) return 'waving';
  if (running) return 'running';
  if (error) return 'failed';
  if (waiting) return 'waiting';
  if (celebrateUntil && Date.now() < celebrateUntil) return 'jumping';
  return 'idle';
}

/**
 * The states this plugin can drive: the 9 Codex V1 atlas rows plus three
 * interaction states supplied by the built-in sprite's custom `animations`
 * (eat / play / drag live on extra atlas rows 9–11).
 */
export const DRIVABLE_STATES = Object.freeze(['idle', 'running', 'waiting', 'failed', 'jumping', 'waving', 'review', 'drag', 'eat', 'play']);
