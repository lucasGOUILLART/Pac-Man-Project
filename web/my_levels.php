<?php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';
requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// ── Fetch all levels owned by this user ─────────────────────────────────────
$stmt = $pdo->prepare('
    SELECT id, name, map, difficulte, score_max, solution_safe, is_public, created_at
    FROM niveau
    WHERE auteur_id = ?
    ORDER BY created_at DESC
');
$stmt->execute([$userId]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// ── Parse gem/ghost counts from each map text ────────────────────────────────
function parseLevelMeta(string $map): array {
    $gems   = substr_count($map, '.');
    $ghosts = 0;
    foreach (explode("\n", $map) as $line) {
        $p = preg_split('/\s+/', trim($line));
        if (isset($p[0]) && $p[0] === 'MAP') break;
        if (isset($p[0]) && in_array($p[0], ['R', 'G', 'Y', 'B'], true)) $ghosts++;
    }
    return ['gems' => $gems, 'ghosts' => $ghosts];
}

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
<link rel="stylesheet" href="css/style.css?v=3">
</head>
<body class="mylevels-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">MY LEVELS</h1>
    <a href="play.php" class="nav-btn">← BACK</a>
</header>

<main class="mylevels-main">

    <!-- Quick-create row -->
    <div class="mylevels-quickbar">
        <a class="menu-btn" href="editor.php"><span class="btn-icon">✎</span> CREATE IN EDITOR</a>
        <a class="menu-btn" href="generator.php"><span class="btn-icon">⚄</span> GENERATE RANDOM</a>
        <span class="mylevels-count">
            <?= $total ?> / 20 level<?= $total !== 1 ? 's' : '' ?>
            <?php if ($total >= 20): ?><span class="mylevels-limit">· LIMIT REACHED</span><?php endif; ?>
        </span>
    </div>

    <?php if ($total === 0): ?>
    <!-- Empty state -->
    <div class="mylevels-empty panel">
        <p>You haven't saved any levels yet.</p>
        <p>Design one in the <a href="editor.php">Level Editor</a> or<br>
           generate a random maze and save it.</p>
    </div>

    <?php else: ?>
    <!-- Level cards grid -->
    <div class="mylevels-grid" id="levelGrid">
        <?php foreach ($levels as $lvl): ?>
        <article class="my-level-card panel" id="card-<?= $lvl['id'] ?>">

            <div class="mlc-header">
                <h2 class="mlc-name"><?= e($lvl['name'] ?? 'Sans titre') ?></h2>
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
window.CSRF_TOKEN = <?= json_encode(csrfToken()) ?>;

// Level data embedded for client-side Play and Export (avoids extra round-trips)
window.MY_LEVELS = <?= json_encode(array_map(
    fn($l) => ['id' => $l['id'], 'name' => $l['name'] ?? 'Sans titre', 'map' => $l['map']],
    $levels
)) ?>;

const STORAGE_KEY = 'ombrequatre_play_map';

// ── Play ─────────────────────────────────────────────────────────────────────
function playLevel(id) {
    const lvl = window.MY_LEVELS.find(l => l.id === id);
    if (!lvl) return;
    sessionStorage.setItem(STORAGE_KEY, lvl.map);
    window.location.href = 'game.php?mode=custom';
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportLevel(id) {
    const lvl = window.MY_LEVELS.find(l => l.id === id);
    if (!lvl) return;
    const payload = {
        version:    1,
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

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteLevel(id, cardEl) {
    if (!confirm('Delete this level? This cannot be undone.')) return;

    const resp = await fetch('api/delete_level.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csrf_token: window.CSRF_TOKEN, id }),
    });
    const data = await resp.json();

    if (data.ok) {
        cardEl.classList.add('mlc-removing');
        setTimeout(() => {
            cardEl.remove();
            window.MY_LEVELS = window.MY_LEVELS.filter(l => l.id !== id);
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
