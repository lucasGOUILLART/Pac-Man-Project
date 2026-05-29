-- =========================================================
-- Les fantômes d'Ombrequatre - Database Schema
-- Group: 4doigtsdelamain (CIR1 2025-2026)
-- =========================================================
--
-- mot_de_passe est VARCHAR(255) (pas 30) car bcrypt produit 60 chars.
-- "utisateur" (typo) conservé pour correspondre au schéma original.
-- =========================================================

CREATE DATABASE IF NOT EXISTS `basegrp5_4doigtsdelamain`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `basegrp5_4doigtsdelamain`;

-- Clean slate for re-installs
DROP TABLE IF EXISTS `in_game`;
DROP TABLE IF EXISTS `utisateur`;
DROP TABLE IF EXISTS `niveau`;

-- ---------------------------------------------------------
-- Table: niveau
-- Stores level definitions (map data, difficulty, max score)
-- ---------------------------------------------------------
CREATE TABLE `niveau` (
  `id`             INT(11)      NOT NULL AUTO_INCREMENT,
  `difficulte`     INT(11)      NOT NULL DEFAULT 1,
  `score_max`      INT(11)      NOT NULL DEFAULT 0,
  `map`            TEXT         NOT NULL,
  `solution_cache` TEXT         NULL,                    -- solution optimale pré-calculée (U/D/L/R)
  `solution_safe`  TINYINT(1)   NOT NULL DEFAULT 0,      -- 1 = évite les fantômes ; 0 = gems-only
  `name`           VARCHAR(100) NULL DEFAULT NULL,        -- nom donné par l'utilisateur (NULL = niveau officiel)
  `is_public`      TINYINT(1)   NOT NULL DEFAULT 1,      -- 0 = brouillon perso ; 1 = publié dans la campagne
  `auteur_id`      INT(11)      NULL DEFAULT NULL,        -- auteur (NULL = niveau officiel intégré)
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_auteur` (`auteur_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Table: utisateur (typo kept from original schema)
-- ---------------------------------------------------------
CREATE TABLE `utisateur` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `pseudo` VARCHAR(30) NOT NULL UNIQUE,
  `adresse_mail` VARCHAR(60) NOT NULL UNIQUE,
  `mot_de_passe` VARCHAR(255) NOT NULL,  -- 255 chars for bcrypt hash
  `niveau_actuel` INT(11) NOT NULL DEFAULT 1,
  `score_total` INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Table: in_game
-- Per-level player progress (best score, gem count, best time)
-- ---------------------------------------------------------
CREATE TABLE `in_game` (
  `id_niveau` INT(11) NOT NULL,
  `id_joueur` INT(11) NOT NULL,
  `score_niveau` INT(11) NOT NULL DEFAULT 0,
  `nb_piece` INT(11) NOT NULL DEFAULT 0,
  `temps_best` INT(11) NULL DEFAULT NULL,   -- best completion time in seconds (NULL if not yet won)
  PRIMARY KEY (`id_niveau`, `id_joueur`),
  KEY `idx_joueur` (`id_joueur`),
  FOREIGN KEY (`id_niveau`) REFERENCES `niveau`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`id_joueur`) REFERENCES `utisateur`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Données : 10 niveaux de la campagne officielle
-- =========================================================
-- Format MAP :  W H P R G Y B  puis "MAP" puis la grille.
--   #  mur   .  gemme   o  potion   c  montre   *  portail   _  sol vide
-- =========================================================

INSERT INTO `niveau` (`id`, `difficulte`, `score_max`, `map`, `solution_cache`, `solution_safe`) VALUES
(1, 1, 200,
'W 9
H 7
P 1 1
MAP
#########
#.......#
#.#####.#
#.#####.#
#.#####.#
#.......#
#########',
'DRUL', 0),
(2, 1, 270,
'W 11
H 7
P 1 1
MAP
###########
#.........#
#.###.###.#
#.###.###.#
#.###.###.#
#.........#
###########',
'DRURDLUL', 0),
(3, 2, 280,
'W 11
H 9
P 1 1
MAP
###########
#.........#
#_#####_#_#
#_.....___#
#_#####_#_#
#___.....__
#_#####_#_#
#.........#
###########',
'DRRULLDDRRDLL', 0),
(4, 2, 290,
'W 11
H 9
P 1 1
R 7 9
MAP
###########
#.........#
#.#####_#_#
#.#___#__.#
#...#.#__.#
#.#___#__.#
#.#####_#_#
#.........#
###########',
'DDRRUUUULLDRURD', 0),
(5, 3, 300,
'W 13
H 9
P 1 1
R 1 11
G 7 1
MAP
#############
#...........#
#_###_###_#_#
#__..___..__#
#_###___###_#
#__..___..__#
#_###_###_#_#
#...........#
#############',
'DRDDLDRRRULLUURRULLL', 0),
(6, 3, 360,
'W 13
H 9
P 1 1
R 1 11
G 7 1
Y 7 11
MAP
#############
#...........#
#_###_###_#_#
#__.__o__.__#
#_###___###_#
#__.__o__.__#
#_###_###_#_#
#...........#
#############',
'DRRRRRULLLDDRRRRRDLLL', 0),
(7, 4, 380,
'W 13
H 11
P 1 1
R 1 11
G 9 1
Y 9 11
MAP
#############
#...........#
#_###_###_#_#
#__.._o_.___#
#_###___###_#
#_____#_____#
#_###___###_#
#__.._o_.___#
#_###_###_#_#
#...........#
#############',
'DRRRRRULLLDDDRRRRRDLLL', 0),
(8, 4, 180,
'W 13
H 11
P 5 6
R 1 6
G 9 6
Y 5 1
B 1 1
MAP
#############
#*___.___.*_#
#_###_###_#_#
#__._____._.#
#_###___###_#
#__._o__._._#
#_###___###_#
#__._____._.#
#_###_###_#_#
#*___.___.*_#
#############',
'RRULULDLDRDDLDRRUR', 0),
(9, 5, 360,
'W 15
H 13
P 6 7
R 1 7
G 11 7
Y 6 1
B 1 1
MAP
###############
#*_.___.___._*#
#_###_###_#_#_#
#_._________._#
#_#_###___###_#
#_._c___o___c.#
#_###_______###
#_._c___o___c.#
#_#_###___###_#
#_._________._#
#_###_###_#_#_#
#*_.___.___._*#
###############',
'URDDLLLLLURRDDLDLDRRRURULUURULULLLDR', 0),
(10, 5, 360,
'W 15
H 15
P 7 7
R 1 7
G 13 7
Y 7 1
B 1 1
MAP
###############
#*___________*#
#_###_###_#_#_#
#_._________._#
#_#_###___###_#
#_._c___.___c.#
#_###___o___###
#_._.___.___._#
#_###___o___###
#_._c___.___c.#
#_#_###___###_#
#_._________._#
#_###_###_#_#_#
#*___________*#
###############',
'UULLLLURDLDRDDLLDRRDRURRULLLLUUUUUURRRDLDDR', 0);

-- =========================================================
-- Optional: a demo user (password is "demo1234")
-- Generated with PHP: password_hash("demo1234", PASSWORD_BCRYPT)
-- Remove this in production.
-- =========================================================
INSERT INTO `utisateur` (`pseudo`, `adresse_mail`, `mot_de_passe`, `niveau_actuel`, `score_total`) VALUES
('demo', 'demo@example.com', '$2y$10$t3sEg3Q/JK0lCgZR3fAme.bXiLCIeTJn.uwPj/NV8nGHlZ/ixKTEm', 1, 0);
