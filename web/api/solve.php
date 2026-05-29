<?php
/**
 * api/solve.php — Pont vers le solveur de niveaux.
 *
 * Priorité : binaire C compilé (solver/solver.exe ou solver/solver).
 * Repli :    implémentation A* en PHP pur — fonctionne sans compilation.
 *
 * Corps POST (JSON) :  { "level": "...", "requireSafe": bool, "allowFallback": bool }
 * Réponse (JSON) :     { "found": bool, "moves": [...], "ghostsConsidered": bool,
 *                        "fallback": bool, "reason": null|string }
 */
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');
ob_start();          // On bufferise tout — seul du JSON propre est envoyé au client
header('Content-Type: application/json');

// Constantes pour les déplacements dans les 4 directions (U=0, D=1, L=2, R=3)
define('DR',  [-1, 1, 0, 0]);   // Deltarow : haut, bas, gauche, droite
define('DC',  [0,  0, -1, 1]);   // Deltacol
define('OPP', [1,  0,  3,  2]); // Direction opposée à chaque indice

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
$requireSafe   = ($req['requireSafe']   ?? true)  === true;  // Par défaut, on cherche un chemin sans fantômes
$allowFallback = ($req['requireSafe']   ?? false) === true;  // Autoriser un chemin gemmes-only si pas de chemin sûr ?
$allowFallback = ($req['allowFallback'] ?? false) === true;

// ── 1. Essai du binaire C compilé ──────────────────────────────────────────────

$projectRoot = dirname(__DIR__, 2);
$binary      = null;
foreach ([$projectRoot . '/solver/solver', $projectRoot . '/solver/solver.exe'] as $c) {
    if (is_file($c)) { $binary = $c; break; }
}

if ($binary !== null && function_exists('exec')) {
    // On écrit le texte du niveau dans un fichier temporaire pour le passer au binaire
    $tmp = tempnam(sys_get_temp_dir(), 'omb_lvl_');
    if ($tmp !== false && file_put_contents($tmp, $levelText) !== false) {
        $null    = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? '2>NUL' : '2>/dev/null';
        $safeUsed = $requireSafe;
        $fellBack = false;

        $res = run_c_solver($binary, $tmp, $requireSafe, $null);
        // Si le solveur sûr échoue et que le repli est autorisé, on réessaie sans contrainte fantômes
        if (($res['code'] !== 0 || $res['unsolvable']) && $requireSafe && $allowFallback) {
            $res2 = run_c_solver($binary, $tmp, false, $null);
            if ($res2['code'] === 0 && !$res2['unsolvable']) {
                $res = $res2; $safeUsed = false; $fellBack = true;
            }
        }
        @unlink($tmp); // Nettoyage du fichier temporaire

        // On extrait les mouvements (U/D/L/R) de la sortie du binaire
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

// ── 2. Repli vers le solveur A* en PHP pur ───────────────────────────────────

try {
    $result = php_solve($levelText, $requireSafe, $allowFallback);
} catch (Throwable $e) {
    $result = ['found' => false, 'moves' => [], 'ghostsConsidered' => false, 'fallback' => false, 'reason' => 'solver_error'];
}
ob_end_clean();  // On efface les éventuels warnings accumulés dans le buffer
echo json_encode($result);
exit;

// ── Fonction d'appel du binaire C ─────────────────────────────────────────────

function run_c_solver(string $bin, string $file, bool $safe, string $null): array
{
    $cmd = escapeshellarg($bin) . ' ' . escapeshellarg($file) . ' --moves-only';
    if ($safe) $cmd .= ' --safe-path'; // Mode sûr : le solveur évite les fantômes
    $out = []; $code = 0;
    exec($cmd . ' ' . $null, $out, $code);
    return ['out' => $out, 'code' => $code, 'unsolvable' => count($out) === 1 && trim($out[0]) === 'UNSOLVABLE'];
}

// ════════════════════════════════════════════════════════════════════════════
// SOLVEUR A* EN PHP PUR
// État : (ligne, colonne, dernière_direction, masque_gemmes)
// Heuristique : poids de l'arbre couvrant minimal sur les gemmes restantes (Prim, O(n²))
// Mode sûr : pré-calcul des trajectoires R/G/B sur 120 tours
// ════════════════════════════════════════════════════════════════════════════

function php_solve(string $text, bool $requireSafe, bool $allowFallback): array
{
    ini_set('memory_limit', '512M'); // On alloue plus de mémoire pour les grandes cartes
    $lvl = parse_level($text);
    if ($lvl === null) return ['found' => false, 'moves' => [], 'ghostsConsidered' => false, 'fallback' => false, 'reason' => 'bad_request'];
    if ($lvl['n_coins'] === 0) return ['found' => true, 'moves' => [], 'ghostsConsidered' => $requireSafe, 'fallback' => false, 'reason' => null];

    // On active le mode sûr uniquement s'il y a des fantômes sur la carte
    $safe = $requireSafe && has_ghosts($lvl);
    $res  = astar($lvl, $safe);

    // Si le chemin sûr n'existe pas et que le repli est autorisé, on réessaie sans fantômes
    if (!$res['found'] && $requireSafe && $allowFallback && $safe) {
        $res2 = astar($lvl, false);
        if ($res2['found']) {
            $res2['ghostsConsidered'] = false;
            $res2['fallback']         = true;
            return $res2;
        }
        // On propage la raison la plus informative (time_limit > node_limit > no_path)
        if (in_array($res2['reason'], ['time_limit', 'node_limit'], true)) {
            $res['reason'] = $res2['reason'];
        }
    }
    $res['ghostsConsidered'] = $safe;
    $res['fallback']         = false;
    return $res;
}

// ── Parseur de carte ──────────────────────────────────────────────────────────

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
                case 'R': $ghosts['R'] = [(int)$parts[1], (int)$parts[2]]; break; // Fantôme rouge
                case 'G': $ghosts['G'] = [(int)$parts[1], (int)$parts[2]]; break; // Fantôme vert
                case 'Y': $ghosts['Y'] = [(int)$parts[1], (int)$parts[2]]; break; // Fantôme jaune
                case 'B': $ghosts['B'] = [(int)$parts[1], (int)$parts[2]]; break; // Fantôme bleu
            }
        } else {
            $mapRows[] = $line;
        }
    }
    if ($w <= 0 || $h <= 0 || $sr < 0) return null;

    // Construction de la grille 2D en complétant les lignes trop courtes avec des murs
    $grid = [];
    for ($r = 0; $r < $h; $r++) {
        $row = str_pad($mapRows[$r] ?? '', $w, '#');
        $grid[] = str_split(substr($row, 0, $w));
    }

    // Indexation des gemmes (., o, c) et des portails (*) pour accès O(1)
    $n_coins   = 0;
    $coin_idx  = [];   // "r,c" => index de la gemme
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

// Vérifie si le niveau contient des fantômes actifs (R, G ou B — pas le jaune qui ne glisse pas)
function has_ghosts(array $lvl): bool
{
    return !empty($lvl['ghosts']['R']) || !empty($lvl['ghosts']['G']) || !empty($lvl['ghosts']['B']);
}

// ── Mécanique de glissement ───────────────────────────────────────────────────

// Vérifie si la case (r, c) est accessible (dans les limites et non-mur)
function is_walkable(array $lvl, int $r, int $c): bool
{
    return $r >= 0 && $r < $lvl['h'] && $c >= 0 && $c < $lvl['w'] && $lvl['grid'][$r][$c] !== '#';
}

// Vérifie si la case (r, c) est une intersection perpendiculaire à la direction de déplacement
function perp_open(array $lvl, int $r, int $c, int $dir): bool
{
    // Directions perpendiculaires : U/D → L/R ; L/R → U/D
    if ($dir === 0 || $dir === 1) { $d1 = 2; $d2 = 3; }
    else                          { $d1 = 0; $d2 = 1; }
    return is_walkable($lvl, $r + DR[$d1], $c + DC[$d1])
        || is_walkable($lvl, $r + DR[$d2], $c + DC[$d2]);
}

/**
 * Simule un glissement depuis (r, c) dans la direction dir.
 * Retourne [ligne_fin, colonne_fin, masque_gemmes_restantes] ou null si bloqué immédiatement.
 */
function slide(array $lvl, int $r, int $c, int $dir, int $mask): ?array
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r + $dr; $cc = $c + $dc;
    if (!is_walkable($lvl, $cr, $cc)) return null; // Mur immédiatement devant

    while (true) {
        $k = "$cr,$cc";
        // On collecte la gemme si la case en contient une (bit à 0 dans le masque = collectée)
        if (isset($lvl['coin_idx'][$k])) $mask &= ~(1 << $lvl['coin_idx'][$k]);
        $nr = $cr + $dr; $nc = $cc + $dc;
        $nwall = !is_walkable($lvl, $nr, $nc);
        $junc  = perp_open($lvl, $cr, $cc, $dir);
        if ($nwall || $junc) break; // On s'arrête au mur ou à l'intersection
        $cr = $nr; $cc = $nc;
    }
    return [$cr, $cc, $mask];
}

// ── Matrice de distances pour l'heuristique MST ───────────────────────────────

// Calcule par BFS la distance minimale (en nombre de tours) depuis (src_r, src_c) vers chaque gemme
function compute_dist_from(array $lvl, int $src_r, int $src_c, int $n): array
{
    $dist = array_fill(0, $n, PHP_INT_MAX);
    $visited = []; // "r,c,dir" => coût le plus faible atteint
    $queue   = [[$src_r, $src_c, 4, 0]]; // [r, c, dernière_dir (4=aucune), g]
    $head    = 0;
    $visited["$src_r,$src_c,4"] = 0;

    while ($head < count($queue)) {
        [$r, $c, $d, $g] = $queue[$head++];
        for ($nd = 0; $nd < 4; $nd++) {
            if ($d !== 4 && $nd === OPP[$d]) continue; // Pas de demi-tour
            $dr = DR[$nd]; $dc = DC[$nd];
            $cr = $r + $dr; $cc = $c + $dc;
            if (!is_walkable($lvl, $cr, $cc)) continue;
            // On simule le glissement et on note les gemmes rencontrées en chemin
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

// Construit la matrice complète des distances entre chaque paire de gemmes + depuis le départ
function build_dist_matrix(array $lvl): array
{
    $n  = $lvl['n_coins'];
    $dm = [];
    for ($i = 0; $i < $n; $i++) {
        $dm[$i] = compute_dist_from($lvl, $lvl['coin_r'][$i], $lvl['coin_c'][$i], $n);
    }
    $dm[$n] = compute_dist_from($lvl, $lvl['sr'], $lvl['sc'], $n); // Distance depuis la position de départ
    return $dm;
}

// Calcule le poids de l'arbre couvrant minimal des gemmes restantes (heuristique admissible pour A*)
function mst_weight(array $dm, int $mask, int $n): int
{
    static $cache = [];
    if ($mask === 0) return 0; // Plus aucune gemme = heuristique nulle
    if (isset($cache[$mask])) return $cache[$mask];

    // On liste les gemmes encore à collecter
    $nodes = [];
    for ($i = 0; $i < $n; $i++) if ($mask & (1 << $i)) $nodes[] = $i;
    $m = count($nodes);
    if ($m === 1) { $cache[$mask] = 0; return 0; }

    // Algorithme de Prim : O(n²), suffisant pour n ≤ 30
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

// ── Pré-calcul des trajectoires des fantômes ──────────────────────────────────

// Simule un glissement de fantôme (rouge ou vert) : même règle que le chevalier
function ghost_slide(array $lvl, int $r, int $c, int $dir): array
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r + $dr; $cc = $c + $dc;
    if (!is_walkable($lvl, $cr, $cc)) return [$r, $c]; // Bloqué = reste sur place
    while (true) {
        $nr = $cr + $dr; $nc = $cc + $dc;
        if (!is_walkable($lvl, $nr, $nc) || perp_open($lvl, $cr, $cc, $dir)) break;
        $cr = $nr; $cc = $nc;
    }
    return [$cr, $cc];
}

// Choisit la prochaine direction d'un fantôme rouge (priorité R→D→L→U) ou vert (U→L→D→R)
function ghost_next_dir(array $lvl, int $r, int $c, int $last, bool $isRed): int
{
    $pR = [3, 1, 2, 0]; // Priorité rouge : Droite, Bas, Gauche, Haut
    $pG = [0, 2, 1, 3]; // Priorité vert : Haut, Gauche, Bas, Droite
    $prio = $isRed ? $pR : $pG;
    $rev  = $last >= 0 ? OPP[$last] : -1; // Direction interdite (pas de demi-tour)
    foreach ($prio as $d) {
        if ($d === $rev) continue;
        if (is_walkable($lvl, $r + DR[$d], $c + DC[$d])) return $d;
    }
    // En dernier recours (cul-de-sac), on autorise le demi-tour
    if ($rev >= 0 && is_walkable($lvl, $r + DR[$rev], $c + DC[$rev])) return $rev;
    return -1; // Vraiment bloqué (ne devrait pas arriver dans une carte valide)
}

// Pré-calcule les positions des fantômes R, G, B pour les 120 prochains tours
function precompute_ghosts(array $lvl, int $maxTurns = 120): array
{
    $trajs = [];
    foreach (['R', 'G', 'B'] as $type) {
        if (empty($lvl['ghosts'][$type])) continue;
        [$gr, $gc] = $lvl['ghosts'][$type];
        $states = [[$gr, $gc, true]]; // Position initiale (visible)
        $last   = -1; $tc = 0;
        for ($t = 1; $t <= $maxTurns; $t++) {
            if ($type === 'B') {
                // Fantôme bleu : disparaît un tour sur deux, téléporte au portail suivant
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
                    $vis = true; // Visible après téléportation
                } else { $vis = false; } // Invisible les tours impairs
            } else {
                // Fantômes rouge et vert : glissement normal
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

// Vérifie qu'un glissement proposé du chevalier n'entre pas en collision avec un fantôme
function slide_is_safe(array $lvl, int $r, int $c, int $dir, int $turn, array $trajs): bool
{
    $dr = DR[$dir]; $dc = DC[$dir];
    $cr = $r; $cc = $c; $first = false;
    while (true) {
        // On vérifie la position de chaque fantôme au tour concerné
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

// ── Cœur de l'algorithme A* ───────────────────────────────────────────────────

/**
 * File de priorité minimale implémentée avec un tableau plat (tas binaire).
 * Chaque entrée : [f (int), g (int), r, c, d, mask, turn, state_key (string)]
 * On trie par $entry[0] (valeur f = g + heuristique).
 */
function heap_push(array &$heap, array $entry): void
{
    $heap[] = $entry;
    $i = count($heap) - 1;
    // Remontée dans le tas jusqu'à la racine
    while ($i > 0) {
        $p = ($i - 1) >> 1;
        if ($heap[$p][0] <= $heap[$i][0]) break;
        [$heap[$p], $heap[$i]] = [$heap[$i], $heap[$p]];
        $i = $p;
    }
}

// Extrait et retourne l'élément de coût minimum du tas
function heap_pop(array &$heap): array
{
    $top = $heap[0];
    $last = array_pop($heap);
    if (!empty($heap)) {
        $heap[0] = $last;
        $n = count($heap);
        $i = 0;
        // Descente dans le tas pour restaurer la propriété de tas
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

// Génère une clé d'état binaire compacte pour la table de visites
function state_key(int $r, int $c, int $d, int $mask, int $turn): string
{
    // En mode sans sécurité, 7 octets suffisent ; en mode sûr on ajoute le tour (plafonné à 127)
    if ($turn < 0) return pack('VCCC', $mask, $r, $c, $d);          // 4+1+1+1=7 octets
    return pack('VCCCC', $mask, $r, $c, $d, min($turn, 127));       // 4+1+1+1+1=8 octets
}

// Recherche A* : trouve le chemin optimal en collectant toutes les gemmes
function astar(array $lvl, bool $safe): array
{
    set_time_limit(30); // On limite le temps total d'exécution
    $n     = $lvl['n_coins'];
    $full  = (1 << $n) - 1; // Masque "toutes les gemmes à collecter" (tous les bits à 1)
    $dm    = build_dist_matrix($lvl);
    $trajs = $safe ? precompute_ghosts($lvl) : []; // Trajectoires fantômes si mode sûr

    $heap   = [];  // Tas binaire min
    $best   = [];  // Meilleur coût connu par état
    $parent = [];  // Pour reconstruire le chemin à la fin

    $t0        = microtime(true);
    $nodeLimit = 1500000;   // Limite de nœuds explorés avant abandon
    // Calcul de la limite mémoire disponible
    $memRaw    = (string)ini_get('memory_limit');
    $memMult   = stripos($memRaw, 'g') !== false ? 1073741824
               : (stripos($memRaw, 'm') !== false ? 1048576 : 1024);
    $memLimit  = (int)rtrim($memRaw, 'MGKBmgkb') * $memMult;
    $memCap    = $memLimit > 0 ? (int)($memLimit * 0.75) : 384 * 1048576;

    // État initial : position de départ, aucune direction (d=4), toutes les gemmes à collecter
    $sk0 = state_key($lvl['sr'], $lvl['sc'], 4, $full, $safe ? 0 : -1);
    $h0  = mst_weight($dm, $full, $n);
    heap_push($heap, [$h0, 0, $lvl['sr'], $lvl['sc'], 4, $full, 0, $sk0]);
    $best[$sk0]   = 0;
    $parent[$sk0] = null; // L'état initial n'a pas de parent

    $dirs = 'UDLR'; // Correspondance indice → caractère de direction

    $hitTimeLimit = false;
    $hitNodeLimit = false;

    while (!empty($heap)) {
        // Vérification des limites de ressources
        if (count($best) > $nodeLimit || memory_get_usage() > $memCap) { $hitNodeLimit = true; break; }
        if (microtime(true) - $t0 > 14.0) { $hitTimeLimit = true; break; }

        [,$g, $r, $c, $d, $mask, $turn, $sk] = heap_pop($heap);

        if (isset($best[$sk]) && $best[$sk] < $g) continue; // Entrée périmée dans le tas

        if ($mask === 0) {
            // Toutes les gemmes collectées : on reconstruit le chemin depuis l'état initial
            return ['found' => true, 'moves' => reconstruct($parent, $sk), 'reason' => null];
        }
        if ($safe && $turn >= 120) continue; // On arrête d'explorer au-delà de 120 tours

        for ($nd = 0; $nd < 4; $nd++) {
            if ($d !== 4 && $nd === OPP[$d]) continue; // Pas de demi-tour
            $s = slide($lvl, $r, $c, $nd, $mask);
            if ($s === null) continue; // Bloqué dans cette direction
            [$nr, $nc, $nm] = $s;
            $nt = $turn + 1;
            if ($safe && !slide_is_safe($lvl, $r, $c, $nd, $nt, $trajs)) continue; // Collision avec fantôme
            $ng  = $g + 1;
            $nsk = state_key($nr, $nc, $nd, $nm, $safe ? $nt : -1);
            if (isset($best[$nsk]) && $best[$nsk] <= $ng) continue; // On a déjà un meilleur chemin vers cet état
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

// Remonte la chaîne de parents pour reconstruire la séquence de mouvements
function reconstruct(array $parent, string $sk): array
{
    $moves = [];
    $cur   = $sk;
    while ($parent[$cur] !== null) {
        [$prev, $move] = $parent[$cur];
        $moves[] = $move;
        $cur = $prev;
    }
    return array_reverse($moves); // On inverse car on a remonté du but vers le départ
}
