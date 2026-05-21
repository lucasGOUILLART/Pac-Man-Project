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

    _findFirstCollisionOnEnds(path, ends) {
        for (let i = 0; i < path.length; i++) {
            const [r, c] = path[i];
            for (const e of ends) {
                if (e.g.state === 'defeated') continue;
                if (e.visible === false) continue;
                if (!e.g.visible) continue;
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
        if (done) { done(); return; }
        this.state = STATE.WAITING;
    }

    _handleCollisionAt(r, c) {
        const end = this._turnGhostEnds?.find(e =>
            e.g.visible && e.g.state !== 'defeated' && e.r === r && e.c === c
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

    // =====================================================
    // Solver — BFS safe-path (avoids R, G, B trajectories)
    // Yellow's behavior depends on player choices, so it is
    // ignored by the solver (and we display this in the UI).
    // =====================================================

    /**
     * Pre-compute ghost positions for the next maxTurns turns.
     * Returns: { red: [{r,c,visible}], green: [...], blue: [...] }
     * Index 0 = starting position (turn 0, before any player move).
     * Index t = position AFTER t ghost moves.
     */
    _precomputeGhosts(maxTurns) {
        const trajectories = {};
        const types = ['red', 'green', 'blue'];

        for (const type of types) {
            const ghost = this.ghosts.find(x => x.type === type);
            if (!ghost) continue;

            let r = ghost.startRow, c = ghost.startCol;
            let lastDir = null, visible = true, teleCount = 0;
            const traj = [{ r, c, visible: true }];

            for (let t = 1; t <= maxTurns; t++) {
                if (type === 'blue') {
                    teleCount++;
                    if (teleCount % 2 === 0) {
                        // Re-appear at next portal
                        const idx = this.portals.findIndex(p => p[0] === r && p[1] === c);
                        const next = ((idx >= 0 ? idx : -1) + 1) % this.portals.length;
                        r = this.portals[next][0];
                        c = this.portals[next][1];
                        visible = true;
                    } else {
                        visible = false;
                    }
                } else {
                    // Red / Green: priority list
                    const reverse = lastDir ? OPP[lastDir] : null;
                    const prio = type === 'red'
                        ? ['R', 'D', 'L', 'U']
                        : ['U', 'L', 'D', 'R'];
                    let dir = null;
                    for (const d of prio) {
                        if (d === reverse) continue;
                        const { dr, dc } = DELTA[d];
                        if (this.isWalkable(r + dr, c + dc)) { dir = d; break; }
                    }
                    if (!dir && reverse) {
                        const { dr, dc } = DELTA[reverse];
                        if (this.isWalkable(r + dr, c + dc)) dir = reverse;
                    }
                    if (dir) {
                        const slide = this._computeSlidePathFrom(r, c, dir);
                        if (slide.length >= 2) {
                            const end = slide[slide.length - 1];
                            r = end[0]; c = end[1];
                            lastDir = dir;
                        }
                    }
                }
                traj.push({ r, c, visible });
            }
            trajectories[type] = traj;
        }
        return trajectories;
    }

    /**
     * Compute the safe-path solution.
     *
     * @param opts.fromCurrent  If true, start from the knight's current
     *                          position, current last_dir, current grid,
     *                          and turn=this.moves.  Otherwise, start
     *                          from the level's initial state.
     * @param opts.maxTurns     Max turns the BFS will explore (default 80).
     * @param opts.maxNodes     Max nodes (default 1M).
     * @param opts.requireSafe  If true, refuse to traverse cells occupied
     *                          by ghosts. If false, ignore ghosts entirely
     *                          (gem-only BFS — old behavior, kept as fallback).
     * @returns { found, moves, ghostsConsidered, reason } where moves is an
     *          array of 'U'/'D'/'L'/'R'.
     */
    solvePath(opts = {}) {
        const fromCurrent = opts.fromCurrent === true;
        const maxTurns    = opts.maxTurns || 100;
        const maxNodes    = opts.maxNodes || 2_500_000;
        const maxTimeMs   = opts.maxTimeMs || 3000;   // 3s budget by default
        const requireSafe = opts.requireSafe !== false;
        const startedAt   = (typeof performance !== 'undefined' ? performance.now() : Date.now());

        // Build initial state
        let startR, startC, startD, startMask, startTurn;
        let coinPositions = [];   // [r, c] for each coin index
        let coinIndex = {};       // { "r,c" : index }
        let workingGrid;          // grid snapshot

        if (fromCurrent) {
            // From current state
            workingGrid = this.grid.map(row => row.slice());
            startR = this.player.row;
            startC = this.player.col;
            startD = this.player.lastDir || '_';
            startTurn = this.moves;
        } else {
            // From scratch — reconstitute full level
            const { meta, grid } = parseLevel(this.opts.levelText || '');
            workingGrid = grid;
            startR = meta.start.row;
            startC = meta.start.col;
            startD = '_';
            startTurn = 0;
        }

        // Build coin index from the working grid
        for (let r = 0; r < this.meta.height; r++) {
            for (let c = 0; c < this.meta.width; c++) {
                if ([T.GEM, T.POTION, T.WATCH].includes(workingGrid[r][c])) {
                    coinIndex[r + ',' + c] = coinPositions.length;
                    coinPositions.push([r, c]);
                }
            }
        }
        const nCoins = coinPositions.length;
        if (nCoins === 0) {
            return { found: true, moves: [], ghostsConsidered: requireSafe, reason: 'no_coins' };
        }
        if (nCoins > 30) {
            return { found: false, moves: [], ghostsConsidered: requireSafe, reason: 'too_many_coins' };
        }
        startMask = (1 << nCoins) - 1;

        // Pre-compute ghost trajectories if requireSafe (red, green, blue only —
        // their movement does NOT depend on the player)
        let ghostTraj = null;
        if (requireSafe) {
            ghostTraj = this._precomputeGhosts(maxTurns + 1);
        }

        // Yellow ghost (Âme corrompue) is part of the BFS state because its
        // movement depends on the player's last direction.
        const yellowGhost = requireSafe ? this.ghosts.find(g => g.type === 'yellow') : null;
        let startYR = -1, startYC = -1, startYLastDir = '_';
        if (yellowGhost) {
            if (fromCurrent) {
                startYR = yellowGhost.row;
                startYC = yellowGhost.col;
                startYLastDir = yellowGhost.lastDir || '_';
            } else {
                startYR = yellowGhost.startRow;
                startYC = yellowGhost.startCol;
                startYLastDir = '_';
            }
        }

        /** Step the yellow ghost ONCE given the player's last direction.
         *  Returns { r, c, lastDir }. The yellow tries to go OPPOSITE
         *  the player's last direction; stops (no move) if blocked or
         *  if the opposite would be a reverse of its own last direction. */
        const stepYellow = (yr, yc, yLastDir, playerLastDir) => {
            if (playerLastDir === '_' || !playerLastDir) {
                const reverse = yLastDir !== '_' ? OPP[yLastDir] : null;
                for (const d of ALL_DIRS) {
                    if (d === reverse) continue;
                    const slide = this._computeSlidePathFrom(yr, yc, d);
                    if (slide.length >= 2) {
                        const end = slide[slide.length - 1];
                        return { r: end[0], c: end[1], lastDir: d };
                    }
                }
                return { r: yr, c: yc, lastDir: yLastDir };
            }
            const target = OPP[playerLastDir];
            const reverse = yLastDir !== '_' ? OPP[yLastDir] : null;
            if (target === reverse) {
                return { r: yr, c: yc, lastDir: yLastDir };
            }
            const slide = this._computeSlidePathFrom(yr, yc, target);
            if (slide.length < 2) {
                return { r: yr, c: yc, lastDir: yLastDir };
            }
            const end = slide[slide.length - 1];
            return { r: end[0], c: end[1], lastDir: target };
        };

        // Slide simulation (returns { r, c, mask, path } or null if first step is wall)
        const simulateSlide = (r, c, dir, mask) => {
            const { dr, dc } = DELTA[dir];
            if (!this.isWalkable(r + dr, c + dc)) return null;
            const path = [[r, c]];
            let nr = r, nc = c, nmask = mask;
            while (true) {
                nr += dr; nc += dc;
                path.push([nr, nc]);
                const ci = coinIndex[nr + ',' + nc];
                if (ci !== undefined) nmask &= ~(1 << ci);
                if (!this.isWalkable(nr + dr, nc + dc)) break;
                if (this.isJunction(nr, nc, dir)) break;
            }
            return { r: nr, c: nc, mask: nmask, path };
        };

        // Check if path is safe at given turn against red/green/blue (pre-computed)
        // and yellow (passed in explicitly because it depends on the player's last dir)
        const pathSafe = (path, turn, yellowR, yellowC) => {
            if (!requireSafe || !ghostTraj) return true;
            if (turn >= maxTurns) return false;
            // Red, green, blue
            for (const type of ['red', 'green', 'blue']) {
                const traj = ghostTraj[type];
                if (!traj) continue;
                const pos = traj[turn];
                if (!pos || !pos.visible) continue;
                for (const [pr, pc] of path) {
                    if (pr === pos.r && pc === pos.c) return false;
                }
            }
            // Yellow (always visible if present)
            if (yellowGhost && yellowR >= 0) {
                for (const [pr, pc] of path) {
                    if (pr === yellowR && pc === yellowC) return false;
                }
            }
            return true;
        };

        // BFS
        // Key includes yellow position+dir when requireSafe, because the same
        // (r, c, mask, dir, turn) reached via different player histories may
        // have the yellow in different places.
        const visited = new Map();
        const stateKey = (r, c, d, mask, turn, yr, yc, yd) => {
            if (!requireSafe) return `${mask}:${r},${c}:${d}`;
            if (!yellowGhost) return `${mask}:${r},${c}:${d}:${turn}`;
            return `${mask}:${r},${c}:${d}:${turn}:${yr},${yc}:${yd}`;
        };

        const init = {
            r: startR, c: startC, d: startD, mask: startMask, turn: startTurn,
            yr: startYR, yc: startYC, yd: startYLastDir,
            parent: -1, move: null,
        };
        const nodes = [init];
        const queue = [0];
        let head = 0;
        visited.set(stateKey(startR, startC, startD, startMask, startTurn,
                              startYR, startYC, startYLastDir), 0);

        let foundIdx = -1;
        let timedOut = false;
        let nodeCounter = 0;
        while (head < queue.length && nodes.length < maxNodes) {
            // Check time budget every 8192 nodes
            if ((nodeCounter++ & 0x1FFF) === 0) {
                const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                if (now - startedAt > maxTimeMs) { timedOut = true; break; }
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

                // Step yellow ghost given the player's chosen direction `d`
                let nyr = node.yr, nyc = node.yc, nyd = node.yd;
                if (yellowGhost && node.yr >= 0) {
                    const ystep = stepYellow(node.yr, node.yc, node.yd, d);
                    nyr = ystep.r; nyc = ystep.c; nyd = ystep.lastDir;
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
                found: false, moves: [],
                ghostsConsidered: requireSafe,
                reason,
            };
        }
        // Reconstruct
        const moves = [];
        let cur = foundIdx;
        while (nodes[cur].parent !== -1) {
            moves.push(nodes[cur].move);
            cur = nodes[cur].parent;
        }
        moves.reverse();
        return { found: true, moves, ghostsConsidered: requireSafe, reason: null };
    }

    // Convenience hint API — kept for backwards compat
    getHint() {
        const r = this.solvePath({ fromCurrent: true, requireSafe: true });
        if (r.found && r.moves.length > 0) return r.moves[0];
        // Fall back to gem-only BFS if no safe path exists
        const r2 = this.solvePath({ fromCurrent: true, requireSafe: false });
        return r2.found && r2.moves.length > 0 ? r2.moves[0] : null;
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
            no_path:        'No safe path could be found.<br>The Wardens block every route.',
            node_limit:     'Search space too large — solver gave up.',
            time_limit:     'Search timed out — try without ghosts.',
            too_many_coins: 'Too many gems for the optimal solver.',
            no_coins:       'No gems left.',
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
// Solver: Web Worker + server cache integration
// =====================================================

/**
 * Singleton-ish worker pool. We keep one worker alive for the page.
 * Each request gets a unique id so callbacks don't get crossed.
 */
let _worker = null;
let _workerJobId = 0;
const _workerCallbacks = new Map();   // id -> { onProgress, onDone, onError }

function getWorker() {
    if (_worker) return _worker;
    try {
        _worker = new Worker('js/solver-worker.js');
    } catch (err) {
        console.error('Cannot spawn worker', err);
        return null;
    }
    _worker.onmessage = (e) => {
        const m = e.data || {};
        const cb = _workerCallbacks.get(m.id);
        if (!cb) return;
        if (m.type === 'progress' && cb.onProgress) cb.onProgress(m);
        else if (m.type === 'done') {
            cb.onDone && cb.onDone(m.result);
            _workerCallbacks.delete(m.id);
        } else if (m.type === 'error') {
            cb.onError && cb.onError(m.message);
            _workerCallbacks.delete(m.id);
        }
    };
    _worker.onerror = (err) => {
        console.error('Worker error', err);
    };
    return _worker;
}

function solveInWorker(levelText, opts, callbacks) {
    const w = getWorker();
    if (!w) {
        // Worker unavailable: run solver on main thread asynchronously.
        setTimeout(() => {
            try {
                callbacks.onProgress && callbacks.onProgress({ nodes: 0, elapsedMs: 0 });
                const localResult = solveLocally(levelText, opts || {});
                callbacks.onDone && callbacks.onDone(localResult);
            } catch (err) {
                callbacks.onError && callbacks.onError(err && err.message ? err.message : 'Local solver failed');
            }
        }, 0);
        return null;
    }
    const id = ++_workerJobId;
    _workerCallbacks.set(id, callbacks);
    w.postMessage({ id, type: 'solve', level: levelText, opts });
    return id;
}

/** Local fallback solver used when the worker script is not present. */
function solveLocally(levelText, opts = {}) {
    const canvas = document.createElement('canvas');
    const tempGame = new Game(canvas, levelText, { usePowerUps: false });
    try {
        const safe = tempGame.solvePath({
            fromCurrent: false,
            requireSafe: opts.requireSafe !== false,
            maxTimeMs: opts.maxTimeMs || 30_000,
            maxNodes: opts.maxNodes || 8_000_000,
        });
        if (safe.found) {
            return { ...safe, fromCache: false };
        }
        if (opts.allowFallback) {
            const fallback = tempGame.solvePath({
                fromCurrent: false,
                requireSafe: false,
                maxTimeMs: Math.max(5_000, Math.floor((opts.maxTimeMs || 30_000) / 2)),
                maxNodes: Math.max(1_000_000, Math.floor((opts.maxNodes || 8_000_000) / 2)),
            });
            return { ...fallback, fallback: true, fromCache: false };
        }
        return { ...safe, fromCache: false };
    } finally {
        tempGame.destroy();
    }
}

/** Load the initial optimal path using live worker solve only. */
function loadOptimalSolution(game, panel) {
    console.log('[Solver] Live worker solve');
    computeWithWorker(game, panel);
}

function computeWithWorker(game, panel) {
    panel.innerHTML = `
        <h3>OPTIMAL PATH</h3>
        <p class="sol-empty">Computing in background…</p>
        <p class="sol-progress" id="solProgress">0 nodes / 0.0s</p>
    `;

    const progressEl = document.getElementById('solProgress');

    solveInWorker(window.LEVEL_DATA.map, {
        requireSafe: true,
        allowFallback: true,
        maxTimeMs: 30_000,
        maxNodes: 8_000_000,
    }, {
        onProgress: (m) => {
            if (progressEl) {
                progressEl.textContent = `${m.nodes.toLocaleString()} nodes / ${(m.elapsedMs/1000).toFixed(1)}s`;
            }
        },
        onDone: (result) => {
            game._initialSolution = result;
            game._solutionFromCurrent = false;
            renderSolutionPanel(panel, result, { fromCurrent: false, currentMove: 0 });
        },
        onError: (msg) => {
            panel.innerHTML = `
                <h3>OPTIMAL PATH</h3>
                <p class="sol-empty">Solver error: ${msg}</p>
            `;
        },
    });
}

/** Request a hint from the player's current position. Uses the worker
 *  so the UI doesn't block. Highlights the next move on the direction pad. */
function requestHintFromHere(game, panel, solverBtn) {
    // Save original label, show loading state on button
    const originalLabel = solverBtn.textContent;
    solverBtn.disabled = true;
    solverBtn.textContent = 'COMPUTING…';

    panel.innerHTML = `
        <h3>HINT FROM HERE</h3>
        <p class="sol-empty">Computing safe path from your position…</p>
        <p class="sol-progress" id="solProgress">0 nodes / 0.0s</p>
    `;
    const progressEl = document.getElementById('solProgress');

    // Serialize current game state into a "level-from-here" text so the worker
    // can reason from current position. We use the original map (with the
    // already-collected gems removed) and override the start position.
    const customLevel = buildLevelFromCurrent(game);

    solveInWorker(customLevel, {
        requireSafe: true,
        allowFallback: true,
        maxTimeMs: 10_000,
        maxNodes: 4_000_000,
    }, {
        onProgress: (m) => {
            if (progressEl) {
                progressEl.textContent = `${m.nodes.toLocaleString()} nodes / ${(m.elapsedMs/1000).toFixed(1)}s`;
            }
        },
        onDone: (result) => {
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
        },
        onError: (msg) => {
            solverBtn.disabled = false;
            solverBtn.textContent = originalLabel;
            panel.innerHTML = `
                <h3>HINT FROM HERE</h3>
                <p class="sol-empty">Solver error: ${msg}</p>
            `;
        },
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
    let solutionsHidden = false;
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

window.OmbrequatreEngine = { Game, solveLocally };

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('canvas')) return;
    boot();
});

})();
