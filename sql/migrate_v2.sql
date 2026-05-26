-- =========================================================
-- Migration v2 — apply to existing databases
-- Run this if you already have the schema from v1 set up.
-- =========================================================

USE `basegrp5_4doigtsdelamain`;

-- Add best completion time to per-level progress
ALTER TABLE `in_game`
    ADD COLUMN IF NOT EXISTS `temps_best` INT(11) NULL DEFAULT NULL
        COMMENT 'Best completion time in seconds (NULL if not completed yet)';

-- Add index on id_joueur (speeds up "all levels for a player" queries)
ALTER TABLE `in_game`
    ADD KEY IF NOT EXISTS `idx_joueur` (`id_joueur`);

-- Add community-level authorship tracking
ALTER TABLE `niveau`
    ADD COLUMN IF NOT EXISTS `auteur_id` INT(11) NULL DEFAULT NULL
        COMMENT 'User id who submitted this level (NULL = built-in campaign level)',
    ADD COLUMN IF NOT EXISTS `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD KEY IF NOT EXISTS `idx_auteur` (`auteur_id`);
