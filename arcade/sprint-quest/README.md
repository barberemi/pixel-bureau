# Sprint Quest, le jeu de la borne

La rétro du sprint en jeu d'arcade, à plusieurs : un artefact claude.ai, ouvert par la borne des Combles (réglage `combles.url`). Ce dossier en garde la source, pour le republier tel quel s'il se perd ou pour le modifier.

| Fichier | Rôle |
|---|---|
| `index.html` | la page du jeu, sans `<!doctype>`, `<head>` ni `<body>` (la publication les ajoute) |
| `capabilities.json` | les capacités de l'artefact : base partagée et ses règles d'accès (`db`), présence des joueurs (`room`), noms claude.ai (`user`) |

`@@ARTIFACT_URL@@`, dans `index.html`, prend à la publication l'adresse de l'artefact (celle de `combles.url`, sans `?sk=`) : la demande « Préparer avec Claude » la cite.

## Ce que garde l'artefact, et d'où ça revient

| Document | Contenu | S'il se perd |
|---|---|---|
| `sprint/data` | le sprint de la partie | la borne le refait : « Préparer la partie », « Copier les données », puis « Coller » dans le jeu |
| `team/roster` | l'équipe et ses persos | collée avec le sprint, depuis `sprintquest.json` du pack d'équipe |
| `live/state`, `players`, `secret`, `revealed`, `quests` | la partie en cours | perdus ; le récap se garde par « Copier le mail » |

## Republier

Seul Claude publie un artefact (ni Kronn ni un script) : dans Claude Code, à la racine du dépôt, « republie Sprint Quest » (skill `.claude/skills/sprint-quest/`). Toujours modifier le jeu ici, puis republier : la source et l'artefact ne s'écartent pas.
