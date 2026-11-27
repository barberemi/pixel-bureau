# Pixel Noël, la rétro de l'année

La variante de Noël de [Sprint Quest](../sprint-quest/README.md) : même moteur et mêmes persos, mais une partie nourrie par toute l'année au lieu d'un sprint. Un artefact claude.ai à part, que l'équipe ouvre en décembre ; ce dossier en garde la source, pour le republier tel quel ou le modifier.

| Fichier | Rôle |
|---|---|
| `index.html` | la page du jeu, sans `<!doctype>`, `<head>` ni `<body>` (la publication les ajoute) |
| `capabilities.json` | les capacités de l'artefact : base partagée et ses règles d'accès (`db`), présence des joueurs (`room`), noms claude.ai (`user`) |

`@@ARTIFACT_URL@@`, dans `index.html`, prend à la publication l'adresse de l'artefact : la demande « Préparer avec Claude » la cite.

## La partie

Quinze écrans menés par l'hôte : l'écran titre sous la neige, le choix du perso (avec bonnet), le calendrier de l'année (une case par mois), le quiz, le traîneau de l'IA (les points par sprint avant et après son arrivée), la hotte des cadeaux impossibles (chaque cadeau est voté : jamais sans IA, un jour, pareil sans), un boss par membre (le membre devant, l'équipe juste derrière, tout le monde tape), le Père Noël en trois phases (la hotte de tickets, le gel, puis le masque tombe : c'est Claus-9000), les trophées, puis les cartes secrètes (Cadeaux, Charbon, Vœux 2027), le vote Pac-Man, la taverne des vœux, le coin du feu et le récap avec « Copier le mail ».

## Les données de l'année

| Document | Contenu | D'où il vient |
|---|---|---|
| `year/data` | le calendrier, le quiz, le traîneau, les cadeaux, les boss, le Père Noël, les fiches et les trophées de chacun | Claude le prépare depuis Jira et GitHub et l'écrit (`ArtifactData`), après validation des boss par l'hôte ; l'écran titre accepte aussi de le recoller |
| `team/roster` | l'équipe et ses persos, au format de Sprint Quest (`sprintquest.json` du pack), stats rigolotes comprises | écrit avec `year/data` |
| `live/state`, `players`, `secret`, `revealed`, `quests` | la partie en cours | perdus avec l'artefact ; le récap se garde par « Copier le mail » |

Le format de `year/data` est décrit dans `snapshotRequest()` et vérifié par `checkYear()`. Les données réelles ne vont jamais dans le dépôt : elles nomment l'équipe.

## Republier

Seul Claude publie un artefact. Dans Claude Code, à la racine du dépôt : « republie Pixel Noël » (skill `.claude/skills/pixel-noel/`). Toujours modifier le jeu ici, puis republier.
