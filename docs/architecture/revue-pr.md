# Revue de PR en postes

La revue d'une PR est le sous-workflow `review_child`, lancé pour chaque PR (foreach sur `.kronn/prs.json`) par la revue à la demande (`review_one`), le cron des revues (`review_cron`) et la chaîne (`impl_revue_pr`) [src: file: workflows/templates/review_one.json:1] [src: file: workflows/templates/impl_revue_pr.json:1]. Elle lit la PR en postes, un sous-workflow chacun, puis le poste 🧐 avis tranche [src: file: workflows/review.py:1].

## Les postes

| Étape de `review_child` | Modèle | Niveau (réglage `review.postes.<poste>`) | Rôle |
|---|---|---|---|
| `contexte` | `review_contexte` | economy | sens de la PR, stack, fichiers à risque, tests ; dernière ligne `Sécurité : oui` ou `non` |
| `docs` | `review_docs` | default | conventions suivies par le routeur `docs/AGENTS.md`, doc tenue à jour (bloquant si elle devient fausse), citations `[src: …]` |
| `lecture` | `review_lecture` | reasoning, skill `testing` | correction, tests, passe « mutation », duplication, lisibilité, patterns |
| `securite` | `review_securite` | default, skill `security` | passe sécurité ; sautée (code 5 de l'entrée) quand le contexte a écrit « Sécurité : non », sauf `review.securite` = `"toujours"` |
| `avis` | étape Agent du parent | default | vérifie les constats dans le code, rédige la review à la grille (`tools/review_rubric.md`) |

Niveaux et skills : `templates.REVIEW_AGENTS`, rendus par `poste_agent` ; `review.skill_ids` de l'équipe s'ajoute à lecture, sécurité et avis [src: file: tools/templates.py:REVIEW_AGENTS]. Chaque poste est `entree` (consigne, `workflows/review.py poste`), `agent`, `rapport` (rangé dans `.kronn/review-<n>/<poste>.md`) ; l'avis lit ces rapports et le diff annoté `.kronn/review-<n>/diff.md` (`R<n>` = ligne de la nouvelle version, side RIGHT ; `L<n>` = ligne supprimée, side LEFT), écrits dans la copie de travail du run, jamais le dossier du projet [src: file: workflows/review.py:contexte].

## Limites de Kronn qui ont fixé la forme

- 20 étapes au plus par workflow (`Too many steps`) : `review_child` en a 20 ; d'où `pr` et `repo` posés en état par `setup` (plus d'étapes `prnum`, `repovar`), le saut au head déjà relu dans `write_ctx`, la passe sécurité qui décide seule de se sauter, les deux datasets de la page écrits par une seule étape `publish` [src: file: workflows/templates/review_child.json:1].
- 5 niveaux de sous-workflows au plus (`MAX_SUBWORKFLOW_DEPTH`) : chaîne → livraison → `impl_revue_pr` → `review_child` → poste = 4.
- `on_result` ne voit que les signaux de Kronn (`OK`, `ERROR`, `exit_N`…), jamais le texte d'une sortie [src: file: tests/test_models.py:test_on_result_rules_only_match_kronn_signals].
- La sortie typée d'une étape Agent ne remonte pas d'un sous-workflow : l'avis reste dans le parent, car `post`, `build_row`, `react` et `reply` lisent `steps.avis.data`.

## Contrat avec la page de récap (`review.page_id`)

Ne pas le casser en touchant à la revue [src: file: workflows/templates/review_child.json:publish] :

- Dataset `reviews` : une ligne par revue postée (`build_row` depuis `steps.avis.data`), mêmes champs qu'avant le découpage (`pr`, `repo`, `verdict`, `summary`, `author`, `base`, `run_at`, `inline`, `reactions`, `replies`, `diff_*`, `review_pass`).
- Dataset `review_meta` : la réponse GitHub du POST (`meta_row`) ; la signature « Review automatique · Le Bureau (agent - modèle) » sert aussi à `write_ctx` pour sauter une PR déjà relue à son head.
- Dataset `review_sessions` : une ligne par revue (`workflows/review.py couts`, étape `cost` / `costs`). La page rapproche une ligne de coût par revue (même PR, entre 5 min avant et 60 min après `run_at`) : `couts` regroupe les sessions Claude Code des postes d'une même revue (même dossier, même PR, moins de 20 min d'écart), sous l'id de la première, détail par poste dans `postes`. Chaque prompt de poste commence donc par « Review la PR #<n> (`<repo>`) · poste <poste> ».
- `run_at` est posé par `write_ctx` au départ (UTC, millisecondes, `Z`), pas à l'heure de l'avis : les postes passent avant lui.

## La file de la salle de revue (2e étage)

Le cron relit ses PR l'une après l'autre (foreach séquentiel) ; la salle montre celles qui attendent, sans rien faire apparaître d'un coup [src: file: page/src/68-revue.js:1] :

- `finalize` du cron imprime `PRS=[[repo, n°, auteur], …]`, dans l'ordre du cron (jamais regroupé par auteur) ; `workflows/redaction_snapshot.py` en tire `revue.batches` (par passage du cron, 24 h) et `revue.verdicts` (verdict de l'avis de chaque revue finie), un run fini lu une fois (`~/.cache/pixel-bureau/revue/`) [src: file: workflows/redaction_snapshot.py:revue].
- La page compare l'état voulu à l'heure T (`rvfState` : PR au casier, PR lue, revues finies) à ce qu'elle a déjà posé (`RVF_M`), comme la caserne : Bernard et son transpalette pour une nouvelle fournée (il vide la corbeille « Postées » du passage d'avant), le relecteur qui tamponne, pose à la corbeille et prend le dossier suivant, les auteurs (une personne par auteur) qui restent au bureau si leur PR suivante est la prochaine, retournent s'asseoir sinon, et redescendent après leur dernière. Six cases au casier, puis « +n ». En arrivant à l'étage, après un saut du curseur de plus de 2 min ou avec REDUCED_MOTION, tout est posé.
- Le premier bureau est celui de la file (`rvfDesk`) ; les revues à la demande prennent les cinq autres. Config de la page : `CFG.revue_cron_wf`.

## Ailleurs

- 2e étage : la salle de revue montre les postes et l'avis sous chaque bureau (`RV_STEP` de `page/src/68-redaction.js`) ; les runs des postes (`CFG.revue_postes_wf`) ne passent pas au RDC [src: file: page/src/68-redaction.js:RV_STEP].
- Bilan de la chaîne : les jetons des postes comptent avec la revue de la PR (`REVUE` de `workflows/chaine_bilan.py`).

Tests : `tests/test_review.py` (script), `tests/test_models.py` (rendu, niveaux, 20 étapes), `tests/redaction.test.js` (salle), `tests/test_chaine_bilan.py`.
