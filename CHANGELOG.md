# Changelog

Les changements notables du Bureau, version par version.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : `0.MINOR.PATCH` (MINOR = fonctionnalités, PATCH = correctifs), tag sans `v` (`0.1.0`), comme Kronn. Chaque PR ajoute sa ligne dans « Unreleased » ; à la release, la section prend le numéro de `VERSION` et sa date, et le tag publie la GitHub Release avec ce texte (`.github/workflows/release.yml`).

## [Unreleased]

### Corrigé

- Fiche Courrier : un mail plus ancien qu'hier montre sa date (« jeudi 24 sept. 10:13 ») et plus seulement le jour de la semaine.
- Mise en prod d'une PR en simulation : le ticket n'est plus passé au statut de fin ni commenté par le retour IA (nouvelle étape `dry_guard` après la gate de fin) ; avant, approuver la gate de fin d'une simulation écrivait dans Jira.
- Mise en prod d'une PR : l'annonce Teams part après le rebase (un conflit n'annonce plus rien), et une étape en échec passe bien la carte en ❌ avec la raison dans le fil (les renvois attendaient un signal que Kronn n'émet pas).

## [0.2.0] - 2026-10-18

### Ajouté

- Agents cron : « ⏰ Son programme » sur la fiche, le programme en clair à l'heure du bureau (Kronn lit les crons en UTC), le prochain passage avec un anneau, le dernier passage et « ↻ Passer maintenant » ; l'heure du prochain passage dans l'étiquette du plan (« ⏰ demain 8h20 ») et sous son état dans la liste du panneau.
- Annonce Teams des mises en prod : une carte postée après la gate du début, éditée à chaque étape (⏳, chargeur animé, ✅, ❌ avec la raison en réponse dans le fil), logo du projet, canal de test en simulation (`mep.teams`, `tools/teams_logo.py`) (#59).
- Mise en prod d'une PR de n'importe quel dépôt réglé (`github.mep`, `github.deploys[].mep`) : modèle du Bureau « Mise en prod d'une PR » (`launch.mep_pr`), lancé depuis la fiche de son agent, d'une PR ou d'un ticket ; ticket déduit de la PR, une seule gate au début, gate de fin « ticket terminé ? », simulation (`dry_run`) (#58).
- Écran mural « Mes pages Kronn » en salle de réunion, à la place du tableau blanc : quatre miniatures et une case « + » ; la fenêtre « Mes pages Kronn » gagne × pour retirer une page et « + Ajouter une page », par une carte Kronn (workflow « Le Bureau · pages », dataset `pagelist`, sans republier). L'ordinateur du boss est libéré (#61).
- Prochains crons en post-it au fond de la salle Serveurs, entre les deux baies : un par cron, couleur de l'agent, il tombe quand le cron a tourné, la liste en clair au survol ; le tableau « Prochains crons » quitte le bureau du boss et le calendrier des absences glisse un peu à gauche ; `objects.planning` des plans n'est plus demandé (#60).
- « ▶ Lancer… » : un champ par paramètre dans la fiche de l'agent (libellé, exemple, * des obligatoires, zone de texte ou liste selon le workflow) ; le bouton copie la ligne déjà remplie, à coller telle quelle dans la carte Kronn, et reste grisé tant qu'une valeur manque ou est refusée (« ; », format) (#67).
- Agents : « ▶ Lancer… » sur la fiche de tout agent dont un workflow demande une saisie (ligne « nom=… ; nom=… » copiée, à compléter dans la carte Kronn, revérifiée avant le lancement) ; « Nouvel agent » depuis le « + » d'une baie de la salle Serveurs (workflow sans agent, prénom, métier, siège, avatar), rangé dans le dataset `agents` sans republier, qui sort de la baie et rejoint sa place ; renommer ou retirer depuis sa fiche (#64).
- PR de plusieurs dépôts (clé `github.pr_repos`, par défaut le dépôt principal et ceux des mises en prod) : une PR d'un autre dépôt apparaît dans la fiche du collègue et du ticket, le fil et les compteurs, s'identifie par son dépôt et son numéro (`front_api#16`), et « 🔎 Faire relire » et « 🛠 Corriger » se lancent aussi depuis la fiche d'une PR (#56).
- Panneau Fraîcheur : les avertissements des crons (tarif non mesuré, canard sans projets, page du boss sautée, déploiements non relus…) s'affichent avec leur source, et chaque échec partiel est aussi écrit dans le run Kronn (#8).
- Trois boutons directs sur chaque validation (✅ Approuver, ⛔ Rejeter, ✏️ Changements…) au lieu de « Décider… » et de son menu (#45).
- Relancer un cron du Bureau depuis le panneau Fraîcheur : « ↻ Relancer » sur une ligne en échec ou en retard, « ↻ » discret sur les autres pour rafraîchir sans attendre (#44).
- Captures d'un pack d'équipe : `tools/shots.py --team <pack>` refait les captures du guide avec l'équipe du pack (la démo lui est réattribuée, boss compris), dans `<pack>/guide/img/`.
- Aperçu local avant le merge : `python3 tools/preview.py` montre la page de ta branche avec tes vraies données, sans rien publier.
- Courrier : tes mails non lus (appli Mail du Mac, Gmail ou autre par IMAP, plusieurs comptes), relevés toutes les 10 min sans jamais le contenu ; une boîte aux lettres par compte à côté du bureau du boss et la fiche Courrier ; le facteur qui dépose le courrier et vient proposer les règles du tri (validées par le boss) ; des porteurs qui remettent certains mails en personne et restent jusqu'à leur lecture dans ta messagerie.

### Corrigé

- « ↻ Relancer » (fiche d'un agent, panneau Fraîcheur) : la carte Kronn ne demande plus de « Paramètres » (réservés à « ▶ Lancer… ») ; la ligne relançable du dataset `gates` porte une colonne `params` vide, liée par le bouton.
- Pastilles des projets (`tools/teams_logo.py badge`) : initiales foncées sur un fond clair (africanews en jaune), blanches sinon.
- « Mes pages Kronn » : un clic sur × ou « Ajouter » ouvre un écran de validation avec la carte Kronn juste dessous (elle s'ouvrait en bas de la fenêtre, hors de vue) ; plus de ✓ de Kronn sur tous les boutons ni de « C'est fait » avant d'avoir lancé ; la fenêtre suit les changements sans recharger ; la miniature d'une page ajoutée est faite tout de suite ; titres déjà échappés décodés (« &amp; ») ; la case « + Ajouter » ouvre la liste des pages ; grille en 4 colonnes (2 sous 900 px), qui tient sur un portable avec 6 pages.
- `publish.py workflows` crée d'abord les workflows du Bureau manquants puis rend tous les modèles : un workflow créé au même passage (« Le Bureau · pages ») n'apparaît plus comme un agent (« Intérimaire 1 »).
- Page plus légère : le JS assemblé recolle les lignes finies par « ; », « { » ou « , » (5 Ko), puis par un « + » ; le CSS assemblé, toutes ses lignes (0,7 Ko).
- Ce qu'on tape dans un champ de fiche (Renommer un agent ajouté) n'est plus effacé par la mise à jour du panneau, chaque seconde.
- Les pizzas de fin de sprint ont lieu même quand le sprint est clôturé le matin de sa fin et le suivant déjà ouvert : le cron équipe garde la fin prévue du sprint clôturé (`prev_sprint.planned_end`).
- Un second placement de l'équipe (nouveau plan) ne déplace plus les agents de la config : leur siège demandé n'est plus réécrit en coordonnées (#64).
- La fenêtre « Mes pages Kronn » garde le focus clavier (Tab et Maj+Tab bouclent dedans, le reste de la page est inerte) et le rend à la fermeture (#1).
- Les tuiles « La prod aujourd'hui » et « Les agents », les lignes du fil et le titre de la loupe s'atteignent au clavier et s'ouvrent par Entrée ou Espace (#2).
- Avec le réglage système « réduire les animations », les effets de thème au-dessus du plan disparaissent, la loupe automatique est éteinte par défaut et les défilements sont instantanés (#3).
- Les boutons Direct, Rejouer, Loupe, Important / Tout et Récap annoncent leur état aux lecteurs d'écran (#4).
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
