# Fiches

Clic sur un personnage (plan, panneau ou « Qui fait quoi ») : sa fiche s'ouvre dans le panneau.

**Revenir** : le bouton « ← » en haut du panneau ramène à la vue d'avant, pas forcément à toute l'équipe : la fiche d'un agent ouverte depuis la Fiche de paie affiche « ← Fiche de paie », la fiche d'un agent ouverte depuis le volet du Mur Kanban « ← Mur Kanban » (la fenêtre se rouvre telle quelle). **Échap** fait la même chose (pas pendant une saisie ni quand une fenêtre est ouverte : Échap la ferme d'abord).

![« ← Fiche de paie » : la fiche d'un agent ouverte depuis la Fiche de paie](../img/retour-panneau.png)

**Cartes Kronn** : chaque bouton d'action du panneau (lancer, relancer, poser une question, décider une validation, investiguer…) ouvre une fenêtre, la même que Mes pages Kronn : l'action en titre, puis ce que tu lances (le portrait de l'agent, ou une icône, l'action, sa phrase et « ↩ Annuler »), les étapes (le code copié à coller, quand il y en a un), et la carte Kronn dessous. ×, « ↩ Annuler » ou un clic à côté la referment.

![La fenêtre d'une carte Kronn : « ▶ Lancer », Darryl et les étapes (la carte Kronn s'ouvre dessous, dans Kronn)](../img/carte-kronn.png)

| Agent | Collègue |
| --- | --- |
| ![Fiche d'un agent](../img/fiche-agent.png) | ![Fiche d'un collègue](../img/fiche-collegue.png) |

**Agent** : sous son nom, à quoi il sert, selon sa [famille](01-plan.md#trois-familles-dagents) : « Son bouton : ⟳ Remettre à jour, sur la fiche d'une PR » (au quotidien), « Remplit Core Web Vitals ↗ » avec la miniature de la page et « Sur l'écran mural » ou « + l'y ajouter » (pages), « De passage : aucun agent pour ce workflow » ou « Tourne seul, sans bouton ni page » avec son programme (autres). Puis runs, réussites, échecs et tokens du jour, workflows, sa journée run par run avec les étapes et les erreurs. Boutons (cartes Kronn, sans token sauf « interroger ») :
- **⏰ Son programme** (agent cron) : pour chaque cron de l'agent, son programme en clair à l'heure du bureau (« Du lundi au vendredi toutes les 3 heures de 9h30 à 21h30 » : Kronn lit les crons en heure UTC, la fiche les traduit), un anneau qui se remplit jusqu'au prochain passage (« Prochain passage aujourd'hui à 12h (dans 1 h) ») et son dernier passage du jour. **↻ Passer maintenant** lance un passage en plus, tout de suite, sans rien à remplir : son programme ne change pas.
- **Relancer** : relance un workflow manuel, sans variables (refusé s'il tourne déjà) ; la carte Kronn ne demande rien. Absent pour un workflow qui attend une saisie obligatoire, comme Réestimer : celui-là se lance depuis la fiche du ticket, qui envoie la clé et te demande le reste.
- **▶ Lancer…** : pour chaque workflow de l'agent qui demande une saisie (une intention, un dépôt…), un champ par paramètre, avec son libellé, son exemple et * sur les obligatoires (zone de texte ou liste quand le workflow le déclare). Le bouton reste grisé tant qu'un obligatoire est vide ou qu'une valeur est refusée, avec la raison sous le champ : le « ; » sépare les paramètres (remplace-le par une virgule), et une valeur doit suivre le format déclaré par le workflow ; les retours à la ligne deviennent des espaces. Il copie alors la ligne déjà remplie : colle-la dans le champ **Paramètres** de la carte Kronn, puis Lancer, rien à retoucher. Ta saisie tient pendant que la fiche se met à jour. Le workflow « Le Bureau · relancer un workflow » revérifie chaque nom avant de lancer ; l'agent se met au travail sur le plan dès que le run démarre. Tous les agents l'ont, ceux ajoutés depuis une baie compris, sans rien régler.
- **Lui poser une question** : un agent IA lit ses runs et répond en 5 phrases.
- **Agent ajouté** (agent créé depuis une baie de la salle Serveurs, voir [Le plan](01-plan.md#ajouter-un-agent)) : ✎ Renommer (prénom, métier) ou ✕ Retirer du bureau ; un code à coller dans la carte Kronn, comme à sa création.
- **Décider** une validation : trois boutons directs, ✅ Approuver, ⛔ Rejeter, ✏️ Changements… ; la carte Kronn qui s'ouvre prend un commentaire (obligatoire pour des changements), puis Lancer.

**Boss** (ton personnage) : ce qui attend ta décision, chaque validation avec ses trois boutons (Approuver, Rejeter, Changements) : celles de tes agents, et celles des workflows qui n'ont pas de personnage sur le plan (« Le Bureau · plan », qui propose un nouveau plan pour toute l'équipe). Puis chaque question qu'une discussion Kronn t'a posée et qui attend encore (14 jours, comme le canard) : celles des visiteurs, du canard et des agents interrogés depuis la page. Tant qu'une validation ou une question t'attend, ton personnage porte la bulle ✋ avec leur nombre, et le récap de la journée le rappelle. Sur Mac, une notification te prévient aussi, même page fermée : à chaque nouvelle validation ou question, une seule fois (titre « Le Bureau · ✋ validation », le workflow en sous-titre, la première ligne du message ; plusieurs à la fois : « ✋ 3 décisions t'attendent »). Elle part du cron « Le Bureau · live » (chaque minute aux heures de bureau) ; l'installateur la propose (`notify_mac` dans `bureau.config.json`). Un clic sur la notification ouvre Script Editor, pas la page : c'est la limite des notifications d'`osascript`. Si rien ne s'affiche, autorise les notifications de Script Editor (Réglages Système > Notifications).

![Questions des discussions dans la fiche du boss](../img/questions.png)

Une carte de question se décide sur la page :

- **Question simple** : un bouton par option (★ = celle que l'agent recommande), « ✏️ Autre réponse… » (texte libre) et « ⛔ Refuser… ». Chaque bouton ouvre la carte Kronn : un commentaire facultatif, puis Lancer.
- **Formulaire** (une réponse par item, comme les lots de fiches de dette d'un audit Kronn) : « Tout : Confirmer », « Tout : Différer »… donnent la même réponse à chaque item ; une réponse différente selon les items se donne dans Kronn (lien « Ouvrir la discussion »).
- La réponse part par le workflow « Le Bureau · réponse à une question » (sans agent, 0 token), qui relit la question dans Kronn : déjà décidée ailleurs, rien n'est envoyé.

**Collègue** : tickets ouverts, en cours, PR ouvertes et mergées du jour, ce qu'il a écrit, trié ou testé (PO, facilitateur, testeur).

Sous « Personnaliser », sa ligne d'état tient sur une ligne (« Teste 7 tickets », « En cours sur 2 tickets » ; la phrase complète au survol), suit l'heure affichée (direct ou rejeu) et se complète au besoin :
- ses compteurs Jira de la semaine (« **2** écrits cette semaine », « **7** testés depuis le daily ») ;
- les tickets qu'il traite sans qu'ils soient à lui (ceux que teste la testeuse), en étiquettes : clic = la fiche du ticket, survol = son titre.

![Fiche d'une testeuse : ligne d'état, compteurs et tickets à tester](../img/fiche-testeuse.png)

**Ses tickets** (dans la fiche d'un collègue) : une barre de ses points du sprint, un segment par colonne aux couleurs du Kanban (en tickets si aucun n'est estimé ; survol : le détail), les points déployés sur le total, le nombre de tickets par colonne, et **« ▦ Ses tickets dans le Kanban »** : le Mur Kanban filtré sur lui, où sont ses tickets, leurs fiches et leurs actions (voir [Murs du bureau](08-murs.md)).

**Ses autres PR ouvertes** : les PR qui ne citent aucun de ses tickets du sprint (sans ticket, ou d'un ticket hors du sprint) ; celles qui en citent un sont sur la fiche du ticket, dans le Kanban. Un clic sur l'une d'elles ouvre sa fiche dans le volet du Kanban, filtré sur lui, avec « PR sans ticket dans le sprint ». Le compteur « PR ouvertes » en haut de la fiche les compte toutes. Un groupe par état de review, bordé de sa couleur (changements demandés, en attente de review, approuvées, puis brouillons, repliés par défaut), la plus récemment active d'abord. Chaque PR : son numéro (lien GitHub), le ticket qu'elle cite (lien Jira, en gris) et le composant, son titre sans le préfixe « feat(DM-1): », puis sa dernière activité (« il y a 6 mois » : une PR oubliée se voit), en orange avec ⏳ quand elle attend une review depuis plus de 24 h.

**Ticket** : un clic sur un ticket, où qu'il soit (Kanban, fil, « Qui fait quoi », une fiche), ouvre le Mur Kanban filtré sur la personne qui l'a, et sa fiche dans le volet, à droite des colonnes (voir [Murs du bureau](08-murs.md)) : son statut et depuis quand, qui l'a, ses points, ses PR ouvertes avec leur review (comme « Ses tickets » : numéro, lien GitHub et état de review en tête, le titre entier dessous sans « feat: » ni la clé du ticket, puis conflit, retard et fils de review), le lien Jira, et les workflows à lancer dessus selon son statut.

**Déplacer un ticket** : sous son statut, deux boutons pour le faire changer de colonne. **« Colonne ▶ »** (en bleu) avance d'une colonne, d'« À faire » jusqu'à « Déployé » ; **« ◀ Colonne »** (en gris) recule d'une colonne, depuis « En cours » jusqu'à « À déployer » (refusé en review, à revoir, à retester). Chaque bouton dit la colonne visée et la raison du passage. Il ouvre la carte Kronn du workflow « déplacer un ticket » (0 token) : la transition Jira est choisie au moment du clic, par le nom du statut visé. Quand Jira ne propose pas de passage direct (un ticket en Reopen ne passe pas en To Review), le ticket passe d'abord par un statut de sa colonne (le premier que `jira.statuses` y range : En cours), puis va au statut visé, en deux transitions vérifiées ; l'infobulle du bouton le dit. Jamais par une autre colonne : sans passage possible, la carte le dit et rien ne bouge. Vers la colonne En cours, un ticket que personne n'a t'est affecté avant la transition (le compte de ta connexion Atlassian, comme « m'affecter ») ; un ticket déjà à quelqu'un garde son affecté. La carte du Kanban suit au prochain passage du cron équipe (10 min au plus). « À déployer ▶ Déployé » se fait d'habitude par la mise en prod ; le bouton le fait à la main. Tous les tickets du sprint, avec le compte de ta connexion Atlassian. Les statuts visés se règlent dans `jira.moves` (par défaut, le premier statut que `jira.statuses` range dans la colonne voisine).

![Déplacer un ticket : « ◀ En cours » et « En test ▶ » dans sa fiche](../img/kanban-deplacer.png)

![La carte Kronn du déplacement](../img/carte-deplacer.png)

Dans « 🤖 Lancer un workflow », chaque action montre **l'agent qui la fait** : son portrait pixel, l'icône de son métier, et une phrase (« **Nate** corrige les 5 fils de review »). L'agent est celui dont les workflows (`agents[].wf`, ou un personnage du pack) contiennent le workflow du bouton : son nom n'est jamais écrit en dur. Un agent par bouton : jamais celui d'un autre bouton, ni un intérimaire (celui-là change chaque jour) ; « Commenter », c'est toi (ton compte Jira) ; une action sans agent montre l'hologramme du Bureau. Pour donner le même agent à toute l'équipe, le pack le rattache au bouton (`"model": "rebase"`, voir [Équipe](../equipe.md)). Un clic sur le portrait ouvre la fiche de l'agent. Les actions sont rangées par PR (« Sur la PR #1988 ») puis « Sur le ticket ». En tête, un bandeau montre **où en est le ticket** : implémente › corrige › relit › met en prod, avec l'agent de chaque étape (fait en vert, en cours en couleur, à venir en gris ; seulement les étapes que tu as branchées). L'action logique est encadrée, **● conseillé** : conflit ou retard sur la base → Remettre à jour, fils de review ouverts → Corriger, sinon Faire relire ; en To Deploy → Mettre en prod ; à faire sans PR → Implémenter. Une action pas encore possible est **grisée avec sa raison** (« quand le ticket sera en To Deploy (aujourd'hui : To Review) »). Quand l'agent est déjà dessus (un run en cours sur ce ticket ou cette PR), son bouton est grisé : « Nate est dessus depuis 10h12 ». Le coût moyen d'un run de l'agent (fiche de paie, 7 jours) s'affiche à côté quand il est connu.

Les actions :
- **Implémenter** : ticket à faire ou en cours, sans PR. Après ta validation du plan, le workflow t'assigne le ticket et le passe « En cours » dans Jira, puis code, ouvre la PR et la fait relire.
- **Faire relire** : sur chacune de ses PR pas encore approuvées, brouillons compris (la carte dit alors « (brouillon) »).
- **Corriger les retours** : sur une PR avec changements demandés, même en brouillon (avec des consignes facultatives).
- **Mettre en prod** : ticket à déployer (statut `jira.flow.validated`, To Deploy par défaut) ; avant, grisé avec la raison ; grisé aussi les jours de gel des mises en prod.
- **🚀 Mise en prod** (sur chaque PR, si son dépôt a des réglages de mise en prod) : la mise en prod de cette PR, dépôt et numéro relus par Kronn, seulement quand un de ses tickets est en To Deploy (sinon grisé avec la raison, et une PR sans ticket Jira ne se met pas en prod) ; voir [Mise en prod](16-mise-en-prod.md).
- **🌿 Générer l'env de branche** : en tête des actions de chaque PR d'un dépôt réglé (par défaut le dépôt principal), brouillons compris, avec son agent. Dessous, **où en est l'env** : « ⏳ demandé » juste après le clic, « ⏳ construction en cours · lancée il y a 2 min · run ↗ », « ✅ en ligne » ou « ❌ build en échec », puis trois étapes (label › build › en ligne, avec le lien de l'env). Le bouton est grisé tant que le build tourne, et le Mur Kanban montre « 🌿 ⏳ env » ou « 🌿 ❌ env » sous la carte. Il faut pour cela le workflow GitHub qui construit l'env (clé `env.workflow` du pack, le fichier, par exemple `CD_Deploy_Branch.yaml`), relu chaque minute par le cron live ; ses runs « skipped » (un par événement de la PR, sans le label) ne comptent pas. Juste dessous, une ligne sépare les envs partagés (DEV, STG), qui n'ont rien à voir avec l'env de branche. Un seul bouton : il retire le label d'environnement de la PR (sans erreur s'il n'est pas posé), attend 5 s, puis le repose ; il crée donc l'environnement de la PR, ou le reconstruit après un push. Par défaut, c'est le modèle du Bureau « env de branche d'une PR » (`models.env`, `gh`, 0 token), que l'installateur propose : label et dépôts viennent de la clé `env` du pack (`label`, défaut `env-branch`, et `repos`), toute l'équipe a donc le même bouton. Avec ton propre workflow (`launch.env`), c'est lui qui part, avec le numéro de la PR et une valeur d'action fixe (`launch.env.action`, `reposer` par défaut) que Kronn relit dans le dataset `actions` :

  ![Générer l'env de branche : son build en cours, grisé jusqu'à la fin](../img/env-branche.png)

  ```json
  "env": {"label": "env-branch", "repos": ["owner/depot"]}
  ```
  dans `settings.json` du pack pour le modèle, ou dans ta config pour ton workflow :
  ```json
  "launch": {"env": {"wf": "<id de ton workflow>", "vars": {"pr": "pr_number", "action": "action"},
                     "repos": ["owner/depot"], "action": "reposer"}}
  ```
- **🚀 Déployer la branche** : sur chaque PR d'un dépôt réglé, avec son agent en tête (« **Stanley** déploie la branche », la fusée sans agent), une ligne par env hors prod (DEV, STG…). Chaque ligne dit ce qui occupe l'env : la branche ou la version déployée, qui l'a lancée, depuis quand, et le lien vers le run GitHub (relu chaque minute par le cron live). Le bouton suit : **🚀 Déployer** sur un env libre ou que tu occupes ; **⇄ Remplacer…** quand il porte la branche de quelqu'un d'autre (la fenêtre de la carte Kronn le prévient avant Lancer : son test s'arrête) ; **↻ Redéployer** ou **↻ Relancer** (après un échec) quand c'est déjà ta branche. Juste après le clic, « ⏳ demandé », puis « ⏳ ta branche arrive · lancé il y a 4 min » tant que le run tourne : le bouton est grisé. C'est le modèle du Bureau « déployer la branche d'une PR (hors prod) » (`models.deploy`, `gh`, 0 token), que l'installateur propose quand le pack le règle : il lance le workflow hors prod du dépôt sur la branche de la PR (`gh workflow run --ref`), avec les inputs de l'env. Il refuse tout dépôt ou env hors réglage, une PR fermée ou d'une fork, et tout workflow de prod (`prod_workflow` de la config, ou « prod » dans son nom hors « nonprod »). Une version laissée vide fait construire la branche ; un dépôt qui n'accepte qu'un tag ne se règle pas ici.

  ![Déployer la branche : DEV pris par la branche d'un collègue, STG par une version](../img/deployer-branche.png)

  ![« ⇄ Remplacer… » : la fenêtre prévient avant la carte Kronn](../img/deployer-remplacer.png)

  ```json
  "deploy": {"repos": {"owner/depot": {"workflow": "CD_Deploy-NONPROD.yaml",
    "envs": {"dev": {"envchoice": "dev", "versiontags": "", "validation": "oui"},
             "stg": {"envchoice": "stg", "versiontags": "", "validation": "oui"}}}}}
  ```
  dans `settings.json` du pack (ou ta config). `workflow` est facultatif (sinon le `staging_workflow` du dépôt) ; le nom de chaque env (`dev`, `stg`) doit figurer dans le titre des runs du workflow, c'est par lui que le cron live retrouve l'occupant.
- **Commenter** : à tout statut. Le texte se saisit dans la carte Kronn ; il part sur le ticket dans Jira avec le compte de ta connexion Atlassian, suivi de « (depuis Le Bureau) ». C'est un workflow du Bureau (« Le Bureau · commenter un ticket », un appel Jira, 0 token), créé par l'installateur quand Jira est connecté.
- **Réestimer** (ton workflow `launch.estimate`, sinon le modèle du Bureau installé, `models.estimate`) : sur un ticket non terminé du sprint. Les nouveaux Story Points et la raison se saisissent dans la carte Kronn ; le ticket est mis à jour dans Jira avec un commentaire qui donne l'ancienne valeur, la nouvelle et la raison.
- **⏱ Temps gagné IA** (modèle du Bureau `models.ai_time`) : sur un ticket terminé ; grisé quand son label de suivi est déjà posé. Voir [Temps gagné par l'IA](22-temps-gagne-ia.md).

Chaque bouton ouvre la carte Kronn du workflow : tu valides, puis elle suit le run étape par étape (une seule note le rappelle, en bas de la section). Les workflows se choisissent dans `bureau.config.json` (clé `launch` : `impl`, `mep`, `mep_pr`, `review`, `fix`) ; sans eux, la fiche n'a pas de boutons. N'importe quel workflow Kronn convient : si ses variables ne portent pas les noms attendus, donne-les.

```json
"launch": {
  "impl": "<id du workflow>",
  "mep": {"wf": "<id>", "vars": {"ticket": "issue_key", "pr": null}},
  "review": {"wf": "<id>", "vars": {"repo": "project", "pr": "mr"}}
}
```

Rôles et noms par défaut : `impl` → `ticket` (`jira_ticket_key`) ; `mep` → `ticket` (`jira_ticket_key`), `pr` (`pr_number`) ; `review` → `repo`, `pr` ; `fix` → `pr`, `notes`, et `repo` (facultatif : absent tant que tu ne le nommes pas, par exemple `{"wf": "…", "vars": {"repo": "repo"}}`) ; `estimate` → `ticket` (`jira_ticket_key`), `points` (`story_points`), `reason` (`raison`), par exemple `{"wf": "…", "vars": {"ticket": "ticketKey"}}` si ton workflow nomme autrement la clé du ticket. `null` : ton workflow n'a pas cette variable, elle n'est pas envoyée.

![Fiche d'un ticket](../img/fiche-ticket.png)

**PR** : un clic sur une PR (fil, fiche d'un ticket ou d'un collègue) ouvre le Mur Kanban filtré sur son auteur, et sa fiche dans le volet ; depuis son ticket, « ← » y revient. Son nom avec son dépôt, son titre, l'état de sa review, son auteur (sa fiche), le lien GitHub, le ticket qu'elle cite (sa fiche) et les runs d'agents du jour qui l'ont traitée (une revue de Dwight, une correction). Puis les mêmes boutons que dans la fiche du ticket, avec leur agent et l'action conseillée : **🌿 Générer l'env de branche** (dépôts de `launch.env`), **Remettre à jour**, **Corriger les retours**, **Faire relire** (PR pas encore approuvée) et **Mise en prod** (son ticket en To Deploy).

Dans « Ses PR ouvertes » (fiche d'un collègue, du boss ou d'un ticket), le numéro d'une PR ouvre sa fiche (« ↗ » ouvre GitHub) et chaque ligne montre son état : « ⛔ conflit », « ⟳ 3 de retard », « 💬 4 fils » non résolus.

Sous l'auteur, l'état de la PR face à sa branche de base, relu à chaque passage du cron équipe : **⛔ conflit avec main**, **⟳ 4 commits de retard sur main** ou **✓ à jour de main**. **⟳ Remettre à jour** (PR en retard, en conflit, ou d'état encore inconnu) la rejoue sur sa base sans rien écraser :
- dans une copie du dépôt dédiée au run (`~/.cache/pixel-bureau/pr`), rebase sur sa base avec ses commits gardés tels quels (ni squash ni messages changés) ;
- sans conflit : push protégé (`--force-with-lease`, refusé si quelqu'un a poussé entre-temps), puis le label de CI du dépôt retiré et reposé ; 0 token ;
- avec un conflit : un agent IA le résout commit par commit, la commande de contrôle du dépôt tourne (`github.checks`), puis une validation t'attend dans ta fiche de boss, avec les fichiers, ce qui a été gardé de chaque côté et le résultat du contrôle. **Approuver** pousse ; **Rejeter** ou **Changements** ne pousse rien.

**🛠 Corriger** (dès qu'il reste des fils de review non résolus, sur tous les dépôts suivis ; leur nombre est relu à chaque passage du cron équipe) : Nate traite les conversations de review que personne n'a marquées « résolues » sur GitHub. Dans une copie du dépôt dédiée au run, avec ses dépendances reliées depuis ton dossier local du dépôt, il corrige les fils qui demandent un changement (tests compris, conventions de `docs/AGENTS.md`) ; un correctif dont les contrôles ne passent pas au vert est annulé. Il répond seulement aux fils qu'il traite ou qui appellent une vraie réponse, en deux à quatre lignes, une icône par section (✅ **Corrigé**, 🧪 **Test**, ⏭️ **Laissé tel quel**, 💬 **Réponse**), et rédige le message de commit au format du dépôt. Tes consignes (champ de la carte Kronn) passent avant son tri, celles de l'équipe (section `fix` du pack) s'y ajoutent. Le Bureau lance ensuite la commande de contrôle du dépôt s'il en a une (`fix.checks` du pack, `github.checks` de ta config). Une validation t'attend avec le verdict des contrôles, le message de commit, le diff et les réponses prévues : **Approuver** commite (signé, `Signed-off-by`), pousse (push protégé), poste les réponses, marque résolus les fils corrigés, pose le bloc « 🤖 Corrections de review » dans la description de la PR (remplacé à chaque passage) et relance la CI ; **Rejeter** ou **Changements** : rien n'est poussé ni posté. Un seul run à la fois par PR.


Une PR se reconnaît à son dépôt et à son numéro : `#2039` pour le dépôt principal (`github.repo`), `front_api#16` pour un autre dépôt suivi (`github.pr_repos`, par défaut le principal et ceux des mises en prod). Deux PR #16 de deux dépôts ne se confondent jamais : chacune a sa fiche, ses boutons (Faire relire envoie son dépôt et son numéro), sa ligne dans la fiche du collègue et du ticket, et compte dans « PR ouvertes ». Une PR est rattachée à un ticket par la clé Jira de son titre ou de sa branche (`feat/EW-7317-…`). Corriger une PR d'un autre dépôt demande un workflow qui prend le dépôt (`launch.fix.vars.repo`) ; sinon le bouton n'est proposé que pour le dépôt principal. Pour une PR d'un dépôt non suivi, la page n'en connaît que ce qu'en disent les runs : l'auteur, les agents, le lien GitHub.

![Fiche d'une PR](../img/fiche-pr.png)

**Visiteur** : la discussion Kronn, ses messages importants, le run qui l'a lancée, et la carte de chaque question qui t'attend (la même que dans la fiche du boss).

**Le canard** (clic sur le canard du plan) : une phrase sur la [méthode du canard en plastique](https://fr.wikipedia.org/wiki/M%C3%A9thode_du_canard_en_plastique), puis :
- **Ses questions** : quand une de ses discussions t'a posé une question, sa carte de réponse en tête de la fiche, la même que dans ta fiche de boss (un bouton par option, réponse libre, refus). Elle disparaît au passage du cron qui suit ta réponse.
- **Parler au canard** : un sélecteur de projet Kronn (« Sans projet » en premier, le choix est retenu dans ton navigateur) et un bouton. La carte Kronn demande un titre facultatif (celui de la liste ; vide : la première ligne du sujet) et le sujet (texte libre ou numéro de ticket) ; le workflow du Bureau « Le Bureau · parler au canard » ouvre une discussion « 🦆 … » avec Claude Code dans ce projet et lance l'agent. Pas de boutons en mode TV.
- **Son sprint** (le [canard d'équipe](01-plan.md#le-canard-déquipe)) : son stade, les points déployés sur la cible du sprint et le pourcentage atteint, une barre jusqu'au stade suivant, les 6 stades (ceux pas encore atteints estompés), puis ses canetons : un par sprint où l'équipe a fait mieux que sa moyenne des 4 sprints d'avant (au survol d'un caneton : son sprint, ses points et cette moyenne). Les stades atteints sont sur fond, l'actuel encadré, ceux à venir en pointillés.
- **Ses trophées** : les 6 succès, gagnés (avec leur période) ou grisés avec leur progression (« 3 / 10 », « 6 / 8 »). Un succès gagné mais qu'il ne porte pas encore (ceux de la semaine passée arrivent le lundi à l'ouverture du bureau) dit « le porte lundi à 08:00 », son accessoire estompé et sa carte encadrée ; gagnés sur fond, les autres en pointillés.
- **Ses discussions** : celles des 14 derniers jours (15 au plus), les plus récentes d'abord, avec leur projet, un lien vers Kronn et « attend ta réponse » quand l'agent t'a posé des questions. Elles ne comptent jamais comme des visiteurs.

![Le canard et sa fiche](../img/canard.png)

![Le canard attend ta réponse : sa question en tête de sa fiche](../img/canard-question.png)

La **fiche de paie** (enveloppe sur le bureau du boss) donne tokens, runs et échecs par agent sur 7 jours, avec un coût estimé, rangés par famille (au quotidien, pages, autres) avec le sous-total de chacune. Un intérimaire n'existe que les jours où son workflow tourne : une page mise à jour une fois par semaine n'y figure que ce jour-là.

## Cartes de passion

Selon la clé `passion` du roster, la fiche d'un collègue affiche aussi :

- **Carte GitFut** : sa carte de joueur façon FIFA Ultimate Team, notée sur 99 d'après son activité GitHub ([gitfut.com](https://gitfut.com)), sans le fond, cliquable. Chaque personne du roster qui a son vrai login GitHub (champ `github`, celui de gitfut.com/<login>) a sa carte, et la personne qui installe aussi (login de `gh`) ; la clé `gitfut` de `bureau.config.json` (`{clé du roster: login GitHub}`, `false` pour aucune) remplace cette liste ; le cron horaire la récupère une fois par jour (script `gitfut_snapshot.py`, image réduite par Pillow, celui du venv du dépôt quand Kronn lance le python3 du système).
- **Smash Bros Ultimate** (`smash` : `pseudo`, `main`, `rank` en texte ou en liste, `tournament`, `url`) : pseudo, personnage principal, classements (mondial, européen, français : un par pastille, le premier en avant), dernier tournoi, lien vers son profil.
- **Top 3 dramas** (`dramas` : `top` (3 titres), `now`) : façon Netflix, avec l'épisode en cours.
- **Top 3 libre** (`top3` : `title`, `top` (3 titres), `now`) : même carte, sur le sujet de son choix (ex. « Films de François Civil »).

Sans les infos, la carte s'affiche avec « à venir ».

