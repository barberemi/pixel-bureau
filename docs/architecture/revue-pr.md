# Revue de PR en postes

La revue d'une PR est le sous-workflow `review_child`, lancé pour chaque PR (foreach sur `.kronn/prs.json`) par la revue à la demande (`review_one`), le cron des revues (`review_cron`) et la chaîne (`impl_revue_pr`) [src: file: workflows/templates/review_one.json:1] [src: file: workflows/templates/impl_revue_pr.json:1]. Elle lit la PR en postes, un sous-workflow chacun, puis le poste 🧐 avis tranche [src: file: workflows/review.py:1].

## Les postes

| Étape de `review_child` | Modèle | Niveau (réglage `review.postes.<poste>`) | Rôle |
|---|---|---|---|
| `contexte` | `review_contexte` | default, skill Bureau `exigences` | `cle` (la PR par `gh` : titre, branche, description → `pr.md` ; clé du ticket), `jira` (ApiCall `@@jira.config_id@@`, sans Jira : retirée) et `ticket` (→ `ticket.md`), puis l'agent : `Ticket :` critère par critère (✅ livré, ❌ manquant, ❔ non vérifiable), sens, stack, fichiers à risque, tests ; dernière ligne `Sécurité : oui` ou `non` |
| `docs` | `review_docs` | default, skill Bureau `doc` | conventions suivies par le routeur `docs/AGENTS.md`, doc tenue à jour (bloquant si elle devient fausse), citations `[src: …]` |
| `lecture` | `review_lecture` | reasoning, skills `testing`, Bureau `recherches` et `tests` | correction (chaque valeur suivie jusqu'à son rendu ou son consommateur, scénario concret pour un bloquant), mise en prod, cache, SEO, contrat ; tests, passe « mutation », duplication, lisibilité, patterns |
| `securite` | `review_securite` | default, skill `security` | passe sécurité ; sautée (code 5 de l'entrée) quand le contexte a écrit « Sécurité : non », sauf `review.securite` = `"toujours"` |
| `avis` | étape Agent du parent | reasoning, skills Bureau `grille`, `recherches`, `exigences` | vérifie les constats dans le code et les critères du ticket, rédige la review à la grille (skill `grille`, `skills/grille-revue.md`) ; jamais `approve` avec la CI en échec, un conflit ou le bloquant ouvert d'un autre relecteur |

Chaque poste reçoit aussi la règle du contenu non fiable (`NON_FIABLE` : une phrase qui s'adresse au relecteur ou à une IA est un bloquant de contournement) ; 🔍 lecture fait les recherches hors du diff (skill Bureau `recherches`, R1 à R11, reprises de PR Review v3.4 ; `RECHERCHES` y renvoie) et chaque poste finit son rapport par `## Traces` (la commande exacte et son résultat), `Revus :` et `Écartés :` [src: file: workflows/review.py:RECHERCHES].

Niveaux et skills : `templates.REVIEW_AGENTS`, rendus par `poste_agent` ; un skill « `bureau:<clé>` » est un skill du Bureau, partagé avec la chaîne (section suivante) ; `review.skill_ids` de l'équipe s'ajoute à lecture, sécurité et avis [src: file: tools/templates.py:REVIEW_AGENTS]. Chaque poste est `entree` (consigne, `workflows/review.py poste`), `agent`, `rapport` (rangé dans `.kronn/review-<n>/<poste>.md`) ; `write_ctx` observe aussi la PR sans agent (`observe` : `gh pr checks` au head, `mergeable`, retard sur la base par l'API compare, fichiers de déploiement, de config ou de dépendances touchés) → `.kronn/review-<n>/observation.md` et la section `---OBSERVATION---` du contexte ; l'avis lit ces rapports, `pr.md`, `ticket.md`, `observation.md` et le diff annoté `.kronn/review-<n>/diff.md` (`R<n>` = ligne de la nouvelle version, side RIGHT ; `L<n>` = ligne supprimée, side LEFT), écrits dans la copie de travail du run, jamais le dossier du projet [src: file: workflows/review.py:contexte].

## Skills du Bureau, partagés avec la chaîne

Un savoir-faire, un skill : `skills/*.md` est la source, `templates.BUREAU_SKILLS` les nomme (`grille`, `recherches`, `exigences`, `tests`, `doc`). `publish.py workflows` et `install.py` les publient dans Kronn avant les workflows (`templates.sync_skills` : `POST /skills`, puis `PUT /skills/<id>`), et rangent leurs ids dans `skills.<clé>` de la config ; `skills_of` remplace « `bureau:<clé>` » par cet id dans `REVIEW_AGENTS` et `IMPL_AGENTS`. Pas encore publié : le skill est omis, et `@@skill:<clé>@@` recopie son texte dans le prompt (la grille de l'avis), au lieu d'un simple renvoi [src: file: tools/templates.py:BUREAU_SKILLS]. Pas d'épinglage (`custom-x@N`) : Kronn ne désactive un workflow qu'à la modification d'un skill par un agent (bridge), et le Bureau publie ses skills avec ses workflows. Les versions de la revue et de la chaîne comptent les skills dans leur empreinte.

Liens de la PR (SRV-03) : `write_ctx` ignore un fichier de conventions (`CONV_FILES`) qui passe par un lien symbolique (`lien`, la PR le choisit) et écrit `.review-context.json` sans suivre de lien (`ecrit` : un lien posé par la PR est remplacé par le fichier) [src: file: workflows/review.py:113].

## Relevés à 0 token (`releves.md`)

`write_ctx` écrit `.kronn/review-<n>/releves.md` avec `workflows/_releves.py`, recopié dans le script comme `_lib.py` et partagé avec la chaîne d'implémentation (avec les textes `NON_FIABLE` et `RECHERCHES`) : il part des patches de l'API GitHub et de `git grep` dans le worktree au head (la revue n'a pas l'historique de la base) [src: file: workflows/_releves.py:1].
- Retraits encore référencés : fichiers supprimés et symboles retirés (`noms_retires`), cherchés au head (`references_restantes`, sans `.review-context.json` que la revue pose dans le worktree). Chaque ligne est tranchée (R3).
- Garde-fous des lignes ajoutées : clé de ticket dans un commentaire, en-tête ou clé sensible.
- Tests liés aux fichiers touchés, par le nom (`Foo.php` → `FooTest.php`, `foo.ts` → `foo.test.ts`, `foo.py` → `test_foo.py`), à lire en entier (R9).
- Docs : modifiées par le diff, qui citent un fichier ou un symbole touché, fichiers qu'aucune doc ne cite (poste 📚 docs).
Aussi : `ancres.json` (lignes où GitHub accepte un commentaire inline, par fichier et côté), `precedent.md` (bloquants de la dernière passe postée, P1…, lus dans l'historique), et la conversation de la PR dans `pr.md`.

## La review vérifiée avant d'être postée

`map_event` (`review.py garde`) vérifie la sortie de l'avis par des règles fixes, comme la passe « validate » de PR Review v3.4, et la met en page ; l'avis fournit des champs (`summary`, `blockers`, `ticket`, `positive`, `comments[].gravite`, `traces`, `revus`, `suivi`, `lang`), jamais l'habillage [src: file: workflows/review.py:verifie].
- Ancrages : un commentaire hors des lignes du diff (`ancres.json`) est remonté dans la synthèse (« Aussi », ou les bloquants s'il bloque) au lieu de faire refuser toute la review ; deux commentaires sur une ligne sont fusionnés ; une plage hors du diff est réduite à sa dernière ligne ; un bloc `suggestion` de plusieurs lignes sur une seule devient un exemple.
- Bloquants ancrés : un bloquant de la synthèse dont le dernier renvoi `` `chemin:ligne` `` (chemin complet, ou sa fin s'il ne désigne qu'un fichier du diff) tombe sur une ligne de la nouvelle version reçoit son inline (`🔴` + le bloquant, `ancre_bloquant`), sauf s'il en a déjà un dans ce fichier (#2074 : deux bloquants, aucun inline) ; la grille et l'avis demandent l'inline d'abord.
- Verdict : un bloquant (ou un inline `bloquant`) impose `request_changes` ; `request_changes` sans bloquant devient `comment` ; `approve` devient `comment` avec la CI en échec ou un conflit (`observation.md`), sans trace sur un diff qui touche du code, avec un fichier du diff ni dans `revus` ni dans `skipped`, ou un point de `precedent.md` sans `suivi` corrigé ou réfuté prouvé.
- Chaque réparation va dans `corrections` (historique, compte dans la ligne de la page). La review vérifiée est écrite dans `.kronn/review-<n>/review.json`.

`post` (`review.py poster`, Exec, `external_effect`) la poste par `gh api` avec la signature « Review automatique · Le Bureau (agent - modèle) » ; GitHub refuse-t-il les inline, elle repart sans eux, leur texte dans la synthèse ; refus total : code 9, marqueur `.kronn/echec-<n>`, Goto `skip_note`. Une sortie Exec n'arrive dans une ApiCall que comme texte (seule `PublishPageData` relit un stdout JSON) : c'est pourquoi `post` n'est plus une ApiCall. `gh` et la connexion GitHub de Kronn doivent être le même compte (vérifié avant d'envoyer : sinon `write_ctx` ne reconnaîtrait pas la review au head suivant). `build_row` (`review.py ligne`) sort la ligne `reviews` depuis `review.json` et les états du run ; `publish` écrit `reviews` et `review_meta` (stdout de `post`). `post_fallback` et `meta_row` sont retirés : 18 étapes.

## Historique, version et mode essai

Chaque revue, postée ou non, est gardée dans `review.historique` (`~/.local/share/pixel-bureau/revues/<owner__dépôt>/pr-<n>/`) avec sa version (`templates.review_version` : empreinte des modèles `review*.json`, de `review.py`, `_releves.py` et de la grille, et le dernier commit qui les a touchés), son verdict avant et après vérification, ses corrections, traces et suivi. La passe suivante y lit ses points ouverts (`precedent.md`). `review.essai` (`true`, ou une liste de dépôts) : la revue va jusqu'au bout sans rien poster (`post` sort en 3), gardée dans l'historique pour comparer deux versions ; le shadow de Kronn ne rejoue pas un workflow lancé en foreach avec ses variables.

## Jamais une review vide

PR #2060 d'un dépôt de l'équipe (run `73869a01` de `review_child`, 2026-11-04) : `setup` avait bien créé `.kronn/pr-2060`, les postes avaient rendu leurs rapports, mais l'avis (étape Agent) a cherché ses fichiers dans un autre dossier, vide, et rendu « Impossible de produire la review : les fichiers d'entrée attendus … sont absents du worktree, qui est lui-même vide » ; `map_event` en a fait un COMMENT, `post` l'a publié. Sur #1858 (run `aba40e1d`), le même agent cherchait aussi son dossier : le dossier courant d'un agent n'est pas fiable.

- `setup` pose l'état `root` (`---STATE:root=…---`, chemin absolu de la copie de travail du run) ; le prompt de l'avis donne `{{state.root}}/.kronn/pr-<n>/…` et lui demande, s'il ne trouve pas ses fichiers, de rendre `statut: "echec"` (champ de sa sortie, `ok` sinon) au lieu d'un avis.
- `map_event` est la garde, sans nouvelle étape (20 déjà) : `workflows/review.py garde <pr> <verdict> <is_own>` (stdin : la sortie de l'avis) vérifie que `.kronn/pr-<n>` n'est pas vide, que `.review-context.json` et `diff.md` existent, que l'avis est lisible avec une synthèse, qu'il ne déclare pas d'échec, et qu'un avis sans commentaire inline ne dit pas n'avoir pas trouvé ses fichiers (`SANS_MATIERE` et `SUJET_ENTREES` dans les 600 premiers caractères). Bon : l'action GitHub sur stdout, comme avant. Sinon rien n'est posté : code 7 la première fois (Goto `avis`, `max_iterations: 1`, l'avis est relancé), code 8 ensuite ou quand ce sont les entrées qui manquent (relancer n'y changerait rien) : marqueur `.kronn/vide-<n>` (effacé par `write_ctx` à la revue suivante) et Goto `skip_note`, qui dit « review non postée : avis sans matière (raison) » et finit le run réussi. Essais comptés dans `.kronn/review-<n>/garde.json`.
- Limite : la ligne de la page de récap n'est pas écrite pour une review non postée (rien à lier) : le run Kronn, la sortie de `skip_note` et l'historique le disent.

## Limites de Kronn qui ont fixé la forme

- 20 étapes au plus par workflow (`Too many steps`) : `review_child` en a 18 ; d'où `pr` et `repo` posés en état par `setup` (plus d'étapes `prnum`, `repovar`), le saut au head déjà relu dans `write_ctx`, la passe sécurité qui décide seule de se sauter, les deux datasets de la page écrits par une seule étape `publish` [src: file: workflows/templates/review_child.json:1].
- 5 niveaux de sous-workflows au plus (`MAX_SUBWORKFLOW_DEPTH`) : chaîne → livraison → `impl_revue_pr` → `review_child` → poste = 4.
- `on_result` ne voit que les signaux de Kronn (`OK`, `ERROR`, `exit_N`…), jamais le texte d'une sortie [src: file: tests/test_models.py:test_on_result_rules_only_match_kronn_signals].
- La sortie typée d'une étape Agent ne remonte pas d'un sous-workflow : l'avis reste dans le parent, car `map_event`, `react` et `reply` lisent `steps.avis.data`.

## Contrat avec la page de récap (`review.page_id`)

Ne pas le casser en touchant à la revue [src: file: workflows/templates/review_child.json:publish] :

- Dataset `reviews` : une ligne par revue postée (`build_row` depuis `review.json`), mêmes champs qu'avant le découpage (`pr`, `repo`, `verdict` vérifié, `summary` = la review mise en page, `author`, `base`, `run_at`, `inline` postés, `reactions`, `replies`, `diff_*`, `review_pass`), plus `corrections` et `version`.
- Dataset `review_meta` : la réponse GitHub du POST (stdout de `post`, plus `verdict`) ; la signature « Review automatique · Le Bureau (agent - modèle) » sert aussi à `write_ctx` pour sauter une PR déjà relue à son head.
- Dataset `review_sessions` : une ligne par revue (`workflows/review.py couts`, étape `cost` / `costs`). La page rapproche une ligne de coût par revue (même PR, entre 5 min avant et 60 min après `run_at`) : `couts` regroupe les sessions Claude Code des postes d'une même revue (même dossier, même PR, moins de 20 min d'écart), sous l'id de la première, détail par poste dans `postes`. Chaque prompt de poste commence donc par « Review la PR #<n> (`<repo>`) · poste <poste> ».
- `run_at` est posé par `write_ctx` au départ (UTC, millisecondes, `Z`), pas à l'heure de l'avis : les postes passent avant lui.

## La file de la salle de revue (2e étage)

Le cron relit ses PR l'une après l'autre (foreach séquentiel) ; la salle montre celles qui attendent, sans rien faire apparaître d'un coup [src: file: page/src/68-revue.js:1] :

- Sélection : `finalize` écarte une PR déjà relue par le Bureau à son head, sauf re-demande (le compte de nouveau dans `requested_reviewers` : l'élément porte `rerequest`, et `write_ctx` ne saute pas) ; avec `review.demandees`, il ne garde que les PR où le compte ou une de `review.equipes` (slug, `org/slug` accepté) est demandé, ou déjà relues par lui (nouveau commit). `prefilter` garde `reviewers` et `teams` de chaque PR [src: file: workflows/templates/review_cron.json:finalize].
- `finalize` du cron garde six PR au plus par passage (`kept=keep[:6]`, le reliquat dans « reporte n ») : les revues sont séquentielles, 10 à 25 min chacune, et le run s'arrête à 2 h (`Timeout guard`, le 2026-11-04 avec 9 PR). Il imprime `PRS=[[repo, n°, auteur], …]`, dans l'ordre du cron (jamais regroupé par auteur) ; `workflows/redaction_snapshot.py` en tire `revue.batches` (par passage du cron, 24 h) et `revue.verdicts` (verdict de l'avis de chaque revue finie), un run fini lu une fois (`~/.cache/pixel-bureau/revue/`) [src: file: workflows/redaction_snapshot.py:revue].
- La page compare l'état voulu à l'heure T (`rvfState` : PR au casier, PR lue, revues finies) à ce qu'elle a déjà posé (`RVF_M`), comme la caserne : Bernard et son transpalette pour une nouvelle fournée (il vide la corbeille « Postées » du passage d'avant), le relecteur qui tamponne, pose à la corbeille et prend le dossier suivant, les auteurs (une personne par auteur) qui restent au bureau si leur PR suivante est la prochaine, retournent s'asseoir sinon, et redescendent après leur dernière. Six cases au casier, puis « +n ». En arrivant à l'étage, après un saut du curseur de plus de 2 min ou avec REDUCED_MOTION, tout est posé.
- Le premier bureau est celui de la file (`rvfDesk`) ; les revues à la demande prennent les cinq autres. Config de la page : `CFG.revue_cron_wf`.

## Ailleurs

- 2e étage : la salle de revue montre les postes et l'avis sous chaque bureau (`RV_STEP` de `page/src/68-redaction.js`) ; les runs des postes (`CFG.revue_postes_wf`) ne passent pas au RDC [src: file: page/src/68-redaction.js:RV_STEP].
- Bilan de la chaîne : les jetons des postes comptent avec la revue de la PR (`REVUE` de `workflows/chaine_bilan.py`).

Tests : `tests/test_review.py` (script, relevés, vérification, envoi, historique, sélection du cron), `tests/test_models.py` (rendu, niveaux, 20 étapes), `tests/redaction.test.js` (salle), `tests/test_chaine_bilan.py`.
- Les consignes des postes (`review.py poste`) donnent des chemins absolus : avec `.kronn/pr-<n>` en relatif, un agent reconstruisait parfois le chemin sous le dossier du projet (où rien n'existe) et rendait un rapport vide, quel que soit le modèle [src: file: workflows/review.py:186].
