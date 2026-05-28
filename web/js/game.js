/* =========================================================
   Les fantômes d'Ombrequatre — Game Engine (v2)

   CORE RULE — ONE PLAYER DECISION = ONE TURN.

   When the player chooses a direction:
     1. Each ghost makes EXACTLY ONE action (slide on ice until a wall
        or junction, or for the Esprit abyssal: toggle visibility /
        teleport).
     2. The knight slides through cells until a wall or a junction —
        same turn, animated in parallel with the ghosts.
     3. Collision rule (simultaneous): collision occurs if the
        knight's slide path (start cell + every traversed cell + end
        cell) intersects any visible ghost's NEW position.

   So a long slide of 10 cells is still 1 turn; each ghost only acts
   once during that turn. The knight can outrun ghosts on long runs.
   ========================================================= */

(() => {
'use strict';

// =====================================================
// Constants
// =====================================================

const TILE        = 40;
const SLIDE_MS    = 90;
const FREEZE_MS   = 380;

const T = {
    WALL:    '#',
    GEM:     '.',
    POTION:  'o',
    WATCH:   'c',
    PORTAL:  '*',
    EMPTY:   '_',
};

const DELTA = {
    U: { dr: -1, dc:  0 },
    D: { dr:  1, dc:  0 },
    L: { dr:  0, dc: -1 },
    R: { dr:  0, dc:  1 },
};
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };
const ALL_DIRS = ['U', 'D', 'L', 'R'];

const STATE = {
    WAITING:  'waiting',
    SLIDING:  'sliding',
    FROZEN:   'frozen',
    GAMEOVER: 'gameover',
    WIN:      'win',
};

const SCORE = {
    GEM:    10,
    POTION: 50,
    WATCH:  30,
    GHOST:  200,
};

const COMBAT_TURNS         = 10;
const CHRONOS_FREEZE_TURNS = 5;
const GHOST_RESPAWN_TURNS  = 8;

// =====================================================
// Asset loading
// =====================================================

const ASSET_PATHS = {
    knightIdle:      'img/chevalier1.png',
    knightMouth:     'img/chevalier2BoucheCroissant.png',
    knightBigMouth:  'img/chevelierBoicheLarge.png',
    knightMove1:     'img/chevalierMouvement1.png',
    knightMove2:     'img/chevalierMouvement2.png',
    knightAtkBig:    'img/ChevalierAttaqueGrosse.png',
    knightAtkSmall:  'img/chevalierAttaquePetite.png',

    ghostRedCornes:    'img/fantomeRougeCornes.png',
    ghostRedIdle:      'img/fantomeRougeImmobile.png',
    ghostRedMove:      'img/fantomeRougeMouvement.png',
    ghostGreenCornes:  'img/fantomeVertCornes.png',
    ghostGreenIdle:    'img/fantomeVertImmobile.png',
    ghostGreenMove:    'img/fantomeVertMouvement.png',
    ghostYellowCornes: 'img/fantomeJauneCornes.png',
    ghostYellowIdle:   'img/fantomeJauneImmobile.png',
    ghostYellowMove:   'img/fantomeJauneMouvement.png',
    ghostBlueCornes:   'img/fantomeBleuCornes.png',
    ghostBlueIdle:     'img/fantomeBleuImmobile.png',
    ghostBlueMove:     'img/fantomeBleuMouvement.png',

    ghostScared1: 'img/fantomeEffraye1.png',
    ghostScared2: 'img/fantomeEffraye2.png',
    ghostScared3: 'img/fantomeEffraye3.png',
    ghostScared4: 'img/fantomeEffraye4.png',

    ghostFade1: 'img/fantomeDisparition1.png',
    ghostFade2: 'img/fantomeDisparition2.png',
    ghostFade3: 'img/fantomeDisparition3.png',
    ghostFade4: 'img/fantomeDisparition4.png',
};

const imgs = {};
function loadAssets() {
    return Promise.all(Object.entries(ASSET_PATHS).map(([key, src]) =>
        new Promise(resolve => {
            const img = new Image();
            img.onload  = () => { imgs[key] = img; resolve(); };
            img.onerror = () => { imgs[key] = null; resolve(); };
            img.src = src;
        })
    ));
}

// =====================================================
// Level parsing
// =====================================================

function parseLevel(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const meta = {
        width: 0, height: 0,
        start: { row: 0, col: 0 },
        ghosts: {},
    };

    let i = 0;
    while (i < lines.length && lines[i].trim() !== 'MAP') {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length === 0) { i++; continue; }
        switch (parts[0]) {
            case 'W': meta.width  = parseInt(parts[1], 10); break;
            case 'H': meta.height = parseInt(parts[1], 10); break;
            case 'P': meta.start = { row: +parts[1], col: +parts[2] }; break;
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

// =====================================================
// Game class
// =====================================================

class Game {
    constructor(canvas, levelText, options = {}) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.opts   = { ...options, levelText };
        // Strict check: only ON if explicitly true. Default is OFF.
        this.usePowerUps = options.usePowerUps === true;

        const { meta, grid } = parseLevel(levelText);
        this.meta = meta;
        this.grid = grid;

        canvas.width  = meta.width  * TILE;
        canvas.height = meta.height * TILE;

        this.portals = [];
        for (let r = 0; r < meta.height; r++)
            for (let c = 0; c < meta.width; c++)
                if (grid[r][c] === T.PORTAL) this.portals.push([r, c]);

        this.totalGems = 0;
        for (let r = 0; r < meta.height; r++)
            for (let c = 0; c < meta.width; c++)
                if ([T.GEM, T.POTION, T.WATCH].includes(grid[r][c])) this.totalGems++;

        this.player = {
            row: meta.start.row,
            col: meta.start.col,
            dir: null,
            lastDir: null,
            animFrame: 0,
            sx: meta.start.col * TILE,
            sy: meta.start.row * TILE,
        };

        this.ghosts = [];
        if (meta.ghosts.red)    this.ghosts.push(this._makeGhost('red',    meta.ghosts.red));
        if (meta.ghosts.green)  this.ghosts.push(this._makeGhost('green',  meta.ghosts.green));
        if (meta.ghosts.yellow) this.ghosts.push(this._makeGhost('yellow', meta.ghosts.yellow));
        if (meta.ghosts.blue) {
            const g = this._makeGhost('blue', meta.ghosts.blue);
            g.visible = true;
            g.teleportCounter = 0;
            this.ghosts.push(g);
        }

        this.state         = STATE.WAITING;
        this.score         = 0;
        this.gems          = 0;
        this.moves         = 0;
        this.lives         = 3;
        this.startTime     = Date.now();
        this.elapsedSec    = 0;
        this.lastTurnPath  = null;

        this.combatTurns         = 0;
        this.chronosGhostFreeze  = 0;
        this.chronosPlayerFreeze = 0;
        this.pendingChronos      = null;

        this._slideTimer     = null;
        this._ghostAnims     = [];
        this._turnGhostEnds   = null;
        this._playerSliding   = false;
        this._slideOnComplete = null;
        this._frozenTimer = null;
        this._timeTimer   = setInterval(() => this._tickTime(), 1000);

        this._renderLoop = () => { this.render(); this._raf = requestAnimationFrame(this._renderLoop); };
        this._raf = requestAnimationFrame(this._renderLoop);
    }

    _makeGhost(type, pos) {
        return {
            type,
            row: pos.row, col: pos.col,
            startRow: pos.row, startCol: pos.col,
            lastDir: null,
            state: 'normal',
            visible: true,
            respawnIn: 0,
            moveCount: 0,
            animFrame: 0,
            fadeFrame: 0,
            isSliding: false,
            sx: pos.col * TILE,
            sy: pos.row * TILE,
        };
    }

    // -------- Walkability / junctions --------

    cellAt(r, c) {
        if (r < 0 || r >= this.meta.height || c < 0 || c >= this.meta.width) return T.WALL;
        return this.grid[r][c];
    }
    isWalkable(r, c) { return this.cellAt(r, c) !== T.WALL; }

    isJunction(r, c, currentDir) {
        for (const d of ALL_DIRS) {
            if (d === currentDir || d === OPP[currentDir]) continue;
            const { dr, dc } = DELTA[d];
            if (this.isWalkable(r + dr, c + dc)) return true;
        }
        return false;
    }

    availableDirs() {
        const lastDir = this.player.lastDir;
        const reverse = lastDir ? OPP[lastDir] : null;
        return ALL_DIRS.filter(d => {
            if (d === reverse) return false;
            const { dr, dc } = DELTA[d];
            return this.isWalkable(this.player.row + dr, this.player.col + dc);
        });
    }

    /** Full path of the slide (INCLUDES start cell and final cell). */
    _computeSlidePathFrom(r, c, dir) {
        const { dr, dc } = DELTA[dir];
        const path = [[r, c]];
        if (!this.isWalkable(r + dr, c + dc)) return [];
        while (true) {
            r += dr; c += dc;
            path.push([r, c]);
            if (!this.isWalkable(r + dr, c + dc)) break;
            if (this.isJunction(r, c, dir)) break;
        }
        return path;
    }

    _computeSlidePath(dir) {
        return this._computeSlidePathFrom(this.player.row, this.player.col, dir);
    }

    // -------- Input / turn execution --------

    requestSlide(dir) {
        if (this.state !== STATE.WAITING)     return false;
        if (!ALL_DIRS.includes(dir))          return false;
        if (!this.availableDirs().includes(dir)) return false;

        // ==== ONE TURN BEGINS ====
        this.moves++;
        this.player.dir     = dir;
        this.player.lastDir = dir;

        // Tick mode counters
        if (this.combatTurns > 0) {
            this.combatTurns--;
            if (this.combatTurns === 0) {
                this.ghosts.forEach(g => { if (g.state === 'frightened') g.state = 'normal'; });
            }
        }
        if (this.chronosGhostFreeze > 0) this.chronosGhostFreeze--;

        for (const g of this.ghosts) {
            if (g.state === 'defeated') {
                g.respawnIn--;
                if (g.respawnIn <= 0) this._respawnGhost(g);
            }
        }

        this._startTurnSlide(dir);
        return true;
    }

    /** Plan ghost slides without moving them yet; returns animation list + end cells. */
    _planGhostTurn() {
        const anims = [];
        const ends  = [];

        if (this.chronosGhostFreeze > 0) {
            for (const g of this.ghosts) {
                if (g.state === 'defeated' || !g.visible) continue;
                ends.push({ g, r: g.row, c: g.col });
            }
            return { anims, ends };
        }

        for (const g of this.ghosts) {
            if (g.state === 'defeated') continue;

            if (g.type === 'blue') {
                const end = this._simulateBlueGhostEnd(g);
                ends.push({ g, r: end.row, c: end.col, visible: end.visible });
                anims.push({ g, blue: true, end });
                continue;
            }

            const dir = this._pickGhostDirection(g);
            if (!dir) {
                if (g.visible) ends.push({ g, r: g.row, c: g.col });
                continue;
            }
            const path = this._computeSlidePathFrom(g.row, g.col, dir);
            if (path.length < 2) {
                if (g.visible) ends.push({ g, r: g.row, c: g.col });
                continue;
            }
            anims.push({ g, path, dir, stepIdx: 1 });
            const [er, ec] = path[path.length - 1];
            ends.push({ g, r: er, c: ec });
        }
        return { anims, ends };
    }

    _simulateBlueGhostEnd(g) {
        const nextCount = g.teleportCounter + 1;
        if (nextCount % 2 === 0) {
            const idx = this.portals.findIndex(p => p[0] === g.row && p[1] === g.col);
            const next = ((idx >= 0 ? idx : -1) + 1) % this.portals.length;
            return {
                row: this.portals[next][0],
                col: this.portals[next][1],
                visible: true,
            };
        }
        return { row: g.row, col: g.col, visible: false };
    }

    _findFirstCollisionOnEnds(path, ends, startIdx = 0) {
        for (let i = startIdx; i < path.length; i++) {
            const [r, c] = path[i];
            for (const e of ends) {
                if (e.g.state === 'defeated') continue;
                if (e.visible === false) continue;
                // NOTE: do NOT check e.g.visible here — for the blue ghost on a
                // teleport turn the ghost is currently invisible (e.g.visible=false)
                // but WILL be visible at its destination (e.visible=true).
                // e.visible===false (checked above) already handles the invisible case.
                if (e.r === r && e.c === c) return { idx: i, ghost: e.g };
            }
        }
        return null;
    }

    _startTurnSlide(dir, opts = {}) {
        this._stopSlide();
        this._slideOnComplete = opts.onComplete || null;

        const { anims, ends } = this._planGhostTurn();
        this._turnGhostEnds = ends;
        this._ghostAnims = anims;
        for (const a of anims) {
            if (!a.blue) a.g.isSliding = true;
        }

        const path = opts.playerPath ?? this._computeSlidePath(dir);
        this.lastTurnPath = path.length >= 2 ? path : null;
        this._playerSliding = path.length >= 2;

        if (this._playerSliding) {
            const hit = this._findFirstCollisionOnEnds(path, ends);
            this._slidePath    = path;
            this._slideStepIdx = 1;
            this._slideHitIdx  = hit ? hit.idx : -1;

            // SWAP BUG FIX: if the ghost ends at path[0] (the player's START cell),
            // _slideStepIdx starts at 1 and can never equal 0, so the check in
            // _unifiedSlideStep would never fire. Handle it immediately here.
            if (this._slideHitIdx === 0) {
                // Only a true collision if the ghost STARTED in the player's forward
                // direction (head-on swap). A ghost approaching from a perpendicular
                // direction ends up at path[0] AFTER the player has already moved —
                // that is a false positive and must not kill the player.
                const g0 = hit.ghost;
                const { dr, dc } = DELTA[dir];
                const trueSwap =
                    (dc < 0 && g0.row === path[0][0] && g0.col < path[0][1]) ||  // L: ghost was left
                    (dc > 0 && g0.row === path[0][0] && g0.col > path[0][1]) ||  // R: ghost was right
                    (dr < 0 && g0.col === path[0][1] && g0.row < path[0][0]) ||  // U: ghost was above
                    (dr > 0 && g0.col === path[0][1] && g0.row > path[0][0]);    // D: ghost was below

                if (trueSwap) {
                    this._clearTurnSlide();
                    this._loseLife();
                    return;
                }
                // False positive: perpendicular ghost slides into our start cell
                // after we have left. Recalculate collision from path[1] onward.
                const laterHit = this._findFirstCollisionOnEnds(path, ends, 1);
                this._slideHitIdx = laterHit ? laterHit.idx : -1;
            }
        }

        const hasGhostMotion = anims.some(a =>
            !a.done && (a.blue || (a.path && a.stepIdx < a.path.length))
        );
        if (!this._playerSliding && !hasGhostMotion) {
            const done = this._slideOnComplete;
            this._slideOnComplete = null;
            this.state = STATE.WAITING;
            this._clearTurnSlide();
            if (done) done();
            return;
        }

        this.state = STATE.SLIDING;
        this._unifiedSlideStep();
        if (this.state === STATE.SLIDING) {
            this._slideTimer = setInterval(() => this._unifiedSlideStep(), SLIDE_MS);
        }
    }

    _clearTurnSlide() {
        this._ghostAnims = [];
        this._turnGhostEnds = null;
        this._playerSliding = false;
        for (const g of this.ghosts) g.isSliding = false;
    }

    _advanceGhostAnims() {
        let anyActive = false;
        for (const a of this._ghostAnims) {
            if (a.blue) {
                if (a.done) continue;
                this._stepBlueGhost(a.g);
                a.g.animFrame = (a.g.animFrame + 1) % 2;
                a.done = true;
                continue;
            }
            if (a.stepIdx >= a.path.length) continue;
            const [r, c] = a.path[a.stepIdx];
            a.g.row = r;
            a.g.col = c;
            a.g.sx = c * TILE;
            a.g.sy = r * TILE;
            a.g.animFrame = (a.g.animFrame + 1) % 2;
            a.stepIdx++;
            if (a.stepIdx < a.path.length) {
                anyActive = true;
            } else {
                a.g.lastDir = a.dir;
                a.g.isSliding = false;
            }
        }
        return anyActive;
    }

    _unifiedSlideStep() {
        if (this.state !== STATE.SLIDING) return this._stopSlide();

        const ghostsActive = this._advanceGhostAnims();

        let playerActive = false;
        if (this._playerSliding) {
            const path = this._slidePath;
            if (this._slideStepIdx < path.length) {
                playerActive = true;
                const [nr, nc] = path[this._slideStepIdx];
                this.player.row = nr;
                this.player.col = nc;
                this.player.sx  = nc * TILE;
                this.player.sy  = nr * TILE;
                this.player.animFrame = (this.player.animFrame + 1) % 2;
                this._collectItem(nr, nc);

                if (this._slideStepIdx === this._slideHitIdx) {
                    this._handleCollisionAt(nr, nc);
                    if (this.state !== STATE.SLIDING) return;
                } else {
                    if (this.gems >= this.totalGems) {
                        this._finalizeSlide(true);
                        return;
                    }
                    this._slideStepIdx++;
                }
                playerActive = this._playerSliding && this._slideStepIdx < path.length;
            } else {
                this._playerSliding = false;
            }
        }

        if (!ghostsActive && !playerActive) {
            this._finalizeSlide(false);
        }
    }

    _stopSlide() {
        if (this._slideTimer) { clearInterval(this._slideTimer); this._slideTimer = null; }
        this._clearTurnSlide();
    }

    _finalizeSlide(victoryMidSlide) {
        const done = this._slideOnComplete;
        this._slideOnComplete = null;
        this._stopSlide();
        if (this.pendingChronos === 'freeze_player') {
            this.chronosPlayerFreeze = CHRONOS_FREEZE_TURNS;
            this.state = STATE.FROZEN;
            this.pendingChronos = null;
            this._frozenTimer = setInterval(() => this._frozenTick(), FREEZE_MS);
            return;
        }
        this.pendingChronos = null;
        if (victoryMidSlide || this.gems >= this.totalGems) { this._win(); return; }

        // SAFETY NET: after all animation ticks, verify no ghost landed on the
        // player's final cell. Catches any collision that was missed mid-slide
        // (e.g. timing edge-cases, very short paths, ghost-on-destination).
        const dangerGhost = this.ghosts.find(g =>
            g.visible && g.state !== 'defeated' &&
            g.row === this.player.row && g.col === this.player.col
        );
        if (dangerGhost) {
            if (dangerGhost.state === 'frightened') {
                dangerGhost.state     = 'defeated';
                dangerGhost.visible   = false;
                dangerGhost.respawnIn = GHOST_RESPAWN_TURNS;
                dangerGhost.fadeFrame = 0;
                dangerGhost.isSliding = false;
                this.score += SCORE.GHOST;
                // fall through to WAITING — player survives
            } else {
                this._loseLife();
                return;
            }
        }

        if (done) { done(); return; }
        this.state = STATE.WAITING;
    }

    _handleCollisionAt(r, c) {
        const end = this._turnGhostEnds?.find(e =>
            e.visible !== false && e.g.state !== 'defeated' && e.r === r && e.c === c
        );
        const ghost = end?.g ?? this.ghosts.find(g =>
            g.visible && g.state !== 'defeated' && g.row === r && g.col === c
        );

        if (!ghost) {
            this._playerSliding = false;
            if (!this._ghostAnims.some(a => !a.blue && a.stepIdx < a.path.length)) {
                this._finalizeSlide(false);
            }
            return;
        }

        if (ghost.state === 'frightened') {
            ghost.state     = 'defeated';
            ghost.visible   = false;
            ghost.respawnIn = GHOST_RESPAWN_TURNS;
            ghost.fadeFrame = 0;
            ghost.isSliding = false;
            this.score += SCORE.GHOST;
            this._turnGhostEnds = this._turnGhostEnds.filter(e => e.g !== ghost);

            this._slideStepIdx++;
            if (this._slideStepIdx >= this._slidePath.length) {
                this._playerSliding = false;
            } else {
                this._slideHitIdx = -1;
                for (let i = this._slideStepIdx; i < this._slidePath.length; i++) {
                    const [rr, cc] = this._slidePath[i];
                    if (this._findFirstCollisionOnEnds([[rr, cc]], this._turnGhostEnds)) {
                        this._slideHitIdx = i;
                        break;
                    }
                }
            }
            return;
        }

        this._stopSlide();
        this._loseLife();
    }

    _collectItem(r, c) {
        const t = this.grid[r][c];
        if (t === T.GEM) {
            this.grid[r][c] = T.EMPTY;
            this.score += SCORE.GEM;
            this.gems++;
        } else if (t === T.POTION) {
            this.grid[r][c] = T.EMPTY;
            this.score += SCORE.POTION;
            this.gems++;
            if (this.usePowerUps) {
                this.combatTurns = COMBAT_TURNS;
                this.ghosts.forEach(g => { if (g.state === 'normal') g.state = 'frightened'; });
            }
        } else if (t === T.WATCH) {
            this.grid[r][c] = T.EMPTY;
            this.score += SCORE.WATCH;
            this.gems++;
            if (this.usePowerUps) {
                const coin = (this.moves + this.gems) % 2;
                if (coin === 0) this.chronosGhostFreeze = CHRONOS_FREEZE_TURNS;
                else            this.pendingChronos = 'freeze_player';
            }
        }
    }

    _frozenTick() {
        clearInterval(this._frozenTimer);
        this._frozenTimer = null;
        this._startTurnSlide(null, { playerPath: [], onComplete: () => this._finishFrozenTick() });
    }

    _finishFrozenTick() {
        for (const g of this.ghosts) {
            if (g.state === 'defeated') {
                g.respawnIn--;
                if (g.respawnIn <= 0) this._respawnGhost(g);
            }
        }
        const ghost = this.ghosts.find(g =>
            g.visible && g.state !== 'defeated' &&
            g.row === this.player.row && g.col === this.player.col
        );
        if (ghost && ghost.state !== 'frightened') {
            this._loseLife();
            return;
        }
        if (ghost && ghost.state === 'frightened') {
            ghost.state = 'defeated';
            ghost.visible = false;
            ghost.respawnIn = GHOST_RESPAWN_TURNS;
            this.score += SCORE.GHOST;
        }
        this.chronosPlayerFreeze--;
        if (this.chronosPlayerFreeze <= 0) {
            this.state = STATE.WAITING;
        } else {
            this.state = STATE.FROZEN;
            this._frozenTimer = setInterval(() => this._frozenTick(), FREEZE_MS);
        }
    }

    // -------- Ghost movement (ONCE per turn, slides in parallel with knight) --------

    _pickGhostDirection(g) {
        const reverse = g.lastDir ? OPP[g.lastDir] : null;
        let dir = null;

        if (g.type === 'yellow') {
            const pd = this.player.lastDir;
            if (!pd) {
                dir = this._firstAvailable(g, ['U','D','L','R'], reverse);
            } else {
                const target = OPP[pd];
                if (target === reverse) return null;
                const { dr, dc } = DELTA[target];
                if (this.isWalkable(g.row + dr, g.col + dc)) dir = target;
                else return null;
            }
        } else {
            let prio;
            if (g.state === 'frightened') {
                prio = g.type === 'red' ? ['L','U','R','D'] : ['D','R','U','L'];
            } else {
                prio = g.type === 'red' ? ['R','D','L','U'] : ['U','L','D','R'];
            }
            for (const d of prio) {
                if (d === reverse) continue;
                const { dr, dc } = DELTA[d];
                if (this.isWalkable(g.row + dr, g.col + dc)) { dir = d; break; }
            }
            if (!dir && reverse) {
                const { dr, dc } = DELTA[reverse];
                if (this.isWalkable(g.row + dr, g.col + dc)) dir = reverse;
            }
        }
        return dir;
    }

    _firstAvailable(g, prio, reverse) {
        for (const d of prio) {
            if (d === reverse) continue;
            const { dr, dc } = DELTA[d];
            if (this.isWalkable(g.row + dr, g.col + dc)) return d;
        }
        return null;
    }

    _stepBlueGhost(g) {
        g.teleportCounter++;
        if (g.teleportCounter % 2 === 0) {
            const idx = this.portals.findIndex(p => p[0] === g.row && p[1] === g.col);
            const next = ((idx >= 0 ? idx : -1) + 1) % this.portals.length;
            g.row = this.portals[next][0];
            g.col = this.portals[next][1];
            g.sx = g.col * TILE; g.sy = g.row * TILE;
            g.visible = true;
            g.fadeFrame = 0;
        } else {
            g.visible = false;
        }
    }

    _respawnGhost(g) {
        g.row = g.startRow; g.col = g.startCol;
        g.sx = g.col * TILE; g.sy = g.row * TILE;
        g.lastDir = null;
        g.state = this.combatTurns > 0 ? 'frightened' : 'normal';
        g.visible = true;
        g.fadeFrame = 0;
        if (g.type === 'blue') g.teleportCounter = 0;
    }

    _loseLife() {
        this._stopSlide();
        this.lives--;
        if (this.lives <= 0) { this._gameOver(); return; }
        this.player.row = this.meta.start.row;
        this.player.col = this.meta.start.col;
        this.player.sx  = this.player.col * TILE;
        this.player.sy  = this.player.row * TILE;
        this.player.dir = null;
        this.player.lastDir = null;
        this.combatTurns = 0;
        this.chronosGhostFreeze  = 0;
        this.chronosPlayerFreeze = 0;
        this.pendingChronos = null;
        this.ghosts.forEach(g => this._respawnGhost(g));
        this.ghosts.forEach(g => { if (g.state === 'frightened') g.state = 'normal'; });
        this.state = STATE.WAITING;
    }

    _gameOver() {
        this.state = STATE.GAMEOVER;
        this._stopSlide();
        if (this._frozenTimer) { clearInterval(this._frozenTimer); this._frozenTimer = null; }
        if (this._timeTimer)   { clearInterval(this._timeTimer);   this._timeTimer = null; }
        this._dispatchEnd(false);
    }
    _win() {
        this.state = STATE.WIN;
        this._stopSlide();
        if (this._timeTimer) { clearInterval(this._timeTimer); this._timeTimer = null; }
        this._dispatchEnd(true);
    }
    _dispatchEnd(cleared) {
        if (typeof this.opts.onEnd === 'function') {
            this.opts.onEnd({
                cleared, score: this.score, gems: this.gems,
                totalGems: this.totalGems, moves: this.moves, timeSec: this.elapsedSec,
            });
        }
    }
    _tickTime() {
        if (this.state === STATE.GAMEOVER || this.state === STATE.WIN) return;
        this.elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    }

    // =====================================================
    // Rendering
    // =====================================================

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#001440';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let r = 0; r < this.meta.height; r++)
            for (let c = 0; c < this.meta.width; c++)
                this._drawTile(r, c, this.grid[r][c]);

        if (this.lastTurnPath && this.state === STATE.SLIDING) this._drawSlideTrail();
        if (this.state === STATE.WAITING) this._drawAvailableDirs();

        for (const g of this.ghosts) this._drawGhost(g);
        this._drawPlayer();
    }

    _drawTile(r, c, t) {
        const x = c * TILE, y = r * TILE;
        if (t === T.WALL) { this._drawWall(x, y, r, c); return; }

        // Path background — dark blue/black floor
        this.ctx.fillStyle = '#0a1a3a';
        this.ctx.fillRect(x, y, TILE, TILE);
        this.ctx.fillStyle = 'rgba(39, 68, 107, 0.35)';
        this.ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

        const cx = x + TILE / 2, cy = y + TILE / 2;
        if (t === T.GEM)         this._drawCoin(cx, cy);
        else if (t === T.POTION) this._drawPotion(cx, cy);
        else if (t === T.WATCH)  this._drawWatch(cx, cy);
        else if (t === T.PORTAL) this._drawPortal(cx, cy);
    }

    _drawWall(x, y, r, c) {
        const ctx = this.ctx;
        ctx.fillStyle = '#27446B';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3a5f8c';
        ctx.fillRect(x, y, TILE, 4);
        ctx.fillRect(x, y, 4, TILE);
        ctx.fillStyle = '#162c4a';
        ctx.fillRect(x, y + TILE - 4, TILE, 4);
        ctx.fillRect(x + TILE - 4, y, 4, TILE);
        ctx.fillStyle = '#E0B95A';
        if (this.cellAt(r - 1, c) !== T.WALL) ctx.fillRect(x, y + TILE - 2, TILE, 2);
        if (this.cellAt(r + 1, c) !== T.WALL) ctx.fillRect(x, y, TILE, 2);
        if (this.cellAt(r, c - 1) !== T.WALL) ctx.fillRect(x + TILE - 2, y, 2, TILE);
        if (this.cellAt(r, c + 1) !== T.WALL) ctx.fillRect(x, y, 2, TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        const seed = (r * 31 + c * 7) % 8;
        ctx.fillRect(x + 8 + seed, y + 12, 2, 2);
        ctx.fillRect(x + 22, y + 24 - seed, 2, 2);
    }

    _drawCoin(cx, cy) {
        const ctx = this.ctx;
        const t = Date.now() / 400 + cx * 0.02;
        const w = 7 + 0.5 * Math.sin(t);
        ctx.fillStyle = '#8B603F';
        ctx.fillRect(cx - w, cy - 7, w * 2, 14);
        ctx.fillStyle = '#E0B95A';
        ctx.fillRect(cx - w + 1, cy - 6, w * 2 - 2, 12);
        ctx.fillStyle = '#8B603F';
        ctx.fillRect(cx - 1, cy - 4, 2, 8);
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(cx - w + 2, cy - 5, 2, 2);
    }

    _drawPotion(cx, cy) {
        const ctx = this.ctx;
        const t = Date.now() / 300;
        const p = 0.5 + 0.5 * Math.sin(t);
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14);
        g.addColorStop(0, 'rgba(102, 230, 255, 0.9)');
        g.addColorStop(0.5, `rgba(102, 230, 255, ${0.4 * p})`);
        g.addColorStop(1, 'rgba(102, 230, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#66E6FF';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 3, cy);
        ctx.lineTo(cx + 8, cy);
        ctx.lineTo(cx + 3, cy + 2);
        ctx.lineTo(cx, cy + 8);
        ctx.lineTo(cx - 3, cy + 2);
        ctx.lineTo(cx - 8, cy);
        ctx.lineTo(cx - 3, cy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }

    _drawWatch(cx, cy) {
        const ctx = this.ctx;
        ctx.fillStyle = '#5B3D91';
        ctx.fillRect(cx - 8, cy - 8, 16, 16);
        ctx.fillStyle = '#27446B';
        ctx.fillRect(cx - 6, cy - 6, 12, 12);
        const t = Date.now() / 1000;
        ctx.fillStyle = '#E0B95A';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
        const hx = Math.cos(t * 0.5 - Math.PI / 2) * 3;
        const hy = Math.sin(t * 0.5 - Math.PI / 2) * 3;
        ctx.fillRect(cx + Math.round(hx), cy + Math.round(hy), 2, 2);
        const mx = Math.cos(t * 2 - Math.PI / 2) * 5;
        const my = Math.sin(t * 2 - Math.PI / 2) * 5;
        ctx.fillRect(cx + Math.round(mx), cy + Math.round(my), 2, 2);
    }

    _drawPortal(cx, cy) {
        const ctx = this.ctx;
        const t = Date.now() / 600;
        const p = 0.5 + 0.5 * Math.sin(t);
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 16);
        g.addColorStop(0, `rgba(91, 61, 145, ${0.8 + 0.2 * p})`);
        g.addColorStop(0.6, 'rgba(91, 61, 145, 0.3)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(102, 230, 255, ${0.7 + 0.3 * p})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 7 + p * 1.2, 0, Math.PI * 2);
        ctx.stroke();
    }

    _drawSlideTrail() {
        const ctx = this.ctx;
        const path = this.lastTurnPath;
        if (!path) return;
        ctx.fillStyle = 'rgba(224, 185, 90, 0.10)';
        for (const [r, c] of path) {
            ctx.fillRect(c * TILE + 6, r * TILE + 6, TILE - 12, TILE - 12);
        }
    }

    _drawAvailableDirs() {
        const ctx = this.ctx;
        const cx = this.player.col * TILE + TILE / 2;
        const cy = this.player.row * TILE + TILE / 2;
        const t = Date.now() / 350;
        const p = 0.5 + 0.5 * Math.sin(t);
        for (const d of this.availableDirs()) {
            const { dr, dc } = DELTA[d];
            const ax = cx + dc * TILE * 0.55;
            const ay = cy + dr * TILE * 0.55;
            ctx.fillStyle = `rgba(224, 185, 90, ${0.35 + 0.45 * p})`;
            ctx.fillRect(ax - 3, ay - 3, 6, 6);
        }
    }

    _drawPlayer() {
        const ctx = this.ctx;
        const x = this.player.sx, y = this.player.sy;
        let key;
        if (this.combatTurns > 0) {
            key = (Math.floor(Date.now() / 200) % 2 === 0) ? 'knightAtkBig' : 'knightAtkSmall';
        } else if (this.state === STATE.SLIDING) {
            key = this.player.animFrame === 0 ? 'knightMove1' : 'knightMove2';
        } else {
            key = (Math.floor(Date.now() / 300) % 2 === 0) ? 'knightIdle' : 'knightMouth';
        }
        const img = imgs[key];

        ctx.save();
        ctx.translate(x + TILE / 2, y + TILE / 2);
        const angle = { R: 0, D: Math.PI/2, L: Math.PI, U: -Math.PI/2 }[this.player.dir] || 0;
        ctx.rotate(angle);
        if (img) {
            const scale = key.startsWith('knightAtk') ? 1.15 : 1.0;
            const sz = TILE * scale;
            ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        } else {
            ctx.fillStyle = '#E0B95A';
            ctx.beginPath();
            const m = 0.25 + 0.18 * Math.abs(Math.sin(Date.now() / 200));
            ctx.arc(0, 0, TILE * 0.4, m, Math.PI * 2 - m);
            ctx.lineTo(0, 0);
            ctx.fill();
        }
        ctx.restore();

        if (this.chronosPlayerFreeze > 0) {
            const c = Math.floor(Math.sin(Date.now() / 150) * 80) + 175;
            ctx.strokeStyle = `rgb(${c}, 60, 60)`;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        }
    }

    _drawGhost(g) {
        const ctx = this.ctx;
        const x = g.sx, y = g.sy;

        if (g.state === 'defeated') {
            const frame = Math.floor(Date.now() / 120) % 4 + 1;
            const img = imgs[`ghostFade${frame}`];
            if (img) {
                ctx.globalAlpha = 0.6;
                ctx.drawImage(img, x, y, TILE, TILE);
                ctx.globalAlpha = 1.0;
            }
            return;
        }

        if (!g.visible) {
            if (g.type === 'blue') {
                const frame = Math.floor(Date.now() / 120) % 4 + 1;
                const img = imgs[`ghostFade${frame}`];
                if (img) {
                    ctx.globalAlpha = 0.35;
                    ctx.drawImage(img, x, y, TILE, TILE);
                    ctx.globalAlpha = 1.0;
                }
            }
            return;
        }

        let key;
        if (g.state === 'frightened') {
            const frame = Math.floor(Date.now() / 150) % 4 + 1;
            key = `ghostScared${frame}`;
        } else {
            const map = {
                red:    ['ghostRedCornes',    'ghostRedMove'],
                green:  ['ghostGreenCornes',  'ghostGreenMove'],
                yellow: ['ghostYellowCornes', 'ghostYellowMove'],
                blue:   ['ghostBlueCornes',   'ghostBlueMove'],
            };
            const pair = map[g.type];
            if (g.isSliding) {
                key = g.animFrame === 0 ? pair[1] : pair[0];
            } else {
                key = (Math.floor(Date.now() / 300) % 2 === 0) ? pair[0] : pair[1];
            }
        }
        const img = imgs[key];
        if (img) {
            const oversize = key.endsWith('Cornes') ? 1.25 : 1.0;
            const sz = TILE * oversize;
            ctx.drawImage(img, x + (TILE - sz) / 2, y + (TILE - sz) / 2, sz, sz);
        } else {
            const colors = { red: '#FF3B3B', green: '#3BFF66', yellow: '#E0B95A', blue: '#66E6FF' };
            ctx.fillStyle = g.state === 'frightened' ? '#5B3D91' : colors[g.type];
            ctx.beginPath();
            ctx.arc(x + TILE/2, y + TILE/2, TILE * 0.38, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    destroy() {
        this._stopSlide();
        if (this._frozenTimer) clearInterval(this._frozenTimer);
        if (this._timeTimer)   clearInterval(this._timeTimer);
        if (this._raf)         cancelAnimationFrame(this._raf);
    }

}

// =====================================================
// Solution panel — renders the move list with progress marker
// =====================================================

const ARROW = { U: '↑', D: '↓', L: '←', R: '→' };
const ARROW_TXT = { U: 'UP', D: 'DOWN', L: 'LEFT', R: 'RIGHT' };

function renderSolutionPanel(panel, result, opts = {}) {
    const { fromCurrent = false, currentMove = 0 } = opts;
    if (!panel) return;

    if (!result.found) {
        const reasons = {
            no_path:            'No safe path could be found.<br>The Wardens block every route.',
            node_limit:         'Search space too large — solver gave up.',
            time_limit:         'Search timed out — try without ghosts.',
            too_many_coins:     'Too many gems for the optimal solver.',
            no_coins:           'No gems left.',
            solver_error:       'The C solver could not complete this level.',
            solver_unavailable: 'C solver unavailable — build it: cd solver && make',
        };
        panel.innerHTML = `
            <h3>OPTIMAL PATH</h3>
            <p class="sol-empty">${reasons[result.reason] || 'No solution.'}</p>
            <p class="sol-note">Try without power-ups, or replay the level differently.</p>
        `;
        return;
    }

    const moves = result.moves;
    if (moves.length === 0) {
        panel.innerHTML = `
            <h3>OPTIMAL PATH</h3>
            <p class="sol-empty">All gems already collected!</p>
        `;
        return;
    }

    const headerLabel = fromCurrent ? 'HINT FROM HERE' : 'OPTIMAL PATH';
    let ghostNote;
    if (result.ghostsConsidered) {
        ghostNote = '<span class="sol-note safe">✓ Safe vs all 4 wardens</span>';
    } else if (result.fallback) {
        ghostNote = '<span class="sol-note warn">⚠ Gems-only — no 100%-safe path exists</span>';
    } else {
        ghostNote = '<span class="sol-note warn">⚠ Gems-only — ghosts ignored</span>';
    }
    const sourceNote = '<span class="sol-source">⚙ Live solver</span>';

    const items = moves.map((m, i) => {
        const done = i < currentMove;
        const next = i === currentMove;
        const cls  = done ? 'done' : (next ? 'next' : '');
        return `<li class="${cls}"><span class="sol-num">${(i+1).toString().padStart(2,'0')}</span> <span class="sol-arrow">${ARROW[m]}</span> ${ARROW_TXT[m]}</li>`;
    }).join('');

    panel.innerHTML = `
        <h3>${headerLabel}</h3>
        <div class="sol-meta">
            <span><strong>${moves.length}</strong> moves</span>
            <span><strong>${currentMove}</strong> / ${moves.length} done</span>
        </div>
        ${ghostNote}
        ${sourceNote}
        <ol class="sol-list">${items}</ol>
    `;
}


// =====================================================
// UI wiring
// =====================================================

function fmtTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
}
function pad(n, w) { return n.toString().padStart(w, '0'); }

function updateUI(game) {
    document.getElementById('score').textContent = pad(game.score, 6);
    document.getElementById('gems').textContent  = `${pad(game.gems, 2)}/${pad(game.totalGems, 2)}`;
    document.getElementById('lives').innerHTML   = '<span class="life-pip"></span>'.repeat(Math.max(0, game.lives));
    document.getElementById('moves').textContent = pad(game.moves, 3);
    document.getElementById('time').textContent  = fmtTime(game.elapsedSec);

    let modeText = 'STEALTH';
    let modeCls  = '';
    if (game.combatTurns > 0) {
        modeText = `COMBAT × ${game.combatTurns}`;
        modeCls  = 'combat';
    } else if (game.chronosGhostFreeze > 0) {
        modeText = `CHRONOS · GHOSTS ${game.chronosGhostFreeze}`;
        modeCls  = 'chronos-ghost';
    } else if (game.chronosPlayerFreeze > 0) {
        modeText = `CHRONOS · TRAPPED ${game.chronosPlayerFreeze}`;
        modeCls  = 'chronos-player';
    } else if (!game.usePowerUps) {
        modeText = 'NO POWERS';
        modeCls  = 'no-powers';
    }
    const modeEl = document.querySelector('.mode-banner');
    if (modeEl) {
        modeEl.className = 'mode-banner ' + modeCls;
        document.getElementById('modeText').textContent = modeText;
    }

    const available = game.state === 'waiting' ? game.availableDirs() : [];
    document.querySelectorAll('.dir-btn[data-dir]').forEach(btn => {
        const d = btn.dataset.dir;
        const ok = available.includes(d);
        btn.classList.toggle('available', ok);
        btn.disabled = !ok;
    });
}

function showOverlay(game, payload) {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    overlay.className     = 'game-overlay';
    const heading = payload.cleared ? 'VICTORY' : 'GAME OVER';
    const cls     = payload.cleared ? 'victory' : 'defeat';
    const tale    = payload.cleared
        ? `${payload.gems}/${payload.totalGems} relics  ·  ${payload.moves} moves  ·  ${fmtTime(payload.timeSec)}.<br>The princess waits one chamber closer.`
        : `The Lord of Shadows claims another knight.<br>${payload.gems}/${payload.totalGems} relics gathered before the fall.`;
    overlay.innerHTML = `
        <h2 class="${cls}">${heading}</h2>
        <p class="overlay-tale">${tale}</p>
        <p class="overlay-score">SCORE  ${pad(payload.score, 6)}</p>
        <div class="overlay-actions">
            <a href="dashboard.php">ROYAL HALL</a>
            <button id="retryBtn">RETRY</button>
        </div>
    `;
    document.getElementById('retryBtn').onclick = () => location.reload();
}

// =====================================================
// Pre-game modal — toggle power-ups before starting
// =====================================================

function showPreGameModal() {
    return new Promise(resolve => {
        const modal = document.getElementById('preGameModal');
        if (!modal) { resolve({ usePowerUps: true }); return; }
        modal.style.display = 'flex';

        const toggle    = document.getElementById('togglePowerUps');
        const startBtn  = document.getElementById('startBtn');

        startBtn.onclick = () => {
            modal.style.display = 'none';
            resolve({ usePowerUps: toggle.checked });
        };
    });
}

// =====================================================
// Boot
// =====================================================

// =====================================================
// Solver : appel du solveur C via l'endpoint PHP api/solve.php
// =====================================================

/**
 * Resout un niveau en appelant le solveur C (binaire compile) via
 * l'endpoint PHP api/solve.php. Le navigateur ne peut pas executer de
 * C : tout le calcul se fait cote serveur.
 *
 * @param {string} levelText  Niveau au format .txt du projet.
 * @param {object} opts       { requireSafe, allowFallback }
 * @returns {Promise<object>} { found, moves, ghostsConsidered, fallback, reason }
 */
async function solveViaC(levelText, opts = {}) {
    const body = {
        level:         levelText,
        requireSafe:   opts.requireSafe !== false,
        allowFallback: opts.allowFallback === true,
    };
    const resp = await fetch('api/solve.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });
    // L'endpoint renvoie du JSON meme en cas d'erreur (code 4xx/5xx).
    let payload = null;
    try { payload = await resp.json(); } catch (_) {}
    if (payload && typeof payload.found !== 'undefined') return payload;
    return { found: false, moves: [], reason: 'solver_error' };
}

/** Charge la solution optimale initiale via le solveur C. */
function loadOptimalSolution(game, panel) {
    console.log('[Solver] Resolution via le solveur C (api/solve.php)');
    computeSolution(game, panel);
}

/** Calcule et affiche la solution optimale du niveau (depuis le depart). */
function computeSolution(game, panel) {
    panel.innerHTML = `
        <h3>OPTIMAL PATH</h3>
        <p class="sol-empty">Computing via C solver\u2026</p>
    `;

    solveViaC(window.LEVEL_DATA.map, {
        requireSafe:   true,
        allowFallback: true,
    }).then(result => {
        game._initialSolution     = result;
        game._solutionFromCurrent = false;
        renderSolutionPanel(panel, result, { fromCurrent: false, currentMove: 0 });
    }).catch(err => {
        panel.innerHTML = `
            <h3>OPTIMAL PATH</h3>
            <p class="sol-empty">Solver error: ${err && err.message ? err.message : err}</p>
        `;
    });
}

/** Demande un indice depuis la position actuelle du joueur. Serialise
 *  l'etat courant en niveau-texte et le soumet au solveur C, puis met
 *  en surbrillance le prochain coup sur le pave directionnel. */
function requestHintFromHere(game, panel, solverBtn) {
    const originalLabel = solverBtn.textContent;
    solverBtn.disabled = true;
    solverBtn.textContent = 'COMPUTING\u2026';

    panel.innerHTML = `
        <h3>HINT FROM HERE</h3>
        <p class="sol-empty">Computing path from your current position\u2026</p>
    `;

    // Serialise l'etat courant : gemmes deja ramassees retirees de la
    // carte, P repositionne, positions des fantomes mises a jour.
    const customLevel = buildLevelFromCurrent(game);

    solveViaC(customLevel, {
        requireSafe:   true,
        allowFallback: true,
    }).then(result => {
        solverBtn.disabled = false;
        solverBtn.textContent = originalLabel;

        game._solutionFromCurrent = true;
        renderSolutionPanel(panel, result, { fromCurrent: true, currentMove: 0 });

        if (result.found && result.moves.length > 0) {
            const nextMove = result.moves[0];
            document.querySelectorAll('.dir-btn[data-dir]').forEach(b => {
                b.classList.toggle('suggested', b.dataset.dir === nextMove);
            });
            setTimeout(() => {
                document.querySelectorAll('.dir-btn[data-dir]').forEach(b =>
                    b.classList.remove('suggested'));
            }, 3500);
        }
    }).catch(err => {
        solverBtn.disabled = false;
        solverBtn.textContent = originalLabel;
        panel.innerHTML = `
            <h3>HINT FROM HERE</h3>
            <p class="sol-empty">Solver error: ${err && err.message ? err.message : err}</p>
        `;
    });
}

/** Reconstruct a level text from the current game state — used for HINT
 *  FROM HERE. Already-collected gems become '_' in the map, and the player
 *  start (P) is overridden to current position. Ghost start positions are
 *  also overridden to current positions. */
function buildLevelFromCurrent(game) {
    const meta = game.meta;
    const lines = [
        `W ${meta.width}`,
        `H ${meta.height}`,
        `P ${game.player.row} ${game.player.col}`,
    ];
    for (const g of game.ghosts) {
        if (g.state === 'defeated' || !g.visible) continue;
        const tag = { red: 'R', green: 'G', yellow: 'Y', blue: 'B' }[g.type];
        if (tag) lines.push(`${tag} ${g.row} ${g.col}`);
    }
    lines.push('MAP');
    for (let r = 0; r < meta.height; r++) {
        lines.push(game.grid[r].join(''));
    }
    return lines.join('\n');
}


async function boot() {
    if (!window.LEVEL_DATA) { console.error('No LEVEL_DATA'); return; }

    const playMode = window.LEVEL_DATA.mode || 'campaign';
    if (playMode === 'custom' || playMode === 'generated') {
        const stored = sessionStorage.getItem('ombrequatre_play_map');
        if (!stored) {
            window.location.href = playMode === 'custom' ? 'editor.php' : 'generator.php';
            return;
        }
        window.LEVEL_DATA.map = stored;
    }

    await loadAssets();

    // Use power-ups setting from server (session-stored, set in main menu).
    // window.LEVEL_DATA.powerUps is true/false depending on the user's choice.
    const usePowerUps = window.LEVEL_DATA.powerUps === true;
    console.log('[Game] Power-ups mode:', usePowerUps ? 'ON' : 'OFF');

    const canvas = document.getElementById('canvas');
    const game = new Game(canvas, window.LEVEL_DATA.map, {
        usePowerUps,
        onEnd: async (payload) => {
            showOverlay(game, payload);
            if (!window.LEVEL_DATA.id) return;
            try {
                await fetch('api/save_score.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        csrf_token: window.CSRF_TOKEN,
                        level_id:   window.LEVEL_DATA.id,
                        score:      payload.score,
                        gems:       payload.gems,
                        cleared:    payload.cleared,
                        time_sec:   payload.timeSec,
                    }),
                });
            } catch (_) {}
        },
    });
    window._game = game;

    // 3) Load optimal solution via Web Worker
    const gameMain = document.querySelector('.game-main');
    const solutionPanel = document.getElementById('solutionPanel');
    const toggleSolutionsBtn = document.getElementById('toggleSolutionsBtn');
    let solutionsHidden = true;  // hidden by default; player reveals with the button
    const applySolutionsVisibility = () => {
        if (gameMain) {
            gameMain.classList.toggle('solutions-hidden', solutionsHidden);
        }
        if (solutionPanel) {
            solutionPanel.classList.toggle('is-hidden', solutionsHidden);
            solutionPanel.hidden = solutionsHidden;
            solutionPanel.style.display = solutionsHidden ? 'none' : '';
        }
        if (toggleSolutionsBtn) {
            toggleSolutionsBtn.textContent = solutionsHidden ? 'SHOW SOLUTIONS' : 'HIDE SOLUTIONS';
            toggleSolutionsBtn.setAttribute('aria-pressed', solutionsHidden ? 'true' : 'false');
        }
    };
    if (toggleSolutionsBtn) {
        toggleSolutionsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            solutionsHidden = !solutionsHidden;
            applySolutionsVisibility();
        });
    }
    if (solutionPanel) {
        solutionPanel.innerHTML = '<h3>OPTIMAL PATH</h3><p class="sol-empty">Loading solution…</p>';

        loadOptimalSolution(game, solutionPanel);
    }
    applySolutionsVisibility();

    // 4) Keyboard + buttons
    const keyToDir = {
        ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
        w: 'U', s: 'D', a: 'L', d: 'R',
        z: 'U', q: 'L',
    };
    document.addEventListener('keydown', e => {
        const dir = keyToDir[e.key];
        if (!dir) return;
        e.preventDefault();
        const before = game.moves;
        game.requestSlide(dir);
        // After move, advance solution pointer if on track
        setTimeout(() => {
            if (game.moves > before) advanceSolutionMarker(game, dir);
        }, 20);
    });

    document.querySelectorAll('.dir-btn[data-dir]').forEach(btn => {
        btn.addEventListener('click', () => {
            const before = game.moves;
            const dir = btn.dataset.dir;
            game.requestSlide(dir);
            setTimeout(() => {
                if (game.moves > before) advanceSolutionMarker(game, dir);
            }, 20);
        });
    });

    // 5) "Hint from here" button — recompute from current state via Worker
    const solverBtn = document.getElementById('solverBtn');
    if (solverBtn) {
        solverBtn.addEventListener('click', () => {
            if (game.state !== 'waiting') return;
            requestHintFromHere(game, solutionPanel, solverBtn);
        });
    }

    setInterval(() => updateUI(game), 80);
    updateUI(game);
}

/** When the user plays a move, advance the progress marker in the solution
 *  panel if the move matches the next expected move. Otherwise mark the
 *  solution as "off-path" (the user diverged). */
function advanceSolutionMarker(game, playedDir) {
    const panel = document.getElementById('solutionPanel');
    if (!panel || !game._initialSolution || !game._initialSolution.found) return;
    if (game._solutionFromCurrent) return;  // "hint from here" mode

    if (!game._solCursor) game._solCursor = 0;
    const sol = game._initialSolution.moves;

    if (game._solCursor < sol.length && sol[game._solCursor] === playedDir) {
        game._solCursor++;
        renderSolutionPanel(panel, game._initialSolution,
            { fromCurrent: false, currentMove: game._solCursor });
    } else {
        // diverged — overlay a small banner once
        const note = panel.querySelector('.sol-divergence');
        if (!note) {
            const div = document.createElement('div');
            div.className = 'sol-divergence';
            div.textContent = '⚠ Off optimal path — press SOLVER to replan';
            panel.insertBefore(div, panel.firstChild.nextSibling);
        }
    }
}

window.OmbrequatreEngine = { Game, solveViaC };

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('canvas')) return;
    boot();
});

})();