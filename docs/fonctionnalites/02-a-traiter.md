# À traiter

Ce qui attend le boss, trié du plus urgent au moins urgent, chaque ligne avec son bouton.

![À traiter](../img/a-traiter.png)

| Ligne | Quand | Bouton |
| --- | --- | --- |
| 🚨 Agent en panne | Dernier run en échec (alarme après 3 échecs d'affilée) | Voir sa fiche |
| ✋ Validation demandée | Un run attend une gate | Décider |
| 💬 Discussion qui attend ta réponse | Une question d'agent sans réponse | Ouvrir |
| PR à relire | Ta review est demandée sur GitHub | Ouvrir |
| PR à corriger | Changements demandés sur ta PR | Corriger |
| Ticket bloqué | En review ou en test sans bouger depuis plusieurs jours | Ouvrir |
| PR sans review | Plus de 24 h sans relecture | Voir |

- Section repliable ; réglage d'installation `ui.todo` : `open`, `folded` ou `hidden`.
- Un workflow désactivé dans Kronn ne crée plus de ligne.
