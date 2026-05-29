<?php
// Tableau de bord des niveaux de la campagne : affiche tous les niveaux avec les scores du joueur.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// On récupère les infos de base du joueur (pseudo, niveau débloqué, score total)
$stmt = $pdo->prepare('SELECT pseudo, niveau_actuel, score_total FROM utisateur WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();

// Sécurité : si l'utilisateur a disparu de la BDD, on le déconnecte proprement
if (!$user) {
    header('Location: logout.php');
    exit;
}

// Récupération de tous les niveaux officiels (auteur_id IS NULL) avec les scores du joueur
// On fait un LEFT JOIN pour obtenir null quand le joueur n'a pas encore joué ce niveau
$stmt = $pdo->prepare('
    SELECT n.id, n.difficulte, n.score_max,
           ig.score_niveau AS best_score, ig.nb_piece AS gems_collected,
           ig.temps_best
    FROM niveau n
    LEFT JOIN in_game ig ON ig.id_niveau = n.id AND ig.id_joueur = ?
    WHERE n.auteur_id IS NULL
    ORDER BY n.id ASC
');
$stmt->execute([$userId]);
$levels = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Choose Your Chamber</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="dashboard-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">CHOOSE A CHAMBER</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="dash-main">
    <section class="levels-grid">
        <?php foreach ($levels as $lvl):
            // Un niveau est verrouillé si son id dépasse le niveau actuel du joueur
            $isLocked  = (int)$lvl['id'] > (int)$user['niveau_actuel'];
            // Un niveau est terminé si le joueur a collecté des gemmes et un score > 0
            $isCleared = (int)$lvl['gems_collected'] > 0 && (int)$lvl['best_score'] > 0;
            $diff      = (int)$lvl['difficulte'];
        ?>
        <article class="level-card panel <?= $isLocked ? 'locked' : '' ?> <?= $isCleared ? 'cleared' : '' ?>">
            <div class="level-num">LEVEL <?= str_pad((string)(int)$lvl['id'], 2, '0', STR_PAD_LEFT) ?></div>
            <!-- Affichage de la difficulté sous forme d'étoiles (1 à 5) -->
            <div class="level-stars">
                <?php for ($i = 1; $i <= 5; $i++): ?>
                    <span class="star <?= $i <= $diff ? 'on' : '' ?>">★</span>
                <?php endfor; ?>
            </div>
            <?php
                // Formatage du meilleur temps (secondes → MM:SS), ou "—" si jamais complété
                $tempsBest = $lvl['temps_best'] !== null ? (int)$lvl['temps_best'] : null;
                $timeStr = $tempsBest !== null
                    ? str_pad((string)intdiv($tempsBest, 60), 2, '0', STR_PAD_LEFT) . ':' . str_pad((string)($tempsBest % 60), 2, '0', STR_PAD_LEFT)
                    : '—';
            ?>
            <div class="level-meta">
                <div>Max score: <strong><?= number_format((int)$lvl['score_max']) ?></strong></div>
                <div>Your best: <strong><?= number_format((int)($lvl['best_score'] ?? 0)) ?></strong></div>
                <div>Best time: <strong><?= e($timeStr) ?></strong></div>
            </div>
            <?php if ($isLocked): ?>
                <!-- Niveau verrouillé : le joueur doit finir les niveaux précédents -->
                <div class="level-action locked-tag">LOCKED</div>
            <?php else: ?>
                <a class="level-action" href="game.php?level=<?= (int)$lvl['id'] ?>">
                    <?= $isCleared ? 'REPLAY' : 'ENTER' ?>
                </a>
            <?php endif; ?>
        </article>
        <?php endforeach; ?>
    </section>
</main>
</body>
</html>
