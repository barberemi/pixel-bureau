# Murs du bureau

Les objets du plan sont cliquables et ouvrent leur détail dans le panneau.

| Kanban du sprint | Planning des crons | Mises en prod du jour |
| --- | --- | --- |
| ![Kanban](../img/kanban.png) | ![Planning](../img/planning.png) | ![Mises en prod](../img/mep.png) |

- **Kanban** (à droite du bureau du boss) : tickets et points par colonne Jira.
- **Planning** (à gauche) : les prochains crons de la journée et ceux déjà passés.
- **Écran du plateau TV** : chaque mise en prod (release, staging, production) avec ses liens GitHub ; confettis quand elle arrive en prod, et le héraut des mises en prod qui vient féliciter l'auteur sur la scène (voir [le plan](01-plan.md)). Plateau fermé le vendredi et le week-end. Une mise en prod lancée à la main sur GitHub apparaît en moins d'une minute : les déploiements sont relus chaque minute par une requête conditionnelle, que GitHub ne décompte pas tant que rien ne bouge.
- **Employé du sprint** (mur de la cafétéria) : le plus de points déployés.
- **Enveloppe de paie** : la fiche de paie des agents.
- **Écran du bureau du boss** : tes autres pages Kronn, en miniatures. L'écran les fait défiler (une toutes les 4 s, halo doré : il se clique) ; un clic ouvre une fenêtre avec une carte par page (miniature, titre, dernière mise à jour) qui ouvre la page dans un nouvel onglet de Kronn. Les pages se choisissent à l'installation (l'installateur liste tes pages Kronn, tu donnes leurs ids, ou leur début, dans l'ordre voulu), rangées dans `bureau.config.json` (clé `boss_pages`). Les miniatures sont refaites par le cron horaire seulement quand une page change, avec Chrome ou Chromium, réduites par Pillow (macOS ou Linux) ; sans Chrome, les cartes restent sans image. Rien en mode TV : ce sont tes pages.

![Mes pages Kronn, depuis l'écran du boss](../img/pages-boss.png)
