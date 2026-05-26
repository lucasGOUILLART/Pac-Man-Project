<?php
/**
 * One-time migration script — run once after pulling v2 changes.
 * Adds temps_best to in_game and auteur_id/created_at to niveau.
 * DELETE this file after running it.
 */
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

// Simple admin guard — only allow the first registered user (id=1) to run this.
if (currentUserId() !== 1) {
    die('Forbidden — only the first registered account may run this migration.');
}

$pdo = getDB();
$log = [];

function tryAlter(PDO $pdo, string $sql, string $label, array &$log): void {
    try {
        $pdo->exec($sql);
        $log[] = "✓ $label";
    } catch (PDOException $e) {
        $log[] = "⚠ $label — " . $e->getMessage();
    }
}

tryAlter($pdo,
    "ALTER TABLE `in_game` ADD COLUMN `temps_best` INT(11) NULL DEFAULT NULL",
    'in_game.temps_best', $log);

tryAlter($pdo,
    "ALTER TABLE `in_game` ADD KEY `idx_joueur` (`id_joueur`)",
    'in_game index idx_joueur', $log);

tryAlter($pdo,
    "ALTER TABLE `niveau` ADD COLUMN `auteur_id` INT(11) NULL DEFAULT NULL",
    'niveau.auteur_id', $log);

tryAlter($pdo,
    "ALTER TABLE `niveau` ADD COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    'niveau.created_at', $log);

tryAlter($pdo,
    "ALTER TABLE `niveau` ADD KEY `idx_auteur` (`auteur_id`)",
    'niveau index idx_auteur', $log);

?><!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Migration v2</title>
<style>body{font-family:monospace;background:#001440;color:#E0B95A;padding:40px}li{margin:6px 0}</style>
</head>
<body>
<h1>Migration v2 — Results</h1>
<ul>
<?php foreach ($log as $entry): ?>
    <li><?= htmlspecialchars($entry) ?></li>
<?php endforeach; ?>
</ul>
<p style="color:#66E6FF;margin-top:30px">Migration complete. <strong>Delete this file now.</strong></p>
<p><a href="menu.php" style="color:#E0B95A">→ Back to menu</a></p>
</body>
</html>
