# solveurCrenvoyanttxt

Module autonome : **base de donnees MySQL** → **solveur C** → **fichiers `.txt`**.

Reutilise le moteur BFS du projet (`../solver/solver.c`).

## Structure

```text
solveurCrenvoyanttxt/
├── src/           batch_io, solve_db, solve_one
├── cli/           solve_from_db.php
├── output/
│   ├── levels/    niveaux exportes depuis la BDD
│   └── solutions/ level_<id>_solution.txt
├── Makefile
└── build.bat
```

## Compilation

```bat
cd solveurCrenvoyanttxt
build.bat
```

ou `make` (produit `solve_db` et `solve_one`).

## Execution

Depuis la racine du projet (MySQL MAMP demarre) :

```bat
php solveurCrenvoyanttxt/cli/solve_from_db.php
```

## Un seul niveau

```bat
solve_one output\levels\level_1.txt --output output\solutions\level_1_solution.txt --safe-path --fallback
```

testttstts