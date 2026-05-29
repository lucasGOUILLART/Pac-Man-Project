<?php
// Page d'accueil : formulaire de connexion ET d'inscription sur la même page.
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

startSecureSession();

// Si l'utilisateur est déjà connecté, on l'envoie directement au menu principal
if (isLoggedIn()) {
    header('Location: menu.php');
    exit;
}

$errors = [];
$mode   = $_POST['mode'] ?? 'login'; // Par défaut on affiche le formulaire de connexion

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // On vérifie d'abord le token CSRF pour se protéger des attaques cross-site
    if (!csrfCheck($_POST['csrf_token'] ?? null)) {
        $errors[] = 'Invalid security token. Please refresh and try again.';
    } else {
        $pseudo   = trim($_POST['pseudo'] ?? '');
        $password = $_POST['password'] ?? '';

        if ($mode === 'register') {
            // ── Inscription d'un nouveau chevalier ──
            $email = trim($_POST['email'] ?? '');

            // Validation des champs avant d'aller en base
            if (strlen($pseudo) < 3 || strlen($pseudo) > 30) {
                $errors[] = 'Pseudo must be 3-30 characters.';
            }
            if (!preg_match('/^[a-zA-Z0-9_-]+$/', $pseudo)) {
                $errors[] = 'Pseudo can only contain letters, numbers, _ and -.';
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 60) {
                $errors[] = 'Invalid email address.';
            }
            if (strlen($password) < 8) {
                $errors[] = 'Password must be at least 8 characters.';
            }

            if (empty($errors)) {
                $pdo = getDB();
                // On vérifie si le pseudo ou l'email est déjà pris
                $stmt = $pdo->prepare(
                    'SELECT id FROM utisateur WHERE pseudo = ? OR adresse_mail = ?'
                );
                $stmt->execute([$pseudo, $email]);
                if ($stmt->fetch()) {
                    $errors[] = 'This pseudo or email is already registered.';
                } else {
                    // On hache le mot de passe avec bcrypt avant de l'enregistrer
                    $hash = password_hash($password, PASSWORD_BCRYPT);
                    $ins  = $pdo->prepare(
                        'INSERT INTO utisateur (pseudo, adresse_mail, mot_de_passe)
                         VALUES (?, ?, ?)'
                    );
                    $ins->execute([$pseudo, $email, $hash]);
                    // On connecte l'utilisateur directement après son inscription
                    loginUser((int)$pdo->lastInsertId(), $pseudo);
                    header('Location: menu.php');
                    exit;
                }
            }
        } else {
            // ── Connexion d'un utilisateur existant ──
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, pseudo, mot_de_passe FROM utisateur WHERE pseudo = ?'
            );
            $stmt->execute([$pseudo]);
            $user = $stmt->fetch();

            // password_verify compare le mot de passe en clair avec le hash bcrypt
            if ($user && password_verify($password, $user['mot_de_passe'])) {
                loginUser((int)$user['id'], $user['pseudo']);
                header('Location: menu.php');
                exit;
            }
            $errors[] = 'Incorrect pseudo or password.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Enter the Castle</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="auth-body">
<div class="vignette"></div>

<main class="auth-shell">
    <header class="auth-header">
        <img class="logo" src="img/logo.png" alt="Les fantômes d'Ombrequatre">
        <h1 class="title">LES FANTÔMES D'OMBREQUATRE</h1>
        <p class="subtitle">RESCUE · DEDUCE · SURVIVE</p>
    </header>

    <div class="auth-card">
        <!-- Onglets pour basculer entre connexion et inscription -->
        <div class="tabs">
            <button class="tab <?= $mode === 'login' ? 'active' : '' ?>" data-mode="login">Sign In</button>
            <button class="tab <?= $mode === 'register' ? 'active' : '' ?>" data-mode="register">New Knight</button>
        </div>

        <!-- Affichage des erreurs de validation ou d'authentification -->
        <?php if (!empty($errors)): ?>
            <div class="alert">
                <?php foreach ($errors as $err): ?>
                    <div><?= e($err) ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <form method="post" class="auth-form" id="authForm" autocomplete="off">
            <!-- Token CSRF caché pour protéger le formulaire -->
            <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
            <input type="hidden" name="mode" id="modeInput" value="<?= e($mode) ?>">

            <label class="field">
                <span>Pseudo</span>
                <input type="text" name="pseudo" required minlength="3" maxlength="30"
                       value="<?= e($_POST['pseudo'] ?? '') ?>"
                       pattern="[a-zA-Z0-9_-]+">
            </label>

            <!-- Champ email visible uniquement à l'inscription -->
            <label class="field email-field" style="<?= $mode === 'register' ? '' : 'display:none' ?>">
                <span>E-mail</span>
                <input type="email" name="email" maxlength="60"
                       value="<?= e($_POST['email'] ?? '') ?>">
            </label>

            <label class="field">
                <span>Password</span>
                <input type="password" name="password" required minlength="8">
            </label>

            <button class="submit-btn" type="submit">
                <span id="submitLabel"><?= $mode === 'register' ? 'Take the Oath' : 'Enter the Castle' ?></span>
            </button>
        </form>

        <p class="muted">Demo account — pseudo: <code>demo</code> &nbsp;·&nbsp; password: <code>demo1234</code></p>
    </div>

    <footer class="auth-footer">CIR1 2025-2026 · Group 4doigtsdelamain</footer>
</main>

<script>
// Récupération des éléments du DOM pour gérer le basculement entre les onglets
const tabs       = document.querySelectorAll('.tab');
const modeInput  = document.getElementById('modeInput');
const emailField = document.querySelector('.email-field');
const submitLbl  = document.getElementById('submitLabel');
const emailInput = emailField.querySelector('input');

// Quand on clique sur un onglet, on met à jour le formulaire en conséquence
tabs.forEach(tab => {
    tab.addEventListener('click', e => {
        e.preventDefault();
        const mode = tab.dataset.mode;
        // On marque l'onglet actif et on désactive les autres
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        modeInput.value = mode;
        const isRegister = mode === 'register';
        // On affiche/masque le champ email selon le mode
        emailField.style.display = isRegister ? '' : 'none';
        emailInput.required = isRegister;
        // On adapte le libellé du bouton de soumission
        submitLbl.textContent = isRegister ? 'Take the Oath' : 'Enter the Castle';
    });
});
</script>
</body>
</html>
