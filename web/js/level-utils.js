/**
 * Shared level text format helpers (editor, generator, import/export).
 */
(() => {
'use strict';

const GHOST_TAGS = { red: 'R', green: 'G', yellow: 'Y', blue: 'B' };

function parseLevelText(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const meta = {
        width: 0, height: 0,
        start: null,
        ghosts: {},
    };
    let i = 0;
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
    i++;
    const grid = [];
    for (let r = 0; r < meta.height; r++) {
        const row = (lines[i + r] || '').padEnd(meta.width, '#');
        grid.push(row.split('').slice(0, meta.width));
    }
    return { meta, grid };
}

function serializeLevel(meta, grid) {
    const lines = [
        `W ${meta.width}`,
        `H ${meta.height}`,
        `P ${meta.start.row} ${meta.start.col}`,
    ];
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

function countGems(grid) {
    let n = 0;
    for (const row of grid) {
        for (const ch of row) {
            if (ch === '.' || ch === 'o' || ch === 'c') n++;
        }
    }
    return n;
}

function countGhostTypes(meta) {
    return Object.keys(meta.ghosts).length;
}

/** Basic structural checks before running the solver. */
function validateLevelStructure(meta, grid) {
    const errors = [];
    if (!meta.width || !meta.height || meta.width < 5 || meta.height < 5) {
        errors.push('La carte doit faire au moins 5×5.');
    }
    if (meta.width > 21 || meta.height > 17) {
        errors.push('Taille max : 21×17.');
    }
    if (!meta.start) {
        errors.push('Placez le chevalier (outil Chevalier).');
    }
    const gems = countGems(grid);
    if (gems < 1) {
        errors.push('Ajoutez au moins une étoile (gemme).');
    }
    if (gems > 30) {
        errors.push('Maximum 30 gemmes pour la vérification solveur.');
    }
    const ghostCount = countGhostTypes(meta);
    if (ghostCount > 4) {
        errors.push('Maximum 4 fantômes.');
    }
    if (meta.ghosts.blue && !grid.some(row => row.includes('*'))) {
        errors.push('Le fantôme bleu nécessite au moins un portail (*).');
    }
    if (meta.start) {
        const cell = grid[meta.start.row]?.[meta.start.col];
        if (cell === '#') errors.push('Le chevalier ne peut pas être sur un mur.');
    }
    for (const [color, pos] of Object.entries(meta.ghosts)) {
        const cell = grid[pos.row]?.[pos.col];
        if (cell === '#') errors.push(`Fantôme ${color} sur un mur.`);
    }
    return { ok: errors.length === 0, errors, gems, ghostCount };
}

window.LevelUtils = {
    parseLevelText,
    serializeLevel,
    countGems,
    countGhostTypes,
    validateLevelStructure,
    GHOST_TAGS,
};
})();
