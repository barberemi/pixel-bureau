# Fraîcheur des données

Le badge de l'en-tête dit quand les prochaines données arrivent ; au survol, l'état de chaque source.

- Compte à rebours jusqu'au prochain passage du cron live (toutes les minutes), « ✓ à jour » à l'arrivée, « en pause » hors des heures des crons.
- Survol : chaque source (direct, journée, équipe, fiche de paie, canard d'équipe) avec son âge et son prochain passage estimé (calendrier du cron + durée de son dernier run), en rouge si elle est en retard.
- **↻ Relancer** sur une ligne en échec ou en retard : relance tout de suite le cron de cette source, après confirmation dans la carte Kronn (pas en mode TV).
- Diagnostic sous le tableau : cron du Bureau en échec (étape et message, par exemple Jira refusé), erreurs GitHub, Jira muet, dernier nettoyage des vieux runs.
- Données arrêtées depuis plus de 3 minutes : les personnages passent en « ⏸ données figées » au lieu de rester au travail toute la nuit.

![Panneau Fraîcheur : la journée en retard et l'équipe en échec, chacune avec « ↻ Relancer »](../img/fraicheur.png)
