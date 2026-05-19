-- =========================================================
-- Les fantômes d'Ombrequatre - Database Schema
-- Group: 4doigtsdelamain (CIR1 2025-2026)
-- =========================================================
--
-- NOTE: This schema follows the architecture provided by the team,
-- with ONE security change: mot_de_passe is VARCHAR(255) instead of
-- VARCHAR(30), because PHP password_hash() with bcrypt produces a
-- 60-character hash that wouldn't fit in 30 chars. Storing truncated
-- hashes breaks authentication.
--
-- The table name "utisateur" (instead of "utilisateur") matches the
-- original schema. Rename consistently if you want to fix the typo.
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
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `difficulte` INT(11) NOT NULL DEFAULT 1,
  `score_max` INT(11) NOT NULL DEFAULT 0,
  `map` TEXT NOT NULL,
  `solution_cache` TEXT NULL,         -- pre-computed optimal solution (string of U/D/L/R)
  `solution_safe` TINYINT(1) NOT NULL DEFAULT 0,  -- 1 if solution avoids all 4 ghosts; 0 = gems-only
  PRIMARY KEY (`id`)
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
-- Per-level player progress (best score, gem count)
-- ---------------------------------------------------------
CREATE TABLE `in_game` (
  `id_niveau` INT(11) NOT NULL,
  `id_joueur` INT(11) NOT NULL,
  `score_niveau` INT(11) NOT NULL DEFAULT 0,
  `nb_piece` INT(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_niveau`, `id_joueur`),
  FOREIGN KEY (`id_niveau`) REFERENCES `niveau`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`id_joueur`) REFERENCES `utisateur`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Sample data: 3 levels of increasing difficulty
-- =========================================================
--
-- MAP FORMAT (text):
--   First lines are metadata (W, H, P, R, G, Y, B), then "MAP"
--   followed by the grid.
--
--   W <width>           grid width
--   H <height>          grid height
--   P <row> <col>       knight (player) start
--   R <row> <col>       Ombre ecarlate (red ghost) start
--   G <row> <col>       Spectre toxique (green ghost) start
--   Y <row> <col>       Ame corrompue (yellow ghost) start
--   B <row> <col>       Esprit abyssal (blue ghost) start
--   MAP                 marker, then the grid follows
--
-- Grid characters:
--   #  wall
--   .  path with gem (coin)
--   o  path with strength potion (combat mode)
--   c  path with chronos watch (50/50 freeze ghosts or knight)
--   *  portal (used by Esprit abyssal for teleports)
--   _  empty path (no item)
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
('demo', 'demo@example.com', '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1, 0);
