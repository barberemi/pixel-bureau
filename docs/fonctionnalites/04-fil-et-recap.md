# Fil de la journée et récap

Le fil raconte la journée, heure par heure ; le récap la résume en quelques lignes.

![Fil de la journée](../img/fil.png)

- Événements : runs d'agents (regroupés au-delà de 4 runs par jour : « Creed ×38, 31 ✓ 7 ✗ »), tickets créés par l'équipe (« 📝 Jan crée DM-7910 », aussi dans le bandeau du mode TV), tickets Jira qui changent de statut, PR ouvertes, relues et mergées, releases, staging et prod, daily, discussions.
- Pannes des agents, avec la règle de l'alarme du plan (3 échecs d'affilée) : « 🚨 Creed en panne · 3 échecs d'affilée sur Erreurs prod » au 3e échec, puis « ✅ Creed rétabli · après 18 échecs d'affilée » au premier succès. En « Important », ces deux lignes remplacent le regroupement « Creed ×16 · 0 ✓ · 16 ✗ » ; « Tout » garde le regroupement pour les chiffres.
- Le canard d'équipe : « 🏆 Le canard débloque un succès » et « 🐣 Un caneton est né » (début d'un sprint qui suit un sprint tenu) en « Important » ; ses changements de stade et sa mue au début du sprint dans « Tout ».
- Dans « Tout » seulement : le sprint planning et la rétrospective à leur heure (« 🔁 Rétrospective en salle de réunion · animée par Clark · 1 h 00 ») et les visites : le gardien des reopens à chaque réouverture, le héraut des mises en prod à chaque prod réussie, les invités à leur arrivée (« 👋 David passe au bureau · jusqu'à 11:40 », ou « passe voir » le collègue qu'il salue en premier).

![Fil, filtre « Tout »](../img/fil-tout.png)
- Liens dans chaque ligne :
  - un nom en gras ouvre la fiche de la personne ou de l'agent (et l'allume sur le plan au survol) ;
  - une étiquette ouvre une fiche dans la page : ticket du sprint, PR (la fiche de son ticket, avec ses PR et les boutons Relire et Corriger), version (la fiche de la mise en prod) ;
  - une étiquette avec ↗ s'ouvre dehors : Jira pour un ticket créé aujourd'hui ou hors du sprint, GitHub pour une PR sans ticket du sprint ;
  - un nom grisé n'a pas de fiche (relecteur hors de l'équipe, par exemple) : la raison s'affiche au survol.

  Un clic ailleurs sur la ligne ouvre, comme avant, la fiche de la personne principale (ou celle de la mise en prod).
- Filtre « Important » (par défaut) ou « Tout ». Le titre dit « hier » quand les données sont celles de la veille.

![Récap de la journée](../img/recap.png)

- Bouton « ☀ Récap » de l'en-tête : ce qui s'est passé depuis minuit (ouvert d'office avant midi, sur la journée d'hier).
