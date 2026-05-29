/**
 * Utilitaires partagés pour le format texte des niveaux
 * (éditeur, générateur, import/export).
 */
(() => {
'use strict';

// Correspondance couleur de fantôme → code dans l'en-tête du niveau
const GHOST_TAGS = { red: 'R', green: 'G', yellow: 'Y', blue: 'B' };

/**
 * Parse un texte de niveau au format projet et retourne les métadonnées et la grille.
 * Le format est : en-tête avec W, H, P, R, G, Y, B puis "MAP" puis les lignes de la grille.
 */
function parseLevelText(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const meta = {
        width: 0, height: 0,
        start: null,   // Position de départ du chevalier
        ghosts: {},    // Positions initiales des fantômes
    };
    let i = 0;
    // On lit l'en-tête jusqu'à la ligne "MAP"
    while (i < lines.length && lines[i].trim() !== 'MAP') {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 2) {
            switch (parts[0]) {
                case 'W': meta.width = parseInt(parts[1], 10); break;
                case 'H': meta.height = parseInt(parts[1], 10); break;
                case 'P': meta.start = { row: +parts[1], col: +parts[2] }; break;
                case 'R': meta.ghosts.red = { row: +parts[1], col: +parts[2] }; break;
                case 'G': meta.ghosts.green = { row: +parts[1], col: +parts[2] }; break;
                case 'Y': meta.ghosts.yellow = { row: +parts[1], col: +parts[2] }; break;
                case 'B': meta.ghosts.blue = { row: +parts[1], col: +parts[2] }; break;
            }
        }
        i++;
    }
    i++; // On passe la ligne "MAP"
    // On lit les lignes de la grille, en complétant les lignes courtes avec des murs
    const grid = [];
    for (let r = 0; r < meta.height; r++) {
        const row = (lines[i + r] || '').padEnd(meta.width, '#');
        grid.push(row.split('').slice(0, meta.width));
    }
    return { meta, grid };
}

/**
 * Sérialise les métadonnées et la grille en texte de niveau.
 * Produit le même format qu'attend le solveur C.
 */
function serializeLevel(meta, grid) {
    const lines = [
        `W ${meta.width}`,
        `H ${meta.height}`,
        `P ${meta.start.row} ${meta.start.col}`,
    ];
    // On ajoute les lignes de fantômes présents dans les métadonnées
    for (const [color, tag] of Object.entries(GHOST_TAGS)) {
        const g = meta.ghosts[color];
        if (g) lines.push(`${tag} ${g.row} ${g.col}`);
    }
    lines.push('MAP');
    for (let r = 0; r < meta.height; r++) {
        lines.push(grid[r].join(''));
    }
    return lines.join('\n');
}

// Compte le nombre total de collectibles (gemmes, potions, montres) dans la grille
function countGems(grid) {
    let n = 0;
    for (const row of grid) {
        for (const ch of row) {
            if (ch === '.' || ch === 'o' || ch === 'c') n++;
        }
    }
    return n;
}

// Retourne le nombre de types de fantômes présents dans les métadonnées
function countGhostTypes(meta) {
    return Object.keys(meta.ghosts).length;
}

/**
 * Vérifie la structure du niveau avant de lancer le solveur.
 * Retourne { ok, errors, gems, ghostCount }.
 */
function validateLevelStructure(meta, grid) {
    const errors = [];
    // Taille minimale et maximale autorisée
    if (!meta.width || !meta.height || meta.width < 5 || meta.height < 5) {
        errors.push('La carte doit faire au moins 5×5.');
    }
    if (meta.width > 21 || meta.height > 17) {
        errors.push('Taille max : 21×17.');
    }
    // Le chevalier doit être placé quelque part
    if (!meta.start) {
        errors.push('Placez le chevalier (outil Chevalier).');
    }
    const gems = countGems(grid);
    // Il faut au moins une gemme pour que le niveau ait un objectif
    if (gems < 1) {
        errors.push('Ajoutez au moins une étoile (gemme).');
    }
    // Le solveur ne gère pas plus de 30 gemmes (limite du masque binaire 32 bits)
    if (gems > 30) {
        errors.push('Maximum 30 gemmes pour la vérification solveur.');
    }
    const ghostCount = countGhostTypes(meta);
    if (ghostCount > 4) {
        errors.push('Maximum 4 fantômes.');
    }
    // Le fantôme bleu a besoin de portails pour se téléporter
    if (meta.ghosts.blue && !grid.some(row => row.includes('*'))) {
        errors.push('Le fantôme bleu nécessite au moins un portail (*).');
    }
    // Le chevalier ne peut pas démarrer sur un mur
    if (meta.start) {
        const cell = grid[meta.start.row]?.[meta.start.col];
        if (cell === '#') errors.push('Le chevalier ne peut pas être sur un mur.');
    }
    // Les fantômes ne peuvent pas non plus démarrer sur des murs
    for (const [color, pos] of Object.entries(meta.ghosts)) {
        const cell = grid[pos.row]?.[pos.col];
        if (cell === '#') errors.push(`Fantôme ${color} sur un mur.`);
    }
    return { ok: errors.length === 0, errors, gems, ghostCount };
}

// On expose les fonctions utilitaires en tant qu'objet global
window.LevelUtils = {
    parseLevelText,
    serializeLevel,
    countGems,
    countGhostTypes,
    validateLevelStructure,
    GHOST_TAGS,
};
})();
