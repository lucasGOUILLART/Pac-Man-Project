<?php
// Éditeur de niveaux : création et modification manuelle de labyrinthes.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';
requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// Si un paramètre ?id= est fourni, on charge le niveau existant pour le modifier
$editLevel = null;
if (!empty($_GET['id'])) {
    $editId = (int)$_GET['id'];
    // On vérifie que le niveau appartient bien à cet utilisateur avant de le charger
    $stmt   = $pdo->prepare('
        SELECT id, name, map FROM niveau WHERE id = ? AND auteur_id = ?
    ');
    $stmt->execute([$editId, $userId]);
    $editLevel = $stmt->fetch() ?: null;
}

// Titre de la page adapté selon qu'on crée ou modifie un niveau
$pageTitle = $editLevel
    ? 'Editing: ' . ($editLevel['name'] ?? 'Level')
    : 'Level Editor';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($pageTitle) ?> — Les fantômes d'Ombrequatre</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="editor-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title"><?= $editLevel ? 'EDITING LEVEL' : 'LEVEL EDITOR' ?></h1>
    <a href="<?= $editLevel ? 'my_levels.php' : 'menu.php' ?>" class="nav-btn">
        <?= $editLevel ? '← MY LEVELS' : 'MENU' ?>
    </a>
</header>

<!-- Disposition en 3 colonnes : outils | canvas | actions/validation -->
<main class="editor-layout">
    <!-- Panneau gauche : outils de dessin, taille de la grille, gemmes -->
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

    <!-- Panneau central : la grille de dessin interactive -->
    <section class="editor-canvas panel">
        <p class="editor-hint center">Click on the grid to paint. Knight and Ghost tools place the entity on the selected cell.</p>
        <div class="editor-grid-wrap">
            <div id="editorGrid" class="editor-grid" role="grid"></div>
        </div>
        <div id="editorStatus" class="editor-status"></div>
    </section>

    <!-- Panneau droit : validation par le solveur, sauvegarde et soumission -->
    <aside class="editor-actions panel">
        <h2>VALIDATION</h2>
        <p class="editor-hint">The solver checks in ≤ 15 s that all gems are reachable (avoiding ghosts when possible).</p>
        <button type="button" class="menu-btn primary" id="validateBtn">VALIDATE &amp; PLAY</button>
        <button type="button" class="menu-btn" id="playSkipBtn" disabled>PLAY (after validation)</button>
        <div id="validationResult" class="validation-result"></div>

        <h2>MY LEVELS</h2>
        <p class="editor-hint">Save this level to your personal collection.</p>
        <button type="button" class="menu-btn primary" id="saveLevelBtn" disabled>
            <?= $editLevel ? 'UPDATE MY LEVEL' : 'SAVE TO MY LEVELS' ?>
        </button>
        <a class="menu-btn" href="my_levels.php">VIEW MY LEVELS →</a>
        <div id="saveResult" class="validation-result"></div>

        <h2>COMMUNITY</h2>
        <p class="editor-hint">Submit this level so other players can try it in the campaign.</p>
        <button type="button" class="menu-btn" id="submitLevelBtn" disabled>SUBMIT TO CAMPAIGN</button>
        <div id="submitResult" class="validation-result"></div>
    </aside>
</main>

<!-- Overlay affiché pendant le calcul du solveur -->
<div id="solverOverlay" class="solver-overlay" hidden></div>

<script>
// On expose les variables nécessaires au JavaScript de l'éditeur
window.USER_ID    = <?= (int)currentUserId() ?>;
window.CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;
<?php if ($editLevel): ?>
// Si on est en mode édition, on passe les données du niveau existant à l'éditeur JS
window.EDIT_LEVEL = <?= json_encode([
    'id'   => $editLevel['id'],
    'name' => $editLevel['name'] ?? '',
    'map'  => $editLevel['map'],
]) ?>;
<?php else: ?>
// Nouveau niveau : pas de données existantes à charger
window.EDIT_LEVEL = null;
<?php endif; ?>
</script>
<script src="js/level-utils.js"></script>
<script src="js/game.js"></script>
<script src="js/solver-bridge.js"></script>
<script src="js/editor.js"></script>
</body>
</html>
