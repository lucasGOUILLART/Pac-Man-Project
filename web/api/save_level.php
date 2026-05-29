<?php
/**
 * POST api/save_level.php
 *
 * Sauvegarde (INSERT) ou met à jour (UPDATE) un niveau personnel de l'utilisateur connecté.
 * Les niveaux personnels sont stockés avec is_public=0 pour ne pas apparaître dans la campagne.
 *
 * Corps (JSON) :
 *   csrf_token    string   requis
 *   name          string   nom affiché (100 caractères max)
 *   map           string   texte de la carte du niveau
 *   solution      string   séquence de mouvements optimale (U/D/L/R…)
 *   optimal_moves int      nombre de mouvements dans la solution optimale
 *   ghost_safe    bool     true si le chemin évite tous les fantômes
 *   id            int      optionnel — si > 0, met à jour ce niveau existant au lieu d'en créer un
 *
 * Réponse (JSON) : { ok: true, level_id: int, updated: bool }
 *                  { ok: false, error: string }
 */

header('Content-Type: application/json');

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';

// Accès refusé si non connecté
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

// Vérification du token CSRF
if (!csrfCheck($body['csrf_token'] ?? null)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Bad CSRF token.']);
    exit;
}

// Extraction et nettoyage des paramètres
$levelId  = isset($body['id']) && (int)$body['id'] > 0 ? (int)$body['id'] : 0;
$name     = trim($body['name'] ?? '');
$map      = trim($body['map'] ?? '');
$solution = trim($body['solution'] ?? '');
$safe     = !empty($body['ghost_safe']) ? 1 : 0;
$moves    = (int)($body['optimal_moves'] ?? 0);

// Nom par défaut si aucun nom n'a été renseigné
if ($name === '') $name = 'Sans titre';
if (mb_strlen($name) > 100) $name = mb_substr($name, 0, 100);

// La carte doit avoir une taille minimum pour être valide
if (strlen($map) < 20) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid level map.']);
    exit;
}

// Calcul du score maximum : basé sur le type et le nombre de collectibles dans la carte
// . = gemme (10 pts), o = potion (50 pts), c = montre (30 pts)
$scoreMax = substr_count($map, '.') * 10
          + substr_count($map, 'o') * 50
          + substr_count($map, 'c') * 30;

// Calcul de la difficulté en fonction du nombre de mouvements dans la solution optimale
$difficulte = 1;
if      ($moves >= 40) $difficulte = 5;
elseif  ($moves >= 25) $difficulte = 4;
elseif  ($moves >= 15) $difficulte = 3;
elseif  ($moves >= 8)  $difficulte = 2;

$pdo    = getDB();
$userId = currentUserId();

try {
    if ($levelId > 0) {
        // ── Mise à jour d'un niveau existant ──
        // On vérifie d'abord que le niveau appartient bien à cet utilisateur
        $chk = $pdo->prepare('SELECT id FROM niveau WHERE id = ? AND auteur_id = ?');
        $chk->execute([$levelId, $userId]);
        if (!$chk->fetch()) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Level not found or not yours.']);
            exit;
        }

        $stmt = $pdo->prepare('
            UPDATE niveau
               SET name=?, map=?, solution_cache=?, solution_safe=?,
                   score_max=?, difficulte=?
             WHERE id=? AND auteur_id=?
        ');
        $stmt->execute([
            $name, $map, $solution ?: null, $safe,
            $scoreMax, $difficulte,
            $levelId, $userId,
        ]);
        echo json_encode(['ok' => true, 'level_id' => $levelId, 'updated' => true]);

    } else {
        // ── Création d'un nouveau niveau ──
        // On vérifie que l'utilisateur n'a pas atteint la limite de 20 niveaux personnels
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM niveau WHERE auteur_id = ?');
        $cnt->execute([$userId]);
        if ((int)$cnt->fetchColumn() >= 20) {
            http_response_code(429);
            echo json_encode([
                'ok'    => false,
                'error' => 'Personal level limit reached (20 max). Delete some first.',
            ]);
            exit;
        }

        $stmt = $pdo->prepare('
            INSERT INTO niveau
                (name, difficulte, score_max, map, solution_cache, solution_safe, auteur_id, is_public)
            VALUES (?,?,?,?,?,?,?,0)
        ');
        $stmt->execute([
            $name, $difficulte, $scoreMax,
            $map, $solution ?: null, $safe, $userId,
        ]);
        echo json_encode(['ok' => true, 'level_id' => (int)$pdo->lastInsertId(), 'updated' => false]);
    }

} catch (Throwable $e) {
    error_log('save_level: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Internal error.']);
}
