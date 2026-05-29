<?php
// Page "Mes niveaux" : liste, lecture, export et suppression des niveaux créés par le joueur.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';
requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// Récupération de tous les niveaux appartenant à cet utilisateur, du plus récent au plus ancien
$stmt = $pdo->prepare('
    SELECT id, name, map, difficulte, score_max, solution_safe, is_public, created_at
    FROM niveau
    WHERE auteur_id = ?
    ORDER BY created_at DESC
');
$stmt->execute([$userId]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Analyse du contenu d'une carte pour en extraire le nombre de gemmes et de fantômes
function parseLevelMeta(string $map): array {
    $gems   = substr_count($map, '.'); // Chaque '.' est une gemme dans le format de carte
    $ghosts = 0;
    foreach (explode("\n", $map) as $line) {
        $p = preg_split('/\s+/', trim($line));
        if (isset($p[0]) && $p[0] === 'MAP') break; // On s'arrête au début de la grille
        // R, G, Y, B sont les codes des quatre types de fantômes dans l'en-tête du niveau
        if (isset($p[0]) && in_array($p[0], ['R', 'G', 'Y', 'B'], true)) $ghosts++;
    }
    return ['gems' => $gems, 'ghosts' => $ghosts];
}

// On enrichit chaque niveau avec les métadonnées extraites de la carte
$levels = [];
foreach ($rows as $row) {
    $levels[] = array_merge($row, parseLevelMeta($row['map']));
}

$total = count($levels);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Levels — Les fantômes d'Ombrequatre</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="mylevels-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">MY LEVELS</h1>
    <a href="play.php" class="nav-btn">← BACK</a>
</header>

<main class="mylevels-main">

    <!-- Barre d'actions rapides : créer ou générer un nouveau niveau -->
    <div class="mylevels-quickbar">
        <a class="menu-btn" href="editor.php"><span class="btn-icon">✎</span> CREATE IN EDITOR</a>
        <a class="menu-btn" href="generator.php"><span class="btn-icon">⚄</span> GENERATE RANDOM</a>
        <span class="mylevels-count">
            <?= $total ?> / 20 level<?= $total !== 1 ? 's' : '' ?>
            <?php if ($total >= 20): ?><span class="mylevels-limit">· LIMIT REACHED</span><?php endif; ?>
        </span>
    </div>

    <?php if ($total === 0): ?>
    <!-- État vide : le joueur n'a pas encore créé de niveau -->
    <div class="mylevels-empty panel">
        <p>You haven't saved any levels yet.</p>
        <p>Design one in the <a href="editor.php">Level Editor</a> or<br>
           generate a random maze and save it.</p>
    </div>

    <?php else: ?>
    <!-- Grille de cartes, une par niveau créé par le joueur -->
    <div class="mylevels-grid" id="levelGrid">
        <?php foreach ($levels as $lvl): ?>
        <article class="my-level-card panel" id="card-<?= $lvl['id'] ?>">

            <div class="mlc-header">
                <h2 class="mlc-name"><?= e($lvl['name'] ?? 'Sans titre') ?></h2>
                <!-- Badge PUBLIC ou BROUILLON selon la visibilité du niveau -->
                <span class="mlc-badge <?= $lvl['is_public'] ? 'public' : 'draft' ?>">
                    <?= $lvl['is_public'] ? '● PUBLIC' : '○ DRAFT' ?>
                </span>
            </div>

            <time class="mlc-date"><?= date('d M Y · H:i', strtotime($lvl['created_at'])) ?></time>

            <ul class="mlc-stats">
                <li>★ <?= $lvl['gems'] ?> gem<?= $lvl['gems'] !== 1 ? 's' : '' ?></li>
                <?php if ($lvl['ghosts'] > 0): ?>
                <li>👻 <?= $lvl['ghosts'] ?> ghost<?= $lvl['ghosts'] > 1 ? 's' : '' ?></li>
                <?php else: ?>
                <li>No ghosts</li>
                <?php endif; ?>
                <li>Diff <?= $lvl['difficulte'] ?>/5</li>
                <?php if ($lvl['solution_safe']): ?>
                <li class="mlc-safe">✓ Ghost-safe</li>
                <?php endif; ?>
            </ul>

            <!-- Actions disponibles pour chaque niveau -->
            <div class="mlc-actions">
                <button class="menu-btn primary mlc-btn"
                        onclick="playLevel(<?= $lvl['id'] ?>)">▶ PLAY</button>
                <a class="menu-btn mlc-btn"
                   href="editor.php?id=<?= $lvl['id'] ?>">✎ EDIT</a>
                <button class="menu-btn mlc-btn"
                        onclick="exportLevel(<?= $lvl['id'] ?>)">↓ EXPORT</button>
                <button class="menu-btn mlc-btn mlc-delete"
                        onclick="deleteLevel(<?= $lvl['id'] ?>, this.closest('.my-level-card'))">✕ DELETE</button>
            </div>

        </article>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

</main>

<script>
// Token CSRF exposé au JavaScript pour les requêtes API (suppression notamment)
window.CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;

// On embarque les données des niveaux côté client pour éviter des allers-retours
// réseau lors du clic sur Jouer ou Exporter
window.MY_LEVELS = <?= json_encode(array_map(
    fn($l) => ['id' => $l['id'], 'name' => $l['name'] ?? 'Sans titre', 'map' => $l['map']],
    $levels
)) ?>;

const STORAGE_KEY = 'ombrequatre_play_map';

// Lance la lecture d'un niveau personnalisé en passant la carte via sessionStorage
function playLevel(id) {
    const lvl = window.MY_LEVELS.find(l => l.id === id);
    if (!lvl) return;
    sessionStorage.setItem(STORAGE_KEY, lvl.map);
    window.location.href = 'game.php?mode=custom';
}

// Exporte la carte du niveau sous forme d'un fichier JSON téléchargeable
function exportLevel(id) {
    const lvl = window.MY_LEVELS.find(l => l.id === id);
    if (!lvl) return;
    const payload = {
        name:       lvl.name || 'my-level',
        map:        lvl.map,
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = (lvl.name || 'my-level').replace(/[^\w\-]+/g, '_') + '.ombrequatre.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

// Supprime un niveau après confirmation, puis retire la carte du DOM avec une animation
async function deleteLevel(id, cardEl) {
    if (!confirm('Delete this level? This cannot be undone.')) return;

    const resp = await fetch('api/delete_level.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csrf_token: window.CSRF_TOKEN, id }),
    });
    const data = await resp.json();

    if (data.ok) {
        // Animation de disparition avant de retirer l'élément du DOM
        cardEl.classList.add('mlc-removing');
        setTimeout(() => {
            cardEl.remove();
            window.MY_LEVELS = window.MY_LEVELS.filter(l => l.id !== id);
            // Si la grille est vide après suppression, on affiche un message d'état vide
            const grid = document.getElementById('levelGrid');
            if (grid && !grid.querySelector('.my-level-card')) {
                grid.innerHTML =
                    '<p class="mylevels-empty-inline">All levels deleted. ' +
                    '<a href="editor.php">Create a new one</a>.</p>';
            }
        }, 300);
    } else {
        alert(data.error || 'Delete failed.');
    }
}
</script>
</body>
</html>
