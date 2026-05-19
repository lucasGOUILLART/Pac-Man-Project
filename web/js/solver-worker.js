/* =========================================================
   Les fantômes d'Ombrequatre — Solver Web Worker
   Runs the BFS in a background thread so the UI never blocks.

   Protocol:
     Worker receives: { id, type: 'solve', level, opts }
     Worker sends:    { id, type: 'progress', nodes, elapsedMs }   (occasional)
                      { id, type: 'done', result }
                      { id, type: 'error', message }

   The level is a plain text string (same format as the server). The worker
   parses it itself so the main thread doesn't need to.
   ========================================================= */
'use strict';

// ----- Constants (mirror game.js) -----
const T_WALL = '#';
const T_GEM = '.', T_POTION = 'o', T_WATCH = 'c', T_PORTAL = '*';
const COINS = new Set([T_GEM, T_POTION, T_WATCH]);
const ALL_DIRS = ['U', 'D', 'L', 'R'];
const DELTA = {
    U: { dr: -1, dc:  0 },
    D: { dr:  1, dc:  0 },
    L: { dr:  0, dc: -1 },
    R: { dr:  0, dc:  1 },
};
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };

// ----- Level parsing -----
function parseLevel(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const meta = { width: 0, height: 0, start: { row: 0, col: 0 }, ghosts: {} };
    let i = 0;
    while (i < lines.length && lines[i].trim() !== 'MAP') {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length === 0) { i++; continue; }
        switch (parts[0]) {
            case 'W': meta.width  = parseInt(parts[1], 10); break;
            case 'H': meta.height = parseInt(parts[1], 10); break;
            case 'P': meta.start  = { row: +parts[1], col: +parts[2] }; break;
            case 'R': meta.ghosts.red    = { row: +parts[1], col: +parts[2] }; break;
            case 'G': meta.ghosts.green  = { row: +parts[1], col: +parts[2] }; break;
            case 'Y': meta.ghosts.yellow = { row: +parts[1], col: +parts[2] }; break;
            case 'B': meta.ghosts.blue   = { row: +parts[1], col: +parts[2] }; break;
        }
        i++;
    }
    i++;
    const grid = [];
    for (let r = 0; r < meta.height; r++) {
        const row = (lines[i + r] || '').padEnd(meta.width, '#');
        grid.push(row.split('').slice(0, meta.width));
    }
    return { meta, grid };
}

// ----- Helpers operating on a parsed level -----
function walkable(grid, h, w, r, c) {
    if (r < 0 || r >= h || c < 0 || c >= w) return false;
    return grid[r][c] !== T_WALL;
}

function isJunction(grid, h, w, r, c, dir) {
    for (const d of ALL_DIRS) {
        if (d === dir || d === OPP[dir]) continue;
        const { dr, dc } = DELTA[d];
        if (walkable(grid, h, w, r + dr, c + dc)) return true;
    }
    return false;
}

function computeSlidePathFrom(grid, h, w, r, c, dir) {
    const { dr, dc } = DELTA[dir];
    const path = [[r, c]];
    if (!walkable(grid, h, w, r + dr, c + dc)) return path;
    while (true) {
        r += dr; c += dc;
        path.push([r, c]);
        if (!walkable(grid, h, w, r + dr, c + dc)) break;
        if (isJunction(grid, h, w, r, c, dir)) break;
    }
    return path;
}

// Precompute trajectories for red/green/blue (player-independent)
function precomputeGhosts(grid, meta, maxTurns) {
    const traj = {};
    const portals = [];
    for (let r = 0; r < meta.height; r++)
        for (let c = 0; c < meta.width; c++)
            if (grid[r][c] === T_PORTAL) portals.push([r, c]);

    for (const type of ['red', 'green', 'blue']) {
        if (!meta.ghosts[type]) continue;
        let r = meta.ghosts[type].row;
        let c = meta.ghosts[type].col;
        let lastDir = null, visible = true, teleCount = 0;
        const path = [{ r, c, visible: true }];

        for (let t = 1; t <= maxTurns; t++) {
            if (type === 'blue') {
                teleCount++;
                if (teleCount % 2 === 0) {
                    let idx = -1;
                    for (let i = 0; i < portals.length; i++) {
                        if (portals[i][0] === r && portals[i][1] === c) { idx = i; break; }
                    }
                    const next = ((idx >= 0 ? idx : -1) + 1) % (portals.length || 1);
                    if (portals.length) {
                        r = portals[next][0]; c = portals[next][1];
                    }
                    visible = true;
                } else {
                    visible = false;
                }
            } else {
                const reverse = lastDir ? OPP[lastDir] : null;
                const prio = type === 'red' ? ['R','D','L','U'] : ['U','L','D','R'];
                let dir = null;
                for (const d of prio) {
                    if (d === reverse) continue;
                    const { dr, dc } = DELTA[d];
                    if (walkable(grid, meta.height, meta.width, r + dr, c + dc)) {
                        dir = d; break;
                    }
                }
                if (!dir && reverse) {
                    const { dr, dc } = DELTA[reverse];
                    if (walkable(grid, meta.height, meta.width, r + dr, c + dc)) dir = reverse;
                }
                if (dir) {
                    const slide = computeSlidePathFrom(grid, meta.height, meta.width, r, c, dir);
                    if (slide.length >= 2) {
                        const end = slide[slide.length - 1];
                        r = end[0]; c = end[1];
                        lastDir = dir;
                    }
                }
            }
            path.push({ r, c, visible });
        }
        traj[type] = path;
    }
    return traj;
}

function stepYellow(grid, h, w, yr, yc, yLastDir, playerLastDir) {
    if (!playerLastDir || playerLastDir === '_') {
        const reverse = yLastDir !== '_' ? OPP[yLastDir] : null;
        for (const d of ALL_DIRS) {
            if (d === reverse) continue;
            const slide = computeSlidePathFrom(grid, h, w, yr, yc, d);
            if (slide.length >= 2) {
                const end = slide[slide.length - 1];
                return { r: end[0], c: end[1], lastDir: d };
            }
        }
        return { r: yr, c: yc, lastDir: yLastDir };
    }
    const target = OPP[playerLastDir];
    const reverse = yLastDir !== '_' ? OPP[yLastDir] : null;
    if (target === reverse) return { r: yr, c: yc, lastDir: yLastDir };
    const slide = computeSlidePathFrom(grid, h, w, yr, yc, target);
    if (slide.length < 2) return { r: yr, c: yc, lastDir: yLastDir };
    const end = slide[slide.length - 1];
    return { r: end[0], c: end[1], lastDir: target };
}

// ----- Main solver -----
function solve(levelText, opts, postProgress) {
    const { meta, grid } = parseLevel(levelText);
    const h = meta.height, w = meta.width;

    const maxTurns = opts.maxTurns || 150;
    const maxNodes = opts.maxNodes || 8_000_000;     // generous in worker
    const maxTimeMs = opts.maxTimeMs || 30_000;       // 30 s budget
    const requireSafe = opts.requireSafe !== false;

    // Coin index
    const coinPositions = [];
    const coinIndex = new Map();
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            if (COINS.has(grid[r][c])) {
                coinIndex.set(r + ',' + c, coinPositions.length);
                coinPositions.push([r, c]);
            }
        }
    }
    const nCoins = coinPositions.length;
    if (nCoins === 0) return { found: true, moves: [], ghostsConsidered: requireSafe, reason: 'no_coins' };
    if (nCoins > 30)  return { found: false, moves: [], ghostsConsidered: requireSafe, reason: 'too_many_coins' };
    const startMask = (1 << nCoins) - 1;

    const ghostTraj = requireSafe ? precomputeGhosts(grid, meta, maxTurns + 1) : null;
    const hasYellow = requireSafe && meta.ghosts.yellow;
    const startYR = hasYellow ? meta.ghosts.yellow.row : -1;
    const startYC = hasYellow ? meta.ghosts.yellow.col : -1;
    const startYD = '_';

    const simulateSlide = (r, c, dir, mask) => {
        const { dr, dc } = DELTA[dir];
        if (!walkable(grid, h, w, r + dr, c + dc)) return null;
        const path = [[r, c]];
        let nr = r, nc = c, nmask = mask;
        while (true) {
            nr += dr; nc += dc;
            path.push([nr, nc]);
            const ci = coinIndex.get(nr + ',' + nc);
            if (ci !== undefined) nmask &= ~(1 << ci);
            if (!walkable(grid, h, w, nr + dr, nc + dc)) break;
            if (isJunction(grid, h, w, nr, nc, dir)) break;
        }
        return { r: nr, c: nc, mask: nmask, path };
    };

    const pathSafe = (path, turn, yr, yc) => {
        if (!requireSafe || !ghostTraj) return true;
        if (turn >= maxTurns) return false;
        for (const type of ['red', 'green', 'blue']) {
            const traj = ghostTraj[type];
            if (!traj) continue;
            const pos = traj[turn];
            if (!pos || !pos.visible) continue;
            for (let i = 0; i < path.length; i++) {
                if (path[i][0] === pos.r && path[i][1] === pos.c) return false;
            }
        }
        if (hasYellow && yr >= 0) {
            for (let i = 0; i < path.length; i++) {
                if (path[i][0] === yr && path[i][1] === yc) return false;
            }
        }
        return true;
    };

    const stateKey = (r, c, d, mask, turn, yr, yc, yd) => {
        if (!requireSafe) return mask + ':' + r + ',' + c + ':' + d;
        if (!hasYellow)   return mask + ':' + r + ',' + c + ':' + d + ':' + turn;
        return mask + ':' + r + ',' + c + ':' + d + ':' + turn + ':' + yr + ',' + yc + ':' + yd;
    };

    const visited = new Map();
    const nodes = [{
        r: meta.start.row, c: meta.start.col, d: '_', mask: startMask, turn: 0,
        yr: startYR, yc: startYC, yd: startYD,
        parent: -1, move: null,
    }];
    const queue = [0];
    visited.set(stateKey(meta.start.row, meta.start.col, '_', startMask, 0, startYR, startYC, startYD), 0);
    let head = 0;

    const startedAt = performance.now();
    let foundIdx = -1;
    let timedOut = false;
    let nodeCounter = 0;
    let lastProgressAt = startedAt;

    while (head < queue.length && nodes.length < maxNodes) {
        // Check budget every 4096 nodes
        if ((nodeCounter++ & 0xFFF) === 0) {
            const now = performance.now();
            if (now - startedAt > maxTimeMs) { timedOut = true; break; }
            // Send progress every ~250ms
            if (now - lastProgressAt > 250) {
                postProgress({ nodes: nodes.length, elapsedMs: now - startedAt });
                lastProgressAt = now;
            }
        }

        const idx = queue[head++];
        const node = nodes[idx];
        if (node.mask === 0) { foundIdx = idx; break; }

        const reverse = node.d !== '_' ? OPP[node.d] : null;
        for (const d of ALL_DIRS) {
            if (d === reverse) continue;
            const result = simulateSlide(node.r, node.c, d, node.mask);
            if (!result) continue;
            const nextTurn = node.turn + 1;

            let nyr = node.yr, nyc = node.yc, nyd = node.yd;
            if (hasYellow && node.yr >= 0) {
                const ys = stepYellow(grid, h, w, node.yr, node.yc, node.yd, d);
                nyr = ys.r; nyc = ys.c; nyd = ys.lastDir;
            }

            if (!pathSafe(result.path, nextTurn, nyr, nyc)) continue;

            const k = stateKey(result.r, result.c, d, result.mask, nextTurn, nyr, nyc, nyd);
            if (visited.has(k)) continue;
            visited.set(k, nodes.length);
            queue.push(nodes.length);
            nodes.push({
                r: result.r, c: result.c, d, mask: result.mask, turn: nextTurn,
                yr: nyr, yc: nyc, yd: nyd,
                parent: idx, move: d,
            });
        }
    }

    if (foundIdx === -1) {
        let reason;
        if (timedOut)                      reason = 'time_limit';
        else if (nodes.length >= maxNodes) reason = 'node_limit';
        else                               reason = 'no_path';
        return {
            found: false, moves: [], ghostsConsidered: requireSafe, reason,
            nodes: nodes.length, elapsedMs: performance.now() - startedAt,
        };
    }
    const moves = [];
    let cur = foundIdx;
    while (nodes[cur].parent !== -1) {
        moves.push(nodes[cur].move);
        cur = nodes[cur].parent;
    }
    moves.reverse();
    return {
        found: true, moves, ghostsConsidered: requireSafe, reason: null,
        nodes: nodes.length, elapsedMs: performance.now() - startedAt,
    };
}

// ----- Worker message handler -----
self.onmessage = function (e) {
    const msg = e.data || {};
    const id = msg.id || 0;

    if (msg.type !== 'solve') {
        self.postMessage({ id, type: 'error', message: 'Unknown message type' });
        return;
    }

    try {
        const postProgress = (data) => {
            self.postMessage({ id, type: 'progress', ...data });
        };

        // First try with the requested safety
        let result = solve(msg.level, msg.opts || {}, postProgress);

        // Automatic fallback: if safe BFS failed for solvable reasons, retry without ghosts
        const needsFallback = !result.found && (
            result.reason === 'time_limit' ||
            result.reason === 'node_limit' ||
            result.reason === 'no_path'
        );
        if (needsFallback && (msg.opts || {}).requireSafe !== false && (msg.opts || {}).allowFallback !== false) {
            const fallback = solve(msg.level, { ...(msg.opts || {}), requireSafe: false }, postProgress);
            if (fallback.found) {
                fallback.fallback = true;
                fallback.originalReason = result.reason;
                result = fallback;
            }
        }

        self.postMessage({ id, type: 'done', result });
    } catch (err) {
        self.postMessage({ id, type: 'error', message: err && err.message ? err.message : String(err) });
    }
};
