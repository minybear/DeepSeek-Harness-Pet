/**
 * parity.test.mjs — the browser half (lib/client.js) inlines its own copy of
 * the pet core because the DSH module loader cannot resolve our own files.
 * This test pins the two copies together: any state-machine drift between
 * lib/pet-core.js and the inline copy fails here.
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as core from '../lib/pet-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, '../lib/client.js');

// --- minimal stubs so client.js can be imported under Node -------------------
const React = {
  createElement: () => ({}),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useSyncExternalStore: (_sub, getSnap) => getSnap(),
};
globalThis.document = { createElement: () => ({ getContext: () => new Proxy(function () {}, { get: () => () => {}, set: () => true }), toDataURL: () => 'data:' }) };
let captured = null;
globalThis.window = { __ModuleLoader__: { load: (arg) => { captured = arg; } } };

await import(pathToFileURL(clientPath).href + `?t=${Date.now()}`);
const mod = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require("${name}")`);
});
const inline = mod.__petCore;
assert.ok(inline, 'client.js must export __petCore');

// --- constants are identical ---------------------------------------------------
for (const key of ['DEFAULT_FRAME', 'STATE_ROWS', 'STATE_FRAME_COUNTS', 'STATE_DURATIONS_MS', 'STATE_TTLS_MS', 'STATE_LABELS']) {
  assert.deepEqual(inline[key], core[key], `constant ${key} drifted`);
}
assert.deepEqual([...inline.DRIVABLE_STATES], [...core.DRIVABLE_STATES], 'DRIVABLE_STATES drifted');

// --- parsePetJson: same output (or same failure) across a manifest matrix ------
const manifests = [
  [{ id: 'a', displayName: 'A', description: 'd', spritesheetPath: 's.webp' }, 'dir-a'],
  [{}, 'fallback-dir'],
  [{ frame: { width: 384, height: 104, columns: 4, rows: 18 } }, 'tall'],
  [{ animations: { idle: { frames: [0], fps: 2.0, loop: false, fallback: 'idle' } } }, 'custom'],
  [{ frame: { width: 96, height: 104, columns: 8, rows: 12 }, animations: { eat: { frames: [72, 73], fps: 6 } } }, 'extra'],
  [{ spriteVersionNumber: 2 }, 'v2'],
  // invalid ones: both must throw with the same message
  [null, 'x'],
  [{ frame: { width: 0, height: 1, columns: 1, rows: 1 } }, 'x'],
  [{ animations: { a: { frames: [] } } }, 'x'],
  [{ animations: { a: { frames: [9999] } } }, 'x'],
  [{ animations: { a: { frames: [0], fps: 0 } } }, 'x'],
];
for (const [manifest, dir] of manifests) {
  let coreOut, coreErr, inlineOut, inlineErr;
  try { coreOut = core.parsePetJson(manifest, dir); } catch (e) { coreErr = e.message; }
  try { inlineOut = inline.parsePetJson(manifest, dir); } catch (e) { inlineErr = e.message; }
  assert.equal(inlineErr, coreErr, `parsePetJson error mismatch for ${JSON.stringify(manifest)}`);
  assert.deepEqual(inlineOut, coreOut, `parsePetJson output mismatch for ${JSON.stringify(manifest)}`);
}

// --- frame math: same slices for every state on both grid shapes ----------------
const grids = [core.parsePetJson({}, 'g'), core.parsePetJson({ frame: { width: 96, height: 104, columns: 8, rows: 12 } }, 'g2')];
for (const pet of grids) {
  assert.deepEqual(inline.spriteGrid(pet), core.spriteGrid(pet));
  for (let i = 0; i < pet.totalFrames; i++) {
    assert.deepEqual(inline.frameRect(i, inline.spriteGrid(pet)), core.frameRect(i, core.spriteGrid(pet)), `frameRect(${i})`);
  }
  for (const state of core.DRIVABLE_STATES) {
    assert.deepEqual(inline.stateFrames(state, pet), core.stateFrames(state, pet), `stateFrames(${state})`);
    assert.deepEqual(inline.stateDurations(state, pet), core.stateDurations(state, pet), `stateDurations(${state})`);
  }
}

// --- decaySignals + derivePetState: identical across an input matrix -------------
const T = 1_700_000_000_000;
const inputs = [
  {},
  { running: true },
  { waiting: true },
  { error: 'boom' },
  { completed: true },
  { running: true, runningAt: T - 1000, now: T },
  { running: true, runningAt: T - 3 * 60_000 - 1, now: T },
  { error: 'e', errorAt: T - 60 * 60_000 - 1, now: T },
  { waiting: true, waitingAt: T - 24 * 60 * 60_000 - 1, now: T },
  { completed: true, completedAt: T - 7 * 24 * 60 * 60_000 - 1, now: T },
  { running: true, runningAt: T - 3 * 60_000 - 1, error: 'e', errorAt: T, now: T },
  { drag: true },
  { drag: true, dragDir: 1 },
  { drag: true, dragDir: -1 },
  { drag: true, dragDir: 0, running: true },
  { eat: true, running: true },
  { play: true, running: true },
  { wave: true, running: true },
  { waveUntil: T + 500, now: T, running: true },
  { waveUntil: T - 1, now: T, running: true },
  { celebrateUntil: T + 1000, now: T },
  { celebrateUntil: T - 1, now: T },
  { completed: true, celebrateUntil: T + 1000, now: T },
  { running: true, waiting: true, error: 'x', completed: true, now: T },
];
for (const input of inputs) {
  assert.deepEqual(inline.decaySignals(input), core.decaySignals(input), `decaySignals ${JSON.stringify(input)}`);
  assert.equal(inline.derivePetState(input), core.derivePetState(input), `derivePetState ${JSON.stringify(input)}`);
}

console.log('parity: all assertions passed');
