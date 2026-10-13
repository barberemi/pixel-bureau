# Changelog

Les changements notables du Bureau, version par version.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : `0.MINOR.PATCH` (MINOR = fonctionnalités, PATCH = correctifs), tag sans `v` (`0.1.0`), comme Kronn. Chaque PR ajoute sa ligne dans « Unreleased » ; à la release, la section prend le numéro de `VERSION` et sa date, et le tag publie la GitHub Release avec ce texte (`.github/workflows/release.yml`).

## [Unreleased]

### Ajouté

- Captures d'un pack d'équipe : `tools/shots.py --team <pack>` refait les captures du guide avec l'équipe du pack (la démo lui est réattribuée, boss compris), dans `<pack>/guide/img/`.

## [0.1.0] - 2026-10-13

### Ajouté

- Première version publique : la Live Page Kronn en pixel art (plan du bureau, qui fait quoi, fil et récap, rejeu, mode TV et cérémonies, fiches, murs, avatars, thèmes saisonniers, absences), ses crons et ses workflows à 0 token, l'installateur et la publication.
- Packs d'équipe : une équipe vit dans un dossier privé hors du dépôt (roster, avatars, musique, plan, thèmes), validé par `tools/smoke.py --team`, `tools/plan.py check` et `tools/theme.py check`, avec une CI d'exemple.
- Mises en prod des autres dépôts suivis : celui qui lance le déploiement la porte, et un visiteur vient pour quelqu'un d'extérieur à l'équipe.
- Poids de chaque bloc de la page dans le smoke ; licence AGPL 3.0, `CREDITS.md` généré depuis les calques LPC, `SECURITY.md`.
- Version affichée en pied de page (`VERSION`) et release publiée depuis ce changelog sur un tag.

### Modifié

- Le dépôt public s'appelle `pixel-bureau` ; le dossier de cache des crons devient `~/.cache/pixel-bureau` (reconstruit tout seul).
- Seul le déploiement en prod amène l'auteur et le boss au plateau TV ; une release ou un staging seuls ne déplacent personne.
- Le dépôt ne livre plus que le thème Classique : les autres viennent des packs, et le bouton 🎨 n'apparaît que s'il y a un autre thème.
