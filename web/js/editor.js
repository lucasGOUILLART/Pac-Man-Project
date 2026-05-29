/**
 * Éditeur de niveaux manuel — murs, taille, fantômes, gemmes, import/export, vérification solveur.
 */
(() => {
'use strict';

// On importe les utilitaires partagés depuis LevelUtils (level-utils.js)
const { parseLevelText, serializeLevel, validateLevelStructure, countGems } = window.LevelUtils;

const STORAGE_KEY = 'ombrequatre_play_map'; // Clé sessionStorage pour passer la carte au jeu

// État global de l'éditeur
let width = 11;   // Largeur initiale de la grille
let height = 9;   // Hauteur initiale de la grille
let grid = [];    // Grille 2D de caractères
let meta = { width, height, start: { row: 1, col: 1 }, ghosts: {} };
let tool = 'wall';              // Outil actif pour le dessin
let lastValidatedMap = null;    // Dernière carte validée par le solveur
let lastValidatedResult = null; // Résultat du solveur pour la carte validée
let isPainting = false;         // True quand le bouton de souris est maintenu enfoncé

// Références aux éléments du DOM fréquemment utilisés
const els = {
    grid: document.getElementById('editorGrid'),
    status: document.getElementById('editorStatus'),
    validation: document.getElementById('validationResult'),
    submitResult: document.getElementById('submitResult'),
    saveResult: document.getElementById('saveResult'),
    gemCount: document.getElementById('gemCountDisplay'),
    gemTarget: document.getElementById('gemTargetDisplay'),
    ghostCount: document.getElementById('ghostCountDisplay'),
    validateBtn: document.getElementById('validateBtn'),
    playBtn: document.getElementById('playSkipBtn'),
    submitBtn: document.getElementById('submitLevelBtn'),
    saveBtn: document.getElementById('saveLevelBtn'),
};

// Identifiant du niveau en cours d'édition (0 = nouveau niveau)
let currentLevelId = 0;

// Crée une grille vide avec des murs sur les bordures et des sols à l'intérieur
function emptyGrid(w, h) {
    const g = [];
    for (let r = 0; r < h; r++) {
        const row = [];
        for (let c = 0; c < w; c++) {
            row.push((r === 0 || c === 0 || r === h - 1 || c === w - 1) ? '#' : '_');
        }
        g.push(row);
    }
    return g;
}

// Synchronise les dimensions dans l'objet meta
function syncMetaSize() {
    meta.width = width;
    meta.height = height;
}

// Remplace toutes les cases de bordure par des murs
function applyBorderWalls() {
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            if (r === 0 || c === 0 || r === height - 1 || c === width - 1) {
                grid[r][c] = '#';
            }
        }
    }
    renderGrid();
}

// Redimensionne la grille en préservant le contenu existant
function resizeGrid(newW, newH) {
    const next = emptyGrid(newW, newH);
    // On copie les cases qui existent dans les deux dimensions
    for (let r = 0; r < Math.min(height, newH); r++) {
        for (let c = 0; c < Math.min(width, newW); c++) {
            next[r][c] = grid[r][c];
        }
    }
    width = newW;
    height = newH;
    grid = next;
    syncMetaSize();
    // On réinitialise les positions hors-limites
    if (meta.start.row >= height) meta.start.row = 1;
    if (meta.start.col >= width) meta.start.col = 1;
    for (const color of Object.keys(meta.ghosts)) {
        const g = meta.ghosts[color];
        if (g.row >= height || g.col >= width) delete meta.ghosts[color];
    }
    renderGrid();
}

// Vérifie si une case est accessible (non-mur)
function isWalkableCell(r, c) {
    const ch = grid[r][c];
    return ch !== '#';
}

// Applique l'outil actif sur la case (r, c) — le cœur de l'interaction de dessin
function paintCell(r, c) {
    switch (tool) {
        case 'wall':
            grid[r][c] = '#';
            // Si on pose un mur sur le départ ou un fantôme, on les supprime
            if (meta.start?.row === r && meta.start?.col === c) meta.start = null;
            for (const color of Object.keys(meta.ghosts)) {
                if (meta.ghosts[color].row === r && meta.ghosts[color].col === c) {
                    delete meta.ghosts[color];
                }
            }
            break;
        case 'floor':
        case 'erase':
            grid[r][c] = '_';
            break;
        case 'gem':
            if (grid[r][c] !== '#') grid[r][c] = '.';
            break;
        case 'portal':
            if (grid[r][c] !== '#') grid[r][c] = '*';
            break;
        case 'knight':
            if (!isWalkableCell(r, c)) return; // Impossible de placer le chevalier sur un mur
            meta.start = { row: r, col: c };
            break;
        case 'ghost-red':
        case 'ghost-green':
        case 'ghost-yellow':
        case 'ghost-blue': {
            if (!isWalkableCell(r, c)) return;
            const color = tool.replace('ghost-', '');
            meta.ghosts[color] = { row: r, col: c };
            break;
        }
    }
    updateCounters();
    renderGrid();
}

// Place automatiquement des gemmes sur des cases libres (éparpillées aléatoirement)
function scatterGems() {
    const target = Math.max(1, Math.min(30, parseInt(document.getElementById('targetGems').value, 10) || 12));
    const floors = [];
    // On collecte les cases libres valides (pas la case de départ, pas une case de fantôme)
    for (let r = 1; r < height - 1; r++) {
        for (let c = 1; c < width - 1; c++) {
            if (grid[r][c] === '_' || grid[r][c] === '.') {
                if (!(meta.start && meta.start.row === r && meta.start.col === c)) {
                    const onGhost = Object.values(meta.ghosts).some(g => g.row === r && g.col === c);
                    if (!onGhost) floors.push([r, c]);
                }
            }
        }
    }
    // On efface d'abord toutes les gemmes existantes
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            if (grid[r][c] === '.') grid[r][c] = '_';
        }
    }
    shuffle(floors);
    const n = Math.min(target, floors.length);
    for (let i = 0; i < n; i++) {
        const [r, c] = floors[i];
        grid[r][c] = '.';
    }
    setStatus(`${n} gem(s) placed on floor tiles.`);
    updateCounters();
    renderGrid();
}

// Algorithme de mélange Fisher-Yates
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// Correspondance caractère → classe CSS pour le style des cases dans la grille
const CELL_TYPE = { '#': 'wall', '_': 'floor', '.': 'gem', 'o': 'potion', 'c': 'watch', '*': 'portal' };

// Calcule les classes CSS d'une case (type + éventuels indicateurs chevalier/fantôme)
function cellClass(r, c) {
    const ch = grid[r][c];
    const cls = ['cell', `t-${CELL_TYPE[ch] || 'floor'}`];
    if (meta.start && meta.start.row === r && meta.start.col === c) cls.push('has-knight');
    for (const [color, pos] of Object.entries(meta.ghosts)) {
        if (pos.row === r && pos.col === c) cls.push(`has-ghost-${color}`);
    }
    return cls.join(' ');
}

// Redessine entièrement la grille dans le DOM
function renderGrid() {
    els.grid.style.gridTemplateColumns = `repeat(${width}, 28px)`;
    els.grid.innerHTML = '';
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = cellClass(r, c);
            cell.dataset.row = String(r);
            cell.dataset.col = String(c);
            cell.setAttribute('aria-label', `Case ${r},${c}`);
            // Étiquette de la case : symboles pour gemme, portail, chevalier, fantôme
            let label = grid[r][c] === '#' ? '' : (grid[r][c] === '.' ? '★' : (grid[r][c] === '*' ? '◎' : ''));
            if (meta.start?.row === r && meta.start.col === c) label = '♞';
            for (const [color, pos] of Object.entries(meta.ghosts)) {
                if (pos.row === r && pos.col === c) {
                    label = { red: 'R', green: 'G', yellow: 'Y', blue: 'B' }[color] || label;
                }
            }
            cell.textContent = label;
            cell.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isPainting = true;
                paintCell(r, c);
            });
            cell.addEventListener('mouseenter', () => {
                if (isPainting) paintCell(r, c); // Peinture continue en maintenant le clic
            });
            els.grid.appendChild(cell);
        }
    }
}

// Met à jour les compteurs de gemmes et de fantômes dans la barre d'outils
function updateCounters() {
    const gems = countGems(grid);
    const ghosts = Object.keys(meta.ghosts).length;
    els.gemCount.textContent = String(gems);
    els.gemTarget.textContent = document.getElementById('targetGems').value;
    els.ghostCount.textContent = String(ghosts);
}

function setStatus(msg, isError) {
    els.status.textContent = msg;
    els.status.className = 'editor-status' + (isError ? ' err' : ' ok');
}

function setValidation(html, ok) {
    els.validation.innerHTML = html;
    els.validation.className = 'validation-result ' + (ok ? 'ok' : 'err');
}

// Sérialise l'état courant de l'éditeur en texte de niveau
function getLevelText() {
    if (!meta.start) meta.start = { row: 1, col: 1 }; // Position de départ par défaut
    syncMetaSize();
    return serializeLevel(meta, grid);
}

// Charge un niveau depuis un texte (import ou chargement en mode édition)
function loadFromText(text) {
    const { meta: m, grid: g } = parseLevelText(text);
    width = m.width;
    height = m.height;
    grid = g.map(row => row.slice());
    meta = { width, height, start: m.start || { row: 1, col: 1 }, ghosts: { ...m.ghosts } };
    document.getElementById('gridWidth').value = width;
    document.getElementById('gridHeight').value = height;
    lastValidatedMap = null; // La validation n'est plus valide après un chargement
    els.playBtn.disabled = true;
    updateCounters();
    renderGrid();
    setStatus('Level imported.');
}

// Lance la validation du niveau par le solveur, et joue si playAfter=true
async function validateAndMaybePlay(playAfter) {
    if (!meta.start) {
        setValidation('<p>Place the knight on the grid first.</p>', false);
        return;
    }
    const check = validateLevelStructure(meta, grid);
    if (!check.ok) {
        setValidation('<ul>' + check.errors.map(e => `<li>${e}</li>`).join('') + '</ul>', false);
        return;
    }

    const levelText = getLevelText();
    const hasGhosts = check.ghostCount > 0;
    els.validateBtn.disabled = true;

    try {
        // On appelle le solveur C via le pont SolverBridge (avec animation de chargement)
        const result = await window.SolverBridge.verifyLevel(levelText, {
            requireSafe: hasGhosts,   // Chemin sûr exigé seulement si il y a des fantômes
            allowFallback: true,
            maxTimeMs: 15000,
        });

        if (!result.found) {
            const reasons = {
                no_path: 'No path to collect all gems.',
                node_limit: 'Maze too complex (solver node limit reached).',
                time_limit: 'Timeout (15 s) — simplify the map.',
                too_many_coins: 'Too many gems (max 30).',
            };
            setValidation(`<p class="err">${reasons[result.reason] || 'Level has no solution.'}</p>`, false);
            lastValidatedMap    = null;
            lastValidatedResult = null;
            els.playBtn.disabled   = true;
            if (els.submitBtn) els.submitBtn.disabled = true;
            if (els.saveBtn)   els.saveBtn.disabled   = true;
            return;
        }

        // Validation réussie : on active les boutons Jouer, Sauvegarder et Soumettre
        const safeNote = result.fallback
            ? '<p class="warn">⚠ Gems-only solution (no 100%-safe path vs ghosts).</p>'
            : '<p class="ok">✓ Level is solvable' + (hasGhosts ? ' while avoiding all ghosts' : '') + ` — ${result.moves.length} optimal moves.</p>`;

        setValidation(safeNote, true);
        lastValidatedMap    = levelText;
        lastValidatedResult = result;
        els.playBtn.disabled   = false;
        if (els.submitBtn) els.submitBtn.disabled = false;
        if (els.saveBtn)   els.saveBtn.disabled   = false;

        if (playAfter) launchPlay();
    } catch (err) {
        setValidation(`<p class="err">${err.message || 'Solver error'}</p>`, false);
    } finally {
        els.validateBtn.disabled = false;
    }
}

// Lance la lecture du niveau validé en passant la carte via sessionStorage
function launchPlay() {
    if (!lastValidatedMap) return;
    sessionStorage.setItem(STORAGE_KEY, lastValidatedMap);
    window.location.href = 'game.php?mode=custom';
}

// Soumet le niveau validé à la campagne communautaire
async function submitLevel() {
    if (!lastValidatedMap || !lastValidatedResult) return;
    const btn = els.submitBtn;
    btn.disabled = true;
    btn.textContent = 'SUBMITTING…';

    const setSubmitResult = (html, ok) => {
        if (els.submitResult) {
            els.submitResult.innerHTML = html;
            els.submitResult.className = 'validation-result ' + (ok ? 'ok' : 'err');
        }
    };

    try {
        const resp = await fetch('api/submit_level.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                csrf_token:    window.CSRF_TOKEN,
                map:           lastValidatedMap,
                solution:      lastValidatedResult.moves ? lastValidatedResult.moves.join('') : '',
                optimal_moves: lastValidatedResult.moves ? lastValidatedResult.moves.length : 0,
                ghost_safe:    !lastValidatedResult.fallback,
            }),
        });
        const data = await resp.json();
        if (data.ok) {
            setSubmitResult(`<p class="ok">✓ Level submitted! ID #${data.level_id} — it will appear in the community campaign.</p>`, true);
            btn.textContent = 'SUBMITTED ✓';
        } else {
            setSubmitResult(`<p class="err">${data.error || 'Submission failed.'}</p>`, false);
            btn.disabled = false;
            btn.textContent = 'SUBMIT TO CAMPAIGN';
        }
    } catch (err) {
        setSubmitResult(`<p class="err">Network error: ${err.message}</p>`, false);
        btn.disabled = false;
        btn.textContent = 'SUBMIT TO CAMPAIGN';
    }
}

// ── Sauvegarde dans "Mes Niveaux" ──────────────────────────────────────────────

async function saveLevel() {
    if (!lastValidatedMap || !lastValidatedResult) return;

    const btn = els.saveBtn;
    const defaultName = window.EDIT_LEVEL?.name || '';
    // On demande un nom à l'utilisateur via une boîte de dialogue native
    const name = prompt('Level name:', defaultName);
    if (name === null) return; // L'utilisateur a annulé

    btn.disabled = true;
    const origLabel = btn.textContent;
    btn.textContent = 'SAVING…';

    if (els.saveResult) {
        els.saveResult.innerHTML = '';
        els.saveResult.className = 'validation-result';
    }

    try {
        const resp = await fetch('api/save_level.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                csrf_token:    window.CSRF_TOKEN,
                id:            currentLevelId || undefined, // Undefined = nouvel insert, sinon update
                name:          name.trim() || 'Sans titre',
                map:           lastValidatedMap,
                solution:      lastValidatedResult.moves ? lastValidatedResult.moves.join('') : '',
                optimal_moves: lastValidatedResult.moves ? lastValidatedResult.moves.length : 0,
                ghost_safe:    !lastValidatedResult.fallback,
            }),
        });
        const data = await resp.json();

        if (data.ok) {
            currentLevelId = data.level_id;
            // On met à jour EDIT_LEVEL pour que les sauvegardes suivantes mettent à jour le même niveau
            if (!window.EDIT_LEVEL) window.EDIT_LEVEL = {};
            window.EDIT_LEVEL.id   = data.level_id;
            window.EDIT_LEVEL.name = name.trim() || 'Sans titre';

            btn.textContent = data.updated ? 'UPDATED ✓' : 'SAVED ✓';
            if (els.saveResult) {
                els.saveResult.innerHTML = `<p class="ok">✓ "${name || 'Sans titre'}" saved to <a href="my_levels.php">My Levels</a>.</p>`;
                els.saveResult.className = 'validation-result ok';
            }
            // On remet le bouton dans son état normal après 2,5 secondes
            setTimeout(() => {
                btn.textContent = 'UPDATE MY LEVEL';
                btn.disabled = false;
            }, 2500);
        } else {
            if (els.saveResult) {
                els.saveResult.innerHTML = `<p class="err">${data.error || 'Save failed.'}</p>`;
                els.saveResult.className = 'validation-result err';
            }
            btn.textContent = origLabel;
            btn.disabled = false;
        }
    } catch (err) {
        if (els.saveResult) {
            els.saveResult.innerHTML = `<p class="err">Network error: ${err.message}</p>`;
            els.saveResult.className = 'validation-result err';
        }
        btn.textContent = origLabel;
        btn.disabled = false;
    }
}

// Exporte la carte en fichier JSON téléchargeable
function exportLevel() {
    const text = getLevelText();
    const name = prompt('Level name (for the file):', 'my-level');
    if (name === null) return;
    const payload = {
        name: name || 'my-level',
        map: text,
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // On génère un nom de fichier propre en remplaçant les caractères spéciaux
    a.download = (name || 'my-level').replace(/[^\w\-]+/g, '_') + '.ombrequatre.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('File exported (.json). Share it with other players.');
}

// Ouvre le sélecteur de fichier pour importer un niveau
function importLevel() {
    document.getElementById('importFile').click();
}

// Initialisation de l'éditeur au chargement de la page
function init() {
    grid = emptyGrid(width, height);
    meta.start = { row: 1, col: 1 };
    syncMetaSize();
    renderGrid();
    updateCounters();

    // Branchement des boutons d'outils
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tool = btn.dataset.tool;
        });
    });

    document.getElementById('applySizeBtn').addEventListener('click', () => {
        const w = parseInt(document.getElementById('gridWidth').value, 10);
        const h = parseInt(document.getElementById('gridHeight').value, 10);
        resizeGrid(w, h);
        setStatus(`Grid resized to ${w}×${h}.`);
    });

    document.getElementById('borderWallsBtn').addEventListener('click', applyBorderWalls);
    document.getElementById('scatterGemsBtn').addEventListener('click', scatterGems);
    document.getElementById('validateBtn').addEventListener('click', () => validateAndMaybePlay(false));
    document.getElementById('playSkipBtn').addEventListener('click', launchPlay);
    document.getElementById('exportBtn').addEventListener('click', exportLevel);
    document.getElementById('importBtn').addEventListener('click', importLevel);
    if (els.submitBtn) els.submitBtn.addEventListener('click', submitLevel);
    if (els.saveBtn)   els.saveBtn.addEventListener('click', saveLevel);

    // Si on est en mode édition (paramètre ?id= dans l'URL), on charge le niveau existant
    if (window.EDIT_LEVEL && window.EDIT_LEVEL.map) {
        currentLevelId = window.EDIT_LEVEL.id || 0;
        loadFromText(window.EDIT_LEVEL.map);
        setStatus('Level loaded — validate to enable saving.');
    }

    // Gestion de l'import par fichier (JSON ou texte brut)
    document.getElementById('importFile').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const raw = await file.text();
        try {
            if (file.name.endsWith('.json') || raw.trim().startsWith('{')) {
                // Fichier JSON : on extrait le champ "map" ou "level"
                const data = JSON.parse(raw);
                loadFromText(data.map || data.level || raw);
            } else {
                // Fichier texte brut : on l'utilise directement
                loadFromText(raw);
            }
        } catch (err) {
            setStatus('Invalid import: ' + err.message, true);
        }
        e.target.value = ''; // On réinitialise l'input pour permettre un nouvel import
    });

    // Fin de la peinture quand le bouton de souris est relâché
    document.addEventListener('mouseup', () => { isPainting = false; });
}

document.addEventListener('DOMContentLoaded', init);
})();
