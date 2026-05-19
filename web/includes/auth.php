<?php
/**
 * Authentication helpers: secure sessions, login state, guards.
 */

function startSecureSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();

    // Regenerate periodically to limit session-fixation risk.
    if (!isset($_SESSION['_last_regen']) || (time() - $_SESSION['_last_regen']) > 1800) {
        session_regenerate_id(true);
        $_SESSION['_last_regen'] = time();
    }
}

function isLoggedIn(): bool {
    startSecureSession();
    return isset($_SESSION['user_id']);
}

function currentUserId(): ?int {
    startSecureSession();
    return $_SESSION['user_id'] ?? null;
}

function currentUserPseudo(): ?string {
    startSecureSession();
    return $_SESSION['pseudo'] ?? null;
}

/** Power-ups mode (whether sacred orbs and chronos watches grant effects).
 *  Default is OFF (false) so the campaign is a "pure puzzle" experience. */
function powerUpsEnabled(): bool {
    startSecureSession();
    return !empty($_SESSION['power_ups']);
}

function setPowerUps(bool $enabled): void {
    startSecureSession();
    $_SESSION['power_ups'] = $enabled;
}

function requireLogin(): void {
    if (!isLoggedIn()) {
        header('Location: index.php');
        exit;
    }
}

function loginUser(int $userId, string $pseudo): void {
    startSecureSession();
    session_regenerate_id(true);
    $_SESSION['user_id']     = $userId;
    $_SESSION['pseudo']      = $pseudo;
    $_SESSION['_last_regen'] = time();
}

function logoutUser(): void {
    startSecureSession();
    $_SESSION = [];

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

/** CSRF protection helpers. */
function csrfToken(): string {
    startSecureSession();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrfCheck(?string $token): bool {
    startSecureSession();
    return !empty($_SESSION['csrf_token'])
        && !empty($token)
        && hash_equals($_SESSION['csrf_token'], $token);
}

/** Escape HTML output. */
function e(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
