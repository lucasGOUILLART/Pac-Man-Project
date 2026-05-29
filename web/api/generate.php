<?php
/**
 * api/generate.php — Pont vers le générateur de labyrinthes en C.
 *
 * Appelle le binaire C compilé (solver/generator.exe sur Windows,
 * solver/generator sur Linux/macOS) et retourne le texte du niveau généré.
 *
 * Corps POST (JSON) : { "diff": "easy|medium|hard|impossible", "csrf_token": "..." }
 * Réponse (JSON) :    { "ok": true,  "map": "<texte du niveau>" }
 *                 ou: { "ok": false, "error": "<message>" }
 */
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');
ob_start(); // On bufferise tout pour éviter qu'un warning PHP pollue le JSON de sortie
header('Content-Type: application/json');

// Vérification de l'authentification et de la méthode HTTP
require_once __DIR__ . '/../includes/auth.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    ob_end_flush();
    exit;
}

requireLogin();

// Décodage du corps JSON
$req = json_decode(file_get_contents('php://input'), true);
if (!is_array($req)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'bad_request']);
    ob_end_flush();
    exit;
}

// Vérification du token CSRF (comparaison en temps constant pour la sécurité)
$csrfOk = isset($req['csrf_token']) && is_string($req['csrf_token'])
       && hash_equals(csrfToken(), $req['csrf_token']);
if (!$csrfOk) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'csrf_mismatch']);
    ob_end_flush();
    exit;
}

// Validation de la difficulté demandée
$diff = $req['diff'] ?? '';
if (!in_array($diff, ['easy', 'medium', 'hard', 'impossible'], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_difficulty']);
    ob_end_flush();
    exit;
}

// Recherche du binaire compilé dans le dossier solver/ (Windows et Linux)
$projectRoot = dirname(__DIR__, 2);
$binary      = null;
foreach ([
    $projectRoot . '/solver/generator.exe',
    $projectRoot . '/solver/generator',
] as $candidate) {
    if (is_file($candidate) && is_executable($candidate)) {
        $binary = $candidate;
        break;
    }
}

// Si le binaire n'est pas disponible, on répond gracieusement avec une erreur 503
if ($binary === null || !function_exists('exec')) {
    http_response_code(503);
    ob_end_clean();
    echo json_encode([
        'ok'    => false,
        'error' => 'generator_unavailable',
    ]);
    exit;
}

// Génération d'une graine aléatoire pour que chaque labyrinthe soit unique
$seed = random_int(1, 2147483647);
// On redirige stderr vers /dev/null (ou NUL sur Windows) pour garder stdout propre
$null = (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') ? '2>NUL' : '2>/dev/null';

// Construction et exécution de la commande du générateur C
$cmd  = escapeshellarg($binary)
      . ' ' . escapeshellarg($diff)
      . ' --seed ' . (int)$seed
      . ' ' . $null;

$out  = [];
$code = 0;
exec($cmd, $out, $code);

// Si le générateur a échoué ou n'a rien produit, on retourne une erreur
if ($code !== 0 || empty($out)) {
    ob_end_clean();
    echo json_encode(['ok' => false, 'error' => 'generator_failed']);
    exit;
}

// On joint les lignes de sortie pour reconstituer le texte complet du niveau
$map = implode("\n", $out);
ob_end_clean(); // On vide le buffer pour ne renvoyer que le JSON
echo json_encode(['ok' => true, 'map' => $map]);
