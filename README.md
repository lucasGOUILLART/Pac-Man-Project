# Les fantômes d'Ombrequatre

**Projet de fin d'année — CIR1 2025-2026 — Groupe `4doigtsdelamain`**

Un jeu de déduction inspiré de Pac-Man, où un chevalier doit secourir une
princesse retenue au château d'Ombrequatre par le Seigneur des Ombres. Son
armure trop lourde l'empêche de tourner : il **glisse sur la glace** jusqu'à
heurter un mur ou trouver un croisement, et **ne peut jamais faire demi-tour**.

---

## Sommaire

1. [Contenu livré](#1-contenu-livré)
2. [Architecture](#2-architecture)
3. [Installation](#3-installation)
4. [Le solveur en C](#4-le-solveur-en-c)
5. [Format des niveaux](#5-format-des-niveaux)
6. [Mécaniques du jeu](#6-mécaniques-du-jeu)
7. [Le solveur — deux modes](#7-le-solveur--deux-modes)
8. [Notes importantes](#8-notes-importantes)

---

## 1. Contenu livré

```
project/
├── README.md                   ← ce fichier
├── sql/
│   └── schema.sql              ← création de la BDD + 3 niveaux + 1 user demo
├── web/                        ← interface web (à servir via Apache + PHP)
│   ├── index.php               ← page connexion / inscription
│   ├── menu.php                ← menu principal (Jouer/Options/Bestiaire/Quitter)
│   ├── dashboard.php           ← sélection de niveau (via "Jouer")
│   ├── bestiaire.php           ← galerie interactive des 4 fantômes
│   ├── options.php             ← stats joueur + changement de pseudo
│   ├── game.php                ← page de jeu (HUD score/niveau/solveur/menu)
│   ├── logout.php
│   ├── api/save_score.php      ← endpoint AJAX sauvegarde score (CSRF protected)
│   ├── includes/
│   │   ├── config.php          ← config DB (à adapter)
│   │   ├── db.php              ← connexion PDO sécurisée
│   │   └── auth.php            ← sessions, CSRF, helpers
│   ├── css/style.css           ← thème pixel-art arcade
│   ├── js/game.js              ← moteur de jeu + solveur hint (BFS)
│   └── img/                    ← sprites PNG (chevalier + fantômes + logo)
├── solver/                     ← solveur en C (BFS optimal)
│   ├── solver.h
│   ├── solver.c
│   ├── main.c
│   └── Makefile
└── levels/                     ← niveaux au format texte
    ├── level1.txt
    ├── level2.txt
    ├── level3.txt
    └── level_small.txt
```

### Flux de navigation

```
   index.php (login)
        │
        ▼
   menu.php (menu principal)
        │
        ├── PLAY     → dashboard.php → game.php
        ├── OPTIONS  → options.php
        ├── BESTIARY → bestiaire.php
        └── QUIT     → logout.php
```

---

## 2. Architecture

### Base de données (3 tables)

D'après le schéma fourni par l'équipe :

| Table       | Rôle                                                   |
| ----------- | ------------------------------------------------------ |
| `niveau`    | Définition des niveaux (id, difficulté, score max, map) |
| `utisateur` | Joueurs (typo conservée du schéma original)             |
| `in_game`   | Progression par joueur et par niveau                    |

Relations :
- `niveau.id → in_game.id_niveau` (1:N)
- `utisateur.id → in_game.id_joueur` (1:N)

### Pile technique

- **Front** : HTML5 + CSS3 + JavaScript vanilla (Canvas 2D pour le rendu)
- **Back**  : PHP 7.4+ avec PDO (préparé, exceptions, pas d'émulation)
- **BDD**   : MySQL / MariaDB (UTF-8 mb4)
- **Solveur**: C11, compilé avec `gcc -O2`

Pas de framework — tout est en standard pour rester proche du cours.

---

## 3. Installation

### a. Base de données

```bash
mysql -u root -p < sql/schema.sql
```

Cela crée la base `basegrp5_4doigtsdelamain`, les 3 tables, insère 3 niveaux et
un utilisateur de démo (`demo` / `demo1234`).

### b. Serveur web

1. Copier le dossier `web/` dans la racine d'un serveur Apache (ou XAMPP /
   WAMP / MAMP).
2. Ouvrir `web/includes/config.php` et ajuster les identifiants MySQL.
3. Naviguer vers `http://localhost/web/` → page de connexion.

### c. Solveur

```bash
cd solver
make
./solver ../levels/level_small.txt --simulate
```

---

## 4. Le solveur en C

### Algorithme : BFS optimal

Le solveur effectue une recherche en largeur sur l'espace d'états
`(ligne, colonne, dernière_direction, masque_de_gemmes_restantes)`.

- Une **arête** dans le graphe = un glissement (le chevalier glisse jusqu'à un
  mur ou un croisement, et ramasse toutes les gemmes sur le trajet).
- La **BFS** garantit la **séquence minimale de glissements** pour ramasser
  toutes les gemmes.

### Sortie

```
./solver level.txt
  Level: level.txt
    size:        9 x 7
    start:       (3, 4)
    gems total:  6

  Result: SOLVABLE
  Optimal slide count: 5
  Sequence: LURDL
```

- `--moves-only` : n'imprime que la séquence (une direction par ligne) — utile
  pour piper vers un autre programme.
- `--simulate`   : ré-applique la solution et trace le chemin sur la carte.

### Limites

- **30 gemmes maximum** par niveau (masque sur `uint32_t`). Au-delà, le solveur
  refuse explicitement avec un message clair. Les niveaux d'exemple
  (`level1`–`level3`) en ont **bien plus** : ils sont conçus pour être joués à
  la main, pas brute-forcés. Pour tester le solveur, utiliser `level_small.txt`.
- **8 millions d'états max** : au-delà, le solveur abandonne avec un message
  d'erreur explicite. En pratique tous les niveaux ≤ 20 gemmes tiennent
  largement.

### Pourquoi cette limite

Le coût mémoire de la BFS est `O(2^n_gemmes × cellules × directions)`. À
30 gemmes on a déjà ~16M × cellules × 5, ce qui explose en RAM. C'est la
limite théorique d'une approche BFS « optimale exacte » sur ce problème.

Pour des niveaux plus gros, on pourrait passer à :
- A* avec heuristique (par exemple TSP-like : distance min entre gemmes restantes),
- ou ramasser par paquets (greedy nearest puis local search).

Mais l'énoncé demandait « la meilleure solution » → BFS exacte sur la classe de
niveaux raisonnable.

---

## 5. Format des niveaux

Texte brut. En-tête puis grille.

```
W <largeur>
H <hauteur>
P <ligne> <colonne>     ← position de départ du chevalier
R <ligne> <colonne>     ← position de l'Ombre écarlate (optionnel)
G <ligne> <colonne>     ← position du Spectre toxique (optionnel)
Y <ligne> <colonne>     ← position de l'Âme corrompue (optionnel)
B <ligne> <colonne>     ← position de l'Esprit abyssal (optionnel)
MAP
<grille H lignes de W caractères>
```

Caractères de la grille :

| Char | Sens                                              |
| ---- | ------------------------------------------------- |
| `#`  | mur                                                |
| `.`  | gemme (+10 points)                                 |
| `o`  | orbe sacré (+50, active Combat si pouvoirs ON)     |
| `c`  | montre Chronos (+30, active Chronos si pouvoirs ON) |
| `*`  | portail (utilisé par l'Esprit abyssal)             |
| `_`  | chemin vide (aucun item)                           |

### Les 10 niveaux livrés — progression validée

Tous les niveaux ont été validés par un BFS optimal qui confirme leur
faisabilité avec la mécanique de glissement strict.

| Niveau | Fantômes                       | Gemmes | Moves opt. | Difficulté |
| ------ | ------------------------------ | ------ | ---------- | ---------- |
| 1      | aucun                          | 18     | 4          | ★          |
| 2      | aucun                          | 21     | 8          | ★          |
| 3      | aucun                          | 28     | 11         | ★★         |
| 4      | rouge                          | 23     | 16         | ★★         |
| 5      | rouge, vert                    | 24     | 19         | ★★★        |
| 6      | rouge, vert, jaune             | 24     | 20         | ★★★        |
| 7      | rouge, vert, jaune + orbes     | 24     | 26         | ★★★★       |
| 8      | les 4 + portails               | 14     | 18         | ★★★★       |
| 9      | les 4 + chronos                | 20     | 36         | ★★★★★      |
| 10     | les 4 + tout                   | 20     | 43         | ★★★★★      |

Les premiers niveaux servent à apprendre la mécanique de glissement sans
fantômes. À partir du niveau 4 les fantômes apparaissent progressivement. Le
niveau 8 introduit les portails, le 9 ajoute les montres Chronos.

---

## 6. Mécaniques du jeu

### La règle d'or : 1 décision = 1 tour

C'est la mécanique centrale :

- Le joueur choisit une direction → **c'est 1 décision = 1 tour**.
- Le chevalier glisse de case en case jusqu'à rencontrer un mur ou un
  croisement. **Que le glissement fasse 1 case ou 12 cases, c'est toujours
  1 seul tour**.
- Pendant ce tour, **chaque fantôme effectue exactement UNE action** (un
  glissement sur la glace jusqu'à un mur ou un croisement, ou pour
  l'Esprit abyssal : basculer entre visible/invisible).
- Chevalier et fantômes partagent les **mêmes règles de glissement** (mur ou
  croisement). Sur un long couloir droit, tous avancent de la même distance
  par tour.

### Le glissement strict

- Le chevalier glisse dans la direction choisie.
- Il s'arrête uniquement si :
  - la case suivante est un mur, OU
  - la case actuelle est un croisement (chemin perpendiculaire ouvert).
- Il ne peut **jamais** choisir la direction opposée (pas de demi-tour).

L'UI met en évidence les directions disponibles aux croisements (carrés dorés
pulsants à côté du chevalier).

### Règle de collision (simultanée)

Au début de chaque tour, tous les fantômes calculent leur **nouvelle**
position. Il y a collision si **le chemin du glissement** (case de départ +
toutes les cases traversées + case d'arrivée) **croise la nouvelle position
d'un fantôme visible**.

### Mode "Power-ups" ON / OFF

Avant chaque niveau, une fenêtre demande au joueur :

- **POWER-UPS ON** (par défaut) : les orbes (`o`) et montres (`c`) ramassés
  activent leurs effets (Combat / Chronos).
- **POWER-UPS OFF** : les items donnent toujours leurs points et comptent
  comme gemmes à ramasser, mais **n'activent aucun effet spécial**. Mode
  "défi pur" — le joueur doit gagner sans pouvoirs.

Le HUD affiche en permanence l'état (cyan = ON, gris = OFF).

### Les 4 fantômes (déterministes)

| Fantôme            | Couleur | Comportement                                                         |
| ------------------ | ------- | -------------------------------------------------------------------- |
| **Ombre écarlate** | rouge   | Glisse en priorité droite, bas, gauche, haut. Demi-tour interdit. |
| **Spectre toxique**| vert    | Glisse en priorité haut, gauche, bas, droite (l'inverse du rouge). |
| **Âme corrompue**  | jaune   | Glisse à l'opposé de la dernière direction du joueur. S'arrête si bloqué. |
| **Esprit abyssal** | bleu    | Cycle 2 tours : visible à un portail → invisible → visible au portail suivant … |

### Modes contextuels (quand POWER-UPS = ON)

- **Stealth** (par défaut) : ne pas se faire toucher.
- **Combat** (après orbe sacré cyan) : les fantômes deviennent vulnérables
  10 tours, le chevalier peut les vaincre (+200 points). Ils réapparaissent
  après 8 tours à leur position de départ.
- **Chronos** (après montre violette) : tirage déterministe (parité de
  `moves + gems`) → 50% gèle les fantômes 5 tours, 50% gèle le chevalier
  5 tours.

### Conditions de victoire

Ramasser **toutes** les gemmes (pièces d'or, orbes, montres). Les portails ne
comptent pas.

---

## 7. Le solveur — trois modes

Le panneau **OPTIMAL PATH** à côté du canvas affiche en permanence la
**solution optimale du niveau**, en tenant compte des positions et trajectoires
déterministes des 4 fantômes (rouge, vert, bleu en pré-calcul, jaune dans
l'état BFS car sa direction dépend du joueur).

Le bouton **HINT FROM HERE** dans le HUD recalcule la solution **depuis la
position actuelle** et surligne la prochaine direction suggérée sur le
direction-pad (clignotement cyan, 3.5 secondes).

### Trois sources de solution (par ordre de priorité)

1. **Cache serveur** (`niveau.solution_cache` en BDD) — instantané. Les 10
   niveaux livrés ont leur solution pré-calculée et stockée. L'API
   `api/get_solution.php?level=X` retourne `{ sequence, safe, cached }`.

2. **Web Worker** (`js/solver-worker.js`) — si pas de cache (niveau créé par
   l'utilisateur, par exemple), le solveur tourne dans un thread en
   arrière-plan **sans bloquer l'UI**. Le panneau affiche un compteur de
   progression (nœuds explorés / temps écoulé). Budget par défaut : **30s
   et 8M nœuds**.

3. **Fallback gems-only** — si le BFS sûr échoue (pas de chemin 100% safe,
   timeout, ou explosion de l'espace), le solveur bascule automatiquement
   sur un BFS qui ignore les fantômes. Le panneau affiche un avertissement
   `⚠ Gems-only — no 100%-safe path exists`.

### Algorithme : BFS optimal avec contrainte de sécurité

- BFS classique sur l'espace d'états `(ligne, colonne, dernière_direction,
  masque_gemmes_restantes, tour, jaune_r, jaune_c, jaune_dir)`.
- **Trajectoires fantômes :**
  - Rouge, vert, bleu : pré-calculés une seule fois (règles déterministes
    indépendantes du joueur).
  - Jaune (Âme corrompue) : inclus dans l'état BFS car sa direction dépend
    de la dernière direction du joueur — donc recalculé à chaque branche.
- Le solveur **rejette** tout chemin qui croise une position de fantôme
  prévue à ce tour-là (les 4 fantômes sont vérifiés).
- **Budget par défaut côté Worker** : 30s OU 8M nœuds.

### Le bouton HINT FROM HERE

Quand cliqué, il :
1. Désactive le bouton et affiche "COMPUTING…"
2. Sérialise l'état du jeu actuel en un mini-niveau (avec les gemmes déjà
   ramassées effacées + positions actuelles des fantômes).
3. Lance le Worker avec budget réduit (10s, 4M nœuds).
4. Quand le résultat arrive, surligne la première direction du chemin sur
   le D-pad et met à jour le panneau.

### Solveur en C (`solver/`)

Le solveur en C est plus simple : il fait un BFS optimal sur gemmes
uniquement (sans fantômes) et sort la séquence à l'écran. Sert principalement
à la validation hors-ligne des niveaux générés.

```bash
cd solver
make
./solver ../levels/level1.txt --simulate
```

Limite : **30 gemmes max** par niveau (masque `uint32_t`). Au-delà, le solveur
refuse explicitement avec un message clair.

---

## 8. Notes importantes

### Modification du schéma SQL

Le schéma original prévoit `mot_de_passe VARCHAR(30)`. Cela **ne peut pas
stocker un hash bcrypt** (qui fait 60 caractères). J'ai augmenté la colonne à
`VARCHAR(255)` dans `schema.sql` :

```sql
`mot_de_passe` VARCHAR(255) NOT NULL,
```

Sans ce changement, `password_hash()` produirait un hash tronqué et
`password_verify()` échouerait **systématiquement** — aucune connexion ne
serait possible.

J'ai aussi élargi `adresse_mail` à `VARCHAR(60)` car 30 caractères est trop
court pour beaucoup d'adresses réelles.

### Sécurité implémentée

- ✅ Mots de passe hashés avec **bcrypt** (`PASSWORD_BCRYPT`)
- ✅ Requêtes **PDO préparées** partout, pas d'émulation
- ✅ **CSRF tokens** sur tous les POST (login, register, save_score)
- ✅ **Sessions sécurisées** (HttpOnly, SameSite=Lax, regenerate_id périodique)
- ✅ Score plafonné côté serveur à `score_max` du niveau (anti-triche)
- ✅ Échappement HTML systématique (helper `e()`)
- ✅ Validation des entrées : pseudo regex, email validé, longueur min mot de passe

### Compte de démo

- Pseudo : `demo`
- Mot de passe : `demo1234`

À supprimer en production (ligne `INSERT INTO utisateur` à la fin du
`schema.sql`).

### Ce qui n'est PAS implémenté (mais facile à ajouter)

L'énoncé liste aussi :

- Un **éditeur de niveau manuel** (en C ou en web). Le format est documenté
  ci-dessus, donc l'ajouter consiste à écrire un éditeur de grille qui produit
  ce format texte.
- Un **générateur de niveaux aléatoires** (en C). On peut le scaffolder en
  partant de la structure du solveur (`solver.h` connaît déjà le format).
  Algo possible : génération récursive de labyrinthe (DFS backtracking), puis
  placement aléatoire des items, puis appel au solveur pour valider.

Ces deux modules ne dépendent pas de ce qui est déjà livré et peuvent être
ajoutés en parallèle par les autres membres de l'équipe.

---

*Glisse, déduit, survis.* ⚔
