/* =========================================================
 * solve_one — resolve a single level file to a .txt solution
 *
 * Usage:
 *   solve_one <level.txt> --output <solution.txt> [--safe-path] [--fallback]
 * ========================================================= */

#include "batch_io.h"
#include "solver.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr,
            "Usage: %s <level.txt> --output <solution.txt> [--safe-path] [--fallback]\n",
            argv[0]);
        return 2;
    }

    const char *level_path   = argv[1];
    const char *output_path  = NULL;
    bool safe_path  = false;
    bool fallback   = false;

    for (int i = 2; i < argc; i++) {
        if (strcmp(argv[i], "--safe-path") == 0) safe_path = true;
        else if (strcmp(argv[i], "--fallback") == 0) fallback = true;
        else if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) {
            output_path = argv[++i];
        }
    }

    if (!output_path) {
        fprintf(stderr, "Missing --output <solution.txt>\n");
        return 2;
    }

    kl_level_t lvl;
    kl_solution_t sol;
    char err[256] = {0};
    char mode[32] = {0};

    if (!kl_solve_level_file(level_path, safe_path, fallback,
                             &lvl, &sol, mode, sizeof(mode), err, sizeof(err))) {
        fprintf(stderr, "Error: %s\n", err);
        return 1;
    }

    const char *note = sol.solvable ? "" : "unsolvable";
    if (!kl_write_solution_txt(output_path, 0, level_path, mode, sol.solvable, &sol, note)) {
        fprintf(stderr, "Cannot write %s\n", output_path);
        return 1;
    }

    printf("Written: %s (%s, %d moves)\n",
           output_path, sol.solvable ? "solvable" : "unsolvable", sol.n_moves);
    return sol.solvable ? 0 : 1;
}
