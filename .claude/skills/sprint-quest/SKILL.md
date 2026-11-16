---
name: sprint-quest
description: Republier ou refaire l'artefact Sprint Quest (le jeu de la borne des Combles) depuis arcade/sprint-quest/ ; aussi pour publier une modification du jeu. À utiliser quand on dit « republie Sprint Quest », « l'artefact Sprint Quest est perdu », « la borne ne mène nulle part », ou après avoir modifié arcade/sprint-quest/index.html.
---

# Sprint Quest : republier le jeu

La source est dans `arcade/sprint-quest/` (lire son `README.md`). Le jeu vit dans un artefact claude.ai, dont l'adresse est `combles.url` de `bureau.config.json` (dossier principal de l'installation, jamais commité).

## 1. Ce qui est en ligne

- Lire `combles.url`. Adresse de l'artefact = cette URL sans `?sk=…`.
- S'il y en a une : `Artifact` action `read` sur cette adresse.
  - Introuvable ou supprimé : passer au 3 (artefact neuf).
  - Sinon, comparer la page en ligne à `arcade/sprint-quest/index.html` (en ligne, `@@ARTIFACT_URL@@` est remplacé par l'adresse). Si elle a changé ailleurs, montrer l'écart et demander avant d'écraser ; reporter dans le dépôt ce qu'il faut garder.

## 2. Republier au même endroit

- Copier `index.html` dans le scratchpad, remplacer `@@ARTIFACT_URL@@` par l'adresse.
- `Artifact` publish : `file_path` = la copie, `url` = l'adresse, `capabilities` = le contenu de `capabilities.json`.
- Rien d'autre à faire : l'adresse et la base (équipe, sprint) restent.

## 3. Refaire un artefact neuf

1. Copier `index.html` dans le scratchpad (`@@ARTIFACT_URL@@` laissé tel quel), `Artifact` publish sans `url`, `icon` « game », `capabilities` = `capabilities.json`.
2. Remplacer `@@ARTIFACT_URL@@` par la nouvelle adresse dans la copie, republier sur la même adresse.
3. Dire au mainteneur :
   - de partager l'artefact à l'équipe (menu Partager : l'organisation) et de copier le lien de partage ;
   - de mettre ce lien dans `combles.url` de `bureau.config.json`, puis de lancer `python3 tools/publish.py page` (la publication est réservée à l'humain) ;
   - de remplir la partie : borne des Combles, « ⚙ Préparer la partie », « 📋 Copier les données », puis dans le jeu, écran titre, « 📥 Coller les données du sprint ». Le sprint et l'équipe (`sprintquest.json` du pack) arrivent ensemble.

## À ne pas faire

- Publier `index.html` du dépôt directement : `@@ARTIFACT_URL@@` resterait dans la page.
- Écrire `team/roster` ou `sprint/data` à la main (`ArtifactData`) : ils viennent de la borne ; l'équipe se corrige dans le pack.
- Modifier le jeu dans l'artefact sans reporter le changement dans `arcade/sprint-quest/`.
