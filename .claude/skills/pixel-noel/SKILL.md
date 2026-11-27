---
name: pixel-noel
description: Republier ou refaire l'artefact Pixel Noël (la rétro de Noël sur toute l'année, variante de Sprint Quest) depuis arcade/pixel-noel/, ou préparer ses données de l'année. À utiliser quand on dit « republie Pixel Noël », « prépare les données de Pixel Noël », ou après avoir modifié arcade/pixel-noel/index.html.
---

# Pixel Noël : republier le jeu, préparer l'année

La source est dans `arcade/pixel-noel/` (lire son `README.md`). L'adresse de l'artefact n'est pas dans le dépôt : la demander au mainteneur (ou `Artifact` action `list`, titre « Pixel Noël »).

## Republier au même endroit

1. `Artifact` action `read` sur l'adresse ; si la page en ligne a changé ailleurs, montrer l'écart et demander avant d'écraser.
2. Copier `index.html` dans le scratchpad, remplacer `@@ARTIFACT_URL@@` par l'adresse.
3. `Artifact` publish : `file_path` = la copie, `url` = l'adresse, `capabilities` = le contenu de `capabilities.json`.

## Artefact neuf

Publier la copie sans `url` (`icon` « gift », `capabilities` = `capabilities.json`), remplacer `@@ARTIFACT_URL@@` par la nouvelle adresse, republier au même endroit. Le mainteneur le partage à l'équipe (menu Partager).

## Préparer les données de l'année

1. Lire Jira (changelogs de l'année : Reopen, To Review à 9 h 30, rapporteurs, livraisons par sprint) et GitHub (PR fusionnées des dépôts de la config : revues, changements demandés, lignes `Co-Authored-By: Claude`), en lecture seule ; un sous-agent pour les gros volumes.
2. Proposer à l'hôte un boss par membre (type parmi `BOSS_KINDS`), sa fiche (stats réelles et rigolotes, les inventées marquées « inventé ») et son trophée ; il valide avant tout.
3. Écrire `year/data` et `team/roster` avec `ArtifactData` (set), au format de `snapshotRequest()` ; l'équipe part de `sprintquest.json` du pack, avec ses stats rigolotes dans `fun`.
4. Garder une copie du JSON hors du dépôt (il nomme l'équipe) : le scratchpad, ou le pack privé.

## À ne pas faire

- Mettre un vrai nom, une clé de ticket réelle ou les données de l'année dans le dépôt (public, `tests/test_public.py`).
- Modifier le jeu dans l'artefact sans reporter le changement dans `arcade/pixel-noel/`.
