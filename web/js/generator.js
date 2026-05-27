/**
 * Random level generator — C-backed maze generation, solver-verified.
 *
 * Approach: POST to api/generate.php which calls the compiled C generator
 * (solver/generator.exe / solver/generator).  The C binary uses a DFS
 * Recursive Backtracker to produce unique, fully-connected mazes every run.
 * The solver then verifies solvability before the level is shown.
 * allowFallback:true means a gems-only solution is accepted when no ghost-safe
 * path exists — this dramatically improves generation success rate.
 */
(() => {
'use strict';

const { serializeLevel, validateLevelStructure, parseLevelText, countGems, countGhostTypes } = window.LevelUtils;
const STORAGE_KEY = 'ombrequatre_play_map';

// ── JS fallback blueprints (used when C binary is not yet compiled) ──────────
// Pure wall/floor patterns. '_' = floor, '*' = portal for blue ghost.

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
function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function _manhattan(a, b) { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]); }

function _tryBuildLevelJS(diff) {
    const profile  = PROFILES[diff];
    const bp       = BLUEPRINTS[diff][_randInt(0, BLUEPRINTS[diff].length - 1)];
    const grid     = bp.map(row => row.split(''));
    const h = grid.length, w = grid[0].length;

    const floors = [], portals = [];
    for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++) {
            if (grid[r][c] === '_') floors.push([r, c]);
            else if (grid[r][c] === '*') portals.push([r, c]);
        }

    const hasBlue = diff === 'impossible';
    const ghostList = { easy:[], medium:['red'], hard:['red','green'],
                        impossible:['red','green','yellow','blue'] }[diff];
    const nonBlue = ghostList.filter(g => g !== 'blue');

    if (floors.length < profile.minGems + nonBlue.length + 1) return null;
    if (hasBlue && portals.length < 2) return null;

    _shuffle(floors);
    const [sr, sc] = floors[0];
    const usedKeys = new Set([`${sr},${sc}`]);

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
        const [pr, pc] = portals[_randInt(0, portals.length - 1)];
        meta.ghosts.blue = { row: pr, col: pc };
    }
    const freeFloors = floors
        .filter(([r, c]) => !usedKeys.has(`${r},${c}`))
        .sort((a, b) => _manhattan(b, [sr,sc]) - _manhattan(a, [sr,sc]));
    for (let i = 0; i < nonBlue.length && i < freeFloors.length; i++)
        meta.ghosts[nonBlue[i]] = { row: freeFloors[i][0], col: freeFloors[i][1] };

    const text = serializeLevel(meta, grid);
    if (!validateLevelStructure(meta, grid).ok) return null;
    return { text, gemCount: placed, ghosts: Object.keys(meta.ghosts).length };
}

// ── Difficulty profiles ──────────────────────────────────────────────────────

const PROFILES = {
    easy: {
        label: 'EASY',
        minGems: 8,  maxGems: 14,
        minMoves: 1, maxMoves: 60,
        maxAttempts: 40,
        timeBudget:  0,
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
        timeBudget: 14000,  // 14 s — keeps the hardest solvable level found
        desc: '4 ghosts + portails · 20-28 gemmes · 15 s pour forger le chemin le plus difficile',
    },
};

let currentDiff = 'medium';
let lastMap    = null;
let lastResult = null;

// ── Level fetch (C binary → JS fallback) ─────────────────────────────────────

// Set to true once we know the C binary is unavailable, to skip future API calls.
let _cGenUnavailable = false;

/**
 * Produces one raw level candidate.
 * Primary:  POST api/generate.php  → compiled C generator (DFS Recursive Backtracker).
 * Fallback: JS blueprint system    → used if C binary is not yet compiled.
 * Returns { text, gemCount, ghosts } or null on failure.
 */
async function fetchLevel(diff) {
    // ── Try C generator via API ──
    if (!_cGenUnavailable) {
        try {
            const resp = await fetch('api/generate.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ diff, csrf_token: window.CSRF_TOKEN }),
            });
            const data = await resp.json();

            if (resp.status === 503 || data.error === 'generator_unavailable') {
                // Binary not compiled yet — switch permanently to JS fallback
                _cGenUnavailable = true;
            } else if (data.ok && data.map) {
                const { meta, grid } = parseLevelText(data.map);
                if (validateLevelStructure(meta, grid).ok) {
                    return { text: data.map, gemCount: countGems(grid), ghosts: countGhostTypes(meta) };
                }
            }
        } catch (_) {
            /* network error — fall through to JS */
        }
    }

    // ── JS blueprint fallback ──
    return _tryBuildLevelJS(diff);
}

// ── Preview (canvas — same render logic as game.js) ──────────────────────────

const PREVIEW_CELL = 36; // px per tile  (game uses 40; we scale to 36 for fit)

const GHOST_SPRITE = {
    red:    'img/fantomeRougeImmobile.png',
    green:  'img/fantomeVertImmobile.png',
    yellow: 'img/fantomeJauneImmobile.png',
    blue:   'img/fantomeBleuImmobile.png',
};

/** Mirrors game._drawWall / game._drawTile onto a preview canvas. */
function _drawPreviewTile(ctx, g, r, c, rows, cols) {
    const S  = PREVIEW_CELL;
    const BD = Math.max(2, Math.round(S / 14)); // border depth ≈ 2-3 px
    const x  = c * S, y = r * S;
    const ch = g[r][c];

    if (ch === '#') {
        // Wall — matches game._drawWall
        ctx.fillStyle = '#27446B';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#3a5f8c';          // highlight top
        ctx.fillRect(x, y, S, BD);
        ctx.fillRect(x, y, BD, S);          // highlight left
        ctx.fillStyle = '#162c4a';           // shadow bottom
        ctx.fillRect(x, y + S - BD, S, BD);
        ctx.fillRect(x + S - BD, y, BD, S); // shadow right
        // Gold seam where wall meets a walkable neighbour
        ctx.fillStyle = '#E0B95A';
        if (r > 0      && g[r - 1][c] !== '#') ctx.fillRect(x,         y,         S, 2);
        if (r < rows-1 && g[r + 1][c] !== '#') ctx.fillRect(x,         y + S - 2, S, 2);
        if (c > 0      && g[r][c - 1] !== '#') ctx.fillRect(x,         y,         2, S);
        if (c < cols-1 && g[r][c + 1] !== '#') ctx.fillRect(x + S - 2, y,         2, S);
        return;
    }

    // Floor base — matches game._drawTile
    ctx.fillStyle = '#0a1a3a';
    ctx.fillRect(x, y, S, S);
    ctx.fillStyle = 'rgba(39,68,107,0.35)';
    ctx.fillRect(x + 1, y + 1, S - 2, S - 2);

    const cx = x + S / 2, cy = y + S / 2;

    if (ch === '.') {
        // Coin / gem — matches game._drawCoin (static, no time-based wobble)
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
        // Portal — matches game._drawPortal (static)
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

    // Background (same as game: #001440)
    ctx.fillStyle = '#001440';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pass 1 — draw all tiles (synchronous)
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            _drawPreviewTile(ctx, g, r, c, rows, cols);

    // Pass 2 — overlay sprites (async, drawn when images load)
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

// ── Status ───────────────────────────────────────────────────────────────────

function setStatus(msg, err) {
    const el = document.getElementById('genStatus');
    el.textContent = msg;
    el.className = 'editor-status' + (err ? ' err' : (msg ? ' ok' : ''));
}

// ── Generate ─────────────────────────────────────────────────────────────────

function _resetGeneratorUI(btn, playBtn) {
    btn.disabled = true;
    playBtn.disabled = true;
    document.getElementById('saveGenBtn').disabled = true;
    lastMap = null; lastResult = null;
    document.getElementById('genPreview').innerHTML = '';
    const sr = document.getElementById('genSaveResult');
    if (sr) { sr.textContent = ''; sr.className = 'validation-result'; }
}

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

    await new Promise(r => setTimeout(r, 40));

    // ── IMPOSSIBLE: time-based best-of ──────────────────────────────────────
    if (profile.timeBudget) {
        const deadline = Date.now() + profile.timeBudget;
        let best     = null;
        let attempts = 0;

        // Inject a live-info element inside the parade overlay
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

                // Keep only the hardest solvable level (most optimal moves)
                if (!best || moves > best.result.moves.length) {
                    best = { candidate, result };
                }
            } catch (_) { /* solver timeout or error — try again */ }
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

    // ── Normal: first-valid attempt-based ───────────────────────────────────
    for (let attempt = 1; attempt <= profile.maxAttempts; attempt++) {
        const candidate = await fetchLevel(diff);
        if (!candidate) continue;

        const progressEl = document.querySelector('#paradeProgress');
        if (progressEl) progressEl.textContent = 'Attempt ' + attempt + ' / ' + profile.maxAttempts;

        try {
            const result = await window.OmbrequatreEngine.solveViaC(candidate.text, {
                requireSafe:   candidate.ghosts > 0,
                allowFallback: true,
            });

            if (!result.found) continue;
            const moves = result.moves.length;
            if (moves < profile.minMoves || moves > profile.maxMoves) continue;

            hideParade();
            _finishGeneration(candidate, result, profile, 'attempt ' + attempt, btn, playBtn);
            return;
        } catch (_) { /* retry */ }
    }

    hideParade();
    setStatus('Could not generate a valid level — click Generate again.', true);
    btn.disabled = false;
}

// ── Play ─────────────────────────────────────────────────────────────────────

function play() {
    if (!lastMap) return;
    sessionStorage.setItem(STORAGE_KEY, lastMap);
    window.location.href = 'game.php?mode=generated';
}

// ── Save generated level to My Levels ────────────────────────────────────────

async function saveGenLevel() {
    if (!lastMap || !lastResult) return;

    const name = prompt('Name for this level:', PROFILES[currentDiff].label + ' Random');
    if (name === null) return; // cancelled

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

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generateBtn').addEventListener('click', generate);
    document.getElementById('playBtn').addEventListener('click', play);
    document.getElementById('saveGenBtn').addEventListener('click', saveGenLevel);

    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDiff = btn.dataset.diff;
            document.getElementById('diffDesc').textContent = PROFILES[currentDiff].desc;
            lastMap    = null;
            lastResult = null;
            document.getElementById('playBtn').disabled = true;
            document.getElementById('saveGenBtn').disabled = true;
            document.getElementById('genPreview').innerHTML = '';
            setStatus('');
        });
    });

    document.getElementById('diffDesc').textContent = PROFILES[currentDiff].desc;
    setStatus('Choose a difficulty then click "Generate".');
});

})();
