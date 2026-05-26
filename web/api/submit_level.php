<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Not authenticated.']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Bad JSON.']);
    exit;
}

if (!csrfCheck($body['csrf_token'] ?? null)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Bad CSRF token.']);
    exit;
}

$map      = trim($body['map'] ?? '');
$solution = trim($body['solution'] ?? '');
$moves    = (int)($body['optimal_moves'] ?? 0);
$safe     = !empty($body['ghost_safe']) ? 1 : 0;

if (strlen($map) < 20) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid level map.']);
    exit;
}

// Parse width/height from map header to set a reasonable score_max
$scoreMax = 0;
foreach (explode("\n", $map) as $line) {
    $parts = preg_split('/\s+/', trim($line));
    if (count($parts) >= 2 && $parts[0] === 'W') { }
}
// Count collectibles to estimate score_max
$gemCount    = substr_count($map, '.');
$potionCount = substr_count($map, 'o');
$watchCount  = substr_count($map, 'c');
$scoreMax    = $gemCount * 10 + $potionCount * 50 + $watchCount * 30;
if ($scoreMax === 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Level has no collectible items.']);
    exit;
}

// Estimate difficulty from optimal move count
$difficulte = 1;
if ($moves >= 40)      $difficulte = 5;
elseif ($moves >= 25)  $difficulte = 4;
elseif ($moves >= 15)  $difficulte = 3;
elseif ($moves >= 8)   $difficulte = 2;

$pdo    = getDB();
$userId = currentUserId();

// Prevent spam: max 5 submitted levels per user per day
$stmt = $pdo->prepare('
    SELECT COUNT(*) FROM niveau
    WHERE auteur_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
');
$stmt->execute([$userId]);
if ((int)$stmt->fetchColumn() >= 5) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Daily submission limit reached (5 per day).']);
    exit;
}

try {
    $stmt = $pdo->prepare('
        INSERT INTO niveau (difficulte, score_max, map, solution_cache, solution_safe, auteur_id)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $difficulte,
        $scoreMax,
        $map,
        $solution ?: null,
        $safe,
        $userId,
    ]);
    $newId = (int)$pdo->lastInsertId();
    echo json_encode(['ok' => true, 'level_id' => $newId]);
} catch (Throwable $e) {
    error_log('submit_level: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Internal error.']);
}
