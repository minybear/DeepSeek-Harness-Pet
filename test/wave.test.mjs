/**
 * wave.test.mjs — covers the "waving" greeting de-dup logic.
 *
 * The pet should wave on every genuinely new session (incl. the first one),
 * but never twice for the same session id — re-selecting the same session
 * in the sidebar must NOT trigger a second waving animation.
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, '../lib/client.js');

// --- minimal stubs so client.js can be imported under Node ------------------
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
const { shouldWave } = mod;
assert.equal(typeof shouldWave, 'function', 'client.js must export shouldWave');

// --- the matrix that motivates this fix ------------------------------------
// null lastWavedFor == first time we ever see a session (cold start)
assert.equal(shouldWave(null, 'sess-A'), true, 'cold start -> wave');
// same session reselected
assert.equal(shouldWave('sess-A', 'sess-A'), false, 'same session -> no wave');
// genuine switch
assert.equal(shouldWave('sess-A', 'sess-B'), true, 'A -> B -> wave');
// back to A after a detour
assert.equal(shouldWave('sess-B', 'sess-A'), true, 'B -> A -> wave');
// no current session (e.g. user deselected everything)
assert.equal(shouldWave('sess-A', null), false, 'null currentId -> no wave');
assert.equal(shouldWave(null, null), false, 'both null -> no wave');
// same session after the A -> B -> A detour was recorded as lastWavedFor=A
assert.equal(shouldWave('sess-A', 'sess-A'), false, 'A -> A after detour -> no wave');

// --- simulate the full lifecycle the React effect will run -----------------
// lastWavedFor is a useRef; replay the effect's update logic. The matrix
// below mirrors real user behaviour: open A, re-open A, switch to B,
// re-open B, switch back to A, re-open A, deselect, then re-open A again
// — the only waves happen on genuinely first-seen session ids.
{
  const lastWavedFor = { current: null };
  const events = [];
  for (const id of [null, 'sess-A', 'sess-A', 'sess-B', 'sess-B', 'sess-A', 'sess-A', null, 'sess-A']) {
    if (shouldWave(lastWavedFor.current, id)) {
      events.push(['wave', id]);
      lastWavedFor.current = id;
    } else {
      events.push(['skip', id]);
    }
  }
  assert.deepEqual(events, [
    ['skip', null],
    ['wave', 'sess-A'],
    ['skip', 'sess-A'],
    ['wave', 'sess-B'],
    ['skip', 'sess-B'],
    ['wave', 'sess-A'],
    ['skip', 'sess-A'],
    ['skip', null],
    ['skip', 'sess-A'], // re-selecting the same session never re-waves
  ]);
}

console.log('wave: all assertions passed');