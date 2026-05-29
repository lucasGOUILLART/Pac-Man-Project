<?php
/**
 * Connexion à la base de données via PDO.
 * On utilise un singleton pour ne créer qu'une seule connexion par requête PHP.
 */

function getDB(): PDO {
    // La variable statique conserve la connexion entre les appels successifs
    static $pdo = null;

    if ($pdo === null) {
        // On charge les paramètres depuis config.php (hôte, base, utilisateur, mot de passe)
        $config = require __DIR__ . '/config.php';

        // Construction du DSN (Data Source Name) au format mysql:host=...;dbname=...
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $config['host'],
            $config['dbname'],
            $config['charset']
        );

        try {
            $pdo = new PDO($dsn, $config['user'], $config['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // Les erreurs SQL lèvent des exceptions
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,         // On récupère les lignes sous forme de tableaux associatifs
                PDO::ATTR_EMULATE_PREPARES   => false,                     // On désactive les requêtes préparées simulées pour plus de sécurité
            ]);
        } catch (PDOException $e) {
            // On logue l'erreur en interne mais on n'expose jamais les détails de la BDD au visiteur
            error_log('DB connection failed: ' . $e->getMessage());
            http_response_code(500);
            die('Database unavailable. Please try again later.');
        }
    }

    return $pdo;
}
