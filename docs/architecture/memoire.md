# Mémoire du soir : l'amélioration continue des agents

Chaque soir, les retours humains du jour deviennent des leçons courtes que les agents lisent à leur run suivant. Le boss valide chaque changement à une gate. Le but n'est pas d'accumuler : une fiche courte et juste, réécrite (fusion, oubli) plutôt qu'allongée [src: file: tools/memoire_prompt.md:1]. Relevé le 2026-11-25.

## Trois niveaux

| Niveau | Où | Qui l'écrit | Taille |
|---|---|---|---|
| Journal (faits bruts) | `<memoire.dossier>/journal/<date>.jsonl` | `workflows/memoire.py releve`, 0 token | 60 jours gardés (`JOURNAL_JOURS`) [src: file: workflows/memoire.py:22] |
| Mémoire (leçons) | `<memoire.dossier>/{equipe,ticket,impl,revue,correction}.md` | l'agent `consolide`, après ta gate | 25 leçons pour `equipe`, 40 pour les autres, 400 caractères par leçon [src: file: workflows/memoire.py:25] |
| Règles du dépôt | `docs/`, skills, consignes du pack | toi, en PR, sur proposition de l'agent (« À graver dans le dépôt ») | stable |

`memoire.dossier` vaut `~/.local/share/pixel-bureau/memoire` par défaut (durable, comme les historiques) [src: file: workflows/_memoire.py:20].

## Le cron (`workflows/templates/memoire.json`)

```
releve (Exec, 0 token) ── code 3 : rien de nouveau ──────────────────────────┐
consolide (Agent, tier reasoning, sans outils)                               │
propose (Exec, 0 token) ── code 3 : rien à changer ──────────────────────────┤
boss (Gate) ── Changements : retour à consolide avec ton message              │
applique (Exec, 0 token)                                                     │
fin (Exec) ◄─────────────────────────────────────────────────────────────────┘
```

- Heure : `memoire.heure` (défaut 22, heure du bureau). Les crons du Bureau sont en UTC (`pin_tz`) : le modèle tourne aux deux heures UTC possibles (`@@memoire.heures@@` = `assemble.local_hour_utc`, « 20,21 » à Paris) et `releve` arrête le passage de la minute 0 qui ne tombe pas à l'heure voulue (code 3). Un lancement à la main, à une autre minute, passe toujours [src: file: workflows/memoire.py:205] [src: file: tools/assemble.py:173].
- `releve` lit ce que les workflows gardent déjà, sans leur demander de jetons : tes retours au tampon de la rédaction (historique de `ticket.py`, champ `retours`), tes retours aux gates de la chaîne (`retours.md` des dossiers en cache, un par texte ; un dossier en essai est écarté), les bloquants d'une revue que la passe suivante a réfutés avec leur preuve (historique des revues), ton message « Changements » à la gate de « corriger » (`retour_humain` dans l'état du run, écrit par `pr_update.py fix_abort` depuis `{{state.last_human_feedback}}`) [src: file: workflows/memoire.py:73] [src: file: workflows/pr_update.py:879].
- Un fait n'entre qu'une fois au journal (id stable). Le dossier de l'agent : les faits nouveaux, ceux déjà vus des 30 derniers jours (pour voir ce qui revient), les fiches actuelles avec leur limite.
- `propose` ne garde que des fiches connues et allumées, ramène chaque fiche à son format (un titre, une leçon par ligne « - … », doublons retirés, limites), écrit `proposition.json` et le message de la gate : en première ligne le compte (« 🧠 **Mémoire du soir** · 3 leçons à valider, 1 retirée : … », lignes `+- ` et `-- ` des diffs, une leçon reformulée compte dans les deux ; la page peut le lire dans le message de la gate), un diff par fiche, les promotions, les remarques [src: file: workflows/memoire.py:275].
- `applique` réécrit les fiches, garde les précédentes dans `versions/<horodatage>/` (30 validations au plus) [src: file: workflows/memoire.py:322].
- La gate attend jusqu'à 72 h (`guards.timeout_seconds`) : Kronn coupe un run au bout de 2 h par défaut, la proposition de 22 h serait perdue avant le matin, et celle du vendredi soir doit tenir jusqu'au lundi. `concurrency_limit` 1 : tant qu'une gate est ouverte, le soir suivant ne lance pas de second run ; les retours qu'il aurait relevés le sont au passage d'après (rien n'entre au journal sans relevé).
- La gate s'affiche sur la page comme toute gate (relevé `gates_snapshot.py`, tous les workflows actifs qui ont une étape Gate) [src: file: workflows/gates_snapshot.py:40].

## Qui lit quoi (`workflows/_memoire.py`)

Recopié au rendu dans les scripts qui l'importent (`LIB_IMPORT` de `tools/templates.py`). `memoire_texte(workflow, poste)` rend la fiche commune puis celle du workflow, au plus `MEM_MAX` caractères (coupé à une leçon entière) ; une ligne `- [poste] …` ne va qu'à ce poste ; sans poste, toutes les lignes [src: file: workflows/_memoire.py:41].

| Workflow | Où la mémoire entre | Poste |
|---|---|---|
| ticket | `ticket.py poste` : section « Mémoire de l'équipe », à la place des retours bruts de `lecons()` (gardés tant que la fiche est vide) | recherche, redaction, critique [src: file: workflows/ticket.py:747] |
| impl | `chaine.py entree`, après les retours de l'humain ; pour les contrôles en parallèle, `chaine_controles.py missions` (contexte commun : les leçons sans poste, et celles des seuls contrôles lancés) | le poste de l'entrée (cadrage, code, tests, livraison) ; règles, sécurité, perf, besoin, doc [src: file: workflows/chaine.py:431] [src: file: workflows/chaine_controles.py:memoire_controles] |
| revue | `review.py poste` (contexte, docs, lecture, securite) ; l'avis la lit dans `.review-context.json`, section `---MEMOIRE---` | le poste ; `avis` [src: file: workflows/review.py:304] |
| correction | `pr_update.py fix_prepare`, fin de la sortie (prompt de l'agent fix, et du poste 💬 retours de la chaîne) | aucun : toute la fiche [src: file: workflows/pr_update.py:560] |

## Le marchand de sable (`page/src/49-marchand.js`)

Invité commun (`team/guests.json`, `on: "memoire"`), planche `sprites/common/marchand/` (recette `marchand` de `sprites/heralds.py` : calques LPC, écharpe dessinée par `echarpe()`) ; son ours et son nuage sont des cartes de pixels dessinées par la page (`SAND_BEAR`, `SAND_CLOUD`) [src: file: page/src/49-marchand.js:1].

- `sandmanState` : présent tant qu'une gate du workflow `Le Bureau · mémoire du soir` est ouverte (`GATES`, relevé `gates_snapshot.py`), sinon `off` avec `cloud: true` (il repart par la porte sur son nuage, l'ours avec lui : sans `cloud`, il en descendait et repartait à pied, seul). Une halte par îlot (`sandStops`, en haut de l'îlot, au bout de sa table ; sinon à côté de la place du milieu ; en commençant par le bout le plus proche de la porte, `EXIT`, sinon la loupe figeait la scène le temps de sa traversée), dessiné devant tout (tri de profondeur de `41-render.js`), `SAND_STOP` (90 s) chacune, en boucle. État `gate`, `cloud: true` (de face au repos même en route, `frameFor` : c'est le nuage qui avance ; dessiné `SAND_LIFT` px plus haut, l'ours et le nuage par `drawSandman`, appelé par `drawChar`), bulle « 🧠 N leçons à valider » avec `hot` (le morceau en rouge, `drawOverlay`).
- Le nombre : `sandLessons`, lu dans la première ligne du message de la gate (`propose`, ci-dessus).
- La gate est la sienne : `c.wf` et `run` (sa carte dans sa fiche), `sandmanOwns` dans `loneGates` (jamais orpheline chez le boss), comme `postmanOwns` du facteur [src: file: page/src/55-actions.js:121].
- 🧠 : icône pixel de `PIX_ICONS` (46-icones.js), dessinée à la place de l'emoji dans toute toile. Galerie (`SCENE_DEMO.flag = 'memoire'`), loupe (`loupeKind` : `sand`), fil (`feedLifeEvents`), légende du RDC (Invités), capture `marchand` de `tools/shots.py`.

## Réglage `memoire` (`bureau.config.json`)

`actif` (false : ni relevé ni lecture, cron pas créé), `workflows` (ceux qui lisent leur fiche et dont les retours sont relevés ; défaut les quatre), `dossier`, `heure`. Propre à chaque installation : pas dans le pack (`assemble.merged` ne le fusionne pas). Les scripts de la chaîne et de la revue ne reçoivent qu'une part de la config : `memoire` est dans `CHAINE_CFG` et `REVIEW_CFG` [src: file: tools/templates.py:294].

## Limites et pièges

- `chaine.py` rendu est proche de la limite d'un argument (128 Kio) : `_memoire.py` reste court, sa doc est en commentaires (retirés au rendu) [src: file: tools/templates.py:296].
- Rien n'est appris d'un retour qui n'est gardé nulle part : un « Rejeter » sans « Changements » à la gate de « corriger », une remarque faite hors Kronn.
- L'agent ne voit que des textes : il peut généraliser à tort. La gate est le garde-fou ; un mauvais apprentissage se défait en rejetant, ou en remettant une fiche de `versions/`.
- Mesurer l'effet : « Chaîne · bilan », « Rédaction · bilan » et « Retours · bilan » classent déjà les retours par cause ; une cause qui ne baisse pas après une leçon dit qu'elle ne sert pas.
