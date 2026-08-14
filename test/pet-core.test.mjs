import assert from 'node:assert/strict';
import {
  DEFAULT_FRAME,
  STATE_ROWS,
  STATE_FRAME_COUNTS,
  parsePetJson,
  spriteGrid,
  frameRect,
  stateFrames,
  stateDurations,
  derivePetState,
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
}

// --- validation: bad fps / bad frame index / bad grid ------------------------
{
  assert.throws(() => parsePetJson({ animations: { a: { frames: [0], fps: 999 } } }), /fps/);
  assert.throws(() => parsePetJson({ animations: { a: { frames: [72] } } }), /out of range/);
  assert.throws(() => parsePetJson({ animations: { a: { frames: [] } } }), /non-empty/);
  assert.throws(() => parsePetJson({ frame: { width: 0, height: 208, columns: 8, rows: 9 } }), /positive integers/);
}

// --- state machine priority ---------------------------------------------------
{
  const now = Date.now();
  assert.equal(derivePetState({ running: true, waiting: false, error: null }), 'running');
  assert.equal(derivePetState({ running: false, waiting: false, error: 'boom' }), 'failed');
  assert.equal(derivePetState({ running: false, waiting: true, error: null }), 'waiting');
  assert.equal(derivePetState({ running: false, waiting: false, error: null, celebrateUntil: now + 1000 }), 'jumping');
  assert.equal(derivePetState({ running: false, waiting: false, error: null, celebrateUntil: now - 1 }), 'idle');
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

console.log('pet-core: all assertions passed');
