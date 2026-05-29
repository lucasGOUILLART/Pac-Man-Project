<?php
// Page du bestiaire : présente les quatre fantômes gardiens avec leur histoire et comportement.
require_once __DIR__ . '/includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Les fantômes d'Ombrequatre — Bestiary</title>
<link rel="icon" type="image/png" href="img/logo.png">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="bestiary-body">
<div class="vignette"></div>

<header class="page-topbar">
    <h1 class="page-title">BESTIARY</h1>
    <a href="menu.php" class="nav-btn">MENU</a>
</header>

<main class="bestiary-shell">
    <!-- Colonne gauche : portrait en grand du fantôme sélectionné + son histoire -->
    <section class="best-left panel">
        <div class="best-portrait">
            <img id="bestPortrait" src="img/fantomeRougeCornes.png" alt="">
        </div>
        <div class="best-tale">
            <h3 id="bestName">OMBRE ÉCARLATE</h3>
            <p id="bestTale"></p>
        </div>
    </section>

    <!-- Colonne centrale : grille de sélection des 4 fantômes -->
    <section class="best-grid panel">
        <button class="best-cell active" data-ghost="red">
            <img src="img/fantomeRougeCornes.png" alt="">
            <span class="cell-name red">SCARLET</span>
        </button>
        <button class="best-cell" data-ghost="green">
            <img src="img/fantomeVertCornes.png" alt="">
            <span class="cell-name green">TOXIC</span>
        </button>
        <button class="best-cell" data-ghost="blue">
            <img src="img/fantomeBleuCornes.png" alt="">
            <span class="cell-name blue">ABYSSAL</span>
        </button>
        <button class="best-cell" data-ghost="yellow">
            <img src="img/fantomeJauneCornes.png" alt="">
            <span class="cell-name yellow">CORRUPT</span>
        </button>
    </section>

    <!-- Colonne droite : description du comportement mécanique et barre de dangerosité -->
    <section class="best-right panel">
        <h3>BEHAVIOR</h3>
        <p id="bestDesc"></p>
        <h3 class="mt">THREAT LEVEL</h3>
        <div class="threat-bar"><span id="bestThreat"></span></div>
    </section>
</main>

<script>
// Données des quatre fantômes : histoire narrative, description mécanique et niveau de menace
const GHOSTS = {
    red: {
        name: 'OMBRE ÉCARLATE',
        nameColor: 'red',
        img: 'img/fantomeRougeCornes.png',
        tale: 'Born of human wrath, the Scarlet Shadow has studied us for centuries. She leaves nothing to chance. To find a human in any labyrinth, she follows the wall on her right, like the oldest mortal trick.',
        desc: 'Slides on the ice like the knight. Tries RIGHT first; if blocked, clockwise: Right → Down → Left → Up. Cannot reverse her last direction. The most predictable warden — but never stops hunting.',
        threat: 75,
    },
    green: {
        name: 'SPECTRE TOXIQUE',
        nameColor: 'green',
        img: 'img/fantomeVertCornes.png',
        tale: 'Where Scarlet thinks like a human, Toxique thinks the opposite — to surprise her prey from where it is least expected. Wreathed in plague-green flames, she walks the ceilings of memory.',
        desc: 'Slides on the ice. Tries UP first; if blocked, counter-clockwise: Up → Left → Down → Right. The mirror of Scarlet — equally relentless, opposite priorities.',
        threat: 75,
    },
    blue: {
        name: 'ESPRIT ABYSSAL',
        nameColor: 'blue',
        img: 'img/fantomeBleuCornes.png',
        tale: 'From the Void where water is lava and trees do not exist, the Abyssal has tamed a world without rules. He uses 4 portals known only to him. You will never meet him in a corridor — but he is always one tile from your fate.',
        desc: 'On odd turns, vanishes from sight. On even turns, reappears at the NEXT portal in the cycle. The knight cannot use these portals — only the Abyssal. Beware long slides between two portals.',
        threat: 50,
    },
    yellow: {
        name: 'ÂME CORROMPUE',
        nameColor: 'yellow',
        img: 'img/fantomeJauneCornes.png',
        tale: 'The strongest of all wardens, yet the least feared. Corrupted Soul is terrified of humans. She reads the direction of every knight\'s last stride and flees the opposite way. When cornered, she curls up and stops, hoping not to be seen.',
        desc: 'Slides in the OPPOSITE direction of the knight\'s last heading. If blocked or would reverse herself, she stops and curls up — completely still for the turn.',
        threat: 100,
    },
};

// Références aux éléments du DOM mis à jour lors de la sélection d'un fantôme
const portrait = document.getElementById('bestPortrait');
const nameEl   = document.getElementById('bestName');
const taleEl   = document.getElementById('bestTale');
const descEl   = document.getElementById('bestDesc');
const threatEl = document.getElementById('bestThreat');

// Met à jour l'affichage avec les données du fantôme sélectionné
function selectGhost(key) {
    const g = GHOSTS[key];
    portrait.src = g.img;
    nameEl.textContent = g.name;
    nameEl.className = 'name-' + g.nameColor;
    taleEl.textContent = g.tale;
    descEl.textContent = g.desc;
    // La largeur de la barre représente le pourcentage de dangerosité (0-100)
    threatEl.style.width = g.threat + '%';
    threatEl.className   = 'threat-' + g.nameColor;
    // On marque la cellule active et on retire la classe des autres
    document.querySelectorAll('.best-cell').forEach(b => {
        b.classList.toggle('active', b.dataset.ghost === key);
    });
}

// On branche les événements sur les boutons de la grille de sélection
document.querySelectorAll('.best-cell').forEach(b => {
    b.addEventListener('click', () => selectGhost(b.dataset.ghost));
});

// On affiche l'Ombre Écarlate par défaut au chargement de la page
selectGhost('red');
</script>
</body>
</html>
