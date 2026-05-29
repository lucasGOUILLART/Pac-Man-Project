# Les fantômes d'Ombrequatre

**Projet de fin d'année — CIR1 2025-2026 — Groupe `4doigtsdelamain`**

Un jeu de déduction inspiré de Pac-Man : un chevalier glisse sur la glace, ne peut pas faire demi-tour, et doit ramasser toutes les gemmes en évitant les fantômes.

---

## Prérequis

- **Serveur web** : Apache (MAMP, WAMP ou XAMPP)
- **PHP** : 7.4 ou supérieur (avec PDO et PDO_MySQL activés)
- **Base de données** : MySQL 5.7+ ou MariaDB 10.3+
- **Outils** : `git` pour cloner le dépôt, ou une archive ZIP extraite

---

## Déploiement pas à pas

### Étape 1 — Récupérer le projet

**Via Git :**
```bash
git clone <url-du-dépôt>
```

**Via archive ZIP :**
Extraire l'archive à l'emplacement souhaité.

---

### Étape 2 — Placer les fichiers dans le serveur web

Copier le dossier `web/` dans la racine de votre serveur Apache :

| Environnement | Dossier cible                        |
|---------------|--------------------------------------|
| MAMP (Mac)    | `/Applications/MAMP/htdocs/`         |
| MAMP (Win)    | `C:\MAMP\htdocs\`                    |
| WAMP          | `C:\wamp64\www\`                     |
| XAMPP         | `C:\xampp\htdocs\`                   |

Exemple avec MAMP Windows : placer le contenu de `web/` dans `C:\MAMP\htdocs\project\web\`.

---

### Étape 3 — Créer la base de données

Démarrer le serveur MySQL, puis importer le schéma :

```bash
mysql -u root -p < sql/schema.sql
```

> Cela crée automatiquement la base `basegrp5_4doigtsdelamain`, les 3 tables (`niveau`, `utisateur`, `in_game`), insère les 10 niveaux et un compte de démonstration.

**Via phpMyAdmin** (alternative graphique) :
1. Ouvrir phpMyAdmin (`http://localhost/phpmyadmin`)
2. Onglet **Importer**
3. Choisir le fichier `sql/schema.sql`
4. Cliquer **Exécuter**

---

### Étape 4 — Configurer la connexion à la base de données

Ouvrir le fichier `web/includes/config.php` et renseigner vos identifiants MySQL :

```php
return [
    'host'     => 'localhost',
    'dbname'   => 'basegrp5_4doigtsdelamain',
    'user'     => 'root',       // ← votre utilisateur MySQL
    'password' => 'root',       // ← votre mot de passe MySQL
    'charset'  => 'utf8mb4',
];
```

> Avec MAMP, le mot de passe MySQL par défaut est `root`. Avec XAMPP, le mot de passe est souvent vide (`''`).

---

### Étape 5 — Démarrer le serveur et accéder au site

1. Démarrer Apache et MySQL via MAMP / WAMP / XAMPP.
2. Ouvrir un navigateur et accéder à :

```
http://localhost/project/web/
```

La page de connexion doit s'afficher.

---

### Étape 6 — Se connecter

Un compte de démonstration est créé lors de l'import du schéma :

| Champ          | Valeur     |
|----------------|------------|
| Pseudo         | `demo`     |
| Mot de passe   | `demo1234` |

> **En production**, supprimer ce compte en retirant la ligne `INSERT INTO utisateur` à la fin de `sql/schema.sql` avant de réimporter.

> Si vous avez déjà importé l'ancien schéma, réimportez `schema.sql` pour obtenir le hash corrigé (ou mettez à jour manuellement le mot de passe en base).

---

## Structure du projet

```
project/
├── README.md
├── sql/
│   └── schema.sql          ← script SQL complet (BDD + données)
├── web/                    ← application web (à servir via Apache)
│   ├── index.php           ← connexion / inscription
│   ├── menu.php
│   ├── dashboard.php
│   ├── game.php
│   ├── includes/
│   │   ├── config.php      ← ⚠ à configurer (identifiants MySQL)
│   │   ├── db.php
│   │   └── auth.php
│   ├── api/                ← endpoints AJAX
│   ├── css/
│   ├── js/
│   └── img/
├── levels/                 ← niveaux au format texte
└── solver/                 ← solveur BFS en C (validation hors-ligne)
```

---

## Optionnel — Compiler le solveur en C

Le solveur C permet de valider des niveaux en ligne de commande (sans lancer le site).

**Prérequis :** `gcc` et `make` installés.

```bash
cd solver
make
./solver ../levels/level1.txt --simulate
```

> Limite : 30 gemmes maximum par niveau (contrainte du masque `uint32_t`). Pour tester, utiliser `level_small.txt` s'il est présent.

---

## Résolution de problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| Page blanche | Erreur PHP silencieuse | Activer `display_errors` dans `php.ini` |
| `SQLSTATE[HY000] [1045]` | Mauvais identifiants MySQL | Vérifier `config.php` |
| `SQLSTATE[HY000] [1049]` | Base de données inexistante | Réimporter `schema.sql` |
| `404 Not Found` | Mauvais chemin dans htdocs | Vérifier l'emplacement du dossier `web/` |
| Accès refusé phpMyAdmin | Port MySQL non standard | Vérifier le port dans les préférences MAMP (3306 par défaut) |
