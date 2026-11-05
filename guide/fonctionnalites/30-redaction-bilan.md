# Le bilan de la rédaction

Une page Kronn à part, « Rédaction · bilan », garde l'historique des intentions passées par la salle de rédaction du 2e étage ([La rédaction et la revue](28-redaction.md), [Créer un ticket](20-creer-ticket.md)) et des tickets créés dans Jira : où les tickets s'arrêtent, ce que coûte chaque poste, ce que relève la critique, pourquoi tu demandes des changements au tampon, vers quels projets partent les tickets. Elle sert à suivre la rédaction et à régler ses consignes. Son chiffre clé tient dans l'écran du vidéoprojecteur.

![La page « Rédaction · bilan » : quatre chiffres, le coût par poste et par modèle, l'entonnoir jusqu'à Jira, une ligne par intention](../img/redaction-bilan.png)

## L'installer et la projeter

`python3 tools/install.py` crée la page avec le modèle « créer un ticket » (`models.ticket`) et son cron « bilan de la rédaction (15 min) ». Pour la projeter : « Mes pages Kronn » sur l'écran mural, « ＋ Ajouter » la page « Rédaction · bilan », puis « 📽 Projeter en TV ». Le vidéoprojecteur montre les tickets créés sur 30 jours et le coût d'un ticket.

La page se met à jour toutes les 15 minutes, et tout de suite quand une intention finit par la création de ses tickets : la dernière étape du modèle relance le cron.

## Ce qu'on y voit

En haut, les filtres : période (7, 30 ou 90 jours), projet touché, et « essais » (les intentions qui commencent par « [ESSAI », écartées par défaut).

- **Quatre chiffres** : tickets créés dans Jira sur les tickets proposés (en rouge quand rien n'est arrivé dans Jira), coût par intention et par ticket créé, listes rejetées au tampon (et en panne, et tamponnées du premier coup), attente médiane à ton tampon.
- **Où part l'argent** : le coût de 📚 Recherche, ✍ Rédaction et 🧐 Critique sur la période, colorié par modèle (Opus, Sonnet, Haiku). Le coût vient de Kronn (entrée, contexte relu en cache, sortie) ; il est complet, les postes ne lançant aucun sous-agent. La création dans Jira ne coûte rien ; ton tampon, c'est du temps.
- **De l'intention à Jira** : l'entonnoir en tickets (ceux de la dernière version de chaque intention) : proposés, relus « OK » par la critique, tamponnés, créés ; et en rouge ce qui sort à chaque marche.
- **Par intention**, la plus récente d'abord : projets, tickets créés sur proposés (liens Jira), tours de critique, issue, coût par poste, coût, part de chaque modèle, durée. Un clic ouvre sa fiche.
- **Analyse de la rédaction**, repliée : ce qui sert à régler la salle plutôt qu'à lire une intention.
  - **Les postes** : modèle, durée et coût moyens par intention, projets touchés, versions, renvois de la critique ; la création Jira et ton tampon.
  - **Ce que relève la critique** : ses notes classées par mots-clés (langue, critères d'acceptation, découpage, fichier inventé, doublon, points, composant) ; en rouge, ce qui revient au tour suivant.
  - **Pourquoi tu demandes des changements** : tes retours au tampon, classés (découpage, mauvais projet, trop long, titre, points), chacun rattaché au poste à régler.
  - **Où vont les tickets** : projet × type des tickets créés et leurs points moyens, puis combien d'intentions se découpent en 1, 2, 3 tickets ou plus.
  - **Par semaine** : les tickets créés et le coût d'un ticket.

## La fiche d'une intention

Cinq onglets :

- **💰 Coût** : passage par passage (recherche, rédaction v1, critique 1, rédaction v2…), le modèle, la durée, les jetons de sortie et le coût de chacun, un passage en échec marqué ; puis la création Jira et l'attente à ton tampon.
- **🎫 Tickets** : une carte par ticket de la dernière version (projet, points, sa clé Jira une fois créé), les titres de chaque version côte à côte (« identique » quand rien n'a changé) et les tickets créés avec leur lien.
- **🧐 Critique** : une carte par note, à chaque version, avec sa gravité (bloquant ou conseil) ; tes retours au tampon.
- **📚 Recherche** : les projets touchés et les pistes, en pleine largeur, les chemins de fichiers en police de code.
- **⏱ Déroulé** : poste par poste (chaque version, chaque relecture, ton tampon, la création), et l'intention telle que tu l'as donnée.

Les fiches détaillées sont gardées pour les intentions les plus récentes.

![Fiche d'une intention : l'onglet Critique, une carte par note](../img/redaction-bilan-fiche.png)

## Au 2e étage

Dans la salle de rédaction, sur un chevalet entre les tickets épinglés et le bureau du boss, le tableau noir **TICKETS DU JOUR**, jumeau de celui des revues : les tickets créés depuis minuit, ceux qui attendent ton tampon, les intentions en cours et les jetons du jour. L'historique, lui, est dans la page.

## D'où viennent les données

Le dossier d'une intention (`~/.cache/pixel-bureau/ticket/<run>/`) ne garde que la dernière version des tickets et la dernière critique. Chaque intention a donc son bilan dans un historique jamais vidé, `~/.local/share/pixel-bureau/historique/ticket/<run>.json` (réglage `jira.create.historique`), réécrit à chaque étape du modèle : la demande, le rapport de la recherche, chaque version des tickets, chaque critique, tes retours datés et les tickets créés. Une intention d'avant l'historique se lit dans son dossier (dernière version seulement).

Le cron (sans jetons) a deux étapes, chacune relançable seule : `releve` lit dans Kronn ce que lui seul sait (durée, coût et modèle de chaque agent des postes, passages au tampon et décision, créations en échec, déroulé ; un run fini n'est relu qu'une fois), `bilan` assemble l'historique et ce relevé et publie le dataset `redaction_bilan`.

Après la mise à jour : `python3 tools/install.py` (crée la page et le cron), puis `python3 tools/publish.py all`.
