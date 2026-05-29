<?php
// Déconnexion de l'utilisateur : on détruit la session puis on redirige vers l'accueil.
require_once __DIR__ . '/includes/auth.php';
logoutUser();
header('Location: index.php');
exit;
