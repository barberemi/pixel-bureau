# Rejeu d'un ticket livré (Palpatine, lot 1)

> Modèles `rejeu` (lanceur) et `impl_rejeu` (la chaîne sans gate, dérivée d'`impl_chain` au chargement, sans fichier), script `workflows/rejeu.py`, consigne du juge `tools/rejeu_juge.md`, réglage `rejeu`. Lot 1 : rien dans la page, le bouton de Palpatine viendra après ses maquettes. Relevé le 2026-11-27.

## But

Refaire avec la chaîne d'implémentation un ticket dont la PR est déjà mergée, depuis le commit d'avant cette PR, puis comparer son travail à la vraie PR. La cible est 80 sur 100. Ce qu'on en apprend nourrira la mémoire du soir dans un lot suivant ([memoire](memoire.md)). Le rejeu réutilise le mode essai et la variable `base` de la chaîne, qui savaient déjà rejouer un ticket sans fuite du futur ([chaine-implementation](chaine-implementation.md), « Rejouer un ticket déjà livré ») [src: file: workflows/chaine.py:cmd_prepare].

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
- Jeu `rotation` : parmi les 200 dernières PR mergées du dépôt, celles qui ont une clé de ticket, ne sont pas écartées par le titre (`#autocode`, dépendances, CI, traductions), font entre `lignes` ajoutées + retirées (20 à 600 par défaut) et au plus `fichiers` fichiers (30), touchent du code et des tests, ne sont pas du jeu témoin et n'ont pas été jouées depuis `pause_jours` (60). On garde le genre (premier mot du titre : fix, feat…), puis le coin du code (deux premiers dossiers parlants), les moins joués, et la plus récente à égalité.
- Refus : PR non mergée, sans clé de ticket, rejeu déjà actif sur ce ticket (ou un run pas encore préparé), dépôt sans projet Kronn.
- La demande (`<dossier>/demandes/<ticket>.json` : PR, merge, base, jeu, genre, zone) relie le run à sa PR. La note la refuse si sa `base` n'est pas le `depart` du run.

## La note (`note`, `juge`, `range`)

`note` (0 token, 1 800 s au plus) tourne dans la copie de travail du run, sur la branche `kronn/<ticket>` :

- **Fichiers** : fichiers de code (`_chaine.sorte`) de la vraie PR (`depart..merge`) contre ceux de la chaîne (`depart..HEAD`, sans `.kronn`) : rappel, précision, F1, fichiers manquants et en plus.
- **Lignes** : lignes ajoutées et retirées des fichiers de code, blancs ignorés, coefficient de Dice.
- **Tests** : les fichiers de test de la vraie PR, tels qu'au merge, sont posés sur le code de la chaîne, puis lancés par les commandes du dépôt (`impl.repos.<dépôt>.checks.tests`, `check_fill`), puis retirés (`git checkout HEAD`, ou supprimés s'ils étaient nouveaux). Rouge : relance fichier par fichier tant qu'il reste du budget (`BUDGET`, 1 500 s), le ratio est celui des fichiers verts. Aucune commande ne prend ces fichiers : « non mesuré ».
- Les diffs vont au juge par fichiers (`rejeu_reference.diff`, `rejeu_chaine.diff`, `rejeu_tests.txt` dans `.kronn/chaine/`), pas par la sortie de l'étape : un template Twig y met des `{{ }}` que Kronn prendrait pour ses variables. La sortie, elle, voit ses `{{` cassés.

`juge` (Agent, rôle `juge`, `tier: reasoning`, outils Read, Grep et Glob seulement) lit le ticket et les diffs et rend `score`, `approche`, `echecs_tests` (nommage, comportement, environnement, aucun), `ecarts` avec une `cause` (`ticket_vague` pour la rédaction, `choix_agent` pour la chaîne, `convention`, `acceptable`) et une `lecon` générale, et `resume`.

`range` (0 token) calcule la note sur 100 : tests 0,5, fichiers 0,2, lignes 0,1, juge 0,2 (`POIDS`). Une part non mesurée est retirée et les poids sont rapportés au reste. 80 ou plus : cible atteinte. Il écrit `<dossier>/<ticket>/<run>.json` (note, parts, juge, version de la chaîne lue dans son bilan) et `<dossier>/joues.json` (par PR : date, note, genre, zone, jeu), qui sert à la rotation. Dossier : `rejeu.dossier`, `~/.local/share/pixel-bureau/rejeu` par défaut [src: file: workflows/rejeu.py:cmd_range].

## Réglage `rejeu` (pack ou config)

`depot` (sinon le premier de `impl.repos`), `temoin` (numéros de PR), `lignes` ([min, max]), `fichiers`, `exclus` (motif des titres écartés), `pause_jours`, `dossier`. `rejeu.py` reçoit la part de la config de la chaîne plus `rejeu` (`templates.PART_CHAINE`).

## Limites connues

- Les runs d'`impl_rejeu` ne se voient pas à l'atelier : il ne lit que `models.impl_chain` (`atelier_chain`). `atelier_wf` les retire des runs du RDC.
- Les dépendances liées sont celles du checkout principal d'aujourd'hui, pas celles de la base rejouée (même limite que l'essai rejoué).
- Un test de la vraie PR qui appelle un nom que la chaîne a choisi autrement échoue : le juge le classe `nommage`.
- Rien n'alimente encore la mémoire du soir, et rien n'apparaît dans la page (lots suivants).

## Tests

`tests/test_rejeu.py` : la variante (sans gate, renvois vers la note, mêmes postes que la chaîne, rendu), la note et le rangement dans un dépôt git jetable (fichiers, tests posés puis retirés, rouges, non mesurés, sans demande), le choix d'une PR avec un faux `gh` (témoin, filtres et variété de la rotation, pause).
