<?php
require_once __DIR__ . '/includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Level Editor — Les fantômes d'Ombrequatre</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body class="editor-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">LEVEL EDITOR</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="editor-layout">
    <aside class="editor-tools panel">
        <h2>TOOLS</h2>
        <div class="tool-grid" id="toolGrid">
            <button type="button" class="tool-btn active" data-tool="wall" title="Wall"># Wall</button>
            <button type="button" class="tool-btn" data-tool="floor" title="Floor">_ Floor</button>
            <button type="button" class="tool-btn" data-tool="gem" title="Gem">. Gem</button>
            <button type="button" class="tool-btn" data-tool="portal" title="Portal">* Portal</button>
            <button type="button" class="tool-btn" data-tool="knight" title="Knight">♞ Knight</button>
            <button type="button" class="tool-btn" data-tool="ghost-red">R Red</button>
            <button type="button" class="tool-btn" data-tool="ghost-green">G Green</button>
            <button type="button" class="tool-btn" data-tool="ghost-yellow">Y Yellow</button>
            <button type="button" class="tool-btn" data-tool="ghost-blue">B Blue</button>
            <button type="button" class="tool-btn" data-tool="erase" title="Erase">✕ Erase</button>
        </div>

        <h2>SIZE</h2>
        <div class="editor-field">
            <label for="gridWidth">Width</label>
            <input type="number" id="gridWidth" min="5" max="21" value="11">
        </div>
        <div class="editor-field">
            <label for="gridHeight">Height</label>
            <input type="number" id="gridHeight" min="5" max="17" value="9">
        </div>
        <button type="button" class="menu-btn" id="applySizeBtn">APPLY SIZE</button>
        <button type="button" class="menu-btn" id="borderWallsBtn">BORDER WALLS</button>

        <h2>OBJECTIVES</h2>
        <p class="editor-hint">Gem target: <strong id="gemCountDisplay">0</strong> / <span id="gemTargetDisplay">12</span></p>
        <div class="editor-field">
            <label for="targetGems">Target gem count</label>
            <input type="number" id="targetGems" min="1" max="30" value="12">
        </div>
        <button type="button" class="menu-btn" id="scatterGemsBtn">AUTO-PLACE GEMS</button>
        <p class="editor-hint">Ghosts: <strong id="ghostCountDisplay">0</strong></p>

        <h2>FILE</h2>
        <button type="button" class="menu-btn primary" id="exportBtn">EXPORT</button>
        <button type="button" class="menu-btn" id="importBtn">IMPORT</button>
        <input type="file" id="importFile" accept=".txt,.json,application/json,text/plain" hidden>
    </aside>

    <section class="editor-canvas panel">
        <p class="editor-hint center">Click on the grid to paint. Knight and Ghost tools place the entity on the selected cell.</p>
        <div class="editor-grid-wrap">
            <div id="editorGrid" class="editor-grid" role="grid"></div>
        </div>
        <div id="editorStatus" class="editor-status"></div>
    </section>

    <aside class="editor-actions panel">
        <h2>VALIDATION</h2>
        <p class="editor-hint">The solver checks in ≤ 15 s that all gems are reachable (avoiding ghosts when possible).</p>
        <button type="button" class="menu-btn primary" id="validateBtn">VALIDATE &amp; PLAY</button>
        <button type="button" class="menu-btn" id="playSkipBtn" disabled>PLAY (after validation)</button>
        <div id="validationResult" class="validation-result"></div>

        <h2>COMMUNITY</h2>
        <p class="editor-hint">Submit this level so other players can try it in the campaign.</p>
        <button type="button" class="menu-btn" id="submitLevelBtn" disabled>SUBMIT TO CAMPAIGN</button>
        <div id="submitResult" class="validation-result"></div>
    </aside>
</main>

<div id="solverOverlay" class="solver-overlay" hidden></div>

<script>
window.USER_ID    = <?= (int)currentUserId() ?>;
window.CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;
</script>
<script src="js/level-utils.js"></script>
<script src="js/game.js?v=2"></script>
<script src="js/solver-bridge.js"></script>
<script src="js/editor.js"></script>
</body>
</html>
