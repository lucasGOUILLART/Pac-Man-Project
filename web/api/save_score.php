<?php
// API : enregistrement du score après une partie.
// Reçoit un JSON POST et met à jour la table in_game avec les meilleurs scores.
header('Content-Type: application/json');

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';

// On rejette les requêtes non authentifiées
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Not authenticated.']);
    exit;
}

// Lecture et décodage du corps JSON de la requête
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Bad JSON.']);
    exit;
}

// Vérification du token CSRF pour se protéger des requêtes forgées
if (!csrfCheck($body['csrf_token'] ?? null)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Bad CSRF token.']);
    exit;
}

// Extraction et nettoyage des paramètres reçus
$levelId  = (int)($body['level_id'] ?? 0);
$score    = max(0, (int)($body['score'] ?? 0));    // On s'assure que le score est positif
$gems     = max(0, (int)($body['gems'] ?? 0));
$cleared  = !empty($body['cleared']);               // Le niveau a-t-il été terminé ?
$timeSec  = isset($body['time_sec']) && $body['time_sec'] > 0 ? (int)$body['time_sec'] : null;

if ($levelId <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Bad level id.']);
    exit;
}

$pdo    = getDB();
$userId = currentUserId();

// On vérifie que le niveau existe et on récupère son score maximum (anti-triche côté serveur)
$stmt = $pdo->prepare('SELECT score_max FROM niveau WHERE id = ?');
$stmt->execute([$levelId]);
$lvl = $stmt->fetch();
if (!$lvl) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Unknown level.']);
    exit;
}
// On plafonne le score au maximum autorisé par le niveau
$score = min($score, (int)$lvl['score_max']);

// On utilise une transaction pour garantir la cohérence des données
$pdo->beginTransaction();
try {
    // On vérifie si le joueur a déjà un score pour ce niveau
    $stmt = $pdo->prepare('
        SELECT score_niveau, temps_best FROM in_game WHERE id_niveau = ? AND id_joueur = ?
    ');
    $stmt->execute([$levelId, $userId]);
    $row = $stmt->fetch();

    if ($row === false) {
        // Première partie sur ce niveau : on insère une nouvelle ligne
        $pdo->prepare('
            INSERT INTO in_game (id_niveau, id_joueur, score_niveau, nb_piece, temps_best)
            VALUES (?, ?, ?, ?, ?)
        ')->execute([$levelId, $userId, $score, $gems, $timeSec]);
    } elseif ($score > (int)$row['score_niveau']) {
        // Nouveau meilleur score : on met à jour toute la ligne
        // On ne met à jour le temps que si le nouveau temps est meilleur
        $newTime = ($timeSec !== null && ($row['temps_best'] === null || $timeSec < (int)$row['temps_best']))
            ? $timeSec
            : $row['temps_best'];
        $pdo->prepare('
            UPDATE in_game SET score_niveau = ?, nb_piece = ?, temps_best = ?
            WHERE id_niveau = ? AND id_joueur = ?
        ')->execute([$score, $gems, $newTime, $levelId, $userId]);
    } elseif ($timeSec !== null && ($row['temps_best'] === null || $timeSec < (int)$row['temps_best'])) {
        // Score pas meilleur, mais nouveau record de temps : on met à jour seulement le temps
        $pdo->prepare('
            UPDATE in_game SET temps_best = ?
            WHERE id_niveau = ? AND id_joueur = ?
        ')->execute([$timeSec, $levelId, $userId]);
    }

    // Recalcul du score total du joueur à partir de ses meilleurs scores par niveau
    $pdo->prepare('
        UPDATE utisateur SET score_total = (
            SELECT COALESCE(SUM(score_niveau), 0) FROM in_game WHERE id_joueur = ?
        ) WHERE id = ?
    ')->execute([$userId, $userId]);

    // Si le niveau a été terminé, on débloque le niveau suivant
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

// On renvoie le score effectivement enregistré (après plafonnement)
echo json_encode(['ok' => true, 'score_capped' => $score]);
