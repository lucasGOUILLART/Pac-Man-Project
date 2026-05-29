<?php
// Page de sélection du mode de jeu : campagne, éditeur, labyrinthe aléatoire ou mes niveaux.
require_once __DIR__ . '/includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Play</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="menu-body">
<div class="vignette"></div>

<main class="menu-shell">
    <header class="menu-title">
        <h1>LES FANTÔMES D'OMBREQUATRE</h1>
        <p>CHOOSE YOUR GAME MODE</p>
    </header>

    <!-- Quatre cartes de mode de jeu disposées en grille -->
    <div class="play-columns">
        <!-- Mode campagne : 10 niveaux officiels -->
        <section class="play-card panel">
            <h2>CAMPAIGN</h2>
            <p>Ten hand-crafted levels. Defeat the Wardens, collect the Sacred Jewels, and rescue the princess.</p>
            <a class="menu-btn primary" href="dashboard.php"><span class="btn-icon">▶</span> ENTER</a>
        </section>

        <!-- Éditeur de niveaux : création manuelle de labyrinthes -->
        <section class="play-card panel">
            <h2>LEVEL EDITOR</h2>
            <p>Design your own labyrinth, place ghosts and gems, then submit it to the campaign for others to play.</p>
            <a class="menu-btn" href="editor.php"><span class="btn-icon">✎</span> OPEN EDITOR</a>
        </section>

        <!-- Générateur : labyrinthes aléatoires vérifiés par le solveur C -->
        <section class="play-card panel">
            <h2>RANDOM MAZES</h2>
            <p>Generate a solver-verified random maze on the fly and play it immediately. Every run is unique.</p>
            <a class="menu-btn" href="generator.php"><span class="btn-icon">⚄</span> GENERATE</a>
        </section>

        <!-- Mes niveaux : accès aux niveaux créés ou sauvegardés par le joueur -->
        <section class="play-card panel">
            <h2>MY LEVELS</h2>
            <p>Play, edit, export or delete the levels you created in the editor or generated randomly.</p>
            <a class="menu-btn" href="my_levels.php"><span class="btn-icon">☰</span> MY LEVELS</a>
        </section>
    </div>

    <nav class="play-back">
        <a class="menu-btn quit" href="menu.php">← BACK TO MENU</a>
    </nav>
</main>
</body>
</html>
