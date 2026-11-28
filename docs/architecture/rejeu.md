# Rejeu d'un ticket livré (Palpatine, lot 1)

> Modèles `rejeu` (lanceur) et `impl_rejeu` (la chaîne sans gate, dérivée d'`impl_chain` au chargement, sans fichier), script `workflows/rejeu.py`, consigne du juge `tools/rejeu_juge.md`, réglage `rejeu`. Dans la page : Palpatine (`page/src/49-palpatine.js`), à la salle des serveurs du RDC, lancé à la main (lot 2). Relevé le 2026-11-27.

## But

Refaire avec la chaîne d'implémentation un ticket dont la PR est déjà mergée, depuis le commit d'avant cette PR, puis comparer son travail à la vraie PR. La cible est 80 sur 100. Ce qu'on en apprend nourrit la mémoire du soir ([memoire](memoire.md)). Le rejeu réutilise le mode essai et la variable `base` de la chaîne, qui savaient déjà rejouer un ticket sans fuite du futur ([chaine-implementation](chaine-implementation.md), « Rejouer un ticket déjà livré ») [src: file: workflows/chaine.py:cmd_prepare].

## Forme

```
rejeu (lanceur, 0 token)      jeu (rotation | temoin), cas (n° de PR ou clé de ticket, facultatif)
  lance                         choisit la PR, base = premier parent du merge, demande rangée,
                                POST /mcp/workflow-trigger vers impl_rejeu (mode essai, reprise non, base)
└─ impl_rejeu (16 étapes, concurrency_limit 1, require_isolation)
   ticket · prepare · cadrage · compris · dossier · orchestrateur_plan · mode · code · controles
   · orchestrateur · aiguillage · fin_essai · note · juge · range (Stop) · rattrape
```

`rejeu_template` (`tools/templates.py`) fait `impl_rejeu` depuis `impl_chain` à chaque chargement (`DERIVES`), il suit donc ses changements [src: file: tools/templates.py:rejeu_template] :

- Étapes retirées (`REJEU_RETIRES`) : les trois gates (personne ne tranche), `livraison`, `recap`, `publication` et `commente_plan` (rien à livrer : pas de PR, pas de revue locale, donc moins cher).
- Un Goto vers une étape retirée va à `note`, par exemple « livrer » de l'aiguillage.
- `fin_essai` (escalade) n'a plus de Stop : un rejeu escaladé est noté aussi (`escalade` dans la note).
- Le mode ne propose que `essai`.
- `templates.py export` saute les modèles dérivés.

Le lanceur et la variante s'installent avec la chaîne (`install.with_posts` : `impl` amène `impl_*` et `rejeu`). Sans Jira, ils ne sont pas créés (`skipped`) [src: file: tools/install.py:with_posts].

## Choisir une PR (`rejeu.py lance`)

- `cas` donné : la PR par son numéro, ou la PR mergée dont le titre ou la branche porte la clé de ticket.
- Jeu `temoin` : la PR de `rejeu.temoin` jouée le moins récemment (jamais jouée d'abord). Le jeu témoin sert à mesurer et n'est jamais source de leçons.
- Jeu `rotation` : parmi les 200 dernières PR mergées du dépôt, celles qui ont une clé de ticket, ne sont pas écartées par le titre (`#autocode`, dépendances, CI, traductions), font entre `lignes` ajoutées + retirées (20 à 600 par défaut) et au plus `fichiers` fichiers (30), touchent du code et des tests, ne sont pas du jeu témoin, n'ont pas été jouées depuis `pause_jours` (60) et ne sont pas déjà demandées (demande de moins d'un jour, pas encore notée : `demandees`, car `joues.json` ne s'écrit qu'à la fin du run). On garde le genre (premier mot du titre : fix, feat…), puis le coin du code (deux premiers dossiers parlants), les moins joués, et la plus récente à égalité.
- Refus : PR non mergée, sans clé de ticket, rejeu déjà actif ou en file sur ce ticket, dépôt sans projet Kronn, ou Kronn qui ne rend pas de run (la demande est alors retirée). Un rejeu d'un autre ticket passe, en file derrière celui qui tourne (`concurrency_limit 1`).
- La demande (`<dossier>/demandes/<ticket>.json` : PR, merge, base, jeu, genre, zone) relie le run à sa PR. La note la refuse si sa `base` n'est pas le `depart` du run.

## La note (`note`, `juge`, `range`)

`note` (0 token, 1 800 s au plus) tourne dans la copie de travail du run, sur la branche `kronn/<ticket>` :

- **Fichiers** : fichiers de code (`_chaine.sorte`) de la vraie PR (`depart..merge`) contre ceux de la chaîne (`depart..HEAD`, sans `.kronn`) : rappel, précision, F1, fichiers manquants et en plus.
- **Lignes** : lignes ajoutées et retirées des fichiers de code, blancs ignorés, coefficient de Dice.
- **Tests** : les fichiers de test de la vraie PR, tels qu'au merge, sont posés sur le code de la chaîne, puis lancés par les commandes du dépôt (`impl.repos.<dépôt>.checks.tests`, `check_fill`), puis retirés (`git checkout HEAD`, ou supprimés s'ils étaient nouveaux). Seuls comptent les fichiers qu'une commande lance : une fixture, un mock, une config de test ou une classe de base est posé mais hors du ratio (`support`). Rouge : relance fichier par fichier tant qu'il reste du budget (`BUDGET`, 1 500 s), le ratio est celui des fichiers verts. Contre-épreuve (`rouges_partout`) : les fichiers rouges sont relancés sur la vraie PR, son merge dans une copie à part (`.kronn/chaine/reference`, retirée après), mêmes dépendances et mêmes commandes ; rouges là aussi, c'est l'environnement de test, ils sortent du ratio (`environnement`). Aucune commande ne prend ces fichiers, ou tous rouges des deux côtés : « non mesuré ».
- Les diffs vont au juge par fichiers (`rejeu_reference.diff`, `rejeu_chaine.diff`, `rejeu_tests.txt` dans `.kronn/chaine/`), pas par la sortie de l'étape : un template Twig y met des `{{ }}` que Kronn prendrait pour ses variables. La sortie, elle, voit ses `{{` cassés.

`juge` (Agent, rôle `juge`, `tier: reasoning`, outils Read, Grep et Glob seulement) lit le ticket et les diffs et rend `score`, `approche`, `echecs_tests` (nommage, comportement, environnement, aucun), `ecarts` avec une `cause` (`ticket_vague` pour la rédaction, `choix_agent` pour la chaîne, `convention`, `acceptable`) et une `lecon` générale, et `resume`.

`range` (0 token) calcule la note sur 100 : tests 0,5, fichiers 0,2, lignes 0,1, juge 0,2 (`POIDS`). Une part non mesurée est retirée et les poids sont rapportés au reste. 80 ou plus : cible atteinte. Il écrit `<dossier>/<ticket>/<run>.json` (note, parts, juge, version de la chaîne lue dans son bilan) et `<dossier>/joues.json` (par PR : date, note, genre, zone, jeu), qui sert à la rotation. Dossier : `rejeu.dossier`, `~/.local/share/pixel-bureau/rejeu` par défaut [src: file: workflows/rejeu.py:cmd_range].

## Réglage `rejeu` (pack ou config)

`depot` (sinon le premier de `impl.repos`), `temoin` (numéros de PR), `lignes` ([min, max]), `fichiers`, `exclus` (motif des titres écartés), `pause_jours`, `dossier`. `rejeu.py` reçoit la part de la config de la chaîne plus `rejeu` (`templates.PART_CHAINE`).

## Limites connues

- Les runs d'`impl_rejeu` ne se voient pas à l'atelier : il ne lit que `models.impl_chain` (`atelier_chain`). `atelier_wf` les retire des runs du RDC ; Palpatine les lit dans `AT_RUNS` par `CFG.rejeu_wf` (préfixe de `models.impl_rejeu`).
- Les dépendances liées sont celles du checkout principal d'aujourd'hui, pas celles de la base rejouée (même limite que l'essai rejoué). La contre-épreuve sort de la note les tests que cela casse, mais la chaîne les voit encore rouges à ses contrôles.
- Un test de la vraie PR qui appelle un nom que la chaîne a choisi autrement échoue : le juge le classe `nommage`.
- Le rejeu nourrit la mémoire du soir : ses écarts (hors jeu témoin, sans `acceptable`) entrent au relevé ; `ticket_vague` va à la proposition classique, `choix_agent` et `convention` à une seconde gate (`boss_rejeu`) puis à la fiche `impl`, rangées dans `<dossier>/lecons.json` ([memoire](memoire.md), « Le rejeu qui apprend »). Un « Rejeter » de la première gate arrête le run (Kronn) : ces leçons reviennent au relevé suivant.

## Tests

`tests/test_rejeu.py` : la variante (sans gate, renvois vers la note, mêmes postes que la chaîne, rendu), la note et le rangement dans un dépôt git jetable (fichiers, tests posés puis retirés, rouges, non mesurés, sans demande), le choix d'une PR avec un faux `gh` (témoin, filtres et variété de la rotation, pause).

## Bilan : page « Rejeu · bilan » et résumé de la fiche

Cron `rejeu_bilan` (0 token, `47 @@cron_hours@@ * * 1-5`, comme le bilan des revues : toutes les heures, en semaine aux heures du bureau), script `workflows/rejeu_bilan.py`, page à part `page/rejeu-bilan.html` (`rejeu_bilan_page_id`, `templates.SIDE_PAGES`). La page et le cron s'installent avec le rejeu : `install.side_pages` crée la page quand `rejeu` est choisi (il vient avec `impl`, `install.with_posts`), `templates.skipped("rejeu_bilan")` sans `models.rejeu` ou sans page [src: file: tools/templates.py:skipped].

- `releve` : les runs finis d'`impl_rejeu` (`models.impl_rejeu`), durée (`started_at` à `finished_at`) et coût de Kronn (`agent_provenance.attempts[].cost_usd` des étapes Agent du run et de ses sous-runs par `parent_run_id`, postes `impl_*` et `review_*`, trois niveaux) ; un run fini lu une fois (`~/.cache/pixel-bureau/rejeu_bilan/<run>.json`). Puis `lecons.json` : si `a_valider.run` est encore actif dans Kronn (`workflows.memoire`, statut dans `ACTIVE`), noté dans `_releve.json` (`a_valider_run`, `a_valider_actif`).
- `bilan` (dataset `rejeu_bilan`) : les rejeux `<dossier>/<ticket>/<run>.json` des 90 derniers jours (200 au plus, sortie sous 90 Ko), la version de la chaîne en service (`impl_version`, injectée dans ce script comme dans ceux de la chaîne, `templates.script_code`), `versions` (jeu témoin par version, dans l'ordre d'apparition : moyenne de la dernière note de chaque PR témoin, `lecons` = leçons du rejeu validées entre la version d'avant et celle-ci), `temoins` (les 6 derniers passages de chaque PR témoin), `lecons`, `resume`, `kpi`. Une version est l'empreinte `hash` de `impl_version` (gardée par `range` dans chaque rejeu).
- `resume` (dataset `rejeu_resume` de la page du Bureau, `install.DATASETS`) : `{date, temoin: {moyenne, ecart, version, version_prec, n} | null, dernier: {ticket, pr, note, cible, fini_le} | null, lecons: {a_valider, validees}}`. Moyenne et écart arrondis au demi supérieur. La page le lit par `readRejeuSum` (`REJEU_SUM`, `page/src/90-boot.js`), null sans dataset.
- Leçons : `<dossier>/lecons.json` (`a_valider` : la proposition de la mémoire du soir, `validees` : celles passées à la gate, avec `le`), écrit par la mémoire du soir ([memoire](memoire.md)) ; absent : 0 et 0. `a_valider` ne compte que si son run de la mémoire attend encore.
- Écarts par cause (page) : hors jeu témoin, comme la mémoire du soir.
- Tests : `tests/test_rejeu_bilan.py` (relevé bouchonné, bilan, versions et ⚡, résumé, borne, modèle et installation), `tests/rejeu-bilan-page.test.js` (page), `tests/rejeu-resume.test.js` (lecture côté page). Capture : `tools/shots.py rejeu-bilan` (`SIDE_SHOTS`, données de démo `data/rejeu_bilan.json`, équipe fictive).

## Dans la page : Palpatine (lot 2)

- **Qui** : l'agent de `team/agents.json` au `model: "rejeu"` (Palpatine, sprite `palpatine`), rattaché au lanceur ; `palpIs` le reconnaît par `CFG.action_wf.rejeu`, pas par son nom (un pack peut le remplacer) [src: file: page/src/49-palpatine.js:palpIs].
- **Où** : toujours à la salle des serveurs (`spots.srv` du plan, la case la plus à droite) ; la baie visée est la plus à gauche (`FURN_AT.server_rack`), la salle est la pièce de `light_rooms` qui contient sa case [src: file: page/src/49-palpatine.js:palpPlace].
- **État** : `palpState` (accroché dans `stateAt`, 35-state.js) lit le run `impl_rejeu` actif dans `AT_RUNS` ; bulle = étape (`atStepName`) ; fini : la note 5 min (`run.res`) ; en panne : l'étape en échec.
- **La note** : `_lib.run_res` relit la sortie de l'étape `range` des runs réussis d'`impl_rejeu` (`rejeu_res` : ticket, PR, note, cible, parts en %) [src: file: workflows/_lib.py:rejeu_res]. Garder le format de la sortie de `cmd_range` (testé dans `tests/test_rejeu.py`).
- **Sa fiche** : `palpBlock` (accroché dans `drawSide`, 50-panel.js) : « Maintenant » (`palpMoment`), la dernière note (`palpLast` : le dernier run réussi d'`AT_RUNS` avec `run.res`, sinon `REJEU_SUM.dernier` s'il est plus récent) avec un tag « cible » / « sous 80 », le tag « ⚡ N leçons à valider ce soir » (`palpLessons` : `sandRejeuLessons()` de 49-marchand.js, la gate `boss_rejeu` ouverte, sinon `REJEU_SUM.lecons.a_valider`), le bouton. Pas de liste des rejeux ni de parts : elles sont dans le bilan. Le bloc TÉMOIN (`palpTemoin`) se pose dans l'en-tête de la fiche (`.face`, à gauche du ✎) : `REJEU_SUM.temoin.moyenne`, la pastille d'écart (▲ vert si `ecart` ≥ 1, ▼ rouge si ≤ -1, « = 0 » gris sinon, aucune sans `version_prec`), le title « Moyenne du jeu témoin : 74, +6 depuis la version <version_prec> » (empreinte courte de la chaîne). Sans dataset `rejeu_resume` ou sans `temoin` : pas de bloc [src: file: page/src/49-palpatine.js:palpBlock].
- **Lancer** : blocs `bureau-rejeu` (sa fiche, `jeu` et `cas` saisis) et `bureau-rejeu-ticket` (fiche d'un ticket terminé, `cas` lié au ticket), clé `rejeu` (`MODEL_ACTIONS`).
- **Dessin** : `palpDraw` (accroché dans `drawChar`) dessine la salle (pénombre, flash, arcs, étincelles, fumée, alarme) et ses images de lancer (`SPR.palpatine_cast`, `sprites/common/palpatine/palpatine-cast.png` ; mains : `PALP_HANDS` = `palpatine-cast.json`).
- **Tests** : `tests/palpatine.test.js` ; capture de la fiche : `tools/shots.py fiche-palpatine` (`REJEU_SUM` de démo).
