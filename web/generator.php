<?php
require_once __DIR__ . '/includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Random Mazes — Les fantômes d'Ombrequatre</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body class="generator-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">RANDOM MAZES</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="generator-main panel">
    <section class="generator-intro">
        <h2>MEDIUM DIFFICULTY</h2>
        <p>Automatically generated rooms comparable to campaign levels <strong>5–6</strong>:
           icy corridors, <strong>18–26 gems</strong>, <strong>1 to 2 ghosts</strong> (red / green),
           verified by the solver in under <strong>15 seconds</strong>.</p>
    </section>

    <div class="generator-actions">
        <button type="button" class="menu-btn primary" id="generateBtn">GENERATE A MAZE</button>
        <button type="button" class="menu-btn" id="playBtn" disabled>PLAY THIS LEVEL</button>
    </div>

    <div id="genPreview" class="gen-preview"></div>
    <div id="genStatus" class="editor-status"></div>
</main>

<div id="solverOverlay" class="solver-overlay" hidden></div>

<script src="js/level-utils.js"></script>
<script src="js/game.js?v=2"></script>
<script src="js/solver-bridge.js"></script>
<script src="js/generator.js"></script>
</body>
</html>
