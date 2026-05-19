<?php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

$levelId = (int)($_GET['level'] ?? 1);
if ($levelId < 1) $levelId = 1;

// Power-ups setting is in the session (configured from the main menu).
// Defaults to OFF for a pure-puzzle experience.
$powerUpsEnabled = powerUpsEnabled();

$pdo = getDB();

$stmt = $pdo->prepare('SELECT niveau_actuel FROM utisateur WHERE id = ?');
$stmt->execute([currentUserId()]);
$user = $stmt->fetch();
if (!$user) { header('Location: logout.php'); exit; }

if ($levelId > (int)$user['niveau_actuel']) {
    header('Location: dashboard.php');
    exit;
}

$stmt = $pdo->prepare('SELECT id, difficulte, score_max, map FROM niveau WHERE id = ?');
$stmt->execute([$levelId]);
$level = $stmt->fetch();
if (!$level) { header('Location: dashboard.php'); exit; }

$levelDataJson = json_encode([
    'id'         => (int)$level['id'],
    'difficulte' => (int)$level['difficulte'],
    'score_max'  => (int)$level['score_max'],
    'map'        => $level['map'],
    'powerUps'   => $powerUpsEnabled,
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Level <?= (int)$level['id'] ?></title>
<link rel="stylesheet" href="css/style.css">
</head>
<body class="game-body">
<div class="vignette"></div>

<!-- Top HUD -->
<header class="game-hud">
    <div class="hud-left">
        <div class="hud-stat"><span class="hud-label">SCORE</span><span class="hud-value" id="score">000000</span></div>
        <div class="hud-stat"><span class="hud-label">LEVEL</span><span class="hud-value"><?= str_pad((string)(int)$level['id'], 2, '0', STR_PAD_LEFT) ?></span></div>
        <div class="hud-stat"><span class="hud-label">GEMS</span><span class="hud-value" id="gems">00/00</span></div>
        <div class="hud-stat"><span class="hud-label">TURNS</span><span class="hud-value" id="moves">000</span></div>
        <div class="hud-stat"><span class="hud-label">TIME</span><span class="hud-value" id="time">00:00</span></div>
        <div class="hud-stat"><span class="hud-label">LIVES</span><span class="hud-value" id="lives"></span></div>
        <div class="hud-stat hud-flag <?= $powerUpsEnabled ? 'on' : 'off' ?>">
            <span class="hud-label">POWER-UPS</span>
            <span class="hud-value"><?= $powerUpsEnabled ? 'ON' : 'OFF' ?></span>
        </div>
    </div>
    <div class="hud-right">
        <button id="solverBtn" class="nav-btn nav-btn-dark">HINT FROM HERE</button>
        <a href="menu.php" class="nav-btn nav-btn-dark">MENU</a>
    </div>
</header>

<!-- Mode indicator -->
<div class="mode-banner" id="modeBanner">
    <span class="mode-label">STATUS</span>
    <span class="mode-value" id="modeText">STEALTH</span>
</div>

<!-- Main game area: canvas + solution panel + controls -->
<main class="game-main">
    <section class="game-canvas-wrap">
        <canvas id="canvas" width="640" height="640"></canvas>
        <div class="game-overlay" id="overlay" style="display:none;"></div>
    </section>

    <aside id="solutionPanel" class="solution-panel">
        <h3>OPTIMAL PATH</h3>
        <p class="sol-sub">Computed from level start.<br>
           <span id="solGhostNote" class="sol-note"></span></p>
        <div class="sol-status" id="solStatus">Computing…</div>
        <div class="sol-sequence" id="solSequence"></div>
        <div class="sol-stats">
            <div><span>OPTIMAL</span><strong id="solOpt">—</strong></div>
            <div><span>YOURS</span><strong id="solMine">0</strong></div>
        </div>
    </aside>
</main>

<!-- Direction controls -->
<div class="game-controls">
    <div class="dirs" id="dirs">
        <button class="dir-btn" data-dir="U" aria-label="Up">▲</button>
        <div class="dir-row">
            <button class="dir-btn" data-dir="L" aria-label="Left">◀</button>
            <button class="dir-btn dir-center" disabled aria-hidden="true">✦</button>
            <button class="dir-btn" data-dir="R" aria-label="Right">▶</button>
        </div>
        <button class="dir-btn" data-dir="D" aria-label="Down">▼</button>
    </div>
    <p class="ctrl-hint"><strong>ONE DECISION = ONE TURN.</strong> Use arrow keys or buttons. The knight slides until a wall or junction. No turning back.</p>
</div>

<script>
window.LEVEL_DATA = <?= $levelDataJson ?>;
window.USER_ID    = <?= (int)currentUserId() ?>;
window.CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;
</script>
<script src="js/game.js"></script>
</body>
</html>
