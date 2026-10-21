# Changelog

Les changements notables du Bureau, version par version.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : `0.MINOR.PATCH` (MINOR = fonctionnalités, PATCH = correctifs), tag sans `v` (`0.1.0`), comme Kronn. Chaque PR ajoute sa ligne dans « Unreleased » ; à la release, la section prend le numéro de `VERSION` et sa date, et le tag publie la GitHub Release avec ce texte (`.github/workflows/release.yml`).

## [Unreleased]

### Ajouté

- `build_sprites.py` avertit d'une planche fournie dont la marche de côté est figée (même écartement des pieds sur toutes les images : le personnage glisse), comme l'avaient le Pompier, Stephouille et le boss au sax.
- Console Support sur l'ordinateur du boss : le canal Teams des demandes de support de l'équipe (réglage `support` du pack), relevé toutes les 15 min aux heures de bureau (cron `support_poll`, CLI `claude` et son connecteur Microsoft 365, environ 0,005 $ par relevé) et à la demande ; écran rouge avec le nombre à traiter, infobulle au survol, fenêtre des fils de la semaine ; « Investiguer » lance l'agent Support (modèle `support`) dans une discussion Kronn, sa réponse se valide, se fait reprendre ou se refuse, puis part en fil sous ton nom avec la mention « Généré de manière automatique 🤖 » ; hologramme d'agent réglable (`holo` : léger, rouge, ou alerte pour l'agent Support : rouge pendant une intervention, « 🧯 Feu éteint » après une réponse) (#62).
- Tournée de café : un invité `on: "coffee"` passe tous les jours ouvrés vers 16h, va à la machine à café (sa réplique, loupe), puis apporte un café à chaque présent au bureau, le boss compris, en se plaçant derrière chacun ; les tasses restent côté écran jusqu'à 17h ; une ligne dans le fil à son arrivée (#84).
- Remettre une PR à jour depuis sa fiche (« ⟳ Remettre à jour ») : rebase sur sa base sans squash, push protégé, label de CI reposé ; en cas de conflit, un agent IA le résout, la commande de contrôle du dépôt tourne et tu valides avant tout push (`actions.rebase`, `github.ci_labels`, `github.checks`). La fiche d'une PR montre son état : conflit avec sa base, commits de retard ou à jour ; dans « Ses PR ouvertes », le numéro ouvre la fiche de la PR (« ↗ » pour GitHub) et chaque ligne montre conflit, retard et fils non résolus (#74).
- « 🛠 Corriger » sur toute PR qui a des fils de review non résolus, quel que soit son dépôt : Nate corrige les fils actionnables (tests compris), prépare une réponse par fil, et tu valides le diff et les réponses avant le push, les réponses et la résolution des fils corrigés (`actions.fix_pr`, ne remplace pas ton workflow de `launch.fix`) (#75).

- Réglages d'équipe dans le pack (`settings.json`) : rythme, GitFut, affiches du Top 3, planning des absences et personnages des agents, lus à chaque publication et surchargeables par la config ; l'installateur rattache chaque personnage à un de tes workflows (`--rattacher` pour le refaire) ; `tools/split.py` découpe une config existante sans changer la page ni les workflows (#32).
- Modèles d'agents du Bureau, proposés à l'installation : relire une PR (à la demande, ou en cron créé désactivé, avec une grille de revue générique et les consignes de l'équipe), réestimer un ticket, rédiger une issue GitHub, m'affecter et me désaffecter un ticket. Sans valeur d'installation (connexions, page de récap facultative, champ Story Points, transitions choisies par statut) ; « Faire relire » et « Réestimer » les lancent quand tu n'as pas ton propre workflow (#78).
- Fiche d'un ticket ou d'une PR, « Lancer un workflow » : chaque action montre l'agent qui la fait (portrait, icône de métier, « Nate corrige les 5 fils de review », clic : sa fiche), calculé depuis ses workflows ; groupes par PR puis ticket ; l'action conseillée encadrée ; un bandeau implémente › corrige › relit › met en prod ; les actions pas encore possibles grisées avec leur raison ; « est dessus depuis… » quand l'agent travaille déjà dessus ; coût moyen d'un run (#86).
- Soucoupe-mère sur le plan : un ticket qui entre dans le sprint après son démarrage arrive en soucoupe, qui va chercher la facilitatrice et la dépose avec le ticket devant le mur Kanban (rangé dans « à faire », « +13 pts », bulle d'annonce, loupe) ; tickets ajoutés coup sur coup groupés en une visite ; ligne « 🛸 » dans le fil. Le cron équipe lit le champ Sprint dans l'historique des tickets, sans requête de plus (#89).

### Modifié

- Rejouer la journée : un champ pour taper l'heure, une bulle d'heure sur le curseur et les heures sous la frise, la vitesse en un bouton qui défile (×1, ×2, ×10, ×60, ×480, au lieu de ×120, ×480, ×1500), « ⏵ revoir » sur chaque ligne du fil (20 s avant, en ×1 : la scène se rejoue) ; en lecture rapide les personnages marchent plus vite (Gandalf ne traîne plus vers la porte après sa scène).
- Console Support, réponse postée en fil : seulement les sections (les phrases de l'agent avant la première et après la dernière sautent), une ligne vide entre les sections, la mention « Généré de manière automatique 🤖 » sans italique (à republier avec `publish.py workflows`) ; fiche de l'agent Support plus compacte (bouton de la console sous le texte, un fil par ligne).
- Mise en prod d'une PR : des projets différents en même temps (une seule à la fois par projet, `concurrency_key` du modèle, à republier avec `publish.py workflows`) ; l'agent montre toutes ses validations en attente (panneau du boss, sa fiche, compteurs) et va à la porte du boss dès qu'une attend.
- Page plus légère : à l'assemblage, les appels `document.createElement` et `document.getElementById` répétés passent par un alias court (4,5 Ko).

### Corrigé

- Qui fait quoi : plus de cartes d'absence le soir, la nuit ni le week-end ; une fois tout le monde parti, le panneau ne montrait plus que les absents.
- Plus deux personnages au même endroit : places réservées par case (la table de la cafétéria et le daily, le sax et le mur Kanban se partageaient des cases), deux visites au même endroit côte à côte, une zone pleine (gates de plusieurs agents) répartie sur toutes ses places, et un collègue de passage ne garde plus une place redonnée à un agent.
- Fermer une fenêtre (console Support, pages du boss, nouvel agent) referme aussi la carte Kronn ouverte dedans : elle restait affichée seule, à fermer par sa croix.
- Gandalf (ticket réouvert) et la soucoupe-mère (ticket entré au sprint) se voient en direct : appris en retard par le cron équipe (toutes les 10 min), la scène part de l'heure où il l'a vu, au lieu d'être déjà finie quand la page l'apprend.
- Panneau Fraîcheur : le relevé Support (`support_poll`) a sa ligne, son « ↻ Relancer » comme les autres crons du Bureau, et son dernier échec dans le diagnostic ; la fenêtre Support n'a plus son propre « Relever maintenant » (un seul endroit pour relancer un cron).
- Console Support : l'agent Support lit les tickets Jira cités dans le message (outil `api_call` de Kronn, connexion `jira.config_id`, en lecture) et résume son investigation en notes, qui ne réveillent plus l'agent de la discussion (à republier avec `publish.py workflows`). Un fil dont la réponse a été refusée garde « 🔎 Investiguer » pour réessayer.
- Fil de la journée : la validation d'un run annulé pendant sa gate ne reste plus épinglée « attend ta validation » ; la gate se ferme à la fin du run (« ⏹ … close sans décision »).
- Fiche d'un ticket, « Ses PR ouvertes » : le titre d'une PR n'est plus écrasé dans une colonne étroite entre son numéro et son état ; chaque PR tient sur deux lignes, comme « Ses tickets » (numéro, ↗ GitHub et état, puis le titre entier, puis conflit, retard et fils de review).
- « 🚀 Mise en prod » d'une PR proposée seulement quand un de ses tickets est en To Deploy (avant : dès que la PR était prête, ticket en review compris) ; « Faire relire » ne nomme plus un agent écrit en dur (#86).
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
