/**
 * Pont vers le solveur C avec affichage d'une animation de chargement (max 15s).
 * Utilisé par l'éditeur et le générateur pour vérifier les niveaux.
 */
(() => {
'use strict';

const SOLVER_MAX_MS = 15000; // Temps maximum accordé au solveur (15 secondes)

/**
 * Affiche l'animation de parade (fantômes qui courent) dans l'overlay donné.
 * Retourne une fonction de fermeture à appeler quand le solveur a terminé.
 */
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
    // On met à jour le compteur de temps toutes les 120ms pour un affichage fluide
    const progressEl = overlayEl.querySelector('#paradeProgress');
    const t0 = performance.now();
    const timer = setInterval(() => {
        const elapsed = performance.now() - t0;
        if (progressEl) {
            progressEl.textContent = `${(elapsed / 1000).toFixed(1)} s / 15 s`;
        }
    }, 120);
    // La fonction retournée cache l'overlay et nettoie le timer
    return () => {
        clearInterval(timer);
        overlayEl.hidden = true;
        overlayEl.innerHTML = '';
    };
}

/**
 * Soumet un niveau au solveur C (via api/solve.php) en affichant l'animation d'attente.
 * @returns {Promise<object>} Le résultat du solveur
 */
function verifyLevel(levelText, opts = {}) {
    return new Promise((resolve, reject) => {
        // On vérifie que le moteur de jeu est bien chargé avant d'appeler le solveur
        if (!window.OmbrequatreEngine?.solveViaC) {
            reject(new Error('Game engine not loaded.'));
            return;
        }
        const overlay = document.getElementById('solverOverlay');
        const hide = showParade(overlay, opts.message);
        const requireSafe = opts.requireSafe !== false;
        const allowFallback = opts.allowFallback === true;

        // Le solveur C gère lui-même le repli gemmes-only quand allowFallback est vrai
        window.OmbrequatreEngine.solveViaC(levelText, {
            requireSafe,
            allowFallback,
        }).then(result => {
            hide(); // On ferme l'animation quand la réponse arrive
            resolve(result);
        }).catch(err => {
            hide();
            reject(err);
        });
    });
}

window.SolverBridge = { verifyLevel, SOLVER_MAX_MS, showParade };
})();
