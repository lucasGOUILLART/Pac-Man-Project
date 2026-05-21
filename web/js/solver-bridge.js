/**
 * Solver check with loading parade (max 15s) for editor / generator.
 */
(() => {
'use strict';

const SOLVER_MAX_MS = 15000;

function showParade(overlayEl, message) {
    if (!overlayEl) return () => {};
    overlayEl.hidden = false;
    overlayEl.innerHTML = `
        <div class="solver-parade panel">
            <p class="parade-title">${message || 'Vérification du labyrinthe…'}</p>
            <div class="parade-track" aria-hidden="true">
                <img class="parade-sprite parade-ghost g1" src="img/fantomeRougeMouvement.png" alt="">
                <img class="parade-sprite parade-ghost g2" src="img/fantomeVertMouvement.png" alt="">
                <img class="parade-sprite parade-ghost g3" src="img/fantomeJauneMouvement.png" alt="">
                <img class="parade-sprite parade-knight" src="img/chevalierMouvement1.png" alt="">
            </div>
            <p class="parade-progress" id="paradeProgress">0,0 s / 15 s</p>
            <p class="parade-hint">Le chevalier poursuit les ombres…</p>
        </div>
    `;
    const progressEl = overlayEl.querySelector('#paradeProgress');
    const t0 = performance.now();
    const timer = setInterval(() => {
        const elapsed = performance.now() - t0;
        if (progressEl) {
            progressEl.textContent = `${(elapsed / 1000).toFixed(1)} s / 15 s`;
        }
    }, 120);
    return () => {
        clearInterval(timer);
        overlayEl.hidden = true;
        overlayEl.innerHTML = '';
    };
}

/**
 * @returns {Promise<object>} solver result
 */
function verifyLevel(levelText, opts = {}) {
    return new Promise((resolve, reject) => {
        if (!window.OmbrequatreEngine?.solveLocally) {
            reject(new Error('Moteur de jeu non chargé.'));
            return;
        }
        const overlay = document.getElementById('solverOverlay');
        const hide = showParade(overlay, opts.message);
        const maxTimeMs = Math.min(opts.maxTimeMs || SOLVER_MAX_MS, SOLVER_MAX_MS);
        const requireSafe = opts.requireSafe !== false;
        const allowFallback = opts.allowFallback === true;

        const run = () => {
            try {
                let result = window.OmbrequatreEngine.solveLocally(levelText, {
                    requireSafe,
                    allowFallback: false,
                    maxTimeMs,
                    maxNodes: opts.maxNodes || 4_000_000,
                });
                if (!result.found && allowFallback) {
                    result = window.OmbrequatreEngine.solveLocally(levelText, {
                        requireSafe: false,
                        allowFallback: false,
                        maxTimeMs: Math.max(3000, Math.floor(maxTimeMs / 2)),
                        maxNodes: 2_000_000,
                    });
                    if (result.found) result.fallback = true;
                }
                hide();
                resolve(result);
            } catch (err) {
                hide();
                reject(err);
            }
        };

        setTimeout(run, 50);
    });
}

window.SolverBridge = { verifyLevel, SOLVER_MAX_MS, showParade };
})();
