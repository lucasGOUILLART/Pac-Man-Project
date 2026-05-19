#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate PDF documentation for solveurCrenvoyanttxt module."""

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from pathlib import Path

OUT = Path(__file__).resolve().parent / "SolveurCrenvoyanttxt_Guide.pdf"


class Doc(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f"Les fantomes d'Ombrequatre - {self.page_no()}/{{nb}}", align="C")


def section(pdf: Doc, title: str, level: int = 1):
    pdf.ln(4 if level > 1 else 8)
    sizes = {1: 14, 2: 12, 3: 11}
    pdf.set_font("Helvetica", "B", sizes.get(level, 11))
    pdf.set_text_color(20, 40, 80)
    pdf.multi_cell(0, 7, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 10)


def body(pdf: Doc, text: str):
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)


def bullet(pdf: Doc, items: list[str]):
    pdf.set_font("Helvetica", "", 10)
    for item in items:
        pdf.multi_cell(0, 5.5, f"  -  {item}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)


def code_block(pdf: Doc, text: str):
    pdf.set_font("Courier", "", 9)
    pdf.set_fill_color(245, 245, 250)
    for line in text.strip().split("\n"):
        pdf.cell(0, 5, "  " + line, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)


def build():
    pdf = Doc()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(20, 20, 20)

    # ---- Cover ----
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(20, 40, 80)
    pdf.ln(35)
    pdf.multi_cell(0, 12, "Module solveurCrenvoyanttxt\nGuide technique", align="C")
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(0, 8, "Les fantomes d'Ombrequatre", align="C")
    pdf.ln(16)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(
        0,
        6,
        "Pipeline hors-ligne : MySQL -> solveur C -> fichiers .txt\n\n"
        "CIR1 2025-2026 - Mai 2026",
        align="C",
    )

    # ---- 1. Objectif ----
    pdf.add_page()
    section(pdf, "1. Objectif du module", 1)
    body(
        pdf,
        "Le dossier solveurCrenvoyanttxt est un module autonome ajoute au projet. "
        "Il repond a un besoin precis : pre-calculer, pour tous les niveaux stockes "
        "en base de donnees, la sequence optimale de glissements du chevalier, puis "
        "exporter chaque resultat dans un fichier texte structure (.txt).",
    )
    body(
        pdf,
        "Ce pipeline fonctionne en parallele du jeu web. Le site continue d'utiliser "
        "son solveur JavaScript (Web Worker) et le cache BDD (solution_cache). "
        "Les fichiers .txt servent a la validation, a l'import futur en base, ou a "
        "des traitements externes (scripts, rapports, tests).",
    )
    section(pdf, "1.1 Ce que le module ne fait pas", 2)
    bullet(
        pdf,
        [
            "Il ne modifie pas le moteur de jeu Canvas (web/js/game.js).",
            "Il ne remplace pas automatiquement solution_cache en MySQL.",
            "Il ne se connecte pas directement a MySQL depuis le C (choix d'architecture).",
        ],
    )

    # ---- 2. Architecture ----
    section(pdf, "2. Architecture en deux etapes", 1)
    body(
        pdf,
        "Plutot que de compiler libmysqlclient dans le programme C (lourd sous Windows/MAMP), "
        "le flux est decoupe en orchestration PHP et calcul C pur.",
    )
    code_block(
        pdf,
        """MySQL (table niveau, colonne map)
        |
        v
  cli/solve_from_db.php  ---- exporte level_N.txt + levels_manifest.txt
        |
        v
  solve_db.exe (C)       ---- BFS, ecrit level_N_solution.txt
        |
        v
  output/solutions/      ---- un .txt par niveau""",
    )

    section(pdf, "2.1 Pourquoi cette separation ?", 2)
    bullet(
        pdf,
        [
            "PHP : deja configure pour PDO (web/includes/config.php), lecture simple de la table niveau.",
            "C : reutilise le BFS eprouve de solver/solver.c (gems-only et safe-path).",
            "Fichiers intermediaires : reproductibles, versionnables, debogables a la main.",
        ],
    )

    # ---- 3. Structure ----
    section(pdf, "3. Structure des fichiers", 1)
    code_block(
        pdf,
        """solveurCrenvoyanttxt/
  src/
    batch_io.c / .h    I/O et resolution d'un niveau
    solve_db.c         batch sur manifeste
    solve_one.c        un seul niveau (CLI)
  cli/
    solve_from_db.php  point d'entree principal
  output/
    levels/            cartes exportees
    solutions/         solutions generees
    levels_manifest.txt
  Makefile / build.bat compilation""",
    )
    body(
        pdf,
        "Le coeur algorithmique n'est pas duplique : solve_db et solve_one lient "
        "directement ../solver/solver.c (moteur BFS du projet principal).",
    )

    # ---- 4. Fonctionnement detaille ----
    section(pdf, "4. Fonctionnement detaille", 1)

    section(pdf, "4.1 Etape PHP : solve_from_db.php", 2)
    body(pdf, "Commande (depuis la racine du projet, MySQL MAMP demarre) :")
    code_block(pdf, "php solveurCrenvoyanttxt/cli/solve_from_db.php")
    body(pdf, "Actions realisees :")
    bullet(
        pdf,
        [
            "Connexion PDO via web/includes/config.php.",
            "SELECT id, map FROM niveau ORDER BY id.",
            "Ecriture de chaque carte dans output/levels/level_<id>.txt.",
            "Creation du manifeste output/levels_manifest.txt (une ligne par niveau).",
            "Lancement de solve_db.exe avec les options --safe-path et --fallback par defaut.",
        ],
    )
    body(pdf, "Format du manifeste (une ligne par niveau) :")
    code_block(pdf, "3|C:/.../output/levels/level_3.txt\n4|C:/.../output/levels/level_4.txt")

    section(pdf, "4.2 Etape C : solve_db", 2)
    body(
        pdf,
        "solve_db lit le manifeste, appelle kl_solve_level_file() pour chaque entree, "
        "et ecrit output/solutions/level_<id>_solution.txt.",
    )
    body(pdf, "Options de ligne de commande :")
    bullet(
        pdf,
        [
            "--manifest <fichier>   liste id|chemin_niveau (obligatoire)",
            "--output-dir <dossier> dossier des solutions (obligatoire)",
            "--safe-path            tente d'abord le BFS evitant R/G/B (defaut via PHP)",
            "--gems-only            ignore les fantomes",
            "--fallback             si safe echoue, retente en gems-only",
        ],
    )

    section(pdf, "4.3 Modes de resolution (batch_io.c)", 2)
    body(
        pdf,
        "kl_solve_level_file() encapsule la strategie :",
    )
    bullet(
        pdf,
        [
            "1. Parse le fichier niveau (meme format que le jeu : lignes #, P, R, G, Y, B, etc.).",
            "2. Si --safe-path : appelle kl_solve_safe() (fantomes rouge, vert, bleu pre-calcules).",
            "3. Si echec et --fallback : appelle kl_solve() (gemmes seules, sans fantomes).",
            "4. Sinon gems-only direct.",
        ],
    )
    body(
        pdf,
        "Le fantome jaune (Ame corrompue) depend de la direction du joueur ; "
        "le solveur C safe-path l'ignore volontairement (comme le worker JS).",
    )

    section(pdf, "4.4 Format du fichier solution .txt", 2)
    body(pdf, "Exemple de sortie :")
    code_block(
        pdf,
        """# Les fantomes d'Ombrequatre - solution export
level_id=4
level_file=.../output/levels/level_4.txt
solvable=yes
mode=safe-path
move_count=12
sequence=URDLR...
error=""",
    )
    bullet(
        pdf,
        [
            "sequence : chaine compacte U/D/L/R (un caractere par glissement).",
            "mode : safe-path ou gems-only selon la strategie reussie.",
            "solvable=no si aucun chemin trouve (error renseigne).",
        ],
    )

    section(pdf, "4.5 solve_one : un seul niveau", 2)
    body(pdf, "Utile pour deboguer un niveau sans relancer tout le batch :")
    code_block(
        pdf,
        """solve_one output/levels/level_1.txt ^
  --output output/solutions/level_1_solution.txt ^
  --safe-path --fallback""",
    )

    # ---- 5. Compilation ----
    section(pdf, "5. Compilation et execution", 1)
    section(pdf, "5.1 Prerequis", 2)
    bullet(
        pdf,
        [
            "GCC ou MinGW (build.bat sous Windows).",
            "PHP CLI avec extension PDO MySQL.",
            "MySQL MAMP demarre, table niveau remplie.",
        ],
    )
    section(pdf, "5.2 Compilation", 2)
    code_block(
        pdf,
        """cd solveurCrenvoyanttxt
build.bat        REM Windows
make             REM Linux / macOS""",
    )
    body(pdf, "Binaires produits : solve_db.exe et solve_one.exe (ou sans .exe sous Unix).")

    section(pdf, "5.3 Execution complete", 2)
    code_block(
        pdf,
        """cd C:\\MAMP\\htdocs\\project
php solveurCrenvoyanttxt/cli/solve_from_db.php""",
    )
    body(pdf, "Variantes :")
    code_block(
        pdf,
        """php .../solve_from_db.php --gems-only
php .../solve_from_db.php --no-fallback""",
    )

    # ---- 6. Lien avec le jeu ----
    section(pdf, "6. Lien avec le jeu et la base de donnees", 1)
    body(
        pdf,
        "Table niveau (schema.sql) : colonnes map, solution_cache, solution_safe. "
        "Le module exporte map et calcule hors ligne. Pour alimenter solution_cache, "
        "un script d'import (non inclus) peut lire sequence= depuis les .txt et faire "
        "UPDATE niveau SET solution_cache=..., solution_safe=1.",
    )
    body(
        pdf,
        "Le panneau OPTIMAL PATH du jeu lit get_solution.php (cache BDD) ou recalcule "
        "via solver-worker.js. Les .txt du module solveurCrenvoyanttxt sont donc une "
        "source de verite parallele, ideale pour regenerer le cache en masse.",
    )

    # ---- 7. Mecanique modelisee ----
    section(pdf, "7. Mecanique modelisee par le solveur C", 1)
    bullet(
        pdf,
        [
            "Le chevalier glisse jusqu'a un mur ou un croisement (1 coup = 1 glissement).",
            "Ramassage des gemmes (.), potions (o), montres (c) sur le trajet.",
            "Interdiction du demi-tour (direction opposee a la precedente).",
            "Fantomes R/V/B : 1 glissement par tour, memes regles de glace, priorites fixes.",
            "BFS = nombre minimal de glissements pour tout ramasser.",
        ],
    )

    # ---- 8. Depannage ----
    section(pdf, "8. Depannage", 1)
    bullet(
        pdf,
        [
            "solve_db not found : compiler avec build.bat ou make dans solveurCrenvoyanttxt/.",
            "Database connection failed : verifier config.php (host, user, password).",
            "UNSOLVABLE en safe-path : normal sur niveaux difficiles ; utiliser --fallback.",
            "niveau vide : verifier que la table niveau contient des lignes.",
        ],
    )

    pdf.output(OUT)
    print(f"Written: {OUT}")


if __name__ == "__main__":
    build()
