<?php
/**
 * PDO database connection.
 * Returns a singleton PDO instance configured for safe defaults.
 */

function getDB(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $config = require __DIR__ . '/config.php';

        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $config['host'],
            $config['dbname'],
            $config['charset']
        );

        try {
            $pdo = new PDO($dsn, $config['user'], $config['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            // Log internally, never expose DB details to the user.
            error_log('DB connection failed: ' . $e->getMessage());
            http_response_code(500);
            die('Database unavailable. Please try again later.');
        }
    }

    return $pdo;
}
