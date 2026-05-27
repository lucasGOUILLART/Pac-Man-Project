<?php
/**
 * api/generate.php — Random Level Generator bridge.
 *
 * Calls the compiled C generator binary (solver/generator.exe on Windows,
 * solver/generator on Linux/macOS) and returns the level text.
 *
 * POST body (JSON): { "diff": "easy|medium|hard|impossible", "csrf_token": "..." }
 * Response (JSON):  { "ok": true,  "map": "<level text>" }
 *              or:  { "ok": false, "error": "<message>" }
 */
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');
ob_start();
header('Content-Type: application/json');

// ── Auth + method ─────────────────────────────────────────────────────────────
require_once __DIR__ . '/../includes/auth.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    ob_end_flush();
    exit;
}

requireLogin();

// ── Parse request ────────────────────────────────────────────────────────────
$req = json_decode(file_get_contents('php://input'), true);
if (!is_array($req)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'bad_request']);
    ob_end_flush();
    exit;
}

// CSRF check
$csrfOk = isset($req['csrf_token']) && is_string($req['csrf_token'])
       && hash_equals(csrfToken(), $req['csrf_token']);
if (!$csrfOk) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'csrf_mismatch']);
    ob_end_flush();
    exit;
}

$diff = $req['diff'] ?? '';
if (!in_array($diff, ['easy', 'medium', 'hard', 'impossible'], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_difficulty']);
    ob_end_flush();
    exit;
}

// ── Locate generator binary ──────────────────────────────────────────────────
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

if ($binary === null || !function_exists('exec')) {
    // Binary not available (not yet compiled) — fall back gracefully
    http_response_code(503);
    ob_end_clean();
    echo json_encode([
        'ok'    => false,
        'error' => 'generator_unavailable',
    ]);
    exit;
}

// ── Run generator ────────────────────────────────────────────────────────────
$seed = random_int(1, 2147483647);
$null = (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') ? '2>NUL' : '2>/dev/null';

$cmd  = escapeshellarg($binary)
      . ' ' . escapeshellarg($diff)
      . ' --seed ' . (int)$seed
      . ' ' . $null;

$out  = [];
$code = 0;
exec($cmd, $out, $code);

if ($code !== 0 || empty($out)) {
    ob_end_clean();
    echo json_encode(['ok' => false, 'error' => 'generator_failed']);
    exit;
}

$map = implode("\n", $out);
ob_end_clean();
echo json_encode(['ok' => true, 'map' => $map]);
