/**
 * Générateur de labyrinthes aléatoires — génération via le binaire C, vérification par le solveur.
 *
 * Approche : POST vers api/generate.php qui appelle le générateur C compilé
 * (solver/generator.exe / solver/generator). Le binaire C utilise un DFS
 * Recursive Backtracker pour produire des labyrinthes uniques et entièrement connectés.
 * Le solveur vérifie ensuite la résolvabilité avant d'afficher le niveau.
 * allowFallback:true accepte une solution gemmes-only si aucun chemin sûr n'existe —
 * ce qui améliore considérablement le taux de succès de génération.
 */
(() => {
'use strict';

const { serializeLevel, validateLevelStructure, parseLevelText, countGems, countGhostTypes } = window.LevelUtils;
const STORAGE_KEY = 'ombrequatre_play_map';

// ── Plans de rechange en JS (utilisés si le binaire C n'est pas encore compilé) ──────────
// Motifs mur/sol. '_' = sol, '*' = portail pour le fantôme bleu.

const BLUEPRINTS = {
    easy: [
        ['###########','#_________#','#_###_###_#','#_________#','#_###_###_#','#_________#','###########'],
        ['#############','#___________#','#_###___###_#','#___________#','#_###___###_#','#___________#','#############'],
        ['###########','#_________#','#_#_#_#_#_#','#_________#','#_#___#___#','#_________#','#_#_#_#_#_#','#_________#','###########'],
        ['#############','#___________#','#_###_###_#_#','#___________#','#_###___###_#','#___________#','#_###_###_#_#','#___________#','#############'],
    ],
    medium: [
        ['#############','#___________#','#_###_###_#_#','#___________#','#_###___###_#','#___________#','#_###_###_#_#','#___________#','#############'],
        ['#############','#___________#','#_###_###_#_#','#___________#','#_###___###_#','#___________#','#_###___###_#','#___________#','#_###_###_#_#','#___________#','#############'],
        ['###############','#_____________#','#_###_###_###_#','#_____________#','#_###_____###_#','#_____________#','#_###_###_###_#','#_____________#','###############'],
        ['###########','#_________#','#_###_###_#','#_________#','#_###___#_#','#_________#','#_#___###_#','#_________#','#_###_###_#','#_________#','###########'],
    ],
    hard: [
        ['###############','#_____________#','#_###_###_#_#_#','#_____________#','#_#_###___###_#','#_____________#','#_#_###___###_#','#_____________#','#_###_###_#_#_#','#_____________#','###############'],
        ['###############','#_____________#','#_###_###_#_#_#','#_____________#','#_#_###___###_#','#_____________#','#_____________#','#_#_###___###_#','#_____________#','#_###_###_#_#_#','#_____________#','#_____________#','###############'],
        ['#############','#___________#','#_###_###_#_#','#___________#','#_#_###_#___#','#___________#','#___________#','#_#_#___#___#','#___________#','#_###_###_#_#','#___________#','#___________#','#############'],
        ['###############','#_____________#','#_#_###_###_#_#','#_____________#','#_#___#___#___#','#_____________#','#_###_#___###_#','#_____________#','#_#___###_#___#','#_____________#','###############'],
    ],
    impossible: [
        ['###############','#*___________*#','#_#_###_###_#_#','#_____________#','#_###_#_#_###_#','#_____________#','#_#_#_#_#_#_#_#','#_____________#','#_#_#_#_#_#_#_#','#_____________#','#_###_#_#_###_#','#_____________#','#_#_###_###_#_#','#*___________*#','###############'],
        ['#################','#*_____________*#','#_###_###_###_#_#','#_______________#','#_#_###___###_#_#','#_______________#','#_#___#_#___#___#','#_______________#','#_#_###___###_#_#','#_______________#','#_###_###_###_#_#','#*_____________*#','#################'],
        ['###############','#_____________#','#_###_###_###_#','#*___________*#','#_#___#___#___#','#_____________#','#_###_#_#_###_#','#_____________#','#___#_#_#___#_#','#_____________#','#_#___#___#___#','#*___________*#','#_###_###_###_#','#_____________#','###############'],
        ['###############','#_____________#','#_#_###_#_###_#','#_____________#','#_###_#_###_#_#','#*___________*#','#_#_#_#_#_#_#_#','#_____________#','#_#_#_#_#_#_#_#','#*___________*#','#_###_#_###_#_#','#_____________#','#_#_###_#_###_#','#_____________#','###############'],
    ],
};

function _randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
// Mélange aléatoire en place (Fisher-Yates)
function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function _manhattan(a, b) { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); }

// Construit un niveau de rechange en JS à partir d'un plan de labyrinthe prédéfini
function _tryBuildLevelJS(diff) {
    const profile  = PROFILES[diff];
    const bp       = BLUEPRINTS[diff][_randInt(0, BLUEPRINTS[diff].length - 1)];
    const grid     = bp.map(row => row.split(''));
    const h = grid.length, w = grid[0].length;

    // On identifie les cases libres et les portails dans le plan
    const floors = [], portals = [];
    for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
            if (grid[r][c] === '_') floors.push([r, c]);
            else if (grid[r][c] === '*') portals.push([r, c]);
        }

    const hasBlue = diff === 'impossible'; // Le fantôme bleu n'existe qu'en mode impossible
    const ghostList = { easy:[], medium:['red'], hard:['red','green'],
                        impossible:['red','green','yellow','blue'] }[diff];
    const nonBlue = ghostList.filter(g => g !== 'blue');

    if (floors.length < profile.minGems + nonBlue.length + 1) return null;
    if (hasBlue && portals.length < 2) return null;

    _shuffle(floors);
    const [sr, sc] = floors[0]; // Le chevalier démarre sur la première case libre mélangée
    const usedKeys = new Set([`${sr},${sc}`]);

    // On place les gemmes sur des cases libres non occupées
    const gemCount = _randInt(
        profile.minGems,
        Math.min(profile.maxGems, floors.length - nonBlue.length - 1)
    );
    let placed = 0;
    for (const [r, c] of floors) {
        if (placed >= gemCount) break;
        const key = `${r},${c}`;
        if (usedKeys.has(key)) continue;
        grid[r][c] = '.'; usedKeys.add(key); placed++;
    }
    if (placed < profile.minGems) return null;

    const meta = { width: w, height: h, start: { row: sr, col: sc }, ghosts: {} };

    if (hasBlue) {
        // Le fantôme bleu commence sur un portail aléatoire
        const [pr, pc] = portals[_randInt(0, portals.length - 1)];
        meta.ghosts.blue = { row: pr, col: pc };
    }
    // On place les fantômes non-bleus le plus loin possible du départ
    const freeFloors = floors
        .filter(([r, c]) => !usedKeys.has(`${r},${c}`))
        .sort((a, b) => _manhattan(b, [sr,sc]) - _manhattan(a, [sr,sc]));
    for (let i = 0; i < nonBlue.length && i < freeFloors.length; i++)
        meta.ghosts[nonBlue[i]] = { row: freeFloors[i][0], col: freeFloors[i][1] };

    const text = serializeLevel(meta, grid);
    if (!validateLevelStructure(meta, grid).ok) return null;
    return { text, gemCount: placed, ghosts: Object.keys(meta.ghosts).length };
}

// ── Profils de difficulté ────────────────────────────────────────────────────

const PROFILES = {
    easy: {
        label: 'EASY',
        minGems: 8,  maxGems: 14,
        minMoves: 1, maxMoves: 60,
        maxAttempts: 40,  // Nombre max d'essais avant d'abandonner
        timeBudget:  0,   // 0 = mode premier-valide (pas de time-based)
        desc: 'No ghosts · 8-14 gems · short path',
    },
    medium: {
        label: 'MEDIUM',
        minGems: 14, maxGems: 22,
        minMoves: 1, maxMoves: 80,
        maxAttempts: 40,
        timeBudget:  0,
        desc: '1 red ghost · 14-22 gems · moderate path',
    },
    hard: {
        label: 'HARD',
        minGems: 18, maxGems: 28,
        minMoves: 1, maxMoves: 100,
        maxAttempts: 40,
        timeBudget:  0,
        desc: '2 ghosts · 18-28 gems · long path',
    },
    impossible: {
        label: 'IMPOSSIBLE',
        minGems:  20, maxGems: 28,
        minMoves: 15, maxMoves: 500,
        maxAttempts: 0,
        timeBudget: 14000,  // 14 secondes : on garde le niveau le plus difficile trouvé
        desc: '4 ghosts + portails · 20-28 gemmes · 15 s pour forger le chemin le plus difficile',
    },
};

let currentDiff = 'medium'; // Difficulté sélectionnée par l'utilisateur
let lastMap    = null;       // Dernière carte générée et validée
let lastResult = null;       // Résultat du solveur pour cette carte

// ── Récupération d'un niveau (binaire C → repli JS) ──────────────────────────

// On mémorise si le binaire C est indisponible pour éviter des appels réseau inutiles
let _cGenUnavailable = false;

/**
 * Génère un candidat de niveau.
 * Priorité : POST api/generate.php → binaire C (DFS Recursive Backtracker).
 * Repli :    système de plans JS    → si le binaire n'est pas compilé.
 * Retourne { text, gemCount, ghosts } ou null en cas d'échec.
 */
async function fetchLevel(diff) {
    // ── Essai via l'API du générateur C ──
    if (!_cGenUnavailable) {
        try {
            const resp = await fetch('api/generate.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ diff, csrf_token: window.CSRF_TOKEN }),
            });
            const data = await resp.json();

            if (resp.status === 503 || data.error === 'generator_unavailable') {
                // Le binaire n'est pas compilé : on bascule définitivement sur le JS
                _cGenUnavailable = true;
            } else if (data.ok && data.map) {
                const { meta, grid } = parseLevelText(data.map);
                if (validateLevelStructure(meta, grid).ok) {
                    return { text: data.map, gemCount: countGems(grid), ghosts: countGhostTypes(meta) };
                }
            }
        } catch (_) {
            /* Erreur réseau — on tombe sur le repli JS */
        }
    }

    // ── Repli JS avec plans prédéfinis ──
    return _tryBuildLevelJS(diff);
}

// ── Aperçu (canvas — même logique de rendu que game.js) ───────────────────────

const PREVIEW_CELL = 36; // Taille d'une case dans l'aperçu (légèrement plus petit que le jeu)

const GHOST_SPRITE = {
    red:    'img/fantomeRougeImmobile.png',
    green:  'img/fantomeVertImmobile.png',
    yellow: 'img/fantomeJauneImmobile.png',
    blue:   'img/fantomeBleuImmobile.png',
};

/** Dessine une case sur le canvas d'aperçu — miroir de game._drawWall / game._drawTile. */
function _drawPreviewTile(ctx, g, r, c, rows, cols) {
    const S  = PREVIEW_CELL;
    const BD = Math.max(2, Math.round(S / 14)); // Épaisseur des bordures de mur
    const x  = c * S, y = r * S;
    const ch = g[r][c];

    if (ch === '#') {
        // Rendu de mur (identique à game._drawWall mais sans les pixels décoratifs)
        ctx.fillStyle = '#27446B';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#3a5f8c';          // Arrête lumineuse
        ctx.fillRect(x, y, S, BD);
        ctx.fillRect(x, y, BD, S);          // Arrête gauche
        ctx.fillStyle = '#162c4a';           // Ombre basse
        ctx.fillRect(x, y + S - BD, S, BD);
        ctx.fillRect(x + S - BD, y, BD, S); // Ombre droite
        // Lisière dorée sur les bords face à une case ouverte
        ctx.fillStyle = '#E0B95A';
        if (r > 0      && g[r - 1][c] !== '#') ctx.fillRect(x,         y,         S, 2);
        if (r < rows-1 && g[r + 1][c] !== '#') ctx.fillRect(x,         y + S - 2, S, 2);
        if (c > 0      && g[r][c - 1] !== '#') ctx.fillRect(x,         y,         2, S);
        if (c < cols-1 && g[r][c + 1] !== '#') ctx.fillRect(x + S - 2, y,         2, S);
        return;
    }

    // Fond de case libre
    ctx.fillStyle = '#0a1a3a';
    ctx.fillRect(x, y, S, S);
    ctx.fillStyle = 'rgba(39,68,107,0.35)';
    ctx.fillRect(x + 1, y + 1, S - 2, S - 2);

    const cx = x + S / 2, cy = y + S / 2;

    if (ch === '.') {
        // Pièce dorée (statique, sans animation de rotation)
        const gw = Math.round(S * 0.20);
        const gh = Math.round(S * 0.38);
        ctx.shadowColor = 'rgba(224,185,90,0.65)';
        ctx.shadowBlur  = 6;
        ctx.fillStyle = '#8B603F';
        ctx.fillRect(cx - gw,     cy - gh / 2 - 1, gw * 2,     gh + 2);
        ctx.fillStyle = '#E0B95A';
        ctx.fillRect(cx - gw + 1, cy - gh / 2,     gw * 2 - 2, gh);
        ctx.shadowBlur  = 0;
        ctx.fillStyle = '#8B603F';
        ctx.fillRect(cx - 1,      cy - gh / 2 + 2, 2,           gh - 4);
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(cx - gw + 2, cy - gh / 2 + 1, 2,           2);

    } else if (ch === '*') {
        // Portail (statique, sans animation de pulsation)
        const rad = S * 0.30;
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
        grad.addColorStop(0,   'rgba(91,61,145,0.85)');
        grad.addColorStop(0.6, 'rgba(91,61,145,0.25)');
        grad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = 'rgba(102,230,255,0.9)';
        ctx.shadowBlur  = 8;
        ctx.strokeStyle = '#66E6FF';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, S * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

// Génère et affiche le canvas d'aperçu du niveau dans la div #genPreview
function renderPreview(text) {
    const el = document.getElementById('genPreview');
    const { meta: m, grid: g } = parseLevelText(text);
    const rows = g.length;
    const cols = g[0].length;
    const S    = PREVIEW_CELL;

    const canvas = document.createElement('canvas');
    canvas.width  = cols * S;
    canvas.height = rows * S;
    canvas.className = 'gen-canvas';

    const ctx = canvas.getContext('2d');

    // Fond (identique au jeu)
    ctx.fillStyle = '#001440';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Passe 1 : dessin synchrone de toutes les cases
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            _drawPreviewTile(ctx, g, r, c, rows, cols);

    // Passe 2 : superposition des sprites (asynchrone, car les images se chargent)
    const pad = Math.round(S * 0.05);
    function blitSprite(src, col, row) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, col * S + pad, row * S + pad, S - pad * 2, S - pad * 2);
        img.src = src;
    }
    if (m.start) blitSprite('img/chevalier1.png', m.start.col, m.start.row);
    for (const [color, pos] of Object.entries(m.ghosts || {})) {
        if (GHOST_SPRITE[color]) blitSprite(GHOST_SPRITE[color], pos.col, pos.row);
    }

    const wrap = document.createElement('div');
    wrap.className = 'gen-grid-wrap';
    wrap.appendChild(canvas);
    el.innerHTML = '';
    el.appendChild(wrap);
}

// ── Statut ────────────────────────────────────────────────────────────────────

function setStatus(msg, err) {
    const el = document.getElementById('genStatus');
    el.textContent = msg;
    el.className = 'editor-status' + (err ? ' err' : (msg ? ' ok' : ''));
}

// ── Génération ───────────────────────────────────────────────────────────────

// Réinitialise l'UI avant une nouvelle génération
function _resetGeneratorUI(btn, playBtn) {
    btn.disabled = true;
    playBtn.disabled = true;
    document.getElementById('saveGenBtn').disabled = true;
    lastMap = null; lastResult = null;
    document.getElementById('genPreview').innerHTML = '';
    const sr = document.getElementById('genSaveResult');
    if (sr) { sr.textContent = ''; sr.className = 'validation-result'; }
}

// Met à jour l'UI après une génération réussie
function _finishGeneration(candidate, result, profile, attempt, btn, playBtn, label) {
    lastMap    = candidate.text;
    lastResult = result;
    renderPreview(candidate.text);
    const ghostNote = candidate.ghosts > 0
        ? ', ' + candidate.ghosts + ' ghost(s)' + (result.fallback ? ' ⚠ gems-only' : ' ✓ safe')
        : '';
    setStatus((label || profile.label) + ' — ' + candidate.gemCount + ' gems' + ghostNote +
              ', ' + result.moves.length + ' optimal moves (' + attempt + ').');
    playBtn.disabled = false;
    document.getElementById('saveGenBtn').disabled = false;
    btn.disabled = false;
}

// Fonction principale de génération
async function generate() {
    const diff    = currentDiff;
    const profile = PROFILES[diff];
    const btn     = document.getElementById('generateBtn');
    const playBtn = document.getElementById('playBtn');

    _resetGeneratorUI(btn, playBtn);

    const hideParade = window.SolverBridge.showParade(
        document.getElementById('solverOverlay'),
        profile.timeBudget
            ? 'IMPOSSIBLE — forging the ultimate challenge…'
            : profile.label + ' — generating maze…'
    );

    await new Promise(r => setTimeout(r, 40)); // Petite pause pour que l'UI se mette à jour

    // ── Mode IMPOSSIBLE : on garde le niveau le plus difficile pendant le budget de temps ──
    if (profile.timeBudget) {
        const deadline = Date.now() + profile.timeBudget;
        let best     = null;
        let attempts = 0;

        // On injecte un élément d'info en direct dans l'overlay de parade
        const overlayEl = document.getElementById('solverOverlay');
        const parade    = overlayEl.querySelector('.solver-parade');
        let   infoEl    = null;
        if (parade) {
            infoEl = document.createElement('p');
            infoEl.className   = 'parade-progress impossible-info';
            infoEl.textContent = 'Searching…';
            const hint = parade.querySelector('.parade-hint');
            if (hint) parade.insertBefore(infoEl, hint);
            else parade.appendChild(infoEl);
        }

        while (Date.now() < deadline) {
            attempts++;
            const candidate = await fetchLevel(diff);
            if (!candidate) continue;

            // Mise à jour du compteur d'essais en temps réel
            if (infoEl) {
                const tLeft = Math.max(0, deadline - Date.now());
                infoEl.textContent = 'Attempt ' + attempts +
                    (best ? ' · Best: ' + best.result.moves.length + ' moves' : '') +
                    ' · ' + (tLeft / 1000).toFixed(1) + 's left';
            }

            try {
                const result = await window.OmbrequatreEngine.solveViaC(candidate.text, {
                    requireSafe:   true,
                    allowFallback: true,
                });

                if (!result.found) continue;
                const moves = result.moves.length;
                if (moves < profile.minMoves) continue;

                // On garde le niveau avec le plus grand nombre de mouvements optimaux
                if (!best || moves > best.result.moves.length) {
                    best = { candidate, result };
                }
            } catch (_) { /* Timeout ou erreur du solveur — on réessaie */ }
        }

        hideParade();

        if (!best) {
            setStatus('No level generated — try again.', true);
            btn.disabled = false;
            return;
        }

        _finishGeneration(
            best.candidate, best.result, profile, 'best of ' + attempts, btn, playBtn,
            'IMPOSSIBLE (' + best.result.moves.length + ' moves)'
        );
        return;
    }

    // ── Mode normal : on prend le premier niveau valide ──────────────────────
    for (let attempt = 1; attempt <= profile.maxAttempts; attempt++) {
        const candidate = await fetchLevel(diff);
        if (!candidate) continue;

        // Mise à jour du compteur dans l'overlay de parade
        const progressEl = document.querySelector('#paradeProgress');
        if (progressEl) progressEl.textContent = 'Attempt ' + attempt + ' / ' + profile.maxAttempts;

        try {
            const result = await window.OmbrequatreEngine.solveViaC(candidate.text, {
                requireSafe:   candidate.ghosts > 0,
                allowFallback: true,
            });

            if (!result.found) continue;
            const moves = result.moves.length;
            // On vérifie que le nombre de mouvements est dans la plage attendue pour cette difficulté
            if (moves < profile.minMoves || moves > profile.maxMoves) continue;

            hideParade();
            _finishGeneration(candidate, result, profile, 'attempt ' + attempt, btn, playBtn);
            return;
        } catch (_) { /* On réessaie au prochain tour de boucle */ }
    }

    hideParade();
    setStatus('Could not generate a valid level — click Generate again.', true);
    btn.disabled = false;
}

// ── Lecture ───────────────────────────────────────────────────────────────────

// Lance la lecture du niveau généré via sessionStorage
function play() {
    if (!lastMap) return;
    sessionStorage.setItem(STORAGE_KEY, lastMap);
    window.location.href = 'game.php?mode=generated';
}

// ── Sauvegarde du niveau généré dans "Mes Niveaux" ────────────────────────────

async function saveGenLevel() {
    if (!lastMap || !lastResult) return;

    const name = prompt('Name for this level:', PROFILES[currentDiff].label + ' Random');
    if (name === null) return; // Annulé par l'utilisateur

    const btn = document.getElementById('saveGenBtn');
    const resultEl = document.getElementById('genSaveResult');
    btn.disabled = true;
    btn.textContent = 'SAVING…';
    if (resultEl) { resultEl.textContent = ''; resultEl.className = 'validation-result'; }

    try {
        const resp = await fetch('api/save_level.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                csrf_token:    window.CSRF_TOKEN,
                name:          name.trim() || 'Random Level',
                map:           lastMap,
                solution:      lastResult.moves ? lastResult.moves.join('') : '',
                optimal_moves: lastResult.moves ? lastResult.moves.length : 0,
                ghost_safe:    !lastResult.fallback,
            }),
        });
        const data = await resp.json();

        if (data.ok) {
            btn.textContent = 'SAVED ✓';
            if (resultEl) {
                resultEl.innerHTML = '✓ Saved as "' + (name || 'Random Level') + '" · <a href="my_levels.php">View My Levels</a>';
                resultEl.className = 'validation-result ok';
            }
        } else {
            btn.textContent = 'SAVE TO MY LEVELS';
            btn.disabled = false;
            if (resultEl) {
                resultEl.textContent = data.error || 'Save failed.';
                resultEl.className = 'validation-result err';
            }
        }
    } catch (err) {
        btn.textContent = 'SAVE TO MY LEVELS';
        btn.disabled = false;
        if (resultEl) {
            resultEl.textContent = 'Network error: ' + err.message;
            resultEl.className = 'validation-result err';
        }
    }
}

// ── Initialisation ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generateBtn').addEventListener('click', generate);
    document.getElementById('playBtn').addEventListener('click', play);
    document.getElementById('saveGenBtn').addEventListener('click', saveGenLevel);

    // Branchement des boutons de sélection de difficulté
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDiff = btn.dataset.diff;
            // On met à jour la description de la difficulté sélectionnée
            document.getElementById('diffDesc').textContent = PROFILES[currentDiff].desc;
            // On réinitialise l'état de la génération précédente
            lastMap    = null;
            lastResult = null;
            document.getElementById('playBtn').disabled = true;
            document.getElementById('saveGenBtn').disabled = true;
            document.getElementById('genPreview').innerHTML = '';
            setStatus('');
        });
    });

    // Description initiale de la difficulté par défaut (medium)
    document.getElementById('diffDesc').textContent = PROFILES[currentDiff].desc;
    setStatus('Choose a difficulty then click "Generate".');
});

})();
