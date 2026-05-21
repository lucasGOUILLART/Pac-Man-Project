<?php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// Handle toggle power-ups (AJAX POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['toggle_power_ups'])) {
    if (csrfCheck($_POST['csrf_token'] ?? null)) {
        setPowerUps($_POST['toggle_power_ups'] === '1');
    }
    // Plain redirect (no AJAX response needed)
    header('Location: menu.php');
    exit;
}

// User stats for top corners
$stmt = $pdo->prepare('
    SELECT u.pseudo, u.niveau_actuel, u.score_total,
           (SELECT COALESCE(MAX(score_niveau), 0) FROM in_game WHERE id_joueur = u.id) AS best_score
    FROM utisateur u WHERE u.id = ?
');
$stmt->execute([$userId]);
$user = $stmt->fetch();

// User no longer exists in DB (e.g. after a schema re-import). Force logout.
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
<link rel="stylesheet" href="css/style.css">
</head>
<body class="menu-body">
<div class="vignette"></div>

<main class="menu-shell">
    <!-- Top stats -->
    <div class="menu-top-left">
        <div class="stat-pill">
            <span class="pill-label">BEST SCORE</span>
            <span class="pill-value"><?= str_pad((string)(int)$user['best_score'], 6, '0', STR_PAD_LEFT) ?></span>
        </div>
    </div>
    <div class="menu-top-right">
        <div class="stat-pill">
            <span class="pill-label">BEST LEVEL</span>
            <span class="pill-value"><?= str_pad((string)max(0, (int)$user['niveau_actuel'] - 1), 2, '0', STR_PAD_LEFT) ?></span>
        </div>
    </div>

    <!-- Game title -->
    <header class="menu-title">
        <h1>LES FANTÔMES D'OMBREQUATRE</h1>
        <p>SIR <?= strtoupper(e($user['pseudo'])) ?> · ENTER THE CASTLE</p>
    </header>

    <!-- Three-column layout -->
    <div class="menu-columns">
        <!-- Left: story -->
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

        <!-- Center: logo + buttons -->
        <section class="menu-center">
            <img class="menu-logo" src="img/logo.png" alt="Les fantômes d'Ombrequatre">

            <!-- Power-ups toggle (campaign mode selector) -->
            <form method="post" class="menu-mode-form">
                <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
                <input type="hidden" name="toggle_power_ups" value="<?= $powerUps ? '0' : '1' ?>">
                <button type="submit" class="mode-toggle <?= $powerUps ? 'on' : 'off' ?>">
                    <span class="mode-toggle-label">MODE</span>
                    <span class="mode-toggle-value">
                        <?= $powerUps ? 'WITH POWER-UPS' : 'PURE PUZZLE' ?>
                    </span>
                    <span class="mode-toggle-hint">Click to switch</span>
                </button>
            </form>

            <nav class="menu-buttons">
                <a class="menu-btn primary" href="dashboard.php">
                    <span class="btn-icon">▶</span> CAMPAGNE
                </a>
                <a class="menu-btn" href="editor.php">CONCEVOIR UN NIVEAU</a>
                <a class="menu-btn" href="generator.php">LABYRINTHES ALÉATOIRES</a>
                <a class="menu-btn" href="options.php">OPTIONS</a>
                <a class="menu-btn" href="bestiaire.php">BESTIAIRE</a>
                <a class="menu-btn quit" href="logout.php">QUITTER</a>
            </nav>
        </section>

        <!-- Right: ghost gallery -->
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
