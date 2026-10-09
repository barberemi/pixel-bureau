# Fil de la journée et récap

Le fil raconte la journée, heure par heure ; le récap la résume en quelques lignes.

![Fil de la journée](../img/fil.png)

- Événements : runs d'agents (regroupés au-delà de 4 runs par jour : « Creed ×38, 31 ✓ 7 ✗ »), tickets créés par l'équipe (« 📝 Jan crée DM-7910 », aussi dans le bandeau du mode TV), tickets Jira qui changent de statut, PR ouvertes, relues et mergées, releases, staging et prod, daily, discussions.
- Liens dans chaque ligne :
  - un nom en gras ouvre la fiche de la personne ou de l'agent (et l'allume sur le plan au survol) ;
  - une étiquette ouvre une fiche dans la page : ticket du sprint, PR (la fiche de son ticket, avec ses PR et les boutons Relire et Corriger), version (la fiche de la mise en prod) ;
  - une étiquette avec ↗ s'ouvre dehors : Jira pour un ticket créé aujourd'hui ou hors du sprint, GitHub pour une PR sans ticket du sprint ;
  - un nom grisé n'a pas de fiche (relecteur hors de l'équipe, par exemple) : la raison s'affiche au survol.

  Un clic ailleurs sur la ligne ouvre, comme avant, la fiche de la personne principale (ou celle de la mise en prod).
- Filtre « Important » (par défaut) ou « Tout ». Le titre dit « hier » quand les données sont celles de la veille.

![Récap de la journée](../img/recap.png)

- Bouton « ☀ Récap » de l'en-tête : ce qui s'est passé depuis minuit (ouvert d'office avant midi, sur la journée d'hier).
