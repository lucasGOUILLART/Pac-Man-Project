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
            <p class="parade-title">${message || 'Verifying the maze…'}</p>
            <div class="parade-track" aria-hidden="true">
                <img class="parade-sprite parade-ghost g1" src="img/fantomeRougeMouvement.png" alt="">
                <img class="parade-sprite parade-ghost g2" src="img/fantomeVertMouvement.png" alt="">
                <img class="parade-sprite parade-ghost g3" src="img/fantomeJauneMouvement.png" alt="">
                <img class="parade-sprite parade-knight" src="img/chevalierMouvement1.png" alt="">
            </div>
            <p class="parade-progress" id="paradeProgress">0,0 s / 15 s</p>
            <p class="parade-hint">The knight chases the shadows…</p>
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
        if (!window.OmbrequatreEngine?.solveViaC) {
            reject(new Error('Game engine not loaded.'));
            return;
        }
        const overlay = document.getElementById('solverOverlay');
        const hide = showParade(overlay, opts.message);
        const requireSafe = opts.requireSafe !== false;
        const allowFallback = opts.allowFallback === true;

        // Le solveur C (endpoint api/solve.php) gère lui-même le repli
        // gem-only quand allowFallback est vrai.
        window.OmbrequatreEngine.solveViaC(levelText, {
            requireSafe,
            allowFallback,
        }).then(result => {
            hide();
            resolve(result);
        }).catch(err => {
            hide();
            reject(err);
        });
    });
}

window.SolverBridge = { verifyLevel, SOLVER_MAX_MS, showParade };
})();