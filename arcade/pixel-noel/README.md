# Pixel Noël, la rétro de l'année

La variante de Noël de [Sprint Quest](../sprint-quest/README.md) : même moteur et mêmes persos, mais une partie nourrie par toute l'année au lieu d'un sprint. Un artefact claude.ai à part, que l'équipe ouvre en décembre ; ce dossier en garde la source, pour le republier tel quel ou le modifier.

| Fichier | Rôle |
|---|---|
| `index.html` | la page du jeu, sans `<!doctype>`, `<head>` ni `<body>` (la publication les ajoute) |
| `capabilities.json` | les capacités de l'artefact : base partagée et ses règles d'accès (`db`), présence des joueurs (`room`), noms claude.ai (`user`) |

`@@ARTIFACT_URL@@`, dans `index.html`, prend à la publication l'adresse de l'artefact : la demande « Préparer avec Claude » la cite.

## La partie

Seize écrans menés par l'hôte : l'écran titre sous la neige, le choix du perso (à la souris ou aux flèches du clavier, bonnet compris, la couronne du champion se pose dessus), le sapin à décorer (chacun accroche sa boule, le dernier paie le café), le calendrier de l'année (une case par mois, ouverte en grand avec les titres des tickets), le quiz, le traîneau de l'IA, la hotte des cadeaux impossibles (chaque cadeau est voté : jamais sans IA, un jour, oui), un boss par membre, le Père Noël en trois phases jusqu'à Claus-9000, les trophées (avec un bouton pour applaudir), puis les cartes secrètes (Cadeaux, Charbon, Vœux 2027), le vote Pac-Man, la taverne des vœux, la cheminée (on s'y lance des cadeaux) et le récap, où le traîneau passe.

**Les combats.** Chaque boss et chaque phase du Père Noël a ses points de vie et un nombre de coups prévu (`hp`, `hits`) : les dégâts de chaque coup sont tirés d'avance, un peu au hasard, pour que le dernier coup prévu tombe pile sur zéro. L'écran montre les points de vie, jamais le nombre de coups. Le boss d'un membre ne se tape que par ce membre (l'hôte le remplace s'il est absent) ; au Père Noël, tout le monde tape. Un boss `crit` affiche des coups critiques ; une clé dans `weak` ne fait qu'un point de dégât par coup. Le panneau montre les dégâts de chacun ; l'hôte garde le combat dans `live/state`.

## Les données de l'année

| Document | Contenu | D'où il vient |
|---|---|---|
| `year/data` | le calendrier, le quiz, le traîneau, les cadeaux, les boss, le Père Noël, les fiches et les trophées de chacun | Claude le prépare depuis Jira et GitHub et l'écrit (`ArtifactData`), après validation des boss par l'hôte ; l'écran titre accepte aussi de le recoller |
| `team/roster` | l'équipe et ses persos, au format de Sprint Quest (`sprintquest.json` du pack), stats rigolotes comprises | écrit avec `year/data` |
| `live/state`, `players`, `secret`, `revealed`, `quests` | la partie en cours | perdus avec l'artefact ; le récap se garde par « Copier le mail » |

Le format de `year/data` est décrit dans `snapshotRequest()` et vérifié par `checkYear()`. Les données réelles ne vont jamais dans le dépôt : elles nomment l'équipe.

## Republier

Seul Claude publie un artefact. Dans Claude Code, à la racine du dépôt : « republie Pixel Noël » (skill `.claude/skills/pixel-noel/`). Toujours modifier le jeu ici, puis republier.
