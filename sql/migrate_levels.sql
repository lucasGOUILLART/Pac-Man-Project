-- =========================================================
-- Les fantômes d'Ombrequatre — Migration: refresh levels
--
-- USE THIS if you already have the database created with the old
-- 3 levels and want to update to the 10 new validated levels
-- WITHOUT losing your user accounts.
--
-- What it does:
--   1. Adds missing columns (solution_cache, solution_safe) if not present
--   2. Deletes ALL existing levels and per-level scores (in_game)
--   3. Inserts the 10 new validated levels with pre-computed solutions
--   4. Resets each user's niveau_actuel to 1 (start of campaign)
--   5. Recomputes score_total from the (now empty) in_game table
--
-- USAGE:
--   mysql -u root -p basegrp5_4doigtsdelamain < sql/migrate_levels.sql
--
-- Or in phpMyAdmin: select the database, then Import → upload this file.
-- =========================================================

USE `basegrp5_4doigtsdelamain`;

-- -------- 1. Add columns if missing (idempotent) --------
-- MySQL doesn't support "ADD COLUMN IF NOT EXISTS" in older versions,
-- so we use a stored procedure trick.

DROP PROCEDURE IF EXISTS add_solution_cols;
DELIMITER //
CREATE PROCEDURE add_solution_cols()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'niveau'
          AND COLUMN_NAME = 'solution_cache'
    ) THEN
        ALTER TABLE `niveau` ADD COLUMN `solution_cache` TEXT NULL;
    END IF;
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'niveau'
          AND COLUMN_NAME = 'solution_safe'
    ) THEN
        ALTER TABLE `niveau` ADD COLUMN `solution_safe` TINYINT(1) NOT NULL DEFAULT 0;
    END IF;
END //
DELIMITER ;

CALL add_solution_cols();
DROP PROCEDURE add_solution_cols;

-- -------- 2. Wipe old level data (keep users) --------
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM `in_game`;
DELETE FROM `niveau`;
ALTER TABLE `niveau` AUTO_INCREMENT = 1;
SET FOREIGN_KEY_CHECKS = 1;

-- -------- 3. Insert the 10 new validated levels --------
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


-- -------- 4. Reset every user's progress to level 1 --------
UPDATE `utisateur` SET `niveau_actuel` = 1, `score_total` = 0;

-- Done. Verify with:
--   SELECT id, difficulte, score_max FROM niveau ORDER BY id;
--   SELECT COUNT(*) FROM niveau;       -- should be 10
