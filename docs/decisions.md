# Architecture decisions (why, not what)

> **TEMPLATE FILE.** Filled during audit Step 9 (final review + decisions). Do not invent decisions: they must come from code analysis or user confirmation.

This file captures **intentional choices**: patterns that look unusual but are deliberate. It prevents agents from "fixing" things that aren't broken.

It is the *positive* counterpart to `inconsistencies-tech-debt.md`: decisions the team made on purpose, NOT problems to fix.

## How to fill (audit Step 9)

- **Target 3-8 real decisions** observed in code + briefing. Quality > quantity: a list of 2 strong decisions is fine; 15 fluff items is worse than 3 strong ones.
- **Every row must cite a source**: `file:line`, `briefing.md`, or `user` (if confirmed during validation). No inferred rows: a decision you cannot anchor to a source is a `<!-- TODO: ask user -->` question, not a decision.
- **Remove unused rows entirely**: if the project has only one real decision, delete the `{{DECISION_2}}` placeholder row instead of padding.

## Examples (good shape: adapt to the actual repo)

| Decision | Why chosen | What NOT to do | Source |
|----------|-----------|---------------|--------|
| Single Mutex on SQLite | Single-writer model fits our access pattern; multi-writer would need WAL + busy_timeout tuning | Don't add a connection pool | `src/db/conn.rs:42` |
| No ORM | Pure SQL is faster for our 12-table schema; ORM dependency cost exceeds the win | Don't introduce diesel/sea-orm | `src/db/queries.rs` + user |

## Decisions

| Decision | Why chosen | What NOT to do | Source |
|----------|-----------|---------------|--------|
| Page monofichier : tout inline (CSS, JS, polices et images en `data:`), assemblée dans `dist/office.html` | La sandbox des Live Pages Kronn n'accepte que du inline, HTML de moins de 1 Mo | Ne pas ajouter d'`import`, de module, de CDN ni de ressource externe ; ne pas éditer `dist/` à la main | [src: file: guide/developpement.md:48] |
| Scripts JS `page/src/NN-*.js` concaténés dans l'ordre des noms, une seule portée globale | Un seul `<script>` dans la page monofichier ; le préfixe numérique fixe l'ordre de chargement | Ne pas introduire de modules ES ni de bundler ; choisir le préfixe `NN` d'un nouveau fichier selon ses dépendances | [src: file: guide/developpement.md:9] |
| `_lib.py` et `_plan.py` recopiés dans chaque script de cron au rendu | Kronn lance l'étape Exec par `python3 -c`, sans fichier voisin importable | Ne pas importer un autre fichier voisin ni une bibliothèque hors stdlib dans `workflows/*.py` | [src: file: guide/developpement.md:10] |
| Crons à 0 token : ***REDACTED*** Exec (Python) et ApiCall, pas d'agent IA | Choix déclaré : les datasets de la page sont produits par des crons à 0 token (aucun appel de modèle) | Ne pas remplacer un script de cron par une étape d'agent IA | [src: file: docs/briefing.md:5] |
| Changements de statut Jira lus par `changelog/bulkfetch` filtré sur `status` | `expand=changelog` ramène chaque version de la description : 12 Mo par run, 80 runs par jour | Ne jamais ajouter `expand=changelog` sur `jira_team` ni `jira_closed` | [src: file: guide/developpement.md:26] |
| Publication sans données de démo, plan validé avant envoi | La page publiée attend ses propres datasets ; un plan cassé ferait disparaître des personnages ou bloquerait des chemins | Ne pas publier une page assemblée avec la démo (`data/*.json`) ; ne pas contourner `plan.validate` | [src: file: tools/publish.py:27] [src: file: tools/publish.py:29] |
| Tout est rejouable et daté par les données | Rejeu de la journée et instantanés cohérents, quelle que soit l'heure du calcul | Ne pas dater un événement par l'heure de calcul du script ou du navigateur | [src: file: docs/briefing.md:33] |
