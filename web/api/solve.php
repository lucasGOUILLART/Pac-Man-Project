<?php
/**
 * api/solve.php — Solver bridge.
 *
 * Priority: compiled C binary (solver/solver.exe or solver/solver).
 * Fallback:  pure PHP A* implementation — works without any compilation.
 *
 * POST JSON body:  { "level": "...", "requireSafe": bool, "allowFallback": bool }
 * Response JSON:   { "found": bool, "moves": [...], "ghostsConsidered": bool,
 *                    "fallback": bool, "reason": null|string }
 */
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');
ob_start();          // buffer everything — only clean JSON goes to the client
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['found' => false, 'moves' => [], 'reason' => 'method_not_allowed']);
    exit;
}

$req = json_decode(file_get_contents('php://input'), true);
if (!is_array($req) || empty($req['level']) || !is_string($req['level'])) {
    http_response_code(400);
    echo json_encode(['found' => false, 'moves' => [], 'reason' => 'bad_request']);
    exit;
}

$levelText     = $req['level'];
$requireSafe   = ($req['requireSafe']   ?? true)  === true;
$allowFallback = ($req['allowFallback'] ?? false) === true;

// ── 1. Try the compiled C binary ────────────────────────────────────────────

$projectRoot = dirname(__DIR__, 2);
$binary      = null;
foreach ([$projectRoot . '/solver/solver', $projectRoot . '/solver/solver.exe'] as $c) {
    if (is_file($c)) { $binary = $c; break; }
}

if ($binary !== null && function_exists('exec')) {
    $tmp = tempnam(sys_get_temp_dir(), 'omb_lvl_');
    if ($tmp !== false && file_put_contents($tmp, $levelText) !== false) {
        $null    = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? '2>NUL' : '2>/dev/null';
        $safeUsed = $requireSafe;
        $fellBack = false;

        $res = run_c_solver($binary, $tmp, $requireSafe, $null);
        if (($res['code'] !== 0 || $res['unsolvable']) && $requireSafe && $allowFallback) {
            $res2 = run_c_solver($binary, $tmp, false, $null);
            if ($res2['code'] === 0 && !$res2['unsolvable']) {
                $res = $res2; $safeUsed = false; $fellBack = true;
            }
        }
        @unlink($tmp);

        $moves = [];
        foreach ($res['out'] as $line) {
            $line = trim($line);
            if (in_array($line, ['U','D','L','R'], true)) $moves[] = $line;
        }
        if ($res['code'] === 0 && !$res['unsolvable']) {
            echo json_encode(['found' => true, 'moves' => $moves,
                'ghostsConsidered' => $safeUsed, 'fallback' => $fellBack, 'reason' => null]);
            exit;
        }
        if ($res['unsolvable']) {
            echo json_encode(['found' => false, 'moves' => [],
                'ghostsConsidered' => $safeUsed, 'fallback' => $fellBack, 'reason' => 'no_path']);
            exit;
        }
    }
}

// ── 2. PHP fallback A* solver ────────────────────────────────────────────────

try {
    $result = php_solve($levelText, $requireSafe, $allowFallback);
} catch (Throwable $e) {
    $result = ['found' => false, 'moves' => [], 'ghostsConsidered' => false, 'fallback' => false, 'reason' => 'solver_error'];
}
ob_end_clean();  // discard any warnings/notices accumulated in buffer
echo json_encode($result);
exit;

// ── C binary helper ──────────────────────────────────────────────────────────

function run_c_solver(string $bin, string $file, bool $safe, string $null): array
{
    $cmd = escapeshellarg($bin) . ' ' . escapeshellarg($file) . ' --moves-only';
    if ($safe) $cmd .= ' --safe-path';
    $out = []; $code = 0;
    exec($cmd . ' ' . $null, $out, $code);
    return ['out' => $out, 'code' => $code, 'unsolvable' => count($out) === 1 && trim($out[0]) === 'UNSOLVABLE'];
}

// ════════════════════════════════════════════════════════════════════════════
// PHP A* SOLVER
// State: (row, col, last_dir, gem_mask)
// Heuristic: MST on remaining gems (Prim, O(n²))
// Ghost-safe mode: precompute R/G/B trajectories for 120 turns
// ════════════════════════════════════════════════════════════════════════════

function php_solve(string $text, bool $requireSafe, bool $allowFallback): array
{
    ini_set('memory_limit', '512M');
    $lvl = parse_level($text);
    if ($lvl === null) return ['found' => false, 'moves' => [], 'ghostsConsidered' => false, 'fallback' => false, 'reason' => 'bad_request'];
    if ($lvl['n_coins'] === 0) return ['found' => true, 'moves' => [], 'ghostsConsidered' => $requireSafe, 'fallback' => false, 'reason' => null];

    $safe = $requireSafe && has_ghosts($lvl);
    $res  = astar($lvl, $safe);

    if (!$res['found'] && $requireSafe && $allowFallback && $safe) {
        $res2 = astar($lvl, false);
        if ($res2['found']) {
            $res2['ghostsConsidered'] = false;
            $res2['fallback']         = true;
            return $res2;
        }
        // Propagate the most informative reason (time_limit > node_limit > no_path)
        if (in_array($res2['reason'], ['time_limit', 'node_limit'], true)) {
            $res['reason'] = $res2['reason'];
        }
    }
    $res['ghostsConsidered'] = $safe;
    $res['fallback']         = false;
    return $res;
}

// ── Level parser ─────────────────────────────────────────────────────────────

function parse_level(string $text): ?array
{
    $lines  = explode("\n", str_replace("\r", "", $text));
    $w = $h = 0;
    $sr = $sc = -1;
    $ghosts = [];
    $inMap  = false;
    $mapRows = [];

    foreach ($lines as $line) {
        if (!$inMap) {
            if (trim($line) === 'MAP') { $inMap = true; continue; }
            $parts = preg_split('/\s+/', trim($line));
            if (empty($parts[0])) continue;
            switch ($parts[0]) {
                case 'W': $w = (int)$parts[1]; break;
                case 'H': $h = (int)$parts[1]; break;
                case 'P': $sr = (int)$parts[1]; $sc = (int)$parts[2]; break;
                case 'R': $ghosts['R'] = [(int)$parts[1], (int)$parts[2]]; break;
                case 'G': $ghosts['G'] = [(int)$parts[1], (int)$parts[2]]; break;
                case 'Y': $ghosts['Y'] = [(int)$parts[1], (int)$parts[2]]; break;
                case 'B': $ghosts['B'] = [(int)$parts[1], (int)$parts[2]]; break;
            }
        } else {
            $mapRows[] = $line;
        }
    }
    if ($w <= 0 || $h <= 0 || $sr < 0) return null;

    $grid = [];
    for ($r = 0; $r < $h; $r++) {
        $row = str_pad($mapRows[$r] ?? '', $w, '#');
        $grid[] = str_split(substr($row, 0, $w));
    }

    $n_coins   = 0;
    $coin_idx  = [];   // "r,c" => index
    $coin_r    = [];
    $coin_c    = [];
    $portals   = [];

    for ($r = 0; $r < $h; $r++) {
        for ($c = 0; $c < $w; $c++) {
            $ch = $grid[$r][$c];
            if ($ch === '.' || $ch === 'o' || $ch === 'c') {
                $coin_idx["$r,$c"] = $n_coins;
                $coin_r[] = $r; $coin_c[] = $c;
                $n_coins++;
            } elseif ($ch === '*') {
                $portals[] = [$r, $c];
            }
        }
    }

    return compact('w','h','sr','sc','grid','n_coins','coin_idx','coin_r','coin_c','ghosts','portals');
}

function has_ghosts(array $lvl): bool
{
    return !empty($lvl['ghosts']['R']) || !empty($lvl['ghosts']['G']) || !empty($lvl['ghosts']['B']);
}

// ── Slide mechanics ───────────────────────────────────────────────────────────

const DR = [-1, 1, 0, 0];  // U D L R
const DC = [0,  0, -1, 1];
const OPP = [1, 0, 3, 2];

function is_walkable(array $lvl, int $r, int $c): bool
{
    return $r >= 0 && $r < $lvl['h'] && $c >= 0 && $c < $lvl['w'] && $lvl['grid'][$r][$c] !== '#';
}

function perp_open(array $lvl, int $r, int $c, int $dir): bool
{
    // perpendicular dirs: for U/D → L/R; for L/R → U/D
    if ($dir === 0 || $dir === 1) { $d1 = 2; $d2 = 3; }
    else                          { $d1 = 0; $d2 = 1; }
    return is_walkable($lvl, $r + DR[$d1], $c + DC[$d1])
        || is_walkable($lvl, $r + DR[$d2], $c + DC[$d2]);
}

/** Returns [end_r, end_c, new_mask] or null if blocked. */
function slide(array $lvl, int $r, int $c, int $dir, int $mask): ?array
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r + $dr; $cc = $c + $dc;
    if (!is_walkable($lvl, $cr, $cc)) return null;

    while (true) {
        $k = "$cr,$cc";
        if (isset($lvl['coin_idx'][$k])) $mask &= ~(1 << $lvl['coin_idx'][$k]);
        $nr = $cr + $dr; $nc = $cc + $dc;
        $nwall = !is_walkable($lvl, $nr, $nc);
        $junc  = perp_open($lvl, $cr, $cc, $dir);
        if ($nwall || $junc) break;
        $cr = $nr; $cc = $nc;
    }
    return [$cr, $cc, $mask];
}

// ── Distance matrix for MST heuristic ────────────────────────────────────────

function compute_dist_from(array $lvl, int $src_r, int $src_c, int $n): array
{
    $dist = array_fill(0, $n, PHP_INT_MAX);
    // BFS over (r, c, dir) states; dir=4 means NONE
    $visited = []; // "r,c,dir" => cost
    $queue   = [[$src_r, $src_c, 4, 0]]; // [r, c, last_dir, g]
    $head    = 0;
    $visited["$src_r,$src_c,4"] = 0;

    while ($head < count($queue)) {
        [$r, $c, $d, $g] = $queue[$head++];
        for ($nd = 0; $nd < 4; $nd++) {
            if ($d !== 4 && $nd === OPP[$d]) continue;
            $dr = DR[$nd]; $dc = DC[$nd];
            $cr = $r + $dr; $cc = $c + $dc;
            if (!is_walkable($lvl, $cr, $cc)) continue;
            // simulate slide, record gems along path
            while (true) {
                $k = "$cr,$cc";
                if (isset($lvl['coin_idx'][$k]) && $dist[$lvl['coin_idx'][$k]] === PHP_INT_MAX) {
                    $dist[$lvl['coin_idx'][$k]] = $g + 1;
                }
                $nr = $cr + $dr; $nc = $cc + $dc;
                $nwall = !is_walkable($lvl, $nr, $nc);
                $junc  = perp_open($lvl, $cr, $cc, $nd);
                if ($nwall || $junc) break;
                $cr = $nr; $cc = $nc;
            }
            $vk = "$cr,$cc,$nd";
            if (!isset($visited[$vk]) || $visited[$vk] > $g + 1) {
                $visited[$vk] = $g + 1;
                $queue[] = [$cr, $cc, $nd, $g + 1];
            }
        }
    }
    return $dist;
}

function build_dist_matrix(array $lvl): array
{
    $n  = $lvl['n_coins'];
    $dm = [];
    for ($i = 0; $i < $n; $i++) {
        $dm[$i] = compute_dist_from($lvl, $lvl['coin_r'][$i], $lvl['coin_c'][$i], $n);
    }
    $dm[$n] = compute_dist_from($lvl, $lvl['sr'], $lvl['sc'], $n); // from start
    return $dm;
}

function mst_weight(array $dm, int $mask, int $n): int
{
    static $cache = [];
    if ($mask === 0) return 0;
    if (isset($cache[$mask])) return $cache[$mask];

    $nodes = [];
    for ($i = 0; $i < $n; $i++) if ($mask & (1 << $i)) $nodes[] = $i;
    $m = count($nodes);
    if ($m === 1) { $cache[$mask] = 0; return 0; }

    $key = array_fill(0, $m, PHP_INT_MAX);
    $in  = array_fill(0, $m, false);
    $key[0] = 0;
    $total  = 0;
    for ($iter = 0; $iter < $m; $iter++) {
        $u = -1; $minv = PHP_INT_MAX;
        for ($i = 0; $i < $m; $i++) {
            if (!$in[$i] && $key[$i] < $minv) { $minv = $key[$i]; $u = $i; }
        }
        if ($u < 0) { $cache[$mask] = PHP_INT_MAX >> 1; return PHP_INT_MAX >> 1; }
        $in[$u] = true; $total += $minv;
        $a = $nodes[$u];
        for ($i = 0; $i < $m; $i++) {
            if ($in[$i]) continue;
            $b  = $nodes[$i];
            $d  = min($dm[$a][$b] ?? PHP_INT_MAX, $dm[$b][$a] ?? PHP_INT_MAX);
            if ($d < $key[$i]) $key[$i] = $d;
        }
    }
    $cache[$mask] = $total;
    return $total;
}

// ── Ghost trajectory precomputation ──────────────────────────────────────────

function ghost_slide(array $lvl, int $r, int $c, int $dir): array
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r + $dr; $cc = $c + $dc;
    if (!is_walkable($lvl, $cr, $cc)) return [$r, $c];
    while (true) {
        $nr = $cr + $dr; $nc = $cc + $dc;
        if (!is_walkable($lvl, $nr, $nc) || perp_open($lvl, $cr, $cc, $dir)) break;
        $cr = $nr; $cc = $nc;
    }
    return [$cr, $cc];
}

function ghost_next_dir(array $lvl, int $r, int $c, int $last, bool $isRed): int
{
    $pR = [3, 1, 2, 0]; // R D L U
    $pG = [0, 2, 1, 3]; // U L D R
    $prio = $isRed ? $pR : $pG;
    $rev  = $last >= 0 ? OPP[$last] : -1;
    foreach ($prio as $d) {
        if ($d === $rev) continue;
        if (is_walkable($lvl, $r + DR[$d], $c + DC[$d])) return $d;
    }
    if ($rev >= 0 && is_walkable($lvl, $r + DR[$rev], $c + DC[$rev])) return $rev;
    return -1;
}

function precompute_ghosts(array $lvl, int $maxTurns = 120): array
{
    $trajs = [];
    foreach (['R', 'G', 'B'] as $type) {
        if (empty($lvl['ghosts'][$type])) continue;
        [$gr, $gc] = $lvl['ghosts'][$type];
        $states = [[$gr, $gc, true]]; // [r, c, visible]
        $last   = -1; $tc = 0;
        for ($t = 1; $t <= $maxTurns; $t++) {
            if ($type === 'B') {
                $tc++;
                if ($tc % 2 === 0) {
                    $portals = $lvl['portals'];
                    if (!empty($portals)) {
                        $idx = -1;
                        foreach ($portals as $pi => $p) {
                            if ($p[0] === $gr && $p[1] === $gc) { $idx = $pi; break; }
                        }
                        $next = (($idx + 1) % count($portals));
                        $gr = $portals[$next][0]; $gc = $portals[$next][1];
                    }
                    $vis = true;
                } else { $vis = false; }
            } else {
                $d = ghost_next_dir($lvl, $gr, $gc, $last, $type === 'R');
                if ($d >= 0) { [$gr, $gc] = ghost_slide($lvl, $gr, $gc, $d); $last = $d; }
                $vis = true;
            }
            $states[] = [$gr, $gc, $vis];
        }
        $trajs[$type] = $states;
    }
    return $trajs;
}

function slide_is_safe(array $lvl, int $r, int $c, int $dir, int $turn, array $trajs): bool
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r; $cc = $c; $first = false;
    while (true) {
        foreach ($trajs as $st) {
            if (isset($st[$turn]) && $st[$turn][2] && $st[$turn][0] === $cr && $st[$turn][1] === $cc) return false;
        }
        if (!$first) {
            if (!is_walkable($lvl, $cr + $dr, $cc + $dc)) return false;
            $cr += $dr; $cc += $dc; $first = true; continue;
        }
        $nr = $cr + $dr; $nc = $cc + $dc;
        if (!is_walkable($lvl, $nr, $nc) || perp_open($lvl, $cr, $cc, $dir)) break;
        $cr = $nr; $cc = $nc;
    }
    return true;
}

// ── A* core ───────────────────────────────────────────────────────────────────

/**
 * Min-heap backed by a flat array.
 * Each entry: [f (int), g (int), r, c, d, mask, turn, state_key (string)]
 * We sift by $entry[0] (f).
 */
function heap_push(array &$heap, array $entry): void
{
    $heap[] = $entry;
    $i = count($heap) - 1;
    while ($i > 0) {
        $p = ($i - 1) >> 1;
        if ($heap[$p][0] <= $heap[$i][0]) break;
        [$heap[$p], $heap[$i]] = [$heap[$i], $heap[$p]];
        $i = $p;
    }
}

function heap_pop(array &$heap): array
{
    $top = $heap[0];
    $last = array_pop($heap);
    if (!empty($heap)) {
        $heap[0] = $last;
        $n = count($heap);
        $i = 0;
        while (true) {
            $l = 2*$i+1; $r = 2*$i+2; $s = $i;
            if ($l < $n && $heap[$l][0] < $heap[$s][0]) $s = $l;
            if ($r < $n && $heap[$r][0] < $heap[$s][0]) $s = $r;
            if ($s === $i) break;
            [$heap[$s], $heap[$i]] = [$heap[$i], $heap[$s]];
            $i = $s;
        }
    }
    return $top;
}

function state_key(int $r, int $c, int $d, int $mask, int $turn): string
{
    // Compact binary key: 7 bytes (no-safe) or 8 bytes (safe)
    if ($turn < 0) return pack('VCCC', $mask, $r, $c, $d);          // 4+1+1+1=7
    return pack('VCCCC', $mask, $r, $c, $d, min($turn, 127));       // 4+1+1+1+1=8
}

function astar(array $lvl, bool $safe): array
{
    set_time_limit(30);
    $n     = $lvl['n_coins'];
    $full  = (1 << $n) - 1;
    $dm    = build_dist_matrix($lvl);
    $trajs = $safe ? precompute_ghosts($lvl) : [];

    $heap   = [];  // flat binary min-heap
    $best   = [];  // state_key => best_g
    $parent = [];  // state_key => [parent_key, move_char] | null

    $t0        = microtime(true);
    $nodeLimit = 1500000;   // secondary cap; memory check below is primary
    $memRaw    = (string)ini_get('memory_limit');
    $memMult   = stripos($memRaw, 'g') !== false ? 1073741824
               : (stripos($memRaw, 'm') !== false ? 1048576 : 1024);
    $memLimit  = (int)rtrim($memRaw, 'MGKBmgkb') * $memMult;
    $memCap    = $memLimit > 0 ? (int)($memLimit * 0.75) : 384 * 1048576; // unlimited → use 384 MB

    $sk0 = state_key($lvl['sr'], $lvl['sc'], 4, $full, $safe ? 0 : -1);
    $h0  = mst_weight($dm, $full, $n);
    heap_push($heap, [$h0, 0, $lvl['sr'], $lvl['sc'], 4, $full, 0, $sk0]);
    $best[$sk0]   = 0;
    $parent[$sk0] = null;

    $dirs = 'UDLR';

    $hitTimeLimit = false;
    $hitNodeLimit = false;

    while (!empty($heap)) {
        if (count($best) > $nodeLimit || memory_get_usage() > $memCap) { $hitNodeLimit = true; break; }
        if (microtime(true) - $t0 > 14.0) { $hitTimeLimit = true; break; }

        [,$g, $r, $c, $d, $mask, $turn, $sk] = heap_pop($heap);

        if (isset($best[$sk]) && $best[$sk] < $g) continue; // stale entry

        if ($mask === 0) {
            return ['found' => true, 'moves' => reconstruct($parent, $sk), 'reason' => null];
        }
        if ($safe && $turn >= 120) continue;

        for ($nd = 0; $nd < 4; $nd++) {
            if ($d !== 4 && $nd === OPP[$d]) continue;
            $s = slide($lvl, $r, $c, $nd, $mask);
            if ($s === null) continue;
            [$nr, $nc, $nm] = $s;
            $nt = $turn + 1;
            if ($safe && !slide_is_safe($lvl, $r, $c, $nd, $nt, $trajs)) continue;
            $ng  = $g + 1;
            $nsk = state_key($nr, $nc, $nd, $nm, $safe ? $nt : -1);
            if (isset($best[$nsk]) && $best[$nsk] <= $ng) continue;
            $best[$nsk]   = $ng;
            $parent[$nsk] = [$sk, $dirs[$nd]];
            $h = mst_weight($dm, $nm, $n);
            heap_push($heap, [$ng + $h, $ng, $nr, $nc, $nd, $nm, $nt, $nsk]);
        }
    }
    if ($hitTimeLimit) return ['found' => false, 'moves' => [], 'reason' => 'time_limit'];
    if ($hitNodeLimit) return ['found' => false, 'moves' => [], 'reason' => 'node_limit'];
    return ['found' => false, 'moves' => [], 'reason' => 'no_path'];
}

function reconstruct(array $parent, string $sk): array
{
    $moves = [];
    $cur   = $sk;
    while ($parent[$cur] !== null) {
        [$prev, $move] = $parent[$cur];
        $moves[] = $move;
        $cur = $prev;
    }
    return array_reverse($moves);
}
