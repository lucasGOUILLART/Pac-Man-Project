/* =========================================================
 * Les fantômes d'Ombrequatre — Optimal Solver (implementation)
 *
 * Algorithm
 * ---------
 * The knight has the "ice" mechanic: from any rest position, choosing
 * a direction makes it slide cell-by-cell until it hits a WALL or a
 * JUNCTION (a cell where a perpendicular path exists). One slide
 * counts as ONE move regardless of length, and collects every gem
 * along the way. Reversing the previous direction is forbidden.
 *
 * BFS state:  (row, col, last_dir, coin_mask).
 *   - (row, col): rest position
 *   - last_dir:   so we know what "reverse" means
 *   - coin_mask:  bit set for each uncollected gem (bit cleared when picked)
 *
 * Goal: coin_mask == 0.
 *
 * BFS guarantees the optimal (minimum) number of moves to clear the
 * level. We reconstruct the path with parent pointers.
 *
 * State count: H * W * 5 * 2^n_coins. We cap at 30 coins for memory.
 * For typical demo levels (n_coins ~ 20), this is fast enough.
 *
 * ========================================================= */

#include "solver.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

/* Direction deltas */
static const int DR[4] = { -1, +1,  0,  0 }; /* U, D, L, R */
static const int DC[4] = {  0,  0, -1, +1 };
static const kl_dir_t OPP_DIR[5] = {
    KL_DIR_D, KL_DIR_U, KL_DIR_R, KL_DIR_L, KL_DIR_NONE
};
static const char *DIR_NAME[5] = { "UP", "DOWN", "LEFT", "RIGHT", "NONE" };

const char *kl_dir_name(kl_dir_t d) {
    if (d > KL_DIR_NONE) return "?";
    return DIR_NAME[d];
}

/* ---------- Level parsing ---------- */

static bool is_walkable_char(char c) {
    return c == KL_GEM || c == KL_POTION || c == KL_WATCH ||
           c == KL_PORTAL || c == KL_EMPTY;
}

bool kl_parse_level_file(const char *path, kl_level_t *lvl, char *err, size_t err_sz)
{
    FILE *f = fopen(path, "r");
    if (!f) {
        snprintf(err, err_sz, "Cannot open '%s': %s", path, strerror(errno));
        return false;
    }

    memset(lvl, 0, sizeof(*lvl));
    lvl->start_row = -1;
    lvl->ghost_red_r = lvl->ghost_red_c = -1;
    lvl->ghost_green_r = lvl->ghost_green_c = -1;
    lvl->ghost_yellow_r = lvl->ghost_yellow_c = -1;
    lvl->ghost_blue_r = lvl->ghost_blue_c = -1;
    for (int r = 0; r < KL_MAX_H; r++)
        for (int c = 0; c < KL_MAX_W; c++)
            lvl->coin_index[r][c] = -1;

    char line[512];
    bool in_map = false;
    int  map_row = 0;

    while (fgets(line, sizeof(line), f)) {
        /* strip newline */
        size_t L = strlen(line);
        while (L > 0 && (line[L-1] == '\n' || line[L-1] == '\r')) line[--L] = '\0';

        if (!in_map) {
            if (strcmp(line, "MAP") == 0) {
                in_map = true;
                continue;
            }
            int v1, v2;
            char key;
            if (sscanf(line, "%c %d %d", &key, &v1, &v2) >= 2) {
                switch (key) {
                    case 'W': lvl->w = v1; break;
                    case 'H': lvl->h = v1; break;
                    case 'P': lvl->start_row = v1; lvl->start_col = v2; break;
                    case 'R': lvl->ghost_red_r    = v1; lvl->ghost_red_c    = v2; break;
                    case 'G': lvl->ghost_green_r  = v1; lvl->ghost_green_c  = v2; break;
                    case 'Y': lvl->ghost_yellow_r = v1; lvl->ghost_yellow_c = v2; break;
                    case 'B': lvl->ghost_blue_r   = v1; lvl->ghost_blue_c   = v2; break;
                    default: break;
                }
            }
        } else {
            if (map_row >= lvl->h || map_row >= KL_MAX_H) break;
            if ((int)L < lvl->w) {
                /* Pad with walls if line shorter than declared width. */
                memset(line + L, KL_WALL, lvl->w - L);
                line[lvl->w] = '\0';
            }
            for (int c = 0; c < lvl->w; c++) {
                char ch = line[c];
                lvl->grid[map_row][c] = ch;

                if (ch == KL_GEM || ch == KL_POTION || ch == KL_WATCH) {
                    if (lvl->n_coins >= KL_MAX_COINS) {
                        snprintf(err, err_sz,
                            "Too many collectibles (%d max). Reduce or split the level.",
                            KL_MAX_COINS);
                        fclose(f);
                        return false;
                    }
                    lvl->coin_index[map_row][c]      = lvl->n_coins;
                    lvl->coin_rows[lvl->n_coins]     = map_row;
                    lvl->coin_cols[lvl->n_coins]     = c;
                    lvl->n_coins++;
                } else if (ch == KL_PORTAL) {
                    if (lvl->n_portals < 16) {
                        lvl->portal_rows[lvl->n_portals] = map_row;
                        lvl->portal_cols[lvl->n_portals] = c;
                        lvl->n_portals++;
                    }
                }
            }
            map_row++;
        }
    }
    fclose(f);

    if (lvl->w <= 0 || lvl->w > KL_MAX_W ||
        lvl->h <= 0 || lvl->h > KL_MAX_H) {
        snprintf(err, err_sz, "Invalid dimensions (W=%d, H=%d).", lvl->w, lvl->h);
        return false;
    }
    if (map_row < lvl->h) {
        snprintf(err, err_sz, "Map has only %d rows, expected %d.", map_row, lvl->h);
        return false;
    }
    if (lvl->start_row < 0 || lvl->start_col < 0) {
        snprintf(err, err_sz, "No 'P <row> <col>' player start in header.");
        return false;
    }
    if (!is_walkable_char(lvl->grid[lvl->start_row][lvl->start_col])) {
        snprintf(err, err_sz,
            "Player start (%d, %d) is on a non-walkable cell.",
            lvl->start_row, lvl->start_col);
        return false;
    }
    return true;
}

/* ---------- Slide simulation ----------
 *
 * From (r, c) heading `dir`, slide cell-by-cell until the next cell
 * is a wall OR the current cell is a junction (perpendicular path
 * exists) — the cell at which the knight stops is returned via
 * (*nr, *nc). All gems traversed (including the starting cell if it
 * holds a gem? -- no, the start is already at a rest position so
 * its gem was collected on a prior slide) are cleared from the mask.
 *
 * Returns true if at least one cell was traversed (so the move is
 * meaningful); false if the very first step would hit a wall.
 * --------------------------------------------------------------- */

static bool perpendicular_open(const kl_level_t *lvl, int r, int c, kl_dir_t dir) {
    /* Are L/R relative to `dir` open? */
    int d1, d2;
    if (dir == KL_DIR_U || dir == KL_DIR_D) { d1 = KL_DIR_L; d2 = KL_DIR_R; }
    else                                    { d1 = KL_DIR_U; d2 = KL_DIR_D; }

    int r1 = r + DR[d1], c1 = c + DC[d1];
    int r2 = r + DR[d2], c2 = c + DC[d2];

    bool ok1 = (r1 >= 0 && r1 < lvl->h && c1 >= 0 && c1 < lvl->w &&
                lvl->grid[r1][c1] != KL_WALL);
    bool ok2 = (r2 >= 0 && r2 < lvl->h && c2 >= 0 && c2 < lvl->w &&
                lvl->grid[r2][c2] != KL_WALL);
    return ok1 || ok2;
}

static bool slide(const kl_level_t *lvl,
                  int  r, int c, kl_dir_t dir, uint32_t mask_in,
                  int *out_r, int *out_c, uint32_t *out_mask)
{
    int dr = DR[dir], dc = DC[dir];
    int cr = r + dr, cc = c + dc;
    uint32_t mask = mask_in;

    if (cr < 0 || cr >= lvl->h || cc < 0 || cc >= lvl->w) return false;
    if (lvl->grid[cr][cc] == KL_WALL)                     return false;

    /* Slide one cell at a time, picking up coins, until WALL ahead
     * OR current cell is a junction. */
    while (1) {
        /* Pick up coin if any on this cell */
        int ci = lvl->coin_index[cr][cc];
        if (ci >= 0) mask &= ~(1u << ci);

        /* Look ahead: next cell wall? */
        int nr = cr + dr, nc = cc + dc;
        bool next_wall = (nr < 0 || nr >= lvl->h || nc < 0 || nc >= lvl->w ||
                          lvl->grid[nr][nc] == KL_WALL);

        bool junction = perpendicular_open(lvl, cr, cc, dir);

        if (next_wall || junction) break;
        cr = nr; cc = nc;
    }

    *out_r = cr;
    *out_c = cc;
    *out_mask = mask;
    return true;
}

/* ---------- BFS ---------- */

/* State encoding: row * W + col + (dir << bits) + (mask << ...)
 *
 * For a hash table of visited states we use a packed key:
 *   key = (mask << 16) | (row << 10) | (col << 4) | dir
 * (works for W,H <= 64 and dir < 5)
 *
 * We use an open hash with linear probing.
 */

typedef struct {
    uint64_t key;        /* state key (+1 to distinguish empty) */
    int      parent;     /* index of parent node, -1 for root */
    kl_dir_t move;       /* direction taken from parent */
} bfs_node_t;

static uint64_t state_key(int r, int c, kl_dir_t dir, uint32_t mask) {
    return ((uint64_t)mask << 20) |
           ((uint64_t)r    << 13) |
           ((uint64_t)c    << 6)  |
           ((uint64_t)dir  << 3)  | 1ull;
}

/* Reasonable cap. For 30 coins max => 2^30 * grid_cells is too much;
 * in practice we hit a memory-friendly subset because not all states
 * are reachable. Cap at 8M nodes. */
#define BFS_MAX_NODES   (8 * 1024 * 1024)
#define HT_SIZE         (16 * 1024 * 1024)   /* must be power of 2 */

static bfs_node_t *g_nodes;     /* node table         */
static int        *g_queue;     /* BFS queue (indices)*/
static int        *g_ht;        /* hash -> node index, -1 if empty */

static void ht_init(void) { for (int i = 0; i < HT_SIZE; i++) g_ht[i] = -1; }

static int ht_lookup_or_insert(uint64_t key, int new_idx) {
    uint64_t h = key * 11400714819323198485ull; /* Fibonacci hashing */
    int slot = (int)((h >> 28) & (HT_SIZE - 1));
    while (1) {
        int idx = g_ht[slot];
        if (idx == -1) {
            g_ht[slot] = new_idx;
            return -1; /* inserted */
        }
        if (g_nodes[idx].key == key) return idx;
        slot = (slot + 1) & (HT_SIZE - 1);
    }
}

bool kl_solve(const kl_level_t *lvl, kl_solution_t *sol, char *err, size_t err_sz)
{
    memset(sol, 0, sizeof(*sol));

    if (lvl->n_coins == 0) {
        sol->solvable = true;
        sol->n_moves  = 0;
        return true; /* nothing to collect */
    }

    g_nodes = (bfs_node_t *) malloc(sizeof(bfs_node_t) * BFS_MAX_NODES);
    g_queue = (int *)        malloc(sizeof(int)        * BFS_MAX_NODES);
    g_ht    = (int *)        malloc(sizeof(int)        * HT_SIZE);
    if (!g_nodes || !g_queue || !g_ht) {
        snprintf(err, err_sz, "Out of memory for BFS tables.");
        free(g_nodes); free(g_queue); free(g_ht);
        return false;
    }
    ht_init();

    uint32_t full = (lvl->n_coins >= 32) ? 0xFFFFFFFFu
                                         : ((1u << lvl->n_coins) - 1u);

    /* Start state: at player's start, no last direction, all coins remain.
     * NOTE: if the starting cell itself holds a coin, it remains uncollected
     * because the knight has not yet slid through it. */
    int n_nodes = 0;
    int head = 0, tail = 0;

    uint64_t k0 = state_key(lvl->start_row, lvl->start_col, KL_DIR_NONE, full);
    g_nodes[n_nodes].key    = k0;
    g_nodes[n_nodes].parent = -1;
    g_nodes[n_nodes].move   = KL_DIR_NONE;
    ht_lookup_or_insert(k0, n_nodes);
    g_queue[tail++] = n_nodes++;

    int goal_idx = -1;

    while (head < tail) {
        int idx = g_queue[head++];
        uint64_t k = g_nodes[idx].key;

        uint32_t mask  = (uint32_t)(k >> 20);
        int      r     = (int)((k >> 13) & 0x7F);
        int      c     = (int)((k >> 6)  & 0x7F);
        kl_dir_t dir   = (kl_dir_t)((k >> 3) & 0x7);

        if (mask == 0) { goal_idx = idx; break; }

        for (int d = 0; d < 4; d++) {
            if (dir != KL_DIR_NONE && (kl_dir_t)d == OPP_DIR[dir]) continue;

            int nr, nc; uint32_t nmask;
            if (!slide(lvl, r, c, (kl_dir_t)d, mask, &nr, &nc, &nmask)) continue;

            uint64_t nk = state_key(nr, nc, (kl_dir_t)d, nmask);

            if (n_nodes >= BFS_MAX_NODES) {
                snprintf(err, err_sz,
                    "BFS node table exhausted at %d nodes. Level is likely solvable "
                    "but too large for the brute-force optimal solver.", n_nodes);
                free(g_nodes); free(g_queue); free(g_ht);
                return false;
            }

            g_nodes[n_nodes].key    = nk;
            g_nodes[n_nodes].parent = idx;
            g_nodes[n_nodes].move   = (kl_dir_t)d;

            int existing = ht_lookup_or_insert(nk, n_nodes);
            if (existing != -1) continue; /* already known, shorter path */

            g_queue[tail++] = n_nodes++;
        }
    }

    if (goal_idx == -1) {
        sol->solvable = false;
        free(g_nodes); free(g_queue); free(g_ht);
        return true; /* parsed fine, just no solution */
    }

    /* Reconstruct path. */
    kl_dir_t rev[KL_MAX_CELLS];
    int rev_n = 0;
    int cur = goal_idx;
    while (g_nodes[cur].parent != -1) {
        rev[rev_n++] = g_nodes[cur].move;
        cur = g_nodes[cur].parent;
    }
    for (int i = 0; i < rev_n; i++) {
        sol->moves[i] = rev[rev_n - 1 - i];
    }
    sol->n_moves  = rev_n;
    sol->solvable = true;

    free(g_nodes); free(g_queue); free(g_ht);
    return true;
}

/* =========================================================
 * Safe-path solver
 *
 * Pre-computes the trajectories of Scarlet (red), Toxique (green),
 * and Abyssal (blue) ghosts for the next KL_SAFE_MAX_TURNS turns,
 * then performs BFS where each candidate slide must not traverse
 * any visible ghost's NEW position at the corresponding turn.
 *
 * Yellow (Corrupted) is intentionally ignored because its movement
 * depends on the player's last direction — the solver would have to
 * include it in the state, blowing up the search space.
 * ========================================================= */

#define KL_SAFE_MAX_TURNS 120

typedef struct {
    int  r, c;
    bool visible;
} kl_ghost_state_t;

/* Single trajectory: trajectory[t] = state of the ghost at turn t. */
typedef struct {
    kl_ghost_state_t state[KL_SAFE_MAX_TURNS + 1];
    bool present;
} kl_ghost_traj_t;

/* State key for the safe BFS, including turn. */
static uint64_t safe_state_key(int r, int c, kl_dir_t dir, uint32_t mask, int turn) {
    /* mask up to 30 bits, r/c up to 6 bits, dir 3 bits, turn 8 bits */
    return ((uint64_t)mask  << 23) |
           ((uint64_t)(r & 0x3F) << 17) |
           ((uint64_t)(c & 0x3F) << 11) |
           ((uint64_t)(dir & 0x7) << 8) |
           ((uint64_t)(turn & 0xFF));
}

/* Pick the next direction for a red/green ghost (deterministic priority). */
static kl_dir_t standard_ghost_next(const kl_level_t *lvl, int r, int c, kl_dir_t last, bool is_red)
{
    static const kl_dir_t prio_red[4]   = { KL_DIR_R, KL_DIR_D, KL_DIR_L, KL_DIR_U };
    static const kl_dir_t prio_green[4] = { KL_DIR_U, KL_DIR_L, KL_DIR_D, KL_DIR_R };
    const kl_dir_t *prio = is_red ? prio_red : prio_green;
    kl_dir_t reverse = (last == KL_DIR_NONE) ? KL_DIR_NONE : OPP_DIR[last];

    static const int DR2[4] = { -1, +1,  0,  0 };
    static const int DC2[4] = {  0,  0, -1, +1 };

    for (int i = 0; i < 4; i++) {
        kl_dir_t d = prio[i];
        if (d == reverse) continue;
        int nr = r + DR2[d], nc = c + DC2[d];
        if (nr < 0 || nr >= lvl->h || nc < 0 || nc >= lvl->w) continue;
        if (lvl->grid[nr][nc] == KL_WALL) continue;
        return d;
    }
    /* Dead end: try reverse */
    if (reverse != KL_DIR_NONE) {
        int nr = r + DR2[reverse], nc = c + DC2[reverse];
        if (nr >= 0 && nr < lvl->h && nc >= 0 && nc < lvl->w &&
            lvl->grid[nr][nc] != KL_WALL) {
            return reverse;
        }
    }
    return KL_DIR_NONE; /* stuck */
}

/* Slide a ghost along `dir` (same wall/junction rules as the knight). */
static void ghost_slide(const kl_level_t *lvl, int *r, int *c, kl_dir_t dir)
{
    int dr = DR[dir], dc = DC[dir];
    int cr = *r + dr, cc = *c + dc;

    if (cr < 0 || cr >= lvl->h || cc < 0 || cc >= lvl->w) return;
    if (lvl->grid[cr][cc] == KL_WALL) return;

    *r = cr;
    *c = cc;
    while (1) {
        int nr = *r + dr, nc = *c + dc;
        bool next_wall = (nr < 0 || nr >= lvl->h || nc < 0 || nc >= lvl->w ||
                          lvl->grid[nr][nc] == KL_WALL);
        bool junction = perpendicular_open(lvl, *r, *c, dir);
        if (next_wall || junction) break;
        *r = nr;
        *c = nc;
    }
}

static void precompute_ghost(const kl_level_t *lvl,
                             kl_ghost_traj_t *traj,
                             int start_r, int start_c, char type)
{
    traj->present = true;
    int r = start_r, c = start_c;
    kl_dir_t last = KL_DIR_NONE;
    bool visible = true;
    int tele_count = 0;

    traj->state[0].r = r; traj->state[0].c = c; traj->state[0].visible = true;

    static const int DR2[4] = { -1, +1,  0,  0 };
    static const int DC2[4] = {  0,  0, -1, +1 };

    for (int t = 1; t <= KL_SAFE_MAX_TURNS; t++) {
        if (type == 'B') {
            tele_count++;
            if (tele_count % 2 == 0) {
                /* Re-appear at next portal */
                int idx = -1;
                for (int i = 0; i < lvl->n_portals; i++) {
                    if (lvl->portal_rows[i] == r && lvl->portal_cols[i] == c) {
                        idx = i; break;
                    }
                }
                int next = (idx + 1) % (lvl->n_portals > 0 ? lvl->n_portals : 1);
                if (lvl->n_portals > 0) {
                    r = lvl->portal_rows[next];
                    c = lvl->portal_cols[next];
                }
                visible = true;
            } else {
                visible = false;
            }
        } else {
            kl_dir_t d = standard_ghost_next(lvl, r, c, last, type == 'R');
            if (d != KL_DIR_NONE) {
                ghost_slide(lvl, &r, &c, d);
                last = d;
            }
        }
        traj->state[t].r = r;
        traj->state[t].c = c;
        traj->state[t].visible = visible;
    }
}

/* Check whether the slide from (r,c) heading `dir` is safe at `turn`
 * given precomputed ghost trajectories. We re-walk the slide checking
 * EVERY cell against the new ghost positions at `turn`. */
static bool slide_is_safe(const kl_level_t *lvl,
                          int r, int c, kl_dir_t dir, int turn,
                          const kl_ghost_traj_t *traj_red,
                          const kl_ghost_traj_t *traj_green,
                          const kl_ghost_traj_t *traj_blue)
{
    static const int DR3[4] = { -1, +1,  0,  0 };
    static const int DC3[4] = {  0,  0, -1, +1 };
    int dr = DR3[dir], dc = DC3[dir];

    /* Slide path: starts at (r, c), then advances cell-by-cell. */
    int cr = r, cc = c;
    bool first_done = false;

    while (1) {
        /* Check this cell against each visible ghost at `turn` */
        if (traj_red && traj_red->present && traj_red->state[turn].visible &&
            traj_red->state[turn].r == cr && traj_red->state[turn].c == cc) return false;
        if (traj_green && traj_green->present && traj_green->state[turn].visible &&
            traj_green->state[turn].r == cr && traj_green->state[turn].c == cc) return false;
        if (traj_blue && traj_blue->present && traj_blue->state[turn].visible &&
            traj_blue->state[turn].r == cr && traj_blue->state[turn].c == cc) return false;

        if (!first_done) {
            /* Move once into the slide */
            int nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= lvl->h || nc < 0 || nc >= lvl->w) return false;
            if (lvl->grid[nr][nc] == KL_WALL) return false;
            cr = nr; cc = nc;
            first_done = true;
            continue;
        }

        /* Stop conditions: next is wall, or current is a junction */
        int nr = cr + dr, nc = cc + dc;
        bool next_wall = (nr < 0 || nr >= lvl->h || nc < 0 || nc >= lvl->w ||
                          lvl->grid[nr][nc] == KL_WALL);
        bool junction = perpendicular_open(lvl, cr, cc, dir);
        if (next_wall || junction) break;
        cr = nr; cc = nc;
    }
    /* Check landing cell against ghosts (already done above on entry to last iter) */
    return true;
}

bool kl_solve_safe(const kl_level_t *lvl, kl_solution_t *sol, char *err, size_t err_sz)
{
    memset(sol, 0, sizeof(*sol));

    if (lvl->n_coins == 0) {
        sol->solvable = true; sol->n_moves = 0;
        return true;
    }

    /* Precompute ghost trajectories */
    kl_ghost_traj_t traj_red    = {0};
    kl_ghost_traj_t traj_green  = {0};
    kl_ghost_traj_t traj_blue   = {0};
    if (lvl->ghost_red_r   >= 0) precompute_ghost(lvl, &traj_red,   lvl->ghost_red_r,   lvl->ghost_red_c,   'R');
    if (lvl->ghost_green_r >= 0) precompute_ghost(lvl, &traj_green, lvl->ghost_green_r, lvl->ghost_green_c, 'G');
    if (lvl->ghost_blue_r  >= 0 && lvl->n_portals >= 2)
        precompute_ghost(lvl, &traj_blue,  lvl->ghost_blue_r,  lvl->ghost_blue_c,  'B');

    /* Allocate BFS tables — note: state includes turn, so we need
     * more capacity. We share the same buffers but resize is fixed. */
    g_nodes = (bfs_node_t *) malloc(sizeof(bfs_node_t) * BFS_MAX_NODES);
    g_queue = (int *)        malloc(sizeof(int)        * BFS_MAX_NODES);
    g_ht    = (int *)        malloc(sizeof(int)        * HT_SIZE);
    if (!g_nodes || !g_queue || !g_ht) {
        snprintf(err, err_sz, "Out of memory for BFS tables.");
        free(g_nodes); free(g_queue); free(g_ht);
        return false;
    }
    ht_init();

    uint32_t full = (lvl->n_coins >= 32) ? 0xFFFFFFFFu
                                         : ((1u << lvl->n_coins) - 1u);

    int n_nodes = 0;
    int head = 0, tail = 0;

    uint64_t k0 = safe_state_key(lvl->start_row, lvl->start_col, KL_DIR_NONE, full, 0);
    g_nodes[n_nodes].key    = k0;
    g_nodes[n_nodes].parent = -1;
    g_nodes[n_nodes].move   = KL_DIR_NONE;
    ht_lookup_or_insert(k0, n_nodes);
    g_queue[tail++] = n_nodes++;

    int goal_idx = -1;

    while (head < tail) {
        int idx = g_queue[head++];
        uint64_t k = g_nodes[idx].key;

        uint32_t mask  = (uint32_t)((k >> 23));
        int      r     = (int)((k >> 17) & 0x3F);
        int      c     = (int)((k >> 11) & 0x3F);
        kl_dir_t dir   = (kl_dir_t)((k >> 8) & 0x7);
        int      turn  = (int)(k & 0xFF);

        if (mask == 0) { goal_idx = idx; break; }
        if (turn >= KL_SAFE_MAX_TURNS) continue;

        for (int d = 0; d < 4; d++) {
            if (dir != KL_DIR_NONE && (kl_dir_t)d == OPP_DIR[dir]) continue;

            int nr, nc; uint32_t nmask;
            if (!slide(lvl, r, c, (kl_dir_t)d, mask, &nr, &nc, &nmask)) continue;

            /* Check safety at the NEW turn (turn + 1) */
            int new_turn = turn + 1;
            if (!slide_is_safe(lvl, r, c, (kl_dir_t)d, new_turn,
                               lvl->ghost_red_r   >= 0 ? &traj_red   : NULL,
                               lvl->ghost_green_r >= 0 ? &traj_green : NULL,
                               (lvl->ghost_blue_r >= 0 && lvl->n_portals >= 2) ? &traj_blue : NULL))
                continue;

            uint64_t nk = safe_state_key(nr, nc, (kl_dir_t)d, nmask, new_turn);

            if (n_nodes >= BFS_MAX_NODES) {
                snprintf(err, err_sz,
                    "BFS node table exhausted at %d nodes (safe-path).", n_nodes);
                free(g_nodes); free(g_queue); free(g_ht);
                return false;
            }
            g_nodes[n_nodes].key    = nk;
            g_nodes[n_nodes].parent = idx;
            g_nodes[n_nodes].move   = (kl_dir_t)d;

            int existing = ht_lookup_or_insert(nk, n_nodes);
            if (existing != -1) continue;

            g_queue[tail++] = n_nodes++;
        }
    }

    if (goal_idx == -1) {
        sol->solvable = false;
        free(g_nodes); free(g_queue); free(g_ht);
        return true;
    }

    kl_dir_t rev[KL_MAX_CELLS];
    int rev_n = 0;
    int cur = goal_idx;
    while (g_nodes[cur].parent != -1) {
        rev[rev_n++] = g_nodes[cur].move;
        cur = g_nodes[cur].parent;
    }
    for (int i = 0; i < rev_n; i++) {
        sol->moves[i] = rev[rev_n - 1 - i];
    }
    sol->n_moves  = rev_n;
    sol->solvable = true;

    free(g_nodes); free(g_queue); free(g_ht);
    return true;
}
