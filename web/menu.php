<?php
// Menu principal : tableau de bord avec les stats du joueur et les boutons de navigation.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin(); // Redirige vers index.php si l'utilisateur n'est pas connecté

$pdo    = getDB();
$userId = currentUserId();

// Gestion du bouton de bascule power-ups (soumis via formulaire POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['toggle_power_ups'])) {
    if (csrfCheck($_POST['csrf_token'] ?? null)) {
        setPowerUps($_POST['toggle_power_ups'] === '1');
    }
    // On redirige pour éviter la re-soumission du formulaire si l'utilisateur rafraîchit
    header('Location: menu.php');
    exit;
}

// Récupération des stats du joueur pour les afficher dans les coins de l'écran
$stmt = $pdo->prepare('
    SELECT u.pseudo, u.niveau_actuel, u.score_total,
           (SELECT COALESCE(MAX(score_niveau), 0) FROM in_game WHERE id_joueur = u.id) AS best_score
    FROM utisateur u WHERE u.id = ?
');
$stmt->execute([$userId]);
$user = $stmt->fetch();

// Si l'utilisateur n'existe plus en base (ex. après une réimportation du schéma), on le déconnecte
if (!$user) {
    header('Location: logout.php');
    exit;
}

$powerUps = powerUpsEnabled();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Main Menu</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="menu-body">
<div class="vignette"></div>

<main class="menu-shell">
    <!-- Statistiques affichées dans le coin supérieur gauche -->
    <div class="menu-top-left">
        <div class="stat-pill">
            <span class="pill-label">BEST SCORE</span>
            <span class="pill-value"><?= str_pad((string)(int)$user['best_score'], 6, '0', STR_PAD_LEFT) ?></span>
        </div>
    </div>
    <!-- Statistiques affichées dans le coin supérieur droit -->
    <div class="menu-top-right">
        <div class="stat-pill">
            <span class="pill-label">BEST LEVEL</span>
            <!-- niveau_actuel représente le prochain niveau à débloquer, donc le meilleur niveau joué = actuel - 1 -->
            <span class="pill-value"><?= str_pad((string)max(0, (int)$user['niveau_actuel'] - 1), 2, '0', STR_PAD_LEFT) ?></span>
        </div>
    </div>

    <!-- Titre principal du jeu avec le pseudo du joueur -->
    <header class="menu-title">
        <h1>LES FANTÔMES D'OMBREQUATRE</h1>
        <p>SIR <?= strtoupper(e($user['pseudo'])) ?> · ENTER THE CASTLE</p>
    </header>

    <!-- Disposition en trois colonnes : lore | centre | galerie -->
    <div class="menu-columns">
        <!-- Colonne gauche : histoire du jeu -->
        <aside class="menu-lore panel">
            <h2>THE TALE</h2>
            <p>In the kingdom of <em>Arcadia</em>, a brave princess was captured
               by the <strong>Shadow Lords</strong>.</p>
            <p>Only the <em>Round Knight</em>, guardian of the Light, can save
               her. Cross the haunted labyrinths, collect the Sacred Jewels,
               and face the Shadows to break the curse.</p>
            <p>His armor is so heavy he <em>slides</em> across the icy floors
               and cannot turn back. One choice. One direction. One destiny.</p>
        </aside>

        <!-- Colonne centrale : logo + boutons de navigation + bascule de mode -->
        <section class="menu-center">
            <img class="menu-logo" src="img/logo.png" alt="Les fantômes d'Ombrequatre">

            <!-- Formulaire de bascule entre le mode "Puzzle pur" et "Avec power-ups" -->
            <form method="post" class="menu-mode-form">
                <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
                <!-- La valeur envoyée est l'opposé de l'état actuel pour basculer -->
                <input type="hidden" name="toggle_power_ups" value="<?= $powerUps ? '0' : '1' ?>">
                <button type="submit" class="mode-toggle <?= $powerUps ? 'on' : 'off' ?>">
                    <span class="mode-toggle-label">MODE</span>
                    <span class="mode-toggle-value">
                        <?= $powerUps ? 'WITH POWER-UPS' : 'PURE PUZZLE' ?>
                    </span>
                    <span class="mode-toggle-hint">Click to switch</span>
                </button>
            </form>

            <!-- Boutons de navigation vers les différentes sections du jeu -->
            <nav class="menu-buttons">
                <a class="menu-btn primary" href="play.php">
                    <span class="btn-icon">▶</span> PLAY
                </a>
                <a class="menu-btn" href="my_levels.php">MY LEVELS</a>
                <a class="menu-btn" href="leaderboard.php">LEADERBOARD</a>
                <a class="menu-btn" href="options.php">OPTIONS</a>
                <a class="menu-btn" href="bestiaire.php">BESTIARY</a>
                <a class="menu-btn quit" href="logout.php">QUIT</a>
            </nav>
        </section>

        <!-- Colonne droite : galerie des quatre fantômes gardiens -->
        <aside class="menu-gallery panel">
            <h2>THE WARDENS</h2>
            <div class="gallery-grid">
                <div class="gallery-cell red">
                    <img src="img/fantomeRougeCornes.png" alt="Ombre écarlate">
                    <span>SCARLET</span>
                </div>
                <div class="gallery-cell green">
                    <img src="img/fantomeVertCornes.png" alt="Spectre toxique">
                    <span>TOXIC</span>
                </div>
                <div class="gallery-cell blue">
                    <img src="img/fantomeBleuCornes.png" alt="Esprit abyssal">
                    <span>ABYSSAL</span>
                </div>
                <div class="gallery-cell yellow">
                    <img src="img/fantomeJauneCornes.png" alt="Âme corrompue">
                    <span>CORRUPT</span>
                </div>
            </div>
        </aside>
    </div>
</main>
</body>
</html>
