<?php
require_once __DIR__ . '/includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Concevoir un niveau — Les fantômes d'Ombrequatre</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body class="editor-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">CONCEVOIR UN NIVEAU</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="editor-layout">
    <aside class="editor-tools panel">
        <h2>OUTILS</h2>
        <div class="tool-grid" id="toolGrid">
            <button type="button" class="tool-btn active" data-tool="wall" title="Mur"># Mur</button>
            <button type="button" class="tool-btn" data-tool="floor" title="Sol">_ Sol</button>
            <button type="button" class="tool-btn" data-tool="gem" title="Étoile">. Étoile</button>
            <button type="button" class="tool-btn" data-tool="portal" title="Portail">* Portail</button>
            <button type="button" class="tool-btn" data-tool="knight" title="Chevalier">♞ Chevalier</button>
            <button type="button" class="tool-btn" data-tool="ghost-red">R Rouge</button>
            <button type="button" class="tool-btn" data-tool="ghost-green">G Vert</button>
            <button type="button" class="tool-btn" data-tool="ghost-yellow">Y Jaune</button>
            <button type="button" class="tool-btn" data-tool="ghost-blue">B Bleu</button>
            <button type="button" class="tool-btn" data-tool="erase" title="Effacer">✕ Effacer</button>
        </div>

        <h2>TAILLE</h2>
        <div class="editor-field">
            <label for="gridWidth">Largeur</label>
            <input type="number" id="gridWidth" min="5" max="21" value="11">
        </div>
        <div class="editor-field">
            <label for="gridHeight">Hauteur</label>
            <input type="number" id="gridHeight" min="5" max="17" value="9">
        </div>
        <button type="button" class="menu-btn" id="applySizeBtn">APPLIQUER LA TAILLE</button>
        <button type="button" class="menu-btn" id="borderWallsBtn">MURS DE BORDURE</button>

        <h2>OBJECTIFS</h2>
        <p class="editor-hint">Cible d’étoiles : <strong id="gemCountDisplay">0</strong> / <span id="gemTargetDisplay">12</span></p>
        <div class="editor-field">
            <label for="targetGems">Nombre d’étoiles visé</label>
            <input type="number" id="targetGems" min="1" max="30" value="12">
        </div>
        <button type="button" class="menu-btn" id="scatterGemsBtn">PLACER LES ÉTOILES (AUTO)</button>
        <p class="editor-hint">Fantômes : <strong id="ghostCountDisplay">0</strong></p>

        <h2>FICHIER</h2>
        <button type="button" class="menu-btn primary" id="exportBtn">EXPORTER</button>
        <button type="button" class="menu-btn" id="importBtn">IMPORTER</button>
        <input type="file" id="importFile" accept=".txt,.json,application/json,text/plain" hidden>
    </aside>

    <section class="editor-canvas panel">
        <p class="editor-hint center">Cliquez sur la grille pour peindre. Un clic avec l’outil Chevalier ou Fantôme place l’entité.</p>
        <div class="editor-grid-wrap">
            <div id="editorGrid" class="editor-grid" role="grid"></div>
        </div>
        <div id="editorStatus" class="editor-status"></div>
    </section>

    <aside class="editor-actions panel">
        <h2>VALIDATION</h2>
        <p class="editor-hint">Le solveur vérifie en ≤ 15 s que toutes les étoiles sont récupérables (évitant les fantômes si possible).</p>
        <button type="button" class="menu-btn primary" id="validateBtn">VÉRIFIER &amp; JOUER</button>
        <button type="button" class="menu-btn" id="playSkipBtn" disabled>JOUER (après validation)</button>
        <div id="validationResult" class="validation-result"></div>
    </aside>
</main>

<div id="solverOverlay" class="solver-overlay" hidden></div>

<script src="js/level-utils.js"></script>
<script src="js/game.js?v=2"></script>
<script src="js/solver-bridge.js"></script>
<script src="js/editor.js"></script>
</body>
</html>
