<?php
// Page du classement : top 10 mondial et records par niveau.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// Récupération du top 10 des joueurs par score total (classement général)
$topPlayers = $pdo->query('
    SELECT pseudo, score_total, niveau_actuel,
           (SELECT COALESCE(SUM(nb_piece), 0) FROM in_game WHERE id_joueur = u.id) AS total_gems
    FROM utisateur u
    ORDER BY score_total DESC
    LIMIT 10
')->fetchAll();

// Récupération du meilleur score par niveau (avec le nom du joueur détenteur du record)
// La sous-requête s'assure qu'on ne garde que la ligne avec le score maximum pour chaque niveau
$topByLevel = $pdo->query('
    SELECT n.id AS level_id, n.difficulte,
           u.pseudo,
           ig.score_niveau,
           ig.nb_piece,
           ig.temps_best
    FROM in_game ig
    JOIN utisateur u ON u.id = ig.id_joueur
    JOIN niveau n ON n.id = ig.id_niveau
    WHERE ig.score_niveau = (
        SELECT MAX(ig2.score_niveau) FROM in_game ig2 WHERE ig2.id_niveau = ig.id_niveau
    )
    ORDER BY n.id ASC
')->fetchAll();

// Fonction utilitaire pour afficher un temps en secondes sous le format MM:SS
function fmtTime(?int $sec): string {
    if ($sec === null) return '—';
    $m  = intdiv($sec, 60);
    $s  = $sec % 60;
    return str_pad((string)$m, 2, '0', STR_PAD_LEFT) . ':' . str_pad((string)$s, 2, '0', STR_PAD_LEFT);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Leaderboard</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="leaderboard-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">LEADERBOARD</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="leaderboard-shell">

    <!-- Section 1 : Classement général des 10 meilleurs chevaliers -->
    <section class="lb-section panel">
        <h2>HALL OF FAME — TOP KNIGHTS</h2>
        <?php if (empty($topPlayers)): ?>
            <p class="muted">No scores yet. Be the first!</p>
        <?php else: ?>
        <table class="lb-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Knight</th>
                    <th>Total Score</th>
                    <th>Gems Collected</th>
                    <th>Best Level</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($topPlayers as $rank => $p):
                // On vérifie si cette ligne correspond au joueur connecté pour la mettre en évidence
                $isCurrent = ($p['pseudo'] === currentUserPseudo());
            ?>
            <tr class="<?= $isCurrent ? 'lb-me' : '' ?>">
                <td class="lb-rank">
                    <?php if ($rank === 0): ?>
                        <span class="medal gold">★</span>   <!-- 1ère place : médaille d'or -->
                    <?php elseif ($rank === 1): ?>
                        <span class="medal silver">★</span> <!-- 2ème place : médaille d'argent -->
                    <?php elseif ($rank === 2): ?>
                        <span class="medal bronze">★</span> <!-- 3ème place : médaille de bronze -->
                    <?php else: ?>
                        <?= $rank + 1 ?>
                    <?php endif; ?>
                </td>
                <td class="lb-pseudo"><?= e($p['pseudo']) ?><?= $isCurrent ? ' <span class="you-tag">YOU</span>' : '' ?></td>
                <td class="lb-score"><?= number_format((int)$p['score_total']) ?></td>
                <td><?= number_format((int)$p['total_gems']) ?></td>
                <td><?= str_pad((string)max(0, (int)$p['niveau_actuel'] - 1), 2, '0', STR_PAD_LEFT) ?></td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </section>

    <!-- Section 2 : Records par niveau (meilleur score pour chaque niveau de la campagne) -->
    <section class="lb-section panel">
        <h2>LEVEL RECORDS</h2>
        <?php if (empty($topByLevel)): ?>
            <p class="muted">No level records yet.</p>
        <?php else: ?>
        <table class="lb-table">
            <thead>
                <tr>
                    <th>Level</th>
                    <th>Stars</th>
                    <th>Record Holder</th>
                    <th>Best Score</th>
                    <th>Gems</th>
                    <th>Best Time</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($topByLevel as $row): ?>
            <tr>
                <td class="lb-rank"><?= str_pad((string)(int)$row['level_id'], 2, '0', STR_PAD_LEFT) ?></td>
                <td>
                    <!-- Affichage de la difficulté en étoiles -->
                    <?php for ($i = 1; $i <= 5; $i++): ?>
                        <span class="star <?= $i <= (int)$row['difficulte'] ? 'on' : '' ?>">★</span>
                    <?php endfor; ?>
                </td>
                <td class="lb-pseudo"><?= e($row['pseudo']) ?></td>
                <td class="lb-score"><?= number_format((int)$row['score_niveau']) ?></td>
                <td><?= (int)$row['nb_piece'] ?></td>
                <td><?= fmtTime(isset($row['temps_best']) ? (int)$row['temps_best'] : null) ?></td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </section>

</main>
</body>
</html>
