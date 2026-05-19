/* =========================================================
 * solve_db — batch solver driven by a manifest file
 *
 * solveurCrenvoyanttxt/cli/solve_from_db.php exports levels
 * from MySQL and writes a manifest; this program reads it
 * and emits one .txt solution file per level.
 *
 * Manifest format (one entry per line):
 *   <level_id>|<absolute_or_relative_path_to_level.txt>
 * ========================================================= */

#include "batch_io.h"
#include "solver.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <direct.h>
#define MKDIR(path) _mkdir(path)
#else
#include <sys/stat.h>
#define MKDIR(path) mkdir(path, 0755)
#endif

#define LINE_MAX 2048
#define PATH_MAX_LOCAL 1024

static void usage(const char *prog)
{
    fprintf(stderr,
        "Usage: %s --manifest <file> --output-dir <dir> [options]\n"
        "\n"
        "  --manifest <file>    lines: level_id|path/to/level.txt\n"
        "  --output-dir <dir>   writes level_<id>_solution.txt\n"
        "  --safe-path          use safe BFS first (default)\n"
        "  --gems-only          ignore ghosts\n"
        "  --fallback           retry gems-only if safe-path unsolvable\n",
        prog);
}

static int ensure_dir(const char *path)
{
    if (MKDIR(path) == 0) return 0;
    return 0;
}

static char *trim(char *s)
{
    while (*s == ' ' || *s == '\t' || *s == '\r' || *s == '\n') s++;
    if (*s == '\0') return s;
    char *end = s + strlen(s) - 1;
    while (end > s && (*end == ' ' || *end == '\t' || *end == '\r' || *end == '\n')) {
        *end = '\0';
        end--;
    }
    return s;
}

static int process_entry(
    int level_id,
    const char *level_path,
    const char *out_dir,
    bool use_safe,
    bool allow_fallback)
{
    kl_level_t lvl;
    kl_solution_t sol;
    char err[512] = {0};
    char mode[32] = {0};

    char out_path[PATH_MAX_LOCAL];
    snprintf(out_path, sizeof(out_path), "%s/level_%d_solution.txt", out_dir, level_id);

    if (!kl_solve_level_file(level_path, use_safe, allow_fallback,
                             &lvl, &sol, mode, sizeof(mode), err, sizeof(err))) {
        fprintf(stderr, "  [level %d] ERROR: %s\n", level_id, err);
        kl_write_solution_txt(out_path, level_id, level_path, "", false, &sol, err);
        return 1;
    }

    if (!sol.solvable) {
        const char *note = use_safe
            ? "No safe-path solution; use --fallback or --gems-only"
            : "No gems-only solution";
        fprintf(stderr, "  [level %d] UNSOLVABLE (%s)\n", level_id, note);
        kl_write_solution_txt(out_path, level_id, level_path, mode, false, &sol, note);
        return 2;
    }

    if (!kl_write_solution_txt(out_path, level_id, level_path, mode, true, &sol, "")) {
        fprintf(stderr, "  [level %d] cannot write %s\n", level_id, out_path);
        return 3;
    }

    char seq[KL_MAX_CELLS + 1];
    kl_sequence_string(&sol, seq, sizeof(seq));
    printf("  [level %d] OK  mode=%s  moves=%d  seq=%s\n",
           level_id, mode, sol.n_moves, seq);
    printf("           -> %s\n", out_path);
    return 0;
}

int main(int argc, char **argv)
{
    const char *manifest_path = NULL;
    const char *output_dir    = NULL;
    bool use_safe       = true;
    bool allow_fallback = false;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--manifest") == 0 && i + 1 < argc) {
            manifest_path = argv[++i];
        } else if (strcmp(argv[i], "--output-dir") == 0 && i + 1 < argc) {
            output_dir = argv[++i];
        } else if (strcmp(argv[i], "--safe-path") == 0) {
            use_safe = true;
        } else if (strcmp(argv[i], "--gems-only") == 0) {
            use_safe = false;
            allow_fallback = false;
        } else if (strcmp(argv[i], "--fallback") == 0) {
            allow_fallback = true;
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            usage(argv[0]);
            return 0;
        } else {
            fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            usage(argv[0]);
            return 2;
        }
    }

    if (!manifest_path || !output_dir) {
        usage(argv[0]);
        return 2;
    }

    ensure_dir(output_dir);

    FILE *mf = fopen(manifest_path, "r");
    if (!mf) {
        fprintf(stderr, "Cannot open manifest: %s\n", manifest_path);
        return 1;
    }

    printf("solve_db\n");
    printf("  manifest:   %s\n", manifest_path);
    printf("  output-dir: %s\n", output_dir);
    printf("  mode:       %s%s\n",
           use_safe ? "safe-path" : "gems-only",
           allow_fallback ? " + fallback" : "");

    char line[LINE_MAX];
    int total = 0, ok = 0, failed = 0;

    while (fgets(line, sizeof(line), mf)) {
        char *s = trim(line);
        if (*s == '\0' || *s == '#') continue;

        char *sep = strchr(s, '|');
        if (!sep) {
            fprintf(stderr, "  skip invalid line (no '|'): %s\n", s);
            continue;
        }
        *sep = '\0';
        char *id_str = trim(s);
        char *path   = trim(sep + 1);

        int level_id = atoi(id_str);
        if (level_id <= 0 || *path == '\0') {
            fprintf(stderr, "  skip invalid entry: %s|%s\n", id_str, path);
            continue;
        }

        total++;
        int rc = process_entry(level_id, path, output_dir, use_safe, allow_fallback);
        if (rc == 0) ok++;
        else           failed++;
    }

    fclose(mf);

    printf("\nDone: %d level(s), %d solved, %d failed/unsolvable\n", total, ok, failed);
    return failed > 0 ? 1 : 0;
}
