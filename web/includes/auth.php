<?php
/**
 * Fonctions d'authentification : gestion sécurisée des sessions,
 * vérification de connexion, protection CSRF, et helpers divers.
 */

// Démarre une session sécurisée si elle n'est pas déjà active
function startSecureSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return; // La session est déjà ouverte, rien à faire
    }

    // On configure le cookie de session : pas d'expiration, accessible en HTTPS uniquement, etc.
    session_set_cookie_params([
        'lifetime' => 0,       // Le cookie disparaît quand le navigateur se ferme
        'path'     => '/',
        'httponly' => true,    // Inaccessible depuis JavaScript (protection XSS)
        'samesite' => 'Lax',   // Protection contre les attaques CSRF cross-site
    ]);

    session_start();

    // On régénère l'identifiant de session toutes les 30 minutes
    // pour limiter les risques de fixation de session
    if (!isset($_SESSION['_last_regen']) || (time() - $_SESSION['_last_regen']) > 1800) {
        session_regenerate_id(true);
        $_SESSION['_last_regen'] = time();
    }
}

// Vérifie si l'utilisateur est connecté (présence de l'id dans la session)
function isLoggedIn(): bool {
    startSecureSession();
    return isset($_SESSION['user_id']);
}

// Retourne l'identifiant de l'utilisateur connecté, ou null s'il n'est pas connecté
function currentUserId(): ?int {
    startSecureSession();
    return $_SESSION['user_id'] ?? null;
}

// Retourne le pseudo de l'utilisateur connecté, ou null
function currentUserPseudo(): ?string {
    startSecureSession();
    return $_SESSION['pseudo'] ?? null;
}

/**
 * Mode power-ups (orbes sacrées et montres chronos ont des effets).
 * Désactivé par défaut — le joueur choisit dans le menu principal.
 */
function powerUpsEnabled(): bool {
    startSecureSession();
    return !empty($_SESSION['power_ups']);
}

// Active ou désactive le mode power-ups pour la session en cours
function setPowerUps(bool $enabled): void {
    startSecureSession();
    $_SESSION['power_ups'] = $enabled;
}

// Redirige vers la page d'accueil si l'utilisateur n'est pas connecté
function requireLogin(): void {
    if (!isLoggedIn()) {
        header('Location: index.php');
        exit;
    }
}

// Connecte l'utilisateur en stockant son id et son pseudo dans la session
function loginUser(int $userId, string $pseudo): void {
    startSecureSession();
    session_regenerate_id(true); // Nouveau identifiant de session à la connexion pour éviter la fixation
    $_SESSION['user_id']     = $userId;
    $_SESSION['pseudo']      = $pseudo;
    $_SESSION['_last_regen'] = time();
}

// Déconnecte l'utilisateur : vide la session et supprime le cookie
function logoutUser(): void {
    startSecureSession();
    $_SESSION = []; // On efface toutes les données de session

    // On supprime aussi le cookie côté navigateur
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }

    session_destroy();
}

/** Fonctions de protection CSRF (Cross-Site Request Forgery). */

// Génère (ou récupère) un token CSRF unique pour la session
function csrfToken(): string {
    startSecureSession();
    if (empty($_SESSION['csrf_token'])) {
        // On génère 32 octets aléatoires cryptographiquement sûrs
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

// Vérifie que le token CSRF envoyé par le formulaire correspond à celui de la session
function csrfCheck(?string $token): bool {
    startSecureSession();
    return !empty($_SESSION['csrf_token'])
        && !empty($token)
        && hash_equals($_SESSION['csrf_token'], $token); // Comparaison en temps constant pour éviter les attaques timing
}

/** Échappe une chaîne pour l'affichage sécurisé dans le HTML. */
function e(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
