/* =========================================================
 * Les fantômes d'Ombrequatre — Solver CLI
 *
 * Usage: ./solver <level.txt> [--moves-only] [--simulate]
 *
 *   --moves-only   print only the directions (one per line)
 *   --simulate     also re-walk the solution and print the path
 *                  cells it traverses (useful for integration tests)
 * ========================================================= */

#include "solver.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static void print_grid_with_path(const kl_level_t *lvl, const kl_solution_t *sol) {
    /* Walk the solution again, marking traversed cells. */
    char marks[KL_MAX_H][KL_MAX_W];
    memset(marks, 0, sizeof(marks));

    int r = lvl->start_row, c = lvl->start_col;
    marks[r][c] = 1;

    const int DR[4] = { -1, +1, 0, 0 };
    const int DC[4] = {  0,  0, -1, +1 };

    for (int i = 0; i < sol->n_moves; i++) {
        int dr = DR[sol->moves[i]];
        int dc = DC[sol->moves[i]];
        while (1) {
            int nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= lvl->h || nc < 0 || nc >= lvl->w) break;
            if (lvl->grid[nr][nc] == KL_WALL) break;
            r = nr; c = nc;
            marks[r][c] = 1;

            /* Stop at junction. */
            int d1, d2;
            if (sol->moves[i] == KL_DIR_U || sol->moves[i] == KL_DIR_D) { d1=2; d2=3; }
            else { d1=0; d2=1; }
            int r1 = r + DR[d1], c1 = c + DC[d1];
            int r2 = r + DR[d2], c2 = c + DC[d2];
            bool ok1 = (r1>=0 && r1<lvl->h && c1>=0 && c1<lvl->w && lvl->grid[r1][c1]!=KL_WALL);
            bool ok2 = (r2>=0 && r2<lvl->h && c2>=0 && c2<lvl->w && lvl->grid[r2][c2]!=KL_WALL);
            int nnr = r + dr, nnc = c + dc;
            bool next_wall = (nnr<0||nnr>=lvl->h||nnc<0||nnc>=lvl->w||
                              lvl->grid[nnr][nnc]==KL_WALL);
            if (ok1 || ok2 || next_wall) break;
        }
    }

    printf("\nPath traced:\n");
    for (int rr = 0; rr < lvl->h; rr++) {
        for (int cc = 0; cc < lvl->w; cc++) {
            char base = lvl->grid[rr][cc];
            if (rr == lvl->start_row && cc == lvl->start_col) {
                putchar('K');
            } else if (marks[rr][cc]) {
                if (base == KL_WALL) putchar('#');
                else                  putchar('+');
            } else {
                putchar(base);
            }
        }
        putchar('\n');
    }
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr,
            "Usage: %s <level.txt> [--moves-only] [--simulate] [--safe-path]\n"
            "\n"
            "  --moves-only   print only directions (one per line)\n"
            "  --simulate     trace the solution path on the map\n"
            "  --safe-path    avoid Scarlet/Toxique/Abyssal ghost trajectories\n"
            "                 (Yellow is intentionally ignored - depends on player)\n",
            argv[0]);
        return 2;
    }

    bool moves_only = false;
    bool simulate   = false;
    bool safe_path  = false;
    for (int i = 2; i < argc; i++) {
        if (strcmp(argv[i], "--moves-only") == 0) moves_only = true;
        else if (strcmp(argv[i], "--simulate")  == 0) simulate  = true;
        else if (strcmp(argv[i], "--safe-path") == 0) safe_path = true;
    }

    kl_level_t lvl;
    char err[256] = {0};
    if (!kl_parse_level_file(argv[1], &lvl, err, sizeof(err))) {
        fprintf(stderr, "Parse error: %s\n", err);
        return 1;
    }

    kl_solution_t sol;
    bool ok;
    if (safe_path) ok = kl_solve_safe(&lvl, &sol, err, sizeof(err));
    else           ok = kl_solve(&lvl, &sol, err, sizeof(err));
    if (!ok) {
        fprintf(stderr, "Solve error: %s\n", err);
        return 1;
    }

    if (moves_only) {
        if (!sol.solvable) { puts("UNSOLVABLE"); return 1; }
        for (int i = 0; i < sol.n_moves; i++) {
            char c = "UDLR"[sol.moves[i]];
            putchar(c);
            putchar('\n');
        }
        return 0;
    }

    printf("Level: %s\n", argv[1]);
    printf("  size:        %d x %d\n", lvl.w, lvl.h);
    printf("  start:       (%d, %d)\n", lvl.start_row, lvl.start_col);
    printf("  gems total:  %d\n", lvl.n_coins);
    printf("  mode:        %s\n", safe_path ? "SAFE-PATH (avoids R/G/B ghosts)" : "GEM-ONLY (ignores ghosts)");

    if (!sol.solvable) {
        puts("\nResult: UNSOLVABLE");
        if (safe_path) {
            puts("No safe sequence avoids the Wardens. Try --without --safe-path or play with power-ups.");
        } else {
            puts("No sequence of slides collects every gem from the start.");
        }
        return 1;
    }

    printf("\nResult: SOLVABLE\n");
    printf("Optimal slide count: %d\n", sol.n_moves);
    printf("Sequence: ");
    for (int i = 0; i < sol.n_moves; i++) {
        putchar("UDLR"[sol.moves[i]]);
    }
    putchar('\n');

    if (simulate) print_grid_with_path(&lvl, &sol);
    return 0;
}
