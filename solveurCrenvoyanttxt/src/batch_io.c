#include "batch_io.h"
#include <stdio.h>
#include <string.h>

void kl_sequence_string(const kl_solution_t *sol, char *buf, size_t buf_sz)
{
    if (!buf || buf_sz == 0) return;
    buf[0] = '\0';
    if (!sol || !sol->solvable || sol->n_moves <= 0) return;

    static const char DIR[] = "UDLR";
    size_t n = (size_t)sol->n_moves;
    if (n >= buf_sz) n = buf_sz - 1;

    for (size_t i = 0; i < n; i++) {
        int d = (int)sol->moves[i];
        if (d >= 0 && d < 4) buf[i] = DIR[d];
        else                 buf[i] = '?';
    }
    buf[n] = '\0';
}

bool kl_solve_level_file(
    const char *level_path,
    bool        use_safe,
    bool        allow_fallback,
    kl_level_t *lvl_out,
    kl_solution_t *sol_out,
    char       *mode_out,
    size_t      mode_sz,
    char       *err,
    size_t      err_sz)
{
    if (mode_out && mode_sz > 0) mode_out[0] = '\0';

    if (!kl_parse_level_file(level_path, lvl_out, err, err_sz)) {
        return false;
    }

    if (use_safe) {
        if (!kl_solve_safe(lvl_out, sol_out, err, err_sz)) return false;
        if (sol_out->solvable) {
            if (mode_out && mode_sz > 0) {
                strncpy(mode_out, "safe-path", mode_sz - 1);
                mode_out[mode_sz - 1] = '\0';
            }
            return true;
        }
        if (!allow_fallback) return true;
    }

    if (!kl_solve(lvl_out, sol_out, err, err_sz)) return false;
    if (mode_out && mode_sz > 0) {
        strncpy(mode_out, "gems-only", mode_sz - 1);
        mode_out[mode_sz - 1] = '\0';
    }
    return true;
}

bool kl_write_solution_txt(
    const char           *out_path,
    int                   level_id,
    const char           *level_path,
    const char           *mode,
    bool                  solvable,
    const kl_solution_t  *sol,
    const char           *error_note)
{
    FILE *f = fopen(out_path, "w");
    if (!f) return false;

    char seq[KL_MAX_CELLS + 1];
    kl_sequence_string(sol, seq, sizeof(seq));

    fprintf(f, "# Les fantômes d'Ombrequatre - solution export\n");
    fprintf(f, "level_id=%d\n", level_id);
    fprintf(f, "level_file=%s\n", level_path ? level_path : "");
    fprintf(f, "solvable=%s\n", solvable ? "yes" : "no");
    fprintf(f, "mode=%s\n", mode ? mode : "");
    fprintf(f, "move_count=%d\n", solvable && sol ? sol->n_moves : 0);
    fprintf(f, "sequence=%s\n", solvable ? seq : "");
    fprintf(f, "error=%s\n", error_note ? error_note : "");

    fclose(f);
    return true;
}
