<?php
require_once __DIR__ . '/includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Labyrinthes aléatoires — Les fantômes d'Ombrequatre</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body class="generator-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">LABYRINTHES ALÉATOIRES</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="generator-main panel">
    <section class="generator-intro">
        <h2>DIFFICULTÉ MOYENNE</h2>
        <p>Génération automatique de salles comparables aux niveaux <strong>5–6</strong> de la campagne :
           couloirs glacés, <strong>18–26 étoiles</strong>, <strong>1 à 2 fantômes</strong> (rouge / vert),
           vérifiés par le solveur en moins de <strong>15 secondes</strong>.</p>
    </section>

    <div class="generator-actions">
        <button type="button" class="menu-btn primary" id="generateBtn">GÉNÉRER UN LABYRINTHE</button>
        <button type="button" class="menu-btn" id="playBtn" disabled>JOUER CE NIVEAU</button>
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
