/**
 * solver-worker.js — BFS solver running in a Web Worker.
 *
 * Receives:  { id, type: 'solve', level: <string>, opts: { requireSafe, allowFallback, maxTimeMs, maxNodes } }
 * Sends:     { id, type: 'progress', nodes, elapsedMs }
 *            { id, type: 'done',     result }
 *            { id, type: 'error',    message }
 */

'use strict';

// ─── Polyfills so game.js can be imported into a Worker context ───────────────

// requestAnimationFrame / cancelAnimationFrame (used by the Game render loop;
// destroy() cancels the pending frame so the render loop never actually fires
// during the synchronous BFS solve, but the stubs must exist).
self.requestAnimationFrame = (cb) => setTimeout(cb, 16);
self.cancelAnimationFrame  = (id) => clearTimeout(id);

// Canvas factory: prefer OffscreenCanvas (available in all modern browsers);
// fall back to a Proxy-based mock that silently swallows every call.
function makeCanvas() {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(1, 1);
    }
    // Minimal mock: every property read returns a no-op function, every write
    // is accepted.  Covers fillRect, arc, beginPath, save/restore, etc.
    const noopCtx = new Proxy({}, {
        get(_, p) {
            if (p === 'canvas') return mock;
            return () => {};
        },
        set() { return true; },
    });
    const mock = { width: 1, height: 1, getContext: () => noopCtx };
    return mock;
}

// document stub — only createElement('canvas') and the event-listener stubs
// are actually exercised by game.js in a worker context.
const _noop      = () => {};
const _noopProxy = new Proxy({}, {
    get(_, p) {
        if (p === 'style' || p === 'classList' || p === 'dataset')
            return new Proxy({}, { get: () => _noop, set: () => true });
        if (p === 'firstChild' || p === 'nextSibling') return null;
        return _noop;
    },
    set() { return true; },
});

self.document = {
    createElement:   (tag) => tag === 'canvas' ? makeCanvas() : _noopProxy,
    addEventListener: _noop,
    getElementById:   () => null,
    querySelectorAll: () => ({ forEach: _noop }),
};

// Expose self as window so that `window.OmbrequatreEngine = …` in game.js
// lands on the worker's global scope.
self.window = self;

// ─── Load the game engine ─────────────────────────────────────────────────────
importScripts('game.js');

// After the import, self.OmbrequatreEngine = { Game, solveLocally } is set.

// ─── Message handler ──────────────────────────────────────────────────────────
self.onmessage = (e) => {
    const { id, type, level, opts } = e.data || {};
    if (type !== 'solve') return;

    // Acknowledge start so the progress bar shows something immediately.
    self.postMessage({ id, type: 'progress', nodes: 0, elapsedMs: 0 });

    try {
        if (!self.OmbrequatreEngine || !self.OmbrequatreEngine.solveLocally) {
            throw new Error('Game engine not loaded.');
        }
        const result = self.OmbrequatreEngine.solveLocally(level, opts || {});
        self.postMessage({ id, type: 'done', result });
    } catch (err) {
        self.postMessage({
            id,
            type: 'error',
            message: err && err.message ? err.message : 'Solver failed in worker',
        });
    }
};
