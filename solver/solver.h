/* =========================================================
 * Les fantômes d'Ombrequatre — Optimal Solver (header)
 *
 * BFS over (row, col, last_dir, coin_mask) state.
 * Outputs the shortest sequence of slides that collects every gem.
 *
 * Limit: up to 30 coins (uint32_t bitmask). Maps with more
 * collectibles are rejected with an error message — the team
 * should keep solvable levels under that limit.
 * ========================================================= */

#ifndef KL_SOLVER_H
#define KL_SOLVER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define KL_MAX_W       64
#define KL_MAX_H       64
#define KL_MAX_COINS   30
#define KL_MAX_CELLS   (KL_MAX_W * KL_MAX_H)

/* Tile semantics (matches the JS / PHP map format). */
typedef enum {
    KL_WALL   = '#',
    KL_GEM    = '.',
    KL_POTION = 'o',
    KL_WATCH  = 'c',
    KL_PORTAL = '*',
    KL_EMPTY  = '_',
} kl_tile_t;

typedef enum {
    KL_DIR_U = 0,
    KL_DIR_D = 1,
    KL_DIR_L = 2,
    KL_DIR_R = 3,
    KL_DIR_NONE = 4,
} kl_dir_t;

/* Parsed level. */
typedef struct {
    int  w, h;
    int  start_row, start_col;
    char grid[KL_MAX_H][KL_MAX_W + 1];

    /* Coin index map: -1 if not a coin, otherwise [0..n_coins) */
    int  coin_index[KL_MAX_H][KL_MAX_W];
    int  n_coins;
    int  coin_rows[KL_MAX_COINS];
    int  coin_cols[KL_MAX_COINS];

    /* Ghost starting positions (-1 if absent) */
    int  ghost_red_r,    ghost_red_c;
    int  ghost_green_r,  ghost_green_c;
    int  ghost_yellow_r, ghost_yellow_c;
    int  ghost_blue_r,   ghost_blue_c;

    /* Portals (for blue ghost teleports) */
    int  n_portals;
    int  portal_rows[16];
    int  portal_cols[16];
} kl_level_t;

/* Result of solving. */
typedef struct {
    bool      solvable;
    int       n_moves;             /* number of slides */
    kl_dir_t  moves[KL_MAX_CELLS]; /* direction sequence */
} kl_solution_t;

/* Public API */
bool kl_parse_level_file(const char *path, kl_level_t *lvl, char *err, size_t err_sz);
bool kl_solve(const kl_level_t *lvl, kl_solution_t *sol, char *err, size_t err_sz);
bool kl_solve_safe(const kl_level_t *lvl, kl_solution_t *sol, char *err, size_t err_sz);
const char *kl_dir_name(kl_dir_t d);

#endif /* KL_SOLVER_H */
