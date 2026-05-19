<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Not authenticated.']);
    exit;
}

$levelId = (int)($_GET['level'] ?? 0);
if ($levelId <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Bad level id.']);
    exit;
}

$pdo = getDB();

// Defensive: try the new schema (with solution_cache column).
// If the column doesn't exist (old schema), fall back to a "no cache" response.
try {
    $stmt = $pdo->prepare('SELECT solution_cache, solution_safe FROM niveau WHERE id = ?');
    $stmt->execute([$levelId]);
    $row = $stmt->fetch();
} catch (PDOException $e) {
    // Column missing (old schema). Tell the client to compute locally.
    echo json_encode([
        'ok'       => true,
        'sequence' => '',
        'safe'     => false,
        'cached'   => false,
        'note'     => 'Schema is outdated — please run sql/migrate_levels.sql',
    ]);
    exit;
}

if (!$row) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Unknown level.']);
    exit;
}

$seq = $row['solution_cache'] ?? '';
echo json_encode([
    'ok'       => true,
    'sequence' => $seq,
    'safe'     => (int)($row['solution_safe'] ?? 0) === 1,
    'cached'   => $seq !== '',
]);
