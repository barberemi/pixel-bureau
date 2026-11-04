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
| Épic ou parent | facultatif (ABC-123) : Jira n'accepte qu'une épic. Vérifié dès le lancement : pour une Story ou une Tâche, ses tickets vont sous son épic (montrée au tampon) ; sans épic, le run s'arrête tout de suite, avant la rédaction |

« Lancer… » reste grisé tant qu'il manque un champ obligatoire, et quand trois intentions sont déjà en cours (trois à la fois au plus). Une fois lancé, le formulaire se vide. Les Story Points sont ceux du ticket, ou le total quand l'intention est découpée : l'IA les répartit.

## Le relire

Avant les postes, le Bureau cherche dans Jira les tickets ouverts dont le titre partage plusieurs mots forts de l'intention (sans IA ; par racine, pour qu'une intention en français retrouve un titre en anglais) : ce sont les doublons possibles, donnés à la rédaction (qui ne réécrit pas un ticket qui existe, et cite un ticket proche) et à la critique.

Trois postes, un agent chacun : 📚 la recherche lit quelques fichiers des dépôts des composants ; ✍ la rédaction écrit le ou les tickets au modèle de l'équipe (`jira.create.template`, recopié en entier dans sa consigne quand c'est un fichier d'un dépôt), titre et description en wiki Jira, un composant et des points chacun, et découpe l'intention qui touche plusieurs projets ou livrables ; quand elle découpe, elle dit aussi quel ticket est bloqué par quel autre (celui dont il consomme le résultat) ; 🧐 la critique relit (modèle suivi, dépendances dans le bon sens, pas de doublon), et renvoie à la rédaction ce qui est à retoucher (trois tours au plus). Personne ne crée rien.

La validation arrive sur sa fiche, avec l'alerte ✋ habituelle : le titre, le type, les points, les composants, le sprint et l'épic, puis la description en texte lisible (titres en ▸, panneaux en │).

![La validation : le ticket tel qu'il sera créé](../img/creer-ticket-validation.png)

Une validation pour la liste. Elle commence par le récap, une ligne par ticket (T1, T2… : titre, type, points, composant, « bloqué par T1 » s'il dépend d'un autre), puis les réserves de la critique s'il en reste, les tickets Jira ouverts proches (🔎, trois au plus) et les labels posés. Le détail de chaque ticket suit quand la liste est courte (3 500 caractères au plus). Sinon, il est au 2e étage, au clic sur la carte du ticket ou sur sa ligne du panneau ([La rédaction et la revue](28-redaction.md)). Les réponses :

- **✅ Approuver** : les tickets sont créés, l'un après l'autre.
- **Changements** : dis ce qui change (« retire T2 », « fusionne T1 et T3 », « T2 : 5 points ») ; la rédaction reprend avec tes retours, puis la critique, puis la validation.
- **⛔ Rejeter** : rien n'est créé.

## La création

Par l'API REST v2 de Jira, sans IA : la description garde ses panneaux, et les `{{…}}` du modèle de l'équipe passent tels quels. Les labels de l'équipe (`jira.create.labels`) sont posés sur chaque ticket. Les points vont dans le champ de l'écran de création (`jira.create.points_field`), puis dans celui du board (premier de `jira.points_fields`) s'il est différent, sauf avec `jira.create.board_copy` à `false` : seule l'estimation est alors remplie.

Quand l'intention est découpée, chaque ticket créé est lié dans Jira (« Blocks » : *blocks* / *is blocked by*) à ceux déjà créés : il est bloqué par ceux à livrer avant lui, et bloque ceux qui l'attendent. Les tickets sont créés l'un après l'autre, chaque lien est posé dès que ses deux tickets existent ; un lien en échec ne défait pas la création.

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
| `board_copy` | oui | recopier les points dans le champ du board quand `points_field` en est un autre ; `false` : seule l'estimation est remplie |
| `template` | aucun | le modèle de ticket de l'équipe : un texte, ou « `<chemin> du dépôt <dépôt>` » (ou « `<dépôt>:<chemin>` »), un fichier lu dans la copie locale du dépôt (le projet Kronn du même nom, sinon `impl.clones`, `~/Sites` par défaut) et recopié dans la consigne de la rédaction et de la critique |
| `link_type` | Blocks | type de lien Jira des dépendances entre les tickets d'une intention découpée |
| `language` | français | langue des tickets rédigés (titre, description) et des rapports des postes ; le code et les noms de fichiers restent tels quels |
| `labels` | aucun | labels posés sur chaque ticket créé, pour repérer ceux rédigés par le Bureau (une espace devient `_`) |
| `mots_vides` | aucun | mots de la maison que la recherche des doublons ignore, en plus des morceaux communs aux noms des composants et du site Jira |
| `title_language` | celle de `language` | langue du titre seul, quand le modèle de l'équipe veut par exemple des titres en anglais et des descriptions en français ; elle passe avant les consignes de langue du modèle, pour que la rédaction et la critique ne se contredisent pas d'un tour à l'autre |

Le personnage vient du pack (`agents[]` avec `model: "ticket"`), comme les autres modèles.
