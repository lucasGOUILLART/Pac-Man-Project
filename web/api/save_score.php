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

$levelId  = (int)($body['level_id'] ?? 0);
$score    = max(0, (int)($body['score'] ?? 0));
$gems     = max(0, (int)($body['gems'] ?? 0));
$cleared  = !empty($body['cleared']);
$timeSec  = isset($body['time_sec']) && $body['time_sec'] > 0 ? (int)$body['time_sec'] : null;

if ($levelId <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Bad level id.']);
    exit;
}

$pdo    = getDB();
$userId = currentUserId();

// Verify level exists and get its max score (server-side cap on cheating)
$stmt = $pdo->prepare('SELECT score_max FROM niveau WHERE id = ?');
$stmt->execute([$levelId]);
$lvl = $stmt->fetch();
if (!$lvl) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Unknown level.']);
    exit;
}
$score = min($score, (int)$lvl['score_max']);

$pdo->beginTransaction();
try {
    // Upsert in_game with best-score-wins semantics
    $stmt = $pdo->prepare('
        SELECT score_niveau, temps_best FROM in_game WHERE id_niveau = ? AND id_joueur = ?
    ');
    $stmt->execute([$levelId, $userId]);
    $row = $stmt->fetch();

    if ($row === false) {
        $pdo->prepare('
            INSERT INTO in_game (id_niveau, id_joueur, score_niveau, nb_piece, temps_best)
            VALUES (?, ?, ?, ?, ?)
        ')->execute([$levelId, $userId, $score, $gems, $timeSec]);
    } elseif ($score > (int)$row['score_niveau']) {
        $newTime = ($timeSec !== null && ($row['temps_best'] === null || $timeSec < (int)$row['temps_best']))
            ? $timeSec
            : $row['temps_best'];
        $pdo->prepare('
            UPDATE in_game SET score_niveau = ?, nb_piece = ?, temps_best = ?
            WHERE id_niveau = ? AND id_joueur = ?
        ')->execute([$score, $gems, $newTime, $levelId, $userId]);
    } elseif ($timeSec !== null && ($row['temps_best'] === null || $timeSec < (int)$row['temps_best'])) {
        $pdo->prepare('
            UPDATE in_game SET temps_best = ?
            WHERE id_niveau = ? AND id_joueur = ?
        ')->execute([$timeSec, $levelId, $userId]);
    }

    // Update user's total score (recompute from in_game for consistency)
    $pdo->prepare('
        UPDATE utisateur SET score_total = (
            SELECT COALESCE(SUM(score_niveau), 0) FROM in_game WHERE id_joueur = ?
        ) WHERE id = ?
    ')->execute([$userId, $userId]);

    // If cleared, unlock the next level
    if ($cleared) {
        $pdo->prepare('
            UPDATE utisateur
            SET niveau_actuel = GREATEST(niveau_actuel, ?)
            WHERE id = ?
        ')->execute([$levelId + 1, $userId]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    error_log('save_score: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Internal error.']);
    exit;
}

echo json_encode(['ok' => true, 'score_capped' => $score]);
