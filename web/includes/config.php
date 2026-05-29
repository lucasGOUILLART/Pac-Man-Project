<?php

// Paramètres de connexion à la base de données MySQL.
// À adapter si l'environnement change (production, staging, etc.).
return [
    'host'     => 'localhost',   // Serveur MySQL — généralement localhost en local
    'dbname'   => 'basegrp5_4doigtsdelamain', // Nom de la base de données du projet
    'user'     => 'root',        // Utilisateur MySQL (root en local avec MAMP)
    'password' => 'root',        // Mot de passe MySQL (root en local avec MAMP)
    'charset'  => 'utf8mb4',     // On force l'UTF-8 complet pour gérer les emojis et accents
];
