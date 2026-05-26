/**
 * Procedural medium-difficulty levels (campaign ~5–6), solver-verified ≤15s.
 */
(() => {
'use strict';

const { serializeLevel, validateLevelStructure } = window.LevelUtils;
const STORAGE_KEY = 'ombrequatre_play_map';

const TARGET = {
    minGems: 18,
    maxGems: 26,
    minMoves: 15,
    maxMoves: 28,
    maxAttempts: 24,
};

let lastMap = null;

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/** Carve corridors on a bordered grid (medium density). */
function buildMaze(w, h) {
    const grid = [];
    for (let r = 0; r < h; r++) {
        const row = [];
        for (let c = 0; c < w; c++) row.push('#');
        grid.push(row);
    }

    const floors = [];
    for (let r = 2; r < h - 2; r += 2) {
        for (let c = 2; c < w - 2; c += 2) {
            grid[r][c] = '_';
            floors.push([r, c]);
        }
    }

    const dirs = [[0, 2], [2, 0], [0, -2], [-2, 0]];
    shuffle(floors);
    const stack = floors.length ? [floors[0]] : [];
    const seen = new Set(stack.map(([r, c]) => r + ',' + c));

    while (stack.length) {
        const [r, c] = stack[stack.length - 1];
        const neighbours = [];
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr > 0 && nr < h - 1 && nc > 0 && nc < w - 1 && grid[nr][nc] === '#') {
                neighbours.push([nr, nc, r + dr / 2, c + dc / 2]);
            }
        }
        if (!neighbours.length) {
            stack.pop();
            continue;
        }
        const pick = neighbours[randInt(0, neighbours.length - 1)];
        const [nr, nc, mr, mc] = pick;
        grid[nr][nc] = '_';
        grid[mr][mc] = '_';
        stack.push([nr, nc]);
        seen.add(nr + ',' + nc);
    }

    // Extra openings for wider slides (campaign-like)
    for (let i = 0; i < Math.floor((w * h) / 12); i++) {
        const r = randInt(1, h - 2);
        const c = randInt(1, w - 2);
        if (grid[r][c] === '#') {
            const adj = [[0, 1], [1, 0], [0, -1], [-1, 0]].filter(([dr, dc]) => grid[r + dr]?.[c + dc] === '_');
            if (adj.length) grid[r][c] = '_';
        }
    }

    return grid;
}

function collectFloors(grid, exclude) {
    const out = [];
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
            if (grid[r][c] === '_') {
                const key = r + ',' + c;
                if (!exclude.has(key)) out.push([r, c]);
            }
        }
    }
    return out;
}

function manhattan(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function tryGenerateOnce() {
    const w = randInt(11, 13);
    const h = randInt(9, 11);
    const grid = buildMaze(w, h);
    const floors = collectFloors(grid, new Set());
    if (floors.length < TARGET.minGems + 4) return null;

    shuffle(floors);
    const start = floors[0];
    const meta = {
        width: w,
        height: h,
        start: { row: start[0], col: start[1] },
        ghosts: {},
    };

    const gemCount = randInt(TARGET.minGems, Math.min(TARGET.maxGems, floors.length - 3));
    const used = new Set([start[0] + ',' + start[1]]);
    let placed = 0;
    for (const [r, c] of floors) {
        if (placed >= gemCount) break;
        const key = r + ',' + c;
        if (used.has(key)) continue;
        grid[r][c] = '.';
        used.add(key);
        placed++;
    }

    const ghostTypes = Math.random() < 0.45 ? ['red'] : ['red', 'green'];
    const far = floors
        .filter(([r, c]) => !used.has(r + ',' + c))
        .sort((a, b) => manhattan(b, start) - manhattan(a, start));

    for (let i = 0; i < ghostTypes.length && i < far.length; i++) {
        const [r, c] = far[i];
        meta.ghosts[ghostTypes[i]] = { row: r, col: c };
    }

    const text = serializeLevel(meta, grid);
    const structure = validateLevelStructure(meta, grid);
    if (!structure.ok) return null;

    return { meta, grid, text, gemCount: placed, ghosts: Object.keys(meta.ghosts).length };
}

function renderPreview(text) {
    const el = document.getElementById('genPreview');
    const lines = text.split('\n');
    const mapStart = lines.indexOf('MAP') + 1;
    const mapLines = lines.slice(mapStart, mapStart + 20);
    el.innerHTML = '<pre class="gen-map">' + mapLines.map(l =>
        l.replace(/#/g, '█').replace(/\./g, '★').replace(/_/g, '·')
    ).join('\n') + '</pre>';
}

function setStatus(msg, err) {
    const el = document.getElementById('genStatus');
    el.textContent = msg;
    el.className = 'editor-status' + (err ? ' err' : ' ok');
}

function solveSilent(levelText, requireSafe) {
    return window.OmbrequatreEngine.solveViaC(levelText, {
        requireSafe,
        allowFallback: false,
    });
}

async function generate() {
    const btn = document.getElementById('generateBtn');
    const playBtn = document.getElementById('playBtn');
    btn.disabled = true;
    playBtn.disabled = true;
    lastMap = null;

    const hideParade = window.SolverBridge.showParade(
        document.getElementById('solverOverlay'),
        'The knight tests the labyrinths…'
    );

    await new Promise(r => setTimeout(r, 40));

    for (let attempt = 1; attempt <= TARGET.maxAttempts; attempt++) {
        const candidate = tryGenerateOnce();
        if (!candidate) continue;

        const progressEl = document.querySelector('#paradeProgress');
        if (progressEl) {
            progressEl.textContent = `Attempt ${attempt} / ${TARGET.maxAttempts}`;
        }

        try {
            const result = await solveSilent(candidate.text, candidate.ghosts > 0);
            if (!result.found) continue;
            const moves = result.moves.length;
            if (moves < TARGET.minMoves || moves > TARGET.maxMoves) continue;

            hideParade();
            lastMap = candidate.text;
            renderPreview(candidate.text);
            setStatus(
                `Level ready: ${candidate.gemCount} gems, ${candidate.ghosts} ghost(s), ` +
                `${moves} optimal moves (attempt ${attempt}).`
            );
            playBtn.disabled = false;
            btn.disabled = false;
            return;
        } catch (_) { /* retry */ }
    }

    hideParade();
    setStatus('Could not generate a valid level — click Generate again.', true);
    btn.disabled = false;
}

function play() {
    if (!lastMap) return;
    sessionStorage.setItem(STORAGE_KEY, lastMap);
    window.location.href = 'game.php?mode=generated';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generateBtn').addEventListener('click', generate);
    document.getElementById('playBtn').addEventListener('click', play);
    setStatus('Click "Generate" to create a medium-difficulty maze.');
});

})();