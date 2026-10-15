# Changelog

Les changements notables du Bureau, version par version.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : `0.MINOR.PATCH` (MINOR = fonctionnalités, PATCH = correctifs), tag sans `v` (`0.1.0`), comme Kronn. Chaque PR ajoute sa ligne dans « Unreleased » ; à la release, la section prend le numéro de `VERSION` et sa date, et le tag publie la GitHub Release avec ce texte (`.github/workflows/release.yml`).

## [Unreleased]

### Ajouté

- Trois boutons directs sur chaque validation (✅ Approuver, ⛔ Rejeter, ✏️ Changements…) au lieu de « Décider… » et de son menu (#45).
- Relancer un cron du Bureau depuis le panneau Fraîcheur : « ↻ Relancer » sur une ligne en échec ou en retard, « ↻ » discret sur les autres pour rafraîchir sans attendre (#44).
- Captures d'un pack d'équipe : `tools/shots.py --team <pack>` refait les captures du guide avec l'équipe du pack (la démo lui est réattribuée, boss compris), dans `<pack>/guide/img/`.
- Aperçu local avant le merge : `python3 tools/preview.py` montre la page de ta branche avec tes vraies données, sans rien publier.
- Courrier : tes mails non lus (appli Mail du Mac, Gmail ou autre par IMAP, plusieurs comptes), relevés toutes les 10 min sans jamais le contenu ; une boîte aux lettres par compte à côté du bureau du boss et la fiche Courrier ; le facteur qui dépose le courrier et vient proposer les règles du tri (validées par le boss) ; des porteurs qui remettent certains mails en personne et restent jusqu'à leur lecture dans ta messagerie.

### Corrigé

- Un bouton du panneau de droite qui ne répondait pas de temps en temps (la carte Kronn ne s'ouvrait pas) : le panneau ne se redessine plus pendant un clic.
- Les miniatures de « Mes pages Kronn » sur l'écran du boss avaient disparu : les versions récentes de Chrome se ferment seules après la capture, et le cron perdait l'image en voulant l'arrêter.
- Des crons du Bureau refusés de temps en temps (« étape __workspace__ ») quand plusieurs partaient à la même minute : ils se déclarent désormais sans écriture dans le dossier du projet, et Kronn ne les fait plus attendre.
- Les discussions Kronn sont lues page par page (200 au plus par réponse) par le bureau du jour, les validations et le canard : plus de données tronquées au-delà de 200 discussions (#5).

### Sécurité

- Les liens de la page venus des données (PR, runs, release, musique, fil) n'acceptent que https ; une autre adresse donne un lien inactif (#6).
- Les sprites LPC sont téléchargés depuis un commit figé du dépôt amont, et non plus depuis master (#9).

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
