<?php
// Page de jeu : charge les données du niveau et prépare le contexte pour le moteur JavaScript.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

$playMode = $_GET['mode'] ?? 'campaign'; // Mode de jeu : 'campaign', 'custom' ou 'generated'
$powerUpsEnabled = powerUpsEnabled();

if ($playMode === 'custom' || $playMode === 'generated') {
    // En mode personnalisé ou aléatoire, la carte est stockée côté client (sessionStorage)
    // On transmet juste un objet JSON minimal au moteur JS
    $levelLabel = $playMode === 'custom' ? 'CUSTOM' : 'RAND';
    $levelDataJson = json_encode([
        'id'         => 0,           // Pas d'id en BDD pour les niveaux personnalisés
        'mode'       => $playMode,
        'difficulte' => 3,
        'score_max'  => 999999,
        'map'        => '',          // La carte sera chargée depuis sessionStorage par game.js
        'powerUps'   => $powerUpsEnabled,
        'label'      => $levelLabel,
    ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    $pageTitle = $playMode === 'custom' ? 'Custom Level' : 'Random Maze';
} else {
    // ── Mode campagne : on charge le niveau depuis la base de données ──
    $levelId = (int)($_GET['level'] ?? 1);
    if ($levelId < 1) $levelId = 1;

    $pdo = getDB();

    // On vérifie que le joueur a bien débloqué ce niveau
    $stmt = $pdo->prepare('SELECT niveau_actuel FROM utisateur WHERE id = ?');
    $stmt->execute([currentUserId()]);
    $user = $stmt->fetch();
    if (!$user) { header('Location: logout.php'); exit; }

    // Si le joueur essaie d'accéder à un niveau non débloqué, on le redirige
    if ($levelId > (int)$user['niveau_actuel']) {
        header('Location: dashboard.php');
        exit;
    }

    // Chargement des données du niveau demandé
    $stmt = $pdo->prepare('SELECT id, difficulte, score_max, map FROM niveau WHERE id = ?');
    $stmt->execute([$levelId]);
    $level = $stmt->fetch();
    if (!$level) { header('Location: dashboard.php'); exit; }

    // On formate le numéro de niveau sur 2 chiffres (ex. "01", "10")
    $levelLabel = str_pad((string)(int)$level['id'], 2, '0', STR_PAD_LEFT);
    $levelDataJson = json_encode([
        'id'         => (int)$level['id'],
        'mode'       => 'campaign',
        'difficulte' => (int)$level['difficulte'],
        'score_max'  => (int)$level['score_max'],
        'map'        => $level['map'],
        'powerUps'   => $powerUpsEnabled,
        'label'      => $levelLabel,
    ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    $pageTitle = 'Level ' . (int)$level['id'];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — <?= e($pageTitle) ?></title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="game-body">
<div class="vignette"></div>

<!-- HUD (heads-up display) : statistiques en temps réel mises à jour par JavaScript -->
<header class="game-hud">
    <div class="hud-left">
        <div class="hud-stat"><span class="hud-label">SCORE</span><span class="hud-value" id="score">000000</span></div>
        <div class="hud-stat"><span class="hud-label">LEVEL</span><span class="hud-value" id="levelLabel"><?= e($levelLabel) ?></span></div>
        <div class="hud-stat"><span class="hud-label">GEMS</span><span class="hud-value" id="gems">00/00</span></div>
        <div class="hud-stat"><span class="hud-label">TURNS</span><span class="hud-value" id="moves">000</span></div>
        <div class="hud-stat"><span class="hud-label">TIME</span><span class="hud-value" id="time">00:00</span></div>
        <div class="hud-stat"><span class="hud-label">LIVES</span><span class="hud-value" id="lives"></span></div>
        <!-- Indicateur ON/OFF du mode power-ups, défini côté serveur -->
        <div class="hud-stat hud-flag <?= $powerUpsEnabled ? 'on' : 'off' ?>">
            <span class="hud-label">POWERS</span>
            <span class="hud-value"><?= $powerUpsEnabled ? 'ON' : 'OFF' ?></span>
        </div>
    </div>
    <div class="hud-right">
        <button id="solverBtn" class="nav-btn nav-btn-dark">HINT</button>
        <button id="toggleSolutionsBtn" class="nav-btn nav-btn-dark">SHOW SOLUTION</button>
        <a href="menu.php" class="nav-btn nav-btn-dark">MENU</a>
    </div>
</header>

<!-- Bandeau de mode (STEALTH / COMBAT / CHRONOS) mis à jour dynamiquement -->
<div class="mode-banner" id="modeBanner">
    <span class="mode-label">STATUS</span>
    <span class="mode-value" id="modeText">STEALTH</span>
</div>

<main class="game-main">
    <!-- Zone principale avec le canvas de jeu -->
    <section class="game-canvas-wrap">
        <canvas id="canvas" width="640" height="640"></canvas>
        <!-- Overlay affiché à la victoire ou au game over -->
        <div class="game-overlay" id="overlay" style="display:none;"></div>
    </section>

    <!-- Panneau de solution (chemin optimal calculé par le solveur C) -->
    <aside id="solutionPanel" class="solution-panel">
        <h3>OPTIMAL PATH</h3>
        <p class="sol-sub">Computed from the start.<br>
           <span id="solGhostNote" class="sol-note"></span></p>
        <div class="sol-status" id="solStatus">Loading…</div>
        <div class="sol-sequence" id="solSequence"></div>
        <div class="sol-stats">
            <div><span>OPTIMAL</span><strong id="solOpt">—</strong></div>
            <div><span>VOUS</span><strong id="solMine">0</strong></div>
        </div>
    </aside>
</main>

<!-- Pavé directionnel tactile pour mobile -->
<div class="game-controls">
    <div class="dirs" id="dirs">
        <button class="dir-btn" data-dir="U" aria-label="Haut">▲</button>
        <div class="dir-row">
            <button class="dir-btn" data-dir="L" aria-label="Gauche">◀</button>
            <button class="dir-btn dir-center" disabled aria-hidden="true">✦</button>
            <button class="dir-btn" data-dir="R" aria-label="Droite">▶</button>
        </div>
        <button class="dir-btn" data-dir="D" aria-label="Bas">▼</button>
    </div>
    <p class="ctrl-hint"><strong>1 DECISION = 1 TURN.</strong> Arrow keys or buttons. The knight slides until a wall or junction.</p>
</div>

<script>
// On expose les données du niveau et les identifiants au moteur JavaScript via des variables globales
window.LEVEL_DATA = <?= $levelDataJson ?>;
window.USER_ID    = <?= (int)currentUserId() ?>;
window.CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;
</script>
<script src="js/game.js"></script>
</body>
</html>
