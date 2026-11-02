# Chaîne d'implémentation d'un ticket (#76, #125)

> Modèles `workflows/templates/impl*.json`, script `workflows/chaine.py`, réglage `impl` (pack ou config). Relevé le 2026-10-30, plusieurs dépôts et reprise le 2026-10-30.

## Forme

Un ticket avance sur une chaîne de postes. Un poste = un sous-workflow Kronn à but unique, avec son agent, son modèle et ses skills [src: file: tools/templates.py:IMPL_AGENTS].

```
impl (lanceur, 0 token)          composants Jira -> dépôts -> projets Kronn ; une chaîne par dépôt ; un passage par ticket et par dépôt ;
                                 POST /mcp/workflow-trigger avec project_id et ticket, mode, depot, soeurs, partie, reprise
└─ impl_chain (parent, 20 étapes, project_scope All, require_isolation, concurrency_limit 4)
   ticket · prepare · [cadrage] · questions · ✋gate_questions · [schema] · [patterns] · dossier · orchestrateur_plan · ✋gate_plan
   · mode · [code] · [controles] · orchestrateur · aiguillage · ✋gate_escalade
   · [livraison = 📤 PR · [revue_pr] · [retours]] · ✋gate_pr · [publication] (Stop) · commente_plan (Plan seulement, puis Stop)
   controles = [tests] · missions · parallele (📏 règles, 🔒 sécurité, ⚡ perf · a11y, 🎯 besoin, 📚 doc : un sous-agent chacun, en même temps) · range · [revue] · bilan
   code = entree · [affecter] · plan · code (une session, un commit par lot) · verif · relecture · tri (3 essais) · bilan
```

`[x]` = sous-workflow `impl_x`. Chaque poste a de la place pour grandir : 20 étapes par workflow, comptées séparément pour chaque sous-workflow [src: url: https://github.com/DocRoms/Kronn/blob/main/backend/src/api/workflows.rs].

## Règles du moteur qui dictent la forme

- Kronn refuse un sous-workflow qui contient une gate : les quatre gates sont dans le parent.
- Un sous-workflow sans projet tourne dans le projet et la copie de travail de son parent : les postes n'ont pas de `project_id` (`SHARED_WORKSPACE`), le parent a `project_scope: All` et pas de projet ; c'est le lanceur qui choisit le projet au lancement (`project_id` du trigger). Une étape `TriggerWorkflow` ne sait pas passer de projet, d'où l'Exec du lanceur qui appelle l'API.
- Le commentaire d'une gate « Changements » n'est injecté que dans le prompt d'une étape Agent. Une gate qui renvoie à un sous-workflow perdrait le commentaire : la chaîne le passe aux postes par leur variable `retours` (`{{state.last_human_feedback ?? ""}}`), le poste l'ajoute au dossier (`retours.md`, une seule fois par texte).
- Après « Changements » à une gate, Kronn coupe le run au premier passage de l'étape cible et reprend à l'étape qui SUIT, dans la définition, la dernière étape gardée : si celle-ci avait sauté par un Goto, la reprise tombe sur l'étape sautée. À l'essai d'EW-6550, un retour au Code depuis l'escalade a ainsi exécuté `commente_plan` (le plan posté dans Jira en mode essai). D'où l'ordre : le Code suit `mode` (code 0), le commentaire du plan est la dernière étape (`mode` y saute en code 4), la publication s'arrête par un Stop. Reste exposé, sans effet externe : un « Changements » au plan sur un ticket sans question repasse par la gate des questions (vide) ; une reprise qui a sauté au Code ou aux contrôles repartirait du cadrage.
- `on_result` ne lit que les signaux : `exit_3`/`exit_4` d'un Exec pour brancher, `SUBWF_FAILED` pour un poste en panne.
- Un Goto compte ses passages par arête (source, cible) sur tout le run, et une étape en code non nul dont le Goto a épuisé `max_iterations` **échoue** au lieu de continuer : tous les tours (propositions, essais par lot, tests, tours de contrôle) sont comptés par le script, qui rend 0 au dernier ; `max_iterations` n'est qu'un filet.
- Une référence `{{steps.x.data_json}}` à une sortie d'agent sans enveloppe (`on_invalid: Continue`) est inconnue et Kronn refuse de rendre l'étape : toute référence à une sortie d'étape a un repli `?? …` (posé par le générateur).
- Le shadow de Kronn ne rejoue pas un workflow à variables : l'instantané chiffré des variables est rangé sous l'id du run normal, le run shadow s'arrête sur « snapshot unavailable ». D'où le mode **essai** : toute la chaîne sans push, sans PR, sans Jira (le script saute ces étapes, `reviewers` sort en 5 pour sauter le commentaire Jira, l'`entree` du Code sort en 5 pour sauter l'étape `affecter`).

## ✋ Ce que j'ai compris : la gate du cadrage

Après le cadrage, la gate `gate_questions` s'ouvre à chaque ticket (`questions` sort en 0, la gate suit). Elle montre la compréhension, l'inclus et l'exclus, les critères d'acceptation, les questions avec leur hypothèse, un dépôt qui semble hors périmètre et, si le critique du cadrage n'est pas d'accord après 3 propositions, ses remarques restées. « Changements » renvoie au cadrage avec ton message (`retours.md` garde tout l'échange), autant de tours que tu veux, avant le schéma et le plan. `impl.gate_cadrage: false` : la gate ne s'ouvre que s'il y a à trancher (question bloquante, désaccord du critique, hors périmètre), sinon `questions` sort en 3 (saut au schéma). Essai d'EW-6550 : le cadrage avait compris « le front envoie des données, le mobile affiche » pour une page rendue en HTML par le front, son critique l'avait vu, et la chaîne a filé jusqu'au code.

## Un ticket, plusieurs dépôts : un bureau et une PR par dépôt

Un ticket Jira à plusieurs composants touche plusieurs dépôts. Kronn ne donne qu'une copie de travail par run : le lanceur pose **une chaîne par dépôt** (méthode A), chacune dans le projet Kronn de son dépôt, sur son bureau de l'atelier.

- `repos_for` : un dépôt par composant (`impl.components`, sinon un dépôt réglé du même nom, sinon `owner/composant`), sans doublon. Le champ « Dépôt » du lanceur (owner/dépôt ou nom de composant) force un seul bureau. Un dépôt sans projet Kronn : le lanceur cherche sa copie locale (origine GitHub) dans le dossier des clones (`impl.clones`, `~/Sites` par défaut), la clone là avec `impl.auto_projet` (`gh repo clone`), puis l'ajoute à Kronn (`POST /projects/add-folder`, l'origine est relevée par Kronn) ; à défaut, il est signalé dans la sortie du lanceur et les autres partent quand même.
- Garde-fou : un passage par ticket **et par dépôt**, lu dans la sortie `prepare` des runs actifs (« <ticket> sur <dépôt> »). Un run actif pas encore préparé bloque le lancement (on ne sait pas encore ce qu'il porte).
- Périmètre : la chaîne reçoit `depot` et `soeurs` ; `prepare` refuse une copie de travail d'un autre dépôt et range les sœurs dans `etat.json`. Chaque poste (et l'orchestrateur, par le dossier) reçoit une section « Périmètre de ce bureau » : ne traiter que la part du dépôt, noter ce qui revient aux autres et ce qui en dépend.
- PR sœurs : un bloc « PR sœurs » (`<!-- bureau-soeurs -->`) dans la description de chaque PR liste les autres dépôts et leur PR (ou « pas encore ouverte », branche `kronn/<ticket>`) ; la PR qui s'ouvre après réécrit ce bloc dans celles déjà ouvertes, chacune finit par lister toutes les autres.
- Plan seulement : le commentaire Jira commence par `h3. Partie <dépôt> (i sur n)` (variable `partie`, vide pour un seul dépôt).
- Limites assumées : une gate du plan par bureau ; aucun ordre de sortie entre dépôts (la relecture et la mise en prod ensemble se gèrent à la main).

## Reprise après une panne

Kronn ne reprend qu'un run interrompu (redémarrage), pas un run en échec, et supprime la copie de travail d'un run fini ou en échec ; les commits restent sur la branche `kronn/<ticket>`. La chaîne se reprend donc elle-même, sans rien changer à Kronn :

- Après chaque étape Exec, le dossier est recopié dans `~/.cache/pixel-bureau/chaine/<ticket>/<owner__dépôt>/courant/`. `etat.json` porte l'étape atteinte (`etape`) : `cadrage`, `code` (plan validé), `controles`, `orchestrateur`, `escalade`, `livraison`, `relecture`, `publication`, `fini`.
- Le lanceur a une variable `reprise` : `auto` (défaut) reprend si le dernier run de ce ticket sur ce dépôt est en échec (pas s'il a été rejeté à une gate : Kronn le finit aussi en `Failed`, sa dernière étape est alors la gate), `oui` reprend quoi qu'il arrive (par exemple un « plan seulement » relancé en complet repart au Code sans refaire le plan), `non` repart de zéro (et efface le dossier gardé).
- En reprise, `prepare` recopie le dossier, revient sur la branche `kronn/<ticket>` (locale, sinon celle poussée) et sort en 3 (Goto `code`), 4 (Goto `controles`) ou 5 (Goto `livraison`) ; 0 avant le plan validé : cadrage, schéma et patterns déjà faits sautent à leur rapport (`entree` sort en 5), l'orchestrateur refait le plan et la gate du plan revient.
- Au Code, le plan validé et les lots déjà écrits sont gardés ; si l'orchestrateur avait renvoyé au Code, ses consignes reviennent (`consignes_reprise`). Aux contrôles, un rapport déjà rendu saute (`entree` sort en 3) : le Code efface les rapports des contrôles à chaque passage, ceux qui restent valent pour ce code. Une PR déjà ouverte et relue saute à ta relecture.
- Découper la chaîne en workflows lancés un par un a été écarté : chaque run aurait sa copie de travail, les gates ne seraient plus dans un parent commun, et le dossier devrait vivre hors de la copie de toute façon.

Dans l'atelier, un run en échec des dernières 24 h reste dans « 🧯 En panne » (poste où il s'est arrêté) jusqu'à ce qu'un run plus récent du même ticket et du même dépôt le reprenne.

## Rejouer un ticket déjà livré (essai comparé)

La variable `base` de la chaîne (commit ou branche) fait partir la branche d'un état passé, en mode essai, pour comparer le travail de la chaîne à la PR humaine déjà livrée. Le futur ne doit pas fuiter : chaque poste et l'orchestrateur reçoivent la consigne de juger par rapport à ce commit (la base distante contient la livraison), le diff part de ce commit (`depart` dans `etat.json`), le ticket ne montre ni son statut ni les commentaires postérieurs. Reste visible : l'état actuel de GitHub (environnements, rulesets) quand un agent l'interroge.

## Conformité au besoin et description de la PR

Le poste 🎯 Besoin (mission de l'étape parallèle des contrôles, bloquant par défaut) confronte le diff aux exigences du ticket (critères d'acceptation, « Qu'est-ce qu'on va faire », « Comment on teste », retours de l'humain) : `exigences` = une ligne par exigence, `fait`, `partiel`, `non`, `autrement` ou `hors_scope` ; une exigence non faite qui revient au dépôt est bloquante. Les autres contrôles jugent la qualité du code, aucun ne vérifiait le résultat demandé.

La description de la PR suit le modèle du dépôt avec un emoji par section (🎯 De quoi on parle, 🔧 Comment j'ai réglé, 🧪 Comment on teste, ✅ Validation, 🚦 Avant / après le merge), courte, sans texte d'aide laissé. Deux blocs y sont écrits par le script, pas par l'agent : « 📋 Ce que le ticket demandait, et où ça atterrit » (le tableau du poste Besoin, à l'emplacement `<!-- bureau-exigences -->`) et « ⚠️ Points ouverts » (bloquants restés et avis des contrôles, sans doublon, `<!-- bureau-points -->`). Essai d'EW-7945 : l'orchestrateur disait « avis à reporter dans la PR », le rédacteur les a omis et annonçait « qat retiré ».

## Doc du dépôt à jour

Le plan de l'orchestrateur met déjà la doc dans un lot (« La doc fait partie du travail »), mais rien ne vérifiait qu'elle avait suivi : le poste 📚 Doc (mission de l'étape parallèle des contrôles, bloquant par défaut) le fait.

- Relevé à 0 token dans `missions` (`releve_doc`), passé au sous-agent : docs du dépôt déjà modifiées par la branche (`git diff --numstat` : lignes + et -), docs qui citent un fichier modifié, son nom ou un symbole ajouté ou retiré par le diff (`git grep -F`), fichiers modifiés qu'aucune doc ne cite. Docs relevées : `docs/`, `ai/`, tout `README*`, `AGENTS.md` et `CLAUDE.md` ; `impl.repos.<dépôt>.docs` en ajoute (ex. `guide`).
- Rapport `doc.json` : `docs` = une ligne par doc lue, `a_jour`, `a_mettre_a_jour` (ce qui est devenu faux et quoi écrire), `non_concernee` ou `manquante` (un comportement ajouté que nulle doc ne décrit, avec l'endroit où il devrait l'être) ; une doc à mettre à jour est un constat bloquant, une doc manquante l'est si on en a besoin pour se servir du changement.
- L'orchestrateur renvoie au Code avec la doc à corriger et le texte à écrire ; un bloquant resté (escalade approuvée) part dans « ⚠️ Points ouverts » de la PR. `impl.postes.doc.bloquant: false` en fait un avis, `actif: false` coupe le poste.

## Périmètre : implémentation, PR et retours

La chaîne s'arrête à la PR et à sa vie de revue : `impl_livraison` (« 📤 PR ») pousse et ouvre la PR brouillon, puis appelle `impl_revue_pr` (le modèle de revue `review_child` en foreach sur `.kronn/prs.json`, sans gate, donc imbriquable) et `impl_retours` (commentaires sans réponse corrigés, poussés, une réponse par fil). Ni label de CI ni env de branche : le déploiement reste au RDC. Le modèle « corriger » (`fix`) contient une gate : il ne peut pas être un poste, il reste le bouton « 🛠 Corriger » pour les retours humains qui arrivent après.

## L'étage (page)

`page/src/68-atelier.js` : onglets d'étage (`FLOOR`), plan du 1er dessiné à la place de l'open space (toile `AT_W × AT_H`), panneau des bureaux et fiche (carte de décision `gateCard` pour une gate). Plan : 4 bureaux (`AT_ROOMS`, géométrie `atGeo`, bureaux 1 et 3 en miroir), tapis en U vu comme une ligne (`atBeltS`, `atBeltAt`), bureau stable par ticket (`atSlots`). Scènes : `atDiff` compare chaque nouveau dataset au précédent (arrivée, sortie sauf panne, ✓ qui apparaît, retour au code) ; `AT_MEM.fresh` en montant à l'étage pose tout sans rejouer. Promeneurs des bureaux libres : `atWanderTick` (4 sur l'étage, 2 par bureau). Trajets : `atRouteOut` (derrière la rangée du haut ou devant celle du bas, allée du mur extérieur `g.ax`, porte), le tapis raccourci côté mur extérieur. Loupe : `atLoupeEvents` alimente `loupeScan` (44-loupe.js) quand `FLOOR`. Galerie : `galleryScenes` renvoie `atGalleryScenes` au 1er, jouées sur une copie d'`ATELIER` rendue par `demoEnd`. TV : `setTv` garde l'étage, `tvAtelierHtml` remplace « Qui fait quoi », `tvFloorTick` alterne avec `?floor=alt`. La boucle (`90-boot.js`) ne fait marcher les personnages du RDC que sur le RDC ; `setFloor(0)` les replace (`needTeleport`). Tickets sortis aujourd'hui : runs de la chaîne (`CFG.atelier_chain`) mis de côté par `setData` dans `AT_RUNS`. Données : dataset `atelier` du cron `live`, étape `atelier` (`workflows/atelier_snapshot.py`) : un bureau par run actif de la chaîne, états des postes lus dans les étapes du parent, des contrôles (statut du rapport) et du poste PR.

Vu du RDC (`page/src/69-atelier-rdc.js`) : le dataset `atelier` porte aussi `events` (moments des runs des dernières 24 h : `arrive` à la première étape, `gate` à l'ouverture d'une gate, `back` à chaque passage de plus à l'étape `code`, `panne` à la fin d'une étape en échec hors gate, `sort` à la fin de la livraison réussie) et `livres` (PR ouvertes depuis minuit, fuseau du bureau). La page en tire des lignes du fil (`atFeedEvents`, et la gate qui attend dans « En ce moment », `atFeedPins`), des résultats ⌘K (`atSearchRows`), un bloc « 1er étage » dans Qui fait quoi et la colonne TV du RDC (`atWhoRows`), une 4e tuile en haut de page (`atKpi`, une seule ligne : le bandeau garde sa hauteur) ; tout ouvre la fiche à l'étage (`atGoto`). La démo invente ses moments (`atDemoEvents`). Le numéro de bureau d'un moment est celui du ticket tant qu'il en occupe un (`atSlots`).

Hors du RDC : `page_config` donne `atelier_wf` (préfixes des modèles `impl*`) ; `setData` retire de `DATA.runs` leurs runs et les sous-runs qu'ils lancent (`parent`/`tby`, ex. `review_child` lancé par `impl_revue_pr`), `loneGates` ignore leurs gates, `workflowsWithoutAgent` (« Nouvel agent ») ne les propose pas. Les agents dessinés à l'étage (`atWorker`) prennent l'apparence d'un agent nommé du Bureau mais le nom de leur poste et la famille `jour` (hologramme cyan).

## Robustesse (essais du 2026-10-30)

- Sorties d'agent : champs exigés au premier niveau seulement, `on_invalid: Continue` partout sauf le plan de l'orchestrateur (une clé mal écrite dans un élément de liste faisait tomber la chaîne).
- Schéma ou Patterns en panne : la chaîne continue, l'orchestrateur fait leur travail et le signale. Un contrôle en panne (sous-agent sans rapport : `en_panne`) : le bilan le signale.
- L'orchestrateur reçoit le dossier dans son prompt (étape `dossier`, bilan des contrôles) : une lecture de fichiers par l'agent a été coupée par un faux positif des garde-fous de l'API.
- Une nouvelle tentative par étape Agent (`retry`).
- Le lanceur passe par `/mcp/workflow-trigger` (JSON, détaché) : `/workflows/{id}/trigger` est un flux SSE qui ne répond qu'à la première pause du run. Les variables d'un run étant chiffrées, il reconnaît un ticket déjà sur la chaîne à la sortie de l'étape `prepare` des runs actifs.

## Le dossier du ticket

`.kronn/chaine/` dans la copie de travail (ignoré par git), recopié dans le cache après chaque étape (reprise) : `ticket.md`, `etat.json` (dépôt, sœurs, base, branche `kronn/<ticket>`, étape atteinte, tours, PR), un rapport par poste (`<poste>.json`), `plan.json` et `lots.json`, `controles.json`, `controles_tours.json` (un instantané par tour de contrôles, pour le bilan), `retours.md`. Les postes lisent ce qu'ont écrit les précédents ; l'orchestrateur lit tout.

## Bilan et historique

Chaque run laisse un `bilan.json` dans l'historique, hors du cache de reprise (que `prepare` vide à chaque nouveau départ) : `~/.local/share/pixel-bureau/historique/<ticket>/<owner__dépôt>/<run>.json` (réglage `impl.historique`), jamais vidé. Il est réécrit par `sauve()` après **chaque** étape Exec, comme la copie du dossier : aucune étape de plus dans la chaîne (pas de Goto à replacer, 20 étapes respectées), et le dernier écrit vaut pour un run fini, rejeté à une gate ou en panne (Kronn ne lance aucune étape après une panne). Une erreur du bilan est écrite sur stderr et n'arrête jamais l'étape. `chaine.py bilan` l'affiche.

- Contenu : ticket, titre, dépôt, run, mode (`essai` marqué), reprise, début et dernière mise à jour, étape atteinte et issue d'après le dossier (`pr_prete`, `pr_brouillon`, `plan_seul`, `escalade`, `en_cours`), PR, version de la chaîne.
- Version : empreinte des modèles `impl*.json` et de `chaine.py`, et dernier commit qui les a touchés, calculées au rendu (`templates.impl_version`, injectées dans la config du script `chaine.py` seulement) : une modification se juge sur les tickets qui l'ont suivie.
- Tours : propositions par poste (`tri`), essais du Code (`tri_code`), tours de contrôles, escalades ; comptés dans `etat.json` (les fichiers d'essais repartent de zéro à chaque passage).
- Retours humains (`retours.md`) : la gate d'où ils viennent (poste qui les a reçus : cadrage = « compris », schéma = « plan », code = escalade ou PR) et leur cause par mots-clés, 0 token : convention, découpage, périmètre, mauvaise lecture, autre. Le commentaire d'une approbation arrive aussi par `retours` : il est compté.
- Schéma d'impact : le mermaid, les fichiers prévus (créer, modifier, supprimer) contre ceux que le diff touche.
- Diff : fichiers et lignes par sorte (code, tests, doc) et le détail des docs ; rapport du poste 📚 Doc (`doc.json`) quand il existe.
- Exigences du poste 🎯 Besoin, lots du plan, résumé du cadrage et de l'orchestrateur.
- Contrôles, par poste : bloquants et avis trouvés sur tous les tours, corrigés (absents du dernier tour), restés (encore là au dernier tour : livrés en points ouverts ou tranchés à l'escalade). Un constat se reconnaît d'un tour à l'autre à son fichier et au début de son problème, chiffres ignorés.

Pas dans le dossier, donc pas dans le bilan : jetons, durées, agents et modèles par étape, attente aux gates, issue finale (panne, rejet). Ils se lisent dans l'API Kronn (runs de `impl_chain` et de leurs sous-workflows) ; un run dont aucune étape Exec n'a tourné n'a pas de bilan.

## La page « Chaîne · bilan »

Page Kronn à part (`bilan_page_id`, titre « Chaîne · bilan », dataset `bilan`), créée par `tools/install.py` avec la chaîne ; son HTML est `page/bilan.html`, autonome (ni assemblage ni démo), publié par `install.py` et `publish.py page`. La CSP de Kronn n'admet que du script en ligne : le mermaid du schéma est dessiné par la page (SVG, flowchart simple), sans bibliothèque.

Cron `chaine_bilan` (`workflows/chaine_bilan.py`, 0 token, toutes les 15 min aux heures des crons, créé seulement avec la chaîne et sa page) : les bilans de l'historique complétés par l'API Kronn. Jetons par poste : étapes d'agent du parent (`orchestrateur_plan` = plan, `orchestrateur`) et des runs de ses sous-workflows (`parent_run_id`, un poste par modèle `impl_*`, `parallele` des contrôles à part, la revue du Bureau comptée avec la revue de la PR) ; l'étape SubWorkflow du parent n'est pas comptée (pas de double compte). Jetons perdus : étapes en échec (relancées) et celles d'un run en panne. Attente : durée des étapes Gate. Issue finale : `panne`, `rejete` (dernière étape une gate refusée), `annule`, sinon celle du bilan. Un run fini n'est relu qu'une fois (`~/.cache/pixel-bureau/chaine_bilan/<run>.json`). Un run sans bilan (avant l'historique) est repris de l'API seule (`partiel`). 30 jours, 50 runs, fiches détaillées des 12 plus récents, sortie sous 90 Ko (fiches puis lignes retirées). Le champ `kpi` (jetons par ticket hors essais, écart avec la version d'avant dans le libellé) est le chiffre du vidéoprojecteur (`pages_snapshot.kpi_of`).

Non mesuré : une sortie d'agent invalide (`on_invalid: Continue`) n'est pas reconnaissable dans les runs ; ses jetons ne sont pas comptés à part.

## Allers-retours

- Cadrage et revue croisée : `propose` (agent) puis `critique` (un second agent, sans écriture), `tri` renvoie à `propose` tant que le critique dit `revoir`, 3 propositions au plus. Schéma et patterns n'ont plus de critique : ta gate du cadrage et l'orchestrateur tranchent (essai d'EW-7851 : 7 sessions d'agent avant le code, chacune relisant le dépôt).
- Le Code écrit tout en une session (un commit par lot, ou par sujet en correction), comme un développeur seul ; puis `verif` (commandes du dépôt) et `relecture` ; `tri` le relance tant que c'est rouge, 3 essais. L'essai d'EW-7851 écrivait lot par lot (une session, une vérification et une relecture par lot) : 5 lots, 15 sessions.
- Une vérification rouge est relancée sur une copie du point de départ (`git worktree` détaché dans le dossier) : seules les lignes d'erreur nouvelles comptent (chiffres et chemins ignorés), ce qui était déjà rouge au départ est noté `deja_la` et ne fait pas boucler le Code.
- Contrôles : 🧪 tests d'abord (le poste écrit des tests), puis règles, sécurité, perf · a11y, besoin et doc dans une seule étape Agent qui lance un sous-agent par poste, tous en même temps (Kronn ne lance pas de sous-workflows en parallèle : son `foreach` est séquentiel), `range` range leurs rapports poste par poste ; puis la 🔁 revue croisée par une autre famille de modèle. En série, un tour prenait 45 à 50 min à l'essai d'EW-7851.
- Tour suivant : tous les contrôles repassent (une correction peut casser autre chose), avec le diff de la correction depuis leur dernier passage (`controle_sha`) et leur rapport précédent (`precedent_<poste>.json`) ; ils relisent surtout la correction. 🎯 Besoin juge toujours l'ensemble.
- Entre les contrôles et le code : l'orchestrateur décide `livrer`, `retour_code` (consignes) ou `humain` ; `aiguillage` compte les tours (`impl.max_tours`, 3) puis passe la main à la gate d'escalade.
- Un poste bloquant (règles, sécurité, tests, besoin, doc par défaut ; `impl.postes.<poste>.bloquant`) ne s'écarte que par les réglages ; l'orchestrateur peut écarter perf et revue d'un ticket.

## Réglage `impl`

`repos.<owner/dépôt>` : `base` (sinon `main` ; absente du dépôt distant : sa branche par défaut, ex. `master`), `checks.regles` et `checks.tests` (commandes `sh`, chaîne ou `{cmd, subdir}`, emplacements `{worktree}`, `{main}`, `{php}`, `{ts}`, `{tests_php}`, `{tests_ts}`, `{files}` ; une commande dont les fichiers visés manquent est sautée), `ci_label`, `env_label`, `env_url`, `reviewers`, `docs` (docs relevées pour le poste 📚 Doc en plus de `docs/`, `ai/`, `README*`, `AGENTS.md`, `CLAUDE.md`). `components.<composant>` quand un composant ne porte pas le nom de son dépôt. `postes.<rôle>` (`cadrage`, `cadrage.critique`, `code`, `revue`, `doc`…) : `agent`, `tier`, `model`, `skills` en plus, `actif`, `bloquant`. `skills` et `guidelines` de l'équipe pour le code et les contrôles. `max_tours`, `max_lots`. `clones` (dossier des copies locales, `~/Sites` par défaut) et `auto_projet` (cloner un dépôt absent). `historique` : dossier des bilans de run (`~/.local/share/pixel-bureau/historique` par défaut). `references` : dépôts standard de l'équipe (celui qui fixe les conventions) que chaque bureau peut lire, comme ses dépôts sœurs, par leur copie locale (projet Kronn), jamais modifiés.

Vérifier en conteneur jetable depuis la copie de travail : le projet Compose d'une copie de travail n'a pas de conteneur (nom de dossier), un `docker compose exec` y échouerait sans bruit ; `docker run --rm -v {worktree}/…:/app -v {main}/…/vendor:/app/vendor:ro …` marche (dépendances partagées tant que le verrou n'a pas changé).

## Tests

`tests/test_chaine.py` : rendu des modèles (gates, sous-workflows, agents par poste, sauts de reprise), `workflows/chaine.py` étape par étape dans un dépôt git jetable (dont une reprise après une panne au Code, aux contrôles et après un retour au Code, un bureau par dépôt et ses PR sœurs, le bilan du run gardé dans l'historique), `tests/test_chaine_bilan.py` (cron de la page, API bouchonnée), `tests/bilan-page.test.js` (agrégats et rendu de la page), le lanceur (un dépôt par composant, garde-fou par ticket et dépôt, reprise auto) et le relevé de l'atelier (bureaux, file, pannes).
