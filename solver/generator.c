/* =========================================================
 * Les fantômes d'Ombrequatre — Random Level Generator
 *
 * Algorithm: DFS Recursive Backtracker (Wilson/Aldous-Broder variant)
 *   – Grid dimensions are always ODD (W and H).
 *   – Room cells sit at (odd-row, odd-col) positions; walls between
 *     them are at even-row or even-col positions.
 *   – Start with all '#', carve '_' as DFS walks.
 *   – Extra-passage pass knocks down a fraction of seam walls to
 *     add loops and reduce the perfect-tree look.
 *
 * Output (stdout): level text in the standard solver/PHP format.
 *   W <width>
 *   H <height>
 *   P <player_row> <player_col>
 *   [R|G|Y|B <row> <col>]   (zero or more ghost lines)
 *   MAP
 *   <grid rows>
 *
 * Usage:
 *   generator <easy|medium|hard|impossible> [--seed N]
 * ========================================================= */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <stdint.h>
#include <stdbool.h>

/* ── xorshift32 RNG ──────────────────────────────────────────── */
static uint32_t g_rng;

static void   rng_seed(uint32_t s) { g_rng = s ? s : 0xDEADBEEFu; }
static uint32_t rng_next(void) {
    g_rng ^= g_rng << 13;
    g_rng ^= g_rng >> 17;
    g_rng ^= g_rng << 5;
    return g_rng;
}
/* Returns random int in [lo, hi] inclusive. */
static int rng_range(int lo, int hi) {
    if (lo >= hi) return lo;
    return lo + (int)(rng_next() % (unsigned)(hi - lo + 1));
}

/* ── Grid (max 21×17 — matches validateLevelStructure) ──────── */
#define MAX_W 22
#define MAX_H 18
#define MAX_CELLS (MAX_W * MAX_H)
#define MAX_GEMS  28   /* solver limit is 30; we cap at 28 for headroom */

static char g_grid[MAX_H][MAX_W + 2]; /* +2: null terminator + safety */
static int  gW, gH;

static bool in_bounds(int r, int c) {
    return r >= 0 && r < gH && c >= 0 && c < gW;
}

/* ── DFS Recursive Backtracker ──────────────────────────────── */
static bool g_vis[MAX_H][MAX_W];

/* Two-step neighbour offsets for room-to-room moves. */
static const int DFS_DR[4] = { -2,  2,  0,  0 };
static const int DFS_DC[4] = {  0,  0, -2,  2 };

static void shuffle4(int *a) {
    for (int i = 3; i > 0; i--) {
        int j = (int)(rng_next() % (unsigned)(i + 1));
        int t = a[i]; a[i] = a[j]; a[j] = t;
    }
}

/* Carve passages recursively from room cell (r, c). */
static void dfs_carve(int r, int c) {
    g_vis[r][c] = true;
    int ord[4] = { 0, 1, 2, 3 };
    shuffle4(ord);
    for (int i = 0; i < 4; i++) {
        int nr = r + DFS_DR[ord[i]];
        int nc = c + DFS_DC[ord[i]];
        if (!in_bounds(nr, nc) || g_vis[nr][nc]) continue;
        /* Knock down the wall between (r,c) and (nr,nc). */
        g_grid[(r + nr) / 2][(c + nc) / 2] = '_';
        g_grid[nr][nc] = '_';
        dfs_carve(nr, nc);
    }
}

/* ── Extra passages (adds loops so the maze isn't a pure tree) ── */
/* pct: probability in [0, 100] of knocking each eligible seam wall. */
static void extra_passages(int pct) {
    for (int r = 1; r < gH - 1; r++) {
        for (int c = 1; c < gW - 1; c++) {
            if (g_grid[r][c] != '#') continue;
            int re = (r % 2 == 0), ce = (c % 2 == 0);
            /* Only walls that sit exactly between two room cells:
               one of (row, col) must be even, the other odd. */
            if (re == ce) continue;
            bool ok;
            if (re)
                ok = in_bounds(r-1,c) && in_bounds(r+1,c) &&
                     g_grid[r-1][c] != '#' && g_grid[r+1][c] != '#';
            else
                ok = in_bounds(r,c-1) && in_bounds(r,c+1) &&
                     g_grid[r][c-1] != '#' && g_grid[r][c+1] != '#';

            if (ok && (int)(rng_next() % 100u) < pct)
                g_grid[r][c] = '_';
        }
    }
}

/* ── BFS distance from a source cell ───────────────────────── */
typedef struct { int r, c; } Cell;

static int  g_dist[MAX_H][MAX_W];
static Cell g_bfsq[MAX_CELLS];

static const int BDR[4] = { -1, 1,  0,  0 };
static const int BDC[4] = {  0, 0, -1,  1 };

static void bfs_from(int sr, int sc) {
    for (int r = 0; r < gH; r++)
        for (int c = 0; c < gW; c++)
            g_dist[r][c] = -1;
    int head = 0, tail = 0;
    g_dist[sr][sc] = 0;
    g_bfsq[tail++] = (Cell){ sr, sc };
    while (head < tail) {
        Cell u = g_bfsq[head++];
        for (int d = 0; d < 4; d++) {
            int nr = u.r + BDR[d], nc = u.c + BDC[d];
            if (!in_bounds(nr, nc) || g_dist[nr][nc] >= 0
                || g_grid[nr][nc] == '#') continue;
            g_dist[nr][nc] = g_dist[u.r][u.c] + 1;
            g_bfsq[tail++] = (Cell){ nr, nc };
        }
    }
}

static int cmp_dist_desc(const void *a, const void *b) {
    const Cell *ca = (const Cell *)a, *cb = (const Cell *)b;
    return g_dist[cb->r][cb->c] - g_dist[ca->r][ca->c];  /* farthest first */
}

/* (ascending variant kept for future use — suppress unused-function warning) */
#if 0
static int cmp_dist_asc(const void *a, const void *b) {
    const Cell *ca = (const Cell *)a, *cb = (const Cell *)b;
    return g_dist[ca->r][ca->c] - g_dist[cb->r][cb->c];
}
#endif

/* ── Difficulty profiles ────────────────────────────────────── */
typedef struct {
    const char *name;
    int wlo, whi;   /* Odd width  range  [wlo, whi], step 2 */
    int hlo, hhi;   /* Odd height range  [hlo, hhi], step 2 */
    int extra_pct;  /* Extra-passage probability % */
    int gem_min, gem_max;
    bool has_R, has_G, has_Y, has_B; /* Ghost types present */
} Profile;

static const Profile PROFILES[] = {
    /*  name         wlo  whi  hlo  hhi  extra  gmin gmax  R      G      Y      B   */
    { "easy",          9,  11,   7,   9,    30,   8,  14, false, false, false, false },
    { "medium",       11,  13,   9,  11,    22,  14,  22, true,  false, false, false },
    { "hard",         13,  15,  11,  13,    15,  18,  28, true,  true,  false, false },
    { "impossible",   15,  17,  13,  15,    10,  20,  28, true,  true,  true,  true  },
};
static const int N_PROFILES = 4;

static const Profile *get_profile(const char *name) {
    for (int i = 0; i < N_PROFILES; i++)
        if (strcmp(PROFILES[i].name, name) == 0) return &PROFILES[i];
    return NULL;
}

/* ── Portal placement helper (IMPOSSIBLE) ───────────────────── */
/*
 * Picks `n_want` portal positions distributed across the four quadrants.
 * Returns the actual number placed (may be less than n_want if the
 * quadrant has no usable cells).
 */
static int place_portals(Cell *reach, int n_reach, bool *used,
                          int *pr, int *pc, int n_want)
{
    int placed = 0;
    int mid_r  = gH / 2, mid_c = gW / 2;

    /* Quadrant definitions: [r_lo, r_hi) × [c_lo, c_hi) */
    int qr_lo[4] = {  1, mid_r,     1, mid_r };
    int qr_hi[4] = { mid_r, gH-1, mid_r, gH-1 };
    int qc_lo[4] = {  1,     1, mid_c, mid_c };
    int qc_hi[4] = { mid_c, mid_c, gW-1, gW-1 };

    for (int q = 0; q < 4 && placed < n_want; q++) {
        /* Walk the reach array (sorted by dist desc) to find the first
           available cell in this quadrant. */
        for (int i = 0; i < n_reach; i++) {
            int r = reach[i].r, c = reach[i].c;
            if (used[r * MAX_W + c]) continue;
            if (r < qr_lo[q] || r >= qr_hi[q]) continue;
            if (c < qc_lo[q] || c >= qc_hi[q]) continue;
            /* Place portal */
            g_grid[r][c] = '*';
            used[r * MAX_W + c] = true;
            pr[placed] = r;
            pc[placed] = c;
            placed++;
            break;
        }
    }
    return placed;
}

/* ── Core generator ─────────────────────────────────────────── */
static bool generate_level(const Profile *p) {

    /* ── 1. Pick grid size (odd within profile range) ── */
    {
        int ws[8], nw = 0, hs[8], nh = 0;
        for (int w = p->wlo; w <= p->whi; w += 2) ws[nw++] = w;
        for (int h = p->hlo; h <= p->hhi; h += 2) hs[nh++] = h;
        gW = ws[rng_range(0, nw - 1)];
        gH = hs[rng_range(0, nh - 1)];
    }

    /* ── 2. Initialize grid to all walls ── */
    for (int r = 0; r < gH; r++) {
        memset(g_grid[r], '#', (size_t)gW);
        g_grid[r][gW] = '\0';
    }
    memset(g_vis, 0, sizeof(g_vis));

    /* ── 3. DFS carve from a random room cell (odd row & col) ── */
    {
        int r0 = rng_range(0, (gH - 2) / 2) * 2 + 1;
        int c0 = rng_range(0, (gW - 2) / 2) * 2 + 1;
        g_grid[r0][c0] = '_';
        dfs_carve(r0, c0);
    }

    /* ── 4. Add extra passages ── */
    extra_passages(p->extra_pct);

    /* ── 5. Collect floor cells and check minimum count ── */
    Cell floors[MAX_CELLS]; int nf = 0;
    for (int r = 0; r < gH; r++)
        for (int c = 0; c < gW; c++)
            if (g_grid[r][c] == '_') floors[nf++] = (Cell){ r, c };

    int non_blue_ghosts = (p->has_R ? 1 : 0)
                        + (p->has_G ? 1 : 0)
                        + (p->has_Y ? 1 : 0);
    int min_needed = p->gem_min + non_blue_ghosts + 1 /* player */
                   + (p->has_B ? 2 : 0); /* 2 portals min */
    if (nf < min_needed) return false;

    /* ── 6. Pick player start (random inner floor cell) ── */
    /* Prefer cells not on the outermost ring to give ghosts room to appear. */
    Cell inner[MAX_CELLS]; int ni = 0;
    for (int i = 0; i < nf; i++) {
        int r = floors[i].r, c = floors[i].c;
        if (r > 0 && r < gH-1 && c > 0 && c < gW-1) inner[ni++] = floors[i];
    }
    if (ni == 0) { memcpy(inner, floors, (size_t)nf * sizeof(Cell)); ni = nf; }

    int pi = rng_range(0, ni - 1);
    int player_r = inner[pi].r, player_c = inner[pi].c;

    /* ── 7. BFS from player: sort reachable cells farthest-first ── */
    bfs_from(player_r, player_c);

    Cell reach[MAX_CELLS]; int nr = 0;
    for (int i = 0; i < nf; i++) {
        int r = floors[i].r, c = floors[i].c;
        if (g_dist[r][c] > 0) reach[nr++] = floors[i]; /* reachable, not player */
    }
    if (nr < p->gem_min) return false;   /* not enough reachable cells */

    qsort(reach, (size_t)nr, sizeof(Cell), cmp_dist_desc);

    /* Shared "used" bitmap (flat: r*MAX_W + c). */
    bool used[MAX_H * MAX_W];
    memset(used, 0, sizeof(used));
    used[player_r * MAX_W + player_c] = true;

    /* ── 8. Portals (IMPOSSIBLE only) ── */
    int portal_r[4], portal_c[4];
    int n_portals = 0;

    if (p->has_B) {
        n_portals = place_portals(reach, nr, used, portal_r, portal_c, 4);
        if (n_portals < 2) return false; /* blue ghost needs ≥ 2 portals */
        /* Mark portals as used so gems / ghosts don't overwrite them. */
        /* (place_portals already sets used[] and g_grid[][]) */
    }

    /* ── 9. Place gems (random non-used floor cells) ── */
    /* Rebuild a gem pool: all reachable floors not yet used. */
    Cell gem_pool[MAX_CELLS]; int ngp = 0;
    for (int i = 0; i < nr; i++) {
        int r = reach[i].r, c = reach[i].c;
        if (!used[r * MAX_W + c] && g_grid[r][c] == '_')
            gem_pool[ngp++] = reach[i];
    }
    /* Shuffle the pool so gems land randomly (not always farthest first). */
    for (int i = ngp - 1; i > 0; i--) {
        int j = rng_range(0, i);
        Cell t = gem_pool[i]; gem_pool[i] = gem_pool[j]; gem_pool[j] = t;
    }

    int gem_cap    = (p->gem_max > MAX_GEMS) ? MAX_GEMS : p->gem_max;
    int gem_target = rng_range(p->gem_min, gem_cap);
    /* Reserve slots for non-blue ghosts. */
    int avail = ngp - non_blue_ghosts;
    if (avail < p->gem_min) return false;
    if (gem_target > avail) gem_target = avail;
    if (gem_target < p->gem_min) return false;

    int gem_placed = 0;
    for (int i = 0; i < ngp && gem_placed < gem_target; i++) {
        int r = gem_pool[i].r, c = gem_pool[i].c;
        g_grid[r][c] = '.';
        used[r * MAX_W + c] = true;
        gem_placed++;
    }
    if (gem_placed < p->gem_min) return false;

    /* ── 10. Place non-blue ghosts (farthest from player) ── */
    int ghost_rr = -1, ghost_rc = -1; /* red   */
    int ghost_gr = -1, ghost_gc = -1; /* green */
    int ghost_yr = -1, ghost_yc = -1; /* yellow */

    /* Iterate reach (sorted farthest-first) and assign in order. */
    for (int i = 0; i < nr; i++) {
        int r = reach[i].r, c = reach[i].c;
        if (used[r * MAX_W + c] || g_grid[r][c] != '_') continue;
        if (p->has_R && ghost_rr < 0) { ghost_rr=r; ghost_rc=c; used[r*MAX_W+c]=true; continue; }
        if (p->has_G && ghost_gr < 0) { ghost_gr=r; ghost_gc=c; used[r*MAX_W+c]=true; continue; }
        if (p->has_Y && ghost_yr < 0) { ghost_yr=r; ghost_yc=c; used[r*MAX_W+c]=true; break;    }
    }
    if (p->has_R && ghost_rr < 0) return false;
    if (p->has_G && ghost_gr < 0) return false;
    if (p->has_Y && ghost_yr < 0) return false;

    /* ── 11. Place blue ghost on a random portal ── */
    int ghost_br = -1, ghost_bc = -1;
    if (p->has_B) {
        int bi = rng_range(0, n_portals - 1);
        ghost_br = portal_r[bi];
        ghost_bc = portal_c[bi];
    }

    /* ── 12. Emit level text ── */
    printf("W %d\nH %d\n", gW, gH);
    printf("P %d %d\n", player_r, player_c);
    if (p->has_R) printf("R %d %d\n", ghost_rr, ghost_rc);
    if (p->has_G) printf("G %d %d\n", ghost_gr, ghost_gc);
    if (p->has_Y) printf("Y %d %d\n", ghost_yr, ghost_yc);
    if (p->has_B) printf("B %d %d\n", ghost_br, ghost_bc);
    puts("MAP");
    for (int r = 0; r < gH; r++) puts(g_grid[r]);

    return true;
}

/* ── Entry point ────────────────────────────────────────────── */
int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr,
            "Usage: generator <easy|medium|hard|impossible> [--seed N]\n"
            "\n"
            "  Outputs a random level in the standard solver text format.\n"
            "  With --seed N the output is deterministic.\n");
        return 2;
    }

    const char *diff = argv[1];
    const Profile *p = get_profile(diff);
    if (!p) {
        fprintf(stderr, "Unknown difficulty '%s'.\n"
                        "Valid: easy  medium  hard  impossible\n", diff);
        return 1;
    }

    /* Optional --seed N */
    uint32_t seed = (uint32_t)time(NULL);
    for (int i = 2; i < argc; i++) {
        if (strcmp(argv[i], "--seed") == 0 && i + 1 < argc) {
            seed = (uint32_t)strtoul(argv[i + 1], NULL, 10);
            i++;
        }
    }
    rng_seed(seed);

    /* Retry up to 30 times (DFS occasionally produces degenerate layouts). */
    for (int attempt = 0; attempt < 30; attempt++) {
        /* Restore any cell that was overwritten in a failed previous attempt
           by reinitialising via generate_level itself (it resets the grid). */
        if (generate_level(p)) return 0;
        /* Vary the seed slightly so the next attempt differs. */
        rng_next();
    }

    fprintf(stderr, "Failed to generate a valid '%s' level after 30 attempts.\n", diff);
    return 1;
}
