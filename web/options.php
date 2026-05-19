<?php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

requireLogin();

$pdo    = getDB();
$userId = currentUserId();

// Stats
$stmt = $pdo->prepare('
    SELECT u.pseudo, u.niveau_actuel, u.score_total,
        (SELECT COALESCE(MAX(score_niveau), 0) FROM in_game WHERE id_joueur = u.id) AS best_score,
        (SELECT COALESCE(SUM(nb_piece),    0) FROM in_game WHERE id_joueur = u.id) AS total_pieces
    FROM utisateur u WHERE u.id = ?
');
$stmt->execute([$userId]);
$user = $stmt->fetch();

// User no longer exists in DB. Force logout.
if (!$user) {
    header('Location: logout.php');
    exit;
}

// Handle pseudo change
$flash = null;
$errors = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['new_pseudo'])) {
    if (!csrfCheck($_POST['csrf_token'] ?? null)) {
        $errors[] = 'Invalid security token.';
    } else {
        $newPseudo = trim($_POST['new_pseudo']);
        if (strlen($newPseudo) < 3 || strlen($newPseudo) > 30) {
            $errors[] = 'Pseudo must be 3-30 characters.';
        } elseif (!preg_match('/^[a-zA-Z0-9_-]+$/', $newPseudo)) {
            $errors[] = 'Pseudo can only contain letters, numbers, _ and -.';
        } else {
            $stmt = $pdo->prepare('SELECT id FROM utisateur WHERE pseudo = ? AND id != ?');
            $stmt->execute([$newPseudo, $userId]);
            if ($stmt->fetch()) {
                $errors[] = 'This pseudo is already taken.';
            } else {
                $pdo->prepare('UPDATE utisateur SET pseudo = ? WHERE id = ?')
                    ->execute([$newPseudo, $userId]);
                $_SESSION['pseudo'] = $newPseudo;
                $user['pseudo']     = $newPseudo;
                $flash = 'Pseudo updated successfully.';
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Options</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body class="options-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">OPTIONS</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="options-shell">
    <div class="opt-row">
        <div class="opt-stat panel">
            <span class="opt-label">BEST SCORE</span>
            <span class="opt-value"><?= str_pad((string)(int)$user['best_score'], 6, '0', STR_PAD_LEFT) ?></span>
        </div>
        <div class="opt-stat panel">
            <span class="opt-label">COINS GATHERED</span>
            <span class="opt-value"><?= str_pad((string)(int)$user['total_pieces'], 4, '0', STR_PAD_LEFT) ?></span>
        </div>
    </div>

    <div class="opt-row">
        <div class="opt-stat panel">
            <span class="opt-label">BEST LEVEL</span>
            <span class="opt-value"><?= str_pad((string)max(0, (int)$user['niveau_actuel'] - 1), 2, '0', STR_PAD_LEFT) ?></span>
        </div>
        <div class="opt-stat panel">
            <span class="opt-label">TOTAL SCORE</span>
            <span class="opt-value"><?= str_pad((string)(int)$user['score_total'], 6, '0', STR_PAD_LEFT) ?></span>
        </div>
    </div>

    <section class="opt-pseudo panel">
        <div class="opt-avatar">
            <img src="img/chevalier1.png" alt="">
        </div>
        <div class="opt-pseudo-form">
            <h3>CHANGE PSEUDO</h3>
            <p class="muted-small">Currently <strong><?= e($user['pseudo']) ?></strong></p>
            <?php if (!empty($errors)): ?>
                <div class="alert">
                    <?php foreach ($errors as $err): ?><div><?= e($err) ?></div><?php endforeach; ?>
                </div>
            <?php elseif ($flash): ?>
                <div class="alert success"><?= e($flash) ?></div>
            <?php endif; ?>
            <form method="post" class="pseudo-form">
                <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
                <input type="text" name="new_pseudo" placeholder="new pseudo"
                       maxlength="30" pattern="[a-zA-Z0-9_-]+" required>
                <button type="submit" class="menu-btn primary">UPDATE</button>
            </form>
        </div>
    </section>
</main>
</body>
</html>
