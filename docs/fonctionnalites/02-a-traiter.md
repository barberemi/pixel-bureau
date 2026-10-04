# À traiter

Ce qui attend le boss, trié du plus urgent au moins urgent, chaque ligne avec son bouton.

![À traiter](../img/a-traiter.png)

| Ligne | Quand | Bouton |
| --- | --- | --- |
| 🚨 Agent en panne | Dernier run en échec (alarme après 3 échecs d'affilée) | Voir sa fiche |
| ✋ Validation demandée | Un run attend une gate, y compris un nouveau plan proposé à l'équipe ([Le plan](01-plan.md#changer-de-plan-pour-toute-léquipe)) | Décider |
| 💬 Discussion qui attend ta réponse | Une question d'agent sans réponse | Ouvrir |
| PR à relire | Ta review est demandée sur GitHub | Ouvrir |
| PR à corriger | Changements demandés sur ta PR | Corriger |
| Ticket bloqué | En review ou en test depuis plus de 2 jours | Ouvrir |
| PR sans review | Ouverte depuis plus de 24 h sans relecture | Voir |

- **Durées justes** : un ticket compte depuis son entrée dans sa colonne (historique Jira), une PR depuis sa création. Une bascule de sprint, une automatisation Jira ou un push ne remettent pas le compteur à zéro (avant : 7 tickets affichés « 2 j » étaient en review depuis 3 à 87 jours).
- Section repliable ; réglage d'installation `ui.todo` : `open`, `folded` ou `hidden`.
- Un workflow désactivé dans Kronn ne crée plus de ligne.
