import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, '../lib/client.js');

// --- minimal React stub (import-time surface + one render pass) --------------
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.length ? children : undefined }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
  useSyncExternalStore: (_sub, getSnap) => getSnap(),
};

// --- stub DOM canvas so buildDefaultAsset can run ---------------------------
function make2dCtx() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      return () => {};
    },
    set() { return true; },
  });
}
const canvasStub = { width: 0, height: 0, getContext: () => make2dCtx(), toDataURL: () => 'data:image/png;base64,DUMMY' };
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? canvasStub : {}) };

// --- capture window.__ModuleLoader__.load ------------------------------------
let captured = null;
globalThis.window = { __ModuleLoader__: { load: (arg) => { captured = arg; } } };

await import(pathToFileURL(clientPath).href + `?t=${Date.now()}`);

assert.ok(captured, 'client.js must register via window.__ModuleLoader__.load');
assert.equal(captured.id, '@minybear/dsh-pet');
assert.equal(typeof captured.factory, 'function');

const mod = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require("${name}")`);
});

// --- plugin body contract ----------------------------------------------------
assert.equal(typeof mod.apply, 'function');
assert.deepEqual(mod.inject, ['slots', 'sessions']);
assert.equal(typeof mod.PetOverlay, 'function');
assert.equal(typeof mod.buildDefaultAsset, 'function');

const registrations = [];
const fakeCtx = {
  sessions: { binding: () => undefined },
  slots: {
    inject: (_name, fn) => { fn(); },
    register: (opts, Component) => { registrations.push({ opts, Component }); },
  },
};
mod.apply(fakeCtx);

assert.equal(registrations.length, 1);
assert.equal(registrations[0].opts.name, 'shell.overlay');
assert.equal(registrations[0].opts.id, 'dsh-pet');
assert.equal(typeof registrations[0].Component, 'function');
assert.equal(registrations[0].opts.inject().sessionsService, fakeCtx.sessions);

// --- built-in asset: Codex-format grid via `frame` override ------------------
const asset = mod.buildDefaultAsset();
assert.equal(asset.pet.frame.columns, 8);
assert.equal(asset.pet.frame.rows, 12);
assert.equal(asset.pet.totalFrames, 96);
assert.equal(asset.pet.displayName.length > 0, true);
assert.ok(asset.dataUrl.startsWith('data:image/png'));
// interaction states are declared through the official animations override
assert.deepEqual(asset.pet.animations.eat.frames, [72, 73, 74, 75]);
assert.deepEqual(asset.pet.animations.play.frames, [80, 81, 82, 83]);
assert.deepEqual(asset.pet.animations.drag.frames, [88, 89, 90, 91]);

// --- overlay component: renders null without a mounted asset (graceful) ------
const el = registrations[0].Component({
  useSessions: (sel) => sel({ current: undefined, byId: {} }),
  sessionsService: fakeCtx.sessions,
});
assert.equal(el, null, 'overlay is empty until the default sprite is ready');

console.log('client-contract: all assertions passed');
