#ifndef KL_BATCH_IO_H
#define KL_BATCH_IO_H

#include "solver.h"
#include <stddef.h>

/** Encode solution moves as a compact UDLR string (no separator). */
void kl_sequence_string(const kl_solution_t *sol, char *buf, size_t buf_sz);

/**
 * Parse level file, solve (safe first if use_safe, else gems-only fallback).
 * On success, mode_out receives "safe-path" or "gems-only".
 * Returns false on parse/solver internal error (not on unsolvable).
 */
bool kl_solve_level_file(
    const char *level_path,
    bool        use_safe,
    bool        allow_fallback,
    kl_level_t *lvl_out,
    kl_solution_t *sol_out,
    char       *mode_out,
    size_t      mode_sz,
    char       *err,
    size_t      err_sz
);

/**
 * Write a .txt solution file (key=value lines) for later import.
 * Returns false if the file could not be written.
 */
bool kl_write_solution_txt(
    const char       *out_path,
    int               level_id,
    const char       *level_path,
    const char       *mode,
    bool              solvable,
    const kl_solution_t *sol,
    const char       *error_note
);

#endif /* KL_BATCH_IO_H */
