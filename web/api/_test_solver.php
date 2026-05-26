<?php
// Quick CLI test: php _test_solver.php ../../levels/level4.txt [nosafe]
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

if ($argc < 2) { fwrite(STDERR, "Usage: php _test_solver.php <level_file> [nosafe]\n"); exit(1); }
$levelText = file_get_contents($argv[1]);
$safe      = !isset($argv[2]);

// ── Pull in all solver helper functions without running the request pipeline ──
// solve.php starts with: declare, error_reporting, ob_start, header, then checks
// REQUEST_METHOD and exits. We trick it by pre-defining the functions we need.
// Simpler: just call php_solve() after requiring a stripped version.
// For CLI testing we define a minimal php://input shim and fake POST.
$_SERVER['REQUEST_METHOD'] = 'POST';
// php_solve is defined inside solve.php after all the top-level code runs.
// We can't safely require it; instead just copy the functions below.

// ── Copy of all solver functions from solve.php ────────────────────────────
const DR  = [-1, 1, 0, 0];
const DC  = [0,  0, -1, 1];
const OPP = [1, 0, 3, 2];

function is_walkable(array $lvl, int $r, int $c): bool
{
    return $r >= 0 && $r < $lvl['h'] && $c >= 0 && $c < $lvl['w'] && $lvl['grid'][$r][$c] !== '#';
}
function perp_open(array $lvl, int $r, int $c, int $dir): bool
{
    $d1 = ($dir === 0 || $dir === 1) ? 2 : 0;
    $d2 = ($dir === 0 || $dir === 1) ? 3 : 1;
    return is_walkable($lvl, $r + DR[$d1], $c + DC[$d1])
        || is_walkable($lvl, $r + DR[$d2], $c + DC[$d2]);
}
function slide(array $lvl, int $r, int $c, int $dir, int $mask): ?array
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r + $dr; $cc = $c + $dc;
    if (!is_walkable($lvl, $cr, $cc)) return null;
    while (true) {
        $k = "$cr,$cc";
        if (isset($lvl['coin_idx'][$k])) $mask &= ~(1 << $lvl['coin_idx'][$k]);
        $nr = $cr + $dr; $nc = $cc + $dc;
        if (!is_walkable($lvl, $nr, $nc) || perp_open($lvl, $cr, $cc, $dir)) break;
        $cr = $nr; $cc = $nc;
    }
    return [$cr, $cc, $mask];
}
function parse_level(string $text): ?array
{
    $lines = explode("\n", str_replace("\r", "", $text));
    $w = $h = 0; $sr = $sc = -1; $ghosts = []; $inMap = false; $mapRows = [];
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
        } else { $mapRows[] = $line; }
    }
    if ($w <= 0 || $h <= 0 || $sr < 0) return null;
    $grid = [];
    for ($r = 0; $r < $h; $r++) {
        $row = str_pad($mapRows[$r] ?? '', $w, '#');
        $grid[] = str_split(substr($row, 0, $w));
    }
    $n_coins = 0; $coin_idx = []; $coin_r = []; $coin_c = []; $portals = [];
    for ($r = 0; $r < $h; $r++) for ($c = 0; $c < $w; $c++) {
        $ch = $grid[$r][$c];
        if ($ch === '.' || $ch === 'o' || $ch === 'c') {
            $coin_idx["$r,$c"] = $n_coins; $coin_r[] = $r; $coin_c[] = $c; $n_coins++;
        } elseif ($ch === '*') { $portals[] = [$r, $c]; }
    }
    return compact('w','h','sr','sc','grid','n_coins','coin_idx','coin_r','coin_c','ghosts','portals');
}
function compute_dist_from(array $lvl, int $src_r, int $src_c, int $n): array
{
    $dist = array_fill(0, $n, PHP_INT_MAX);
    $visited = []; $queue = [[$src_r, $src_c, 4, 0]]; $head = 0;
    $visited["$src_r,$src_c,4"] = 0;
    while ($head < count($queue)) {
        [$r, $c, $d, $g] = $queue[$head++];
        for ($nd = 0; $nd < 4; $nd++) {
            if ($d !== 4 && $nd === OPP[$d]) continue;
            $dr = DR[$nd]; $dc = DC[$nd];
            $cr = $r + $dr; $cc = $c + $dc;
            if (!is_walkable($lvl, $cr, $cc)) continue;
            while (true) {
                $k = "$cr,$cc";
                if (isset($lvl['coin_idx'][$k]) && $dist[$lvl['coin_idx'][$k]] === PHP_INT_MAX)
                    $dist[$lvl['coin_idx'][$k]] = $g + 1;
                $nr = $cr + $dr; $nc = $cc + $dc;
                if (!is_walkable($lvl, $nr, $nc) || perp_open($lvl, $cr, $cc, $nd)) break;
                $cr = $nr; $cc = $nc;
            }
            $vk = "$cr,$cc,$nd";
            if (!isset($visited[$vk]) || $visited[$vk] > $g + 1) {
                $visited[$vk] = $g + 1; $queue[] = [$cr, $cc, $nd, $g + 1];
            }
        }
    }
    return $dist;
}
function build_dist_matrix(array $lvl): array
{
    $n = $lvl['n_coins']; $dm = [];
    for ($i = 0; $i < $n; $i++)
        $dm[$i] = compute_dist_from($lvl, $lvl['coin_r'][$i], $lvl['coin_c'][$i], $n);
    $dm[$n] = compute_dist_from($lvl, $lvl['sr'], $lvl['sc'], $n);
    return $dm;
}
function mst_weight(array $dm, int $mask, int $n): int
{
    static $cache = [];
    if ($mask === 0) return 0;
    if (isset($cache[$mask])) return $cache[$mask];
    $nodes = []; for ($i = 0; $i < $n; $i++) if ($mask & (1 << $i)) $nodes[] = $i;
    $m = count($nodes);
    if ($m === 1) { $cache[$mask] = 0; return 0; }
    $key = array_fill(0, $m, PHP_INT_MAX); $in = array_fill(0, $m, false); $key[0] = 0; $total = 0;
    for ($iter = 0; $iter < $m; $iter++) {
        $u = -1; $minv = PHP_INT_MAX;
        for ($i = 0; $i < $m; $i++) if (!$in[$i] && $key[$i] < $minv) { $minv = $key[$i]; $u = $i; }
        if ($u < 0) { $cache[$mask] = PHP_INT_MAX >> 1; return PHP_INT_MAX >> 1; }
        $in[$u] = true; $total += $minv; $a = $nodes[$u];
        for ($i = 0; $i < $m; $i++) {
            if ($in[$i]) continue;
            $b = $nodes[$i];
            $d = min($dm[$a][$b] ?? PHP_INT_MAX, $dm[$b][$a] ?? PHP_INT_MAX);
            if ($d < $key[$i]) $key[$i] = $d;
        }
    }
    $cache[$mask] = $total; return $total;
}
function state_key(int $r, int $c, int $d, int $mask, int $turn): string
{
    if ($turn < 0) return pack('VCCC', $mask, $r, $c, $d);
    return pack('VCCCC', $mask, $r, $c, $d, min($turn, 127));
}
function heap_push(array &$heap, array $entry): void
{
    $heap[] = $entry; $i = count($heap) - 1;
    while ($i > 0) { $p = ($i-1) >> 1; if ($heap[$p][0] <= $heap[$i][0]) break; [$heap[$p],$heap[$i]] = [$heap[$i],$heap[$p]]; $i = $p; }
}
function heap_pop(array &$heap): array
{
    $top = $heap[0]; $last = array_pop($heap);
    if (!empty($heap)) {
        $heap[0] = $last; $n = count($heap); $i = 0;
        while (true) { $l=2*$i+1; $r=2*$i+2; $s=$i; if($l<$n&&$heap[$l][0]<$heap[$s][0])$s=$l; if($r<$n&&$heap[$r][0]<$heap[$s][0])$s=$r; if($s===$i)break; [$heap[$s],$heap[$i]]=[$heap[$i],$heap[$s]]; $i=$s; }
    }
    return $top;
}
function reconstruct(array $parent, string $sk): array
{
    $moves = []; $cur = $sk;
    while ($parent[$cur] !== null) { [$prev,$move] = $parent[$cur]; $moves[] = $move; $cur = $prev; }
    return array_reverse($moves);
}

// ── Run ────────────────────────────────────────────────────────────────────
$lvl = parse_level($levelText);
if ($lvl === null) { echo "PARSE ERROR\n"; exit(1); }
echo "Parsed: {$lvl['w']}x{$lvl['h']}, {$lvl['n_coins']} gems, start ({$lvl['sr']},{$lvl['sc']})\n";
echo "Ghosts: " . json_encode($lvl['ghosts']) . "\n";

ini_set('memory_limit', '512M');
$t0 = microtime(true);
$full = (1 << $lvl['n_coins']) - 1;
$dm   = build_dist_matrix($lvl);
echo "Distance matrix built in " . round(microtime(true) - $t0, 3) . "s\n";

$nodeLimit = 1500000;
$memLimit  = (int)((int)rtrim((string)ini_get('memory_limit'), 'MGKBmgkb') * 1048576);
$memCap    = $memLimit > 0 ? (int)($memLimit * 0.75) : 384*1048576;
echo "Memory cap: " . round($memCap/1048576) . " MB\n";

$heap = []; $best = []; $parent = [];
$sk0 = state_key($lvl['sr'], $lvl['sc'], 4, $full, $safe ? 0 : -1);
heap_push($heap, [mst_weight($dm, $full, $lvl['n_coins']), 0, $lvl['sr'], $lvl['sc'], 4, $full, 0, $sk0]);
$best[$sk0] = 0; $parent[$sk0] = null;
$dirs = 'UDLR';

for ($iter = 0; ; $iter++) {
    if (empty($heap))          { echo "NO_PATH\n"; break; }
    if (count($best) > $nodeLimit || memory_get_usage() > $memCap) { echo "NODE_LIMIT after $iter iters, " . count($best) . " states, mem=" . round(memory_get_usage()/1048576) . "MB\n"; break; }
    if (microtime(true)-$t0 > 14) { echo "TIME_LIMIT after $iter iters\n"; break; }

    [,$g,$r,$c,$d,$mask,$turn,$sk] = heap_pop($heap);
    if (isset($best[$sk]) && $best[$sk] < $g) continue;
    if ($mask === 0) {
        $moves = reconstruct($parent, $sk);
        echo "FOUND in " . round(microtime(true)-$t0,3) . "s, " . count($best) . " states, " . count($moves) . " moves: " . implode(' ', $moves) . "\n";
        break;
    }
    if ($safe && $turn >= 120) continue;
    for ($nd = 0; $nd < 4; $nd++) {
        if ($d !== 4 && $nd === OPP[$d]) continue;
        $s = slide($lvl, $r, $c, $nd, $mask);
        if ($s === null) continue;
        [$nr,$nc,$nm] = $s;
        $nt = $turn + 1;
        $ng = $g + 1;
        $nsk = state_key($nr, $nc, $nd, $nm, $safe ? $nt : -1);
        if (isset($best[$nsk]) && $best[$nsk] <= $ng) continue;
        $best[$nsk] = $ng; $parent[$nsk] = [$sk, $dirs[$nd]];
        heap_push($heap, [$ng + mst_weight($dm, $nm, $lvl['n_coins']), $ng, $nr, $nc, $nd, $nm, $nt, $nsk]);
    }
}
echo "Total time: " . round(microtime(true)-$t0,3) . "s\n";
