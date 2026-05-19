#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate architecture PDF: C solver + DB batch (Les fantômes d'Ombrequatre)."""

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from pathlib import Path

OUT = Path(__file__).resolve().parent / "Architecture_Solveur_C_BDD.pdf"


class Doc(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f"Les fantômes d'Ombrequatre - {self.page_no()}/{{nb}}", align="C")


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


def table_row(pdf: Doc, cols: list[str], widths: list[int], bold: bool = False):
    pdf.set_font("Helvetica", "B" if bold else "", 9)
    h = 6
    for i, (w, c) in enumerate(zip(widths, cols)):
        pdf.cell(w, h, c, border=1)
    pdf.ln(h)


def build():
    pdf = Doc()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(20, 20, 20)

    # ---- Cover ----
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(20, 40, 80)
    pdf.ln(40)
    pdf.multi_cell(0, 12, "Architecture alternative\nSolveur C + base de donnees", align="C")
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(0, 8, "Les fantômes d'Ombrequatre - CIR1 2025-2026", align="C")
    pdf.ln(20)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(
        0,
        6,
        "Abandon du solveur JavaScript (Web Worker)\n"
        "Pre-calcul des solutions via programme C\n"
        "Lecture des niveaux depuis MySQL (table niveau)\n\n"
        "Document technique - Mai 2026",
        align="C",
    )

    # ---- 1. Contexte ----
    pdf.add_page()
    section(pdf, "1. Contexte et objectif", 1)
    body(
        pdf,
        "Le projet Les fantômes d'Ombrequatre propose aujourd'hui un panneau OPTIMAL PATH alimente "
        "par trois mecanismes en cascade : (1) cache serveur (colonnes solution_cache et "
        "solution_safe en base), (2) Web Worker JavaScript (solver-worker.js) avec BFS "
        "optimal et contrainte fantomes, (3) repli gems-only si le BFS sur ne trouve pas "
        "de chemin sur en temps imparti.",
    )
    body(
        pdf,
        "L'objectif de cette etude est de definir une architecture ou le calcul des "
        "solutions est exclusivement realise en C, les niveaux etant lus depuis la base "
        "MySQL, puis ecrits dans solution_cache. Le navigateur ne ferait plus que "
        "consommer le cache via get_solution.php - suppression du Worker JS.",
    )

    section(pdf, "1.1 Etat actuel du depot", 2)
    bullet(
        pdf,
        [
            "Solveur C (dossier solver/) : kl_solve() gems-only, kl_solve_safe() evite R/G/B, jaune ignore.",
            "Solveur JS (solver-worker.js + game.js solvePath) : BFS complet avec fantome jaune dans l'etat.",
            "BDD : table niveau (id, map TEXT, solution_cache, solution_safe), 10 niveaux pre-remplis.",
            "API : get_solution.php retourne la sequence si cached=true.",
        ],
    )

    section(pdf, "1.2 Ecart fonctionnel a combler", 2)
    body(
        pdf,
        "Le solveur C en mode --safe-path ne modelise pas le fantome jaune (depend de la "
        "direction du joueur). Le Worker JS, lui, l'inclut dans l'espace d'etats BFS. "
        "Avant de remplacer le JS, il faudra porter cette logique en C (voir section 5) "
        "ou accepter un ecart documente entre solution_safe en BDD et comportement reel en jeu.",
    )

    # ---- 2. Voies d'architecture ----
    pdf.add_page()
    section(pdf, "2. Voies d'architecture possibles", 1)
    body(
        pdf,
        "Cinq approches realistes pour recuperer les niveaux en BDD et les resoudre en C. "
        "Toutes supposent un binaire solver compile (gcc -O2) et les colonnes solution_cache / "
        "solution_safe deja presentes.",
    )

    section(pdf, "2.1 Voie A - Batch CLI orchestre par PHP (recommandee)", 2)
    body(
        pdf,
        "Un script PHP (cli/solve_all_levels.php) se connecte en PDO, SELECT id, map FROM niveau, "
        "ecrit chaque carte dans un fichier temporaire level_{id}.txt, appelle exec() ou "
        "proc_open() sur ./solver --safe-path --moves-only, capture stdout (sequence UDLR), "
        "puis UPDATE niveau SET solution_cache=?, solution_safe=1 WHERE id=?.",
    )
    bullet(
        pdf,
        [
            "Avantages : simple, reutilise le code C existant, pas de lib MySQL en C, facile a deboguer.",
            "Inconvenients : I/O disque temporaires ; latence exec() negligeable en batch.",
            "Usage : cron nocturne, bouton admin apres creation d'un niveau, migration initiale.",
        ],
    )

    section(pdf, "2.2 Voie B - Programme C autonome avec connecteur MySQL", 2)
    body(
        pdf,
        "Etendre solver/ avec un mode batch : ./solver --db-host=localhost --solve-all. "
        "Liaison libmysqlclient ou MariaDB Connector/C : requete directe, parsing map en memoire, "
        "UPDATE sans fichier intermediaire.",
    )
    bullet(
        pdf,
        [
            "Avantages : performance I/O maximale, un seul processus, deployable sans PHP.",
            "Inconvenients : dependance native, gestion credentials, compilation plus complexe (LDFLAGS).",
            "Pertinent si equipe veut un outil DevOps pur C hors stack MAMP.",
        ],
    )

    section(pdf, "2.3 Voie C - Calcul a la demande via API PHP + exec()", 2)
    body(
        pdf,
        "Lors de la creation ou modification d'un niveau (formulaire admin), PHP appelle le "
        "binaire C de facon synchrone et renvoie la solution ou une erreur HTTP 503 si timeout.",
    )
    bullet(
        pdf,
        [
            "Avantages : toujours a jour sans cron ; pas de Worker JS cote client.",
            "Inconvenients : risque de blocage du thread Apache (30s+ sur grands niveaux) ; "
            "il faut set_time_limit, file d'attente ou job async pour la prod.",
            "A eviter pour le panneau OPTIMAL PATH en jeu ; reserve a l'admin.",
        ],
    )

    section(pdf, "2.4 Voie D - Service daemon / file de jobs", 2)
    body(
        pdf,
        "File Redis ou table jobs (level_id, status). Un worker longue duree (C ou PHP) consomme "
        "les taches, ecrit solution_cache. L'API get_solution.php renvoie cached=false tant que "
        "status=pending - le client affiche En cours de calcul sans Worker JS.",
    )
    bullet(
        pdf,
        [
            "Avantages : scalable, pas de timeout HTTP, UX propre pour niveaux utilisateur.",
            "Inconvenients : infrastructure supplementaire ; sur-projet pour 10 niveaux fixes.",
            "Utile si les joueurs peuvent publier des niveaux custom a grande echelle.",
        ],
    )

    section(pdf, "2.5 Voie E - WebAssembly (compromis, hors scope abandon JS)", 2)
    body(
        pdf,
        "Compiler le solveur C en WASM et l'appeler depuis le navigateur conserve une logique "
        "unique tout en restant cote client. Ce n'est pas l'option demandee (abandon du solveur "
        "JS) mais les benchmarks montrent un gain typique de 2 a 5x vs JS pur pour le BFS. "
        "Mentionne ici a titre comparatif uniquement.",
    )

    section(pdf, "2.6 Synthese comparative des voies", 2)
    widths = [42, 28, 28, 28, 34]
    table_row(pdf, ["Voie", "Complexite", "Perf batch", "Prod web", "Recommandation"], widths, True)
    for row in [
        ["A PHP+exec", "Faible", "Bonne", "Admin OK", "OUI - MVP"],
        ["B C+MySQL", "Moyenne", "Excellente", "Admin OK", "OUI - v2"],
        ["C exec sync", "Faible", "N/A", "Risquee", "Admin seulement"],
        ["D file jobs", "Elevee", "Excellente", "Ideale", "Si niveaux user"],
        ["E WASM", "Elevee", "Client", "Evite PHP", "Non (hors cahier)"],
    ]:
        table_row(pdf, row, widths)

    # ---- 3. Flux cible ----
    pdf.add_page()
    section(pdf, "3. Flux cible apres migration", 1)
    body(
        pdf,
        "Chargement du jeu (game.php) : le client appelle uniquement get_solution.php. "
        "Si solution_cache est renseigne, affichage immediat. Sinon message Solution "
        "non disponible - contactez l'admin (plus de fallback Worker).",
    )
    body(
        pdf,
        "Pipeline batch (une fois par niveau nouveau ou modifie) :",
    )
    bullet(
        pdf,
        [
            "1. SELECT id, map FROM niveau WHERE solution_cache IS NULL OR solution_cache = '';",
            "2. Pour chaque id : ecrire map -> /tmp/kl_level_{id}.txt",
            "3. Executer : solver /tmp/kl_level_{id}.txt --safe-path --moves-only",
            "4. Si code retour 0 et sortie != UNSOLVABLE : UPDATE solution_cache, solution_safe=1",
            "5. Sinon : solution_safe=0, log erreur, eventuellement retry gems-only (--sans --safe-path)",
            "6. Supprimer fichiers temporaires",
        ],
    )
    body(
        pdf,
        "HINT FROM HERE : deux options. (a) Pre-calcul impossible pour tous les etats "
        "intermediaires - desactiver ou reserver a un batch lourd. (b) Etendre le batch "
        "pour stocker des sous-solutions (hors scope MVP). Solution pragmatique : garder "
        "un mini-solveur C invoque via API admin uniquement, ou accepter hint desactive en prod.",
    )

    # ---- 4. Performance C vs JS ----
    pdf.add_page()
    section(pdf, "4. Le solveur C est-il plus performant que le solveur JS ?", 1)
    body(
        pdf,
        "Reponse courte : OUI, de maniere significative pour un BFS a espace d'etats large, "
        "surtout en batch hors navigateur. En revanche, pour l'affichage en jeu, seul le "
        "cache compte une fois la migration faite - la perf runtime du solveur ne se voit plus.",
    )

    section(pdf, "4.1 Facteurs techniques", 2)
    bullet(
        pdf,
        [
            "Compilation native (-O2/-O3) : pas d'interpretation JIT, acces memoire direct.",
            "Structures compactes : uint64_t pour les cles d'etat vs chaines JS dans Map.",
            "Pas de GC : le BFS alloue des tableaux fixes (8M noeuds) sans pauses collecteur.",
            "Worker JS : deja hors thread UI, mais reste V8 avec overhead objets et Map.",
        ],
    )

    section(pdf, "4.2 Ordres de grandeur (sources publiques)", 2)
    body(
        pdf,
        "Benchmarks generaux (programming-language-benchmarks, comparaisons C vs JavaScript) : "
        "le C est typiquement 5x a 50x plus rapide sur boucles numeriques intensives selon "
        "l'algorithme et la qualite du code JS.",
    )
    body(
        pdf,
        "Benchmark BFS dedie (projet Sable/bfs-benchmark, graphes petits/moyens) : C++ natif "
        "environ 10x plus rapide que JS Node sur petites instances, 2,5x sur instances moyennes. "
        "Le navigateur (Chrome) est encore plus lent que Node sur les memes tests.",
    )
    body(
        pdf,
        "Pour Les fantômes d'Ombrequatre : un etat safe inclut jusqu'a 30 gemmes (2^30 masques), "
        "tour, position jaune - l'espace explose. Le Worker limite a 8M noeuds / 30s ; le C "
        "utilise la meme limite (BFS_MAX_NODES) mais parcourt plus de noeuds par seconde, "
        "donc plus de chances de trouver une solution safe avant timeout.",
    )

    section(pdf, "4.3 Tableau comparatif applicatif au projet", 2)
    widths = [45, 50, 45]
    table_row(pdf, ["Critere", "Solveur C (batch)", "Worker JS (actuel)"], widths, True)
    for row in [
        ["Debit BFS", "Eleve (natif)", "Moyen (V8)"],
        ["Memoire etat", "Cle 64 bits", "Cle string Map"],
        ["Fantome jaune", "A implementer", "Implemente"],
        ["Usage en jeu", "Via cache BDD", "Direct ou cache"],
        ["Blocage UI", "Aucun (hors browser)", "Aucun (Worker)"],
        ["Deploiement MAMP", "exec + binaire", "Aucun binaire"],
    ]:
        table_row(pdf, row, widths)

    section(pdf, "4.4 Conclusion performance", 2)
    body(
        pdf,
        "Pour pre-calculer les 10 niveaux (ou des centaines en batch), le C est le bon choix : "
        "temps total reduit, logs reproductibles, pas de limite navigateur. Pour l'experience "
        "joueur apres migration, les deux approches sont equivalentes si tout est en cache. "
        "Le gain C se manifeste surtout a la creation de contenu et pour des niveaux difficiles "
        "ou le JS timeout souvent.",
    )

    # ---- 5. Evolutions C requises ----
    pdf.add_page()
    section(pdf, "5. Evolutions du solveur C avant remplacement du JS", 1)
    bullet(
        pdf,
        [
            "Porter stepYellow() et l'etat (yr, yc, yd) dans kl_solve_safe (aligner sur solver-worker.js).",
            "Mode --moves-only deja present ; ajouter --json pour sortie machine (id, moves, safe, ms).",
            "Mode --stdin ou --map-string pour eviter fichiers temporaires depuis PHP.",
            "Codes retour explicites : 0=solvable, 1=unsolvable, 2=erreur parse, 3=limite memoire.",
            "Option --timeout N secondes (alarm) pour batch robuste.",
        ],
    )

    section(pdf, "5.1 Plan de migration (phases)", 2)
    bullet(
        pdf,
        [
            "Phase 1 : Completer kl_solve_safe (jaune) + tests sur levels/ et maps BDD.",
            "Phase 2 : Script PHP cli/solve_all_levels.php + Makefile install target.",
            "Phase 3 : Re-generer solution_cache pour les 10 niveaux ; verifier en jeu.",
            "Phase 4 : Retirer solver-worker.js, simplify game.js (cache only).",
            "Phase 5 : Documenter procedure admin pour nouveaux niveaux.",
        ],
    )

    section(pdf, "5.2 Esquisse script PHP (voie A)", 2)
    body(
        pdf,
        "<?php\n"
        "// cli/solve_all_levels.php\n"
        "$cfg = require __DIR__.'/../web/includes/config.php';\n"
        "$pdo = new PDO(...);\n"
        "$solver = realpath(__DIR__.'/../solver/solver');\n"
        "foreach ($pdo->query('SELECT id, map FROM niveau') as $row) {\n"
        "  $tmp = sys_get_temp_dir().'/kl_'.$row['id'].'.txt';\n"
        "  file_put_contents($tmp, $row['map']);\n"
        "  $out = shell_exec(escapeshellarg($solver).' '.escapeshellarg($tmp).' --safe-path --moves-only 2>&1');\n"
        "  // UPDATE si solvable...\n"
        "}",
    )

    section(pdf, "5.3 Securite exec()", 2)
    body(
        pdf,
        "Utiliser escapeshellarg(), chemin absolu vers le binaire, desactiver l'appel depuis "
        "le web public (CLI ou endpoint admin protege par session + CSRF). Ne jamais passer "
        "du contenu map non valide directement en argument shell (toujours via fichier temp).",
    )

    # ---- 6. Recommandation finale ----
    pdf.add_page()
    section(pdf, "6. Recommandation finale", 1)
    body(
        pdf,
        "Adopter la voie A (batch PHP + binaire C) comme MVP, puis evoluer vers la voie B "
        "si l'equipe souhaite un outil C autonome sans PHP. Abandonner solver-worker.js "
        "une fois tous les niveau.solution_cache valides. Completer le solveur C pour le "
        "fantome jaune afin que solution_safe=1 soit fiable face au moteur de jeu.",
    )
    body(
        pdf,
        "Le solveur C est objectivement plus performant que le JS pour ce probleme ; "
        "l'interet principal n'est pas d'accelerer l'affichage en partie (deja instantane "
        "via cache) mais de fiabiliser le pre-calcul, supprimer la complexite navigateur, "
        "et traiter des niveaux plus difficiles hors ligne.",
    )

    section(pdf, "6.1 References", 2)
    bullet(
        pdf,
        [
            "Depot projet : solver/solver.c, web/js/solver-worker.js, sql/schema.sql",
            "Benchmarks langages : programming-language-benchmarks.vercel.app (JS vs C)",
            "BFS benchmark : github.com/Sable/bfs-benchmark",
            "README projet section 7 (solveur trois modes)",
        ],
    )

    pdf.output(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    print(f"PDF genere : {path}")
