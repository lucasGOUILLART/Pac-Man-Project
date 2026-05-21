/**
 * Manual level designer — walls, size, ghosts, gems, import/export, solver check.
 */
(() => {
'use strict';

const { parseLevelText, serializeLevel, validateLevelStructure, countGems } = window.LevelUtils;

const STORAGE_KEY = 'ombrequatre_play_map';

let width = 11;
let height = 9;
let grid = [];
let meta = { width, height, start: { row: 1, col: 1 }, ghosts: {} };
let tool = 'wall';
let lastValidatedMap = null;
let isPainting = false;

const els = {
    grid: document.getElementById('editorGrid'),
    status: document.getElementById('editorStatus'),
    validation: document.getElementById('validationResult'),
    gemCount: document.getElementById('gemCountDisplay'),
    gemTarget: document.getElementById('gemTargetDisplay'),
    ghostCount: document.getElementById('ghostCountDisplay'),
    validateBtn: document.getElementById('validateBtn'),
    playBtn: document.getElementById('playSkipBtn'),
};

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

function syncMetaSize() {
    meta.width = width;
    meta.height = height;
}

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

function resizeGrid(newW, newH) {
    const next = emptyGrid(newW, newH);
    for (let r = 0; r < Math.min(height, newH); r++) {
        for (let c = 0; c < Math.min(width, newW); c++) {
            next[r][c] = grid[r][c];
        }
    }
    width = newW;
    height = newH;
    grid = next;
    syncMetaSize();
    if (meta.start.row >= height) meta.start.row = 1;
    if (meta.start.col >= width) meta.start.col = 1;
    for (const color of Object.keys(meta.ghosts)) {
        const g = meta.ghosts[color];
        if (g.row >= height || g.col >= width) delete meta.ghosts[color];
    }
    renderGrid();
}

function isWalkableCell(r, c) {
    const ch = grid[r][c];
    return ch !== '#';
}

function paintCell(r, c) {
    switch (tool) {
        case 'wall':
            grid[r][c] = '#';
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
            if (!isWalkableCell(r, c)) return;
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

function scatterGems() {
    const target = Math.max(1, Math.min(30, parseInt(document.getElementById('targetGems').value, 10) || 12));
    const floors = [];
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
    setStatus(`${n} étoile(s) placée(s) sur les couloirs.`);
    updateCounters();
    renderGrid();
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function cellClass(r, c) {
    const ch = grid[r][c];
    const cls = ['cell', `t-${ch === '_' ? 'floor' : ch}`];
    if (meta.start && meta.start.row === r && meta.start.col === c) cls.push('has-knight');
    for (const [color, pos] of Object.entries(meta.ghosts)) {
        if (pos.row === r && pos.col === c) cls.push(`has-ghost-${color}`);
    }
    return cls.join(' ');
}

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
                if (isPainting) paintCell(r, c);
            });
            els.grid.appendChild(cell);
        }
    }
}

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

function getLevelText() {
    if (!meta.start) meta.start = { row: 1, col: 1 };
    syncMetaSize();
    return serializeLevel(meta, grid);
}

function loadFromText(text) {
    const { meta: m, grid: g } = parseLevelText(text);
    width = m.width;
    height = m.height;
    grid = g.map(row => row.slice());
    meta = { width, height, start: m.start || { row: 1, col: 1 }, ghosts: { ...m.ghosts } };
    document.getElementById('gridWidth').value = width;
    document.getElementById('gridHeight').value = height;
    lastValidatedMap = null;
    els.playBtn.disabled = true;
    updateCounters();
    renderGrid();
    setStatus('Niveau importé.');
}

async function validateAndMaybePlay(playAfter) {
    if (!meta.start) {
        setValidation('<p>Placez le chevalier.</p>', false);
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
        const result = await window.SolverBridge.verifyLevel(levelText, {
            requireSafe: hasGhosts,
            allowFallback: true,
            maxTimeMs: 15000,
        });

        if (!result.found) {
            const reasons = {
                no_path: 'Aucun chemin pour tout ramasser.',
                node_limit: 'Labyrinthe trop complexe (limite solveur).',
                time_limit: 'Temps dépassé (15 s) — simplifiez la carte.',
                too_many_coins: 'Trop de gemmes (max 30).',
            };
            setValidation(`<p class="err">${reasons[result.reason] || 'Niveau impossible.'}</p>`, false);
            lastValidatedMap = null;
            els.playBtn.disabled = true;
            return;
        }

        const safeNote = result.fallback
            ? '<p class="warn">⚠ Solution gemmes seulement (pas 100 % sûre vs fantômes).</p>'
            : '<p class="ok">✓ Niveau faisable' + (hasGhosts ? ' en évitant les fantômes' : '') + ` — ${result.moves.length} coups optimaux.</p>`;

        setValidation(safeNote, true);
        lastValidatedMap = levelText;
        els.playBtn.disabled = false;

        if (playAfter) launchPlay();
    } catch (err) {
        setValidation(`<p class="err">${err.message || 'Erreur solveur'}</p>`, false);
    } finally {
        els.validateBtn.disabled = false;
    }
}

function launchPlay() {
    if (!lastValidatedMap) return;
    sessionStorage.setItem(STORAGE_KEY, lastValidatedMap);
    window.location.href = 'game.php?mode=custom';
}

function exportLevel() {
    const text = getLevelText();
    const name = prompt('Nom du niveau (pour le fichier) :', 'mon-niveau');
    if (name === null) return;
    const payload = {
        version: 1,
        name: name || 'mon-niveau',
        map: text,
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name || 'mon-niveau').replace(/[^\w\-]+/g, '_') + '.ombrequatre.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Fichier exporté (.json). Partagez-le avec d’autres joueurs.');
}

function importLevel() {
    document.getElementById('importFile').click();
}

function init() {
    grid = emptyGrid(width, height);
    meta.start = { row: 1, col: 1 };
    syncMetaSize();
    renderGrid();
    updateCounters();

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
        setStatus(`Carte ${w}×${h}.`);
    });

    document.getElementById('borderWallsBtn').addEventListener('click', applyBorderWalls);
    document.getElementById('scatterGemsBtn').addEventListener('click', scatterGems);
    document.getElementById('validateBtn').addEventListener('click', () => validateAndMaybePlay(false));
    document.getElementById('playSkipBtn').addEventListener('click', launchPlay);
    document.getElementById('exportBtn').addEventListener('click', exportLevel);
    document.getElementById('importBtn').addEventListener('click', importLevel);

    document.getElementById('importFile').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const raw = await file.text();
        try {
            if (file.name.endsWith('.json') || raw.trim().startsWith('{')) {
                const data = JSON.parse(raw);
                loadFromText(data.map || data.level || raw);
            } else {
                loadFromText(raw);
            }
        } catch (err) {
            setStatus('Import invalide : ' + err.message, true);
        }
        e.target.value = '';
    });

    document.addEventListener('mouseup', () => { isPainting = false; });
}

document.addEventListener('DOMContentLoaded', init);
})();
