# Créer un ticket

Un ou plusieurs tickets Jira écrits au modèle de ton équipe, sans ouvrir Jira : tu donnes l'intention, une chaîne de postes la rédige (recherche, rédaction, critique) et la découpe quand elle touche plusieurs projets, tu relis chaque ticket tel qu'il sera créé, puis le Bureau le crée et son lien revient sur la page. Tout se voit au 2e étage, dans [la salle de rédaction](28-redaction.md).

![Fiche de l'agent : son dernier ticket créé, puis le formulaire « ▶ Lancer »](../img/creer-ticket.png)

## Le lancer

Depuis la **fiche de l'agent** qui incarne le modèle (Karen sur les captures), bloc **▶ Lancer** :

| Champ | |
| --- | --- |
| Intention | obligatoire : ce qu'il faut faire, en quelques phrases |
| Type | liste des types de l'équipe, son type par défaut déjà choisi |
| Story Points | obligatoires |
| Composant | la liste des composants du projet Jira (les dépôts) ; obligatoire quand l'équipe la donne |
| Composant 2 | facultatif, pour un ticket qui touche deux dépôts |
| Sprint | Backlog (par défaut) ou Sprint suivant : le premier sprint à venir du board, jamais le sprint en cours |
| Épic ou parent | facultatif (ABC-123) |

« Lancer… » reste grisé tant qu'il manque un champ obligatoire, et quand trois intentions sont déjà en cours (trois à la fois au plus). Une fois lancé, le formulaire se vide. Les Story Points sont ceux du ticket, ou le total quand l'intention est découpée : l'IA les répartit.

## Le relire

Trois postes, un agent chacun : 📚 la recherche lit quelques fichiers des dépôts des composants ; ✍ la rédaction écrit le ou les tickets au modèle de l'équipe (`jira.create.template`), titre et description en wiki Jira, un composant et des points chacun, et découpe l'intention qui touche plusieurs projets ou livrables ; 🧐 la critique relit, et renvoie à la rédaction ce qui est à retoucher (trois tours au plus). Personne ne crée rien.

La validation arrive sur sa fiche, avec l'alerte ✋ habituelle : le titre, le type, les points, les composants, le sprint et l'épic, puis la description en texte lisible (titres en ▸, panneaux en │).

![La validation : le ticket tel qu'il sera créé](../img/creer-ticket-validation.png)

Chaque ticket a sa validation (« Ticket 2 sur 3 »), l'un après l'autre :

- **✅ Approuver** : ce ticket est créé.
- **Changements** : ce ticket est écarté, on passe au suivant.
- **⛔ Rejeter** : on s'arrête là, plus rien n'est créé.

## La création

Par l'API REST v2 de Jira, sans IA : la description garde ses panneaux, et les `{{…}}` du modèle de l'équipe passent tels quels. Les points vont dans le champ de l'écran de création (`jira.create.points_field`), puis dans celui du board (premier de `jira.points_fields`) s'il est différent.

Le ticket revient sur la page :

- sur la fiche de l'agent, **🎫 Dernier ticket créé** : sa clé (lien vers Jira), son titre, son type, ses points, ses composants et son sprint ;
- dans le fil : « Karen crée DM-7958 », à la place de la ligne du créateur Jira.

Les relevés de la journée le relisent : le bloc disparaît le lendemain, le ticket reste dans Jira.

## Réglages

Modèle du Bureau `ticket`, proposé par l'installateur quand Jira est connecté (`models.ticket`). Réglage `jira.create`, dans le pack de l'équipe (`settings.json`) ou ta config, qui le surcharge clé à clé :

| Clé | Par défaut | |
| --- | --- | --- |
| `types` | Story, Bug, Task | types proposés, avec leur nom dans ton Jira |
| `type` | le premier | type choisi d'avance |
| `components` | aucune liste | composants proposés ; sans liste, le champ est libre |
| `component_required` | oui avec une liste | composant obligatoire |
| `points_field` | le champ du board | champ des points de l'écran de création |
| `template` | aucun | le modèle de ticket de l'équipe : un fichier, ou un chemin dans un dépôt (cherché dans les clones locaux) |

Le personnage vient du pack (`agents[]` avec `model: "ticket"`), comme les autres modèles.
