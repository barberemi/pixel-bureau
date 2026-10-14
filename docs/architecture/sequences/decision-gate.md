# Décider une gate depuis la page

Cette séquence décrit comment le boss approuve, rejette ou renvoie une gate d'un workflow d'agent depuis la page. Elle commence au clic sur un des trois boutons d'une carte de gate (Approuver, Rejeter, Changements ; `data-kronn-action="bureau-gate"`, chacun lié à sa ligne de `gates.grows`) [src: file: page/src/55-actions.js:105] et se termine quand Kronn a changé le statut du run et que le cron live republie `gates` sans cette ligne. Elle touche la page, Kronn (action de page et workflow manuel « Le Bureau · décision gate ») et le script `gate_decide.py` [src: file: workflows/templates/gate.json:8].

```mermaid
sequenceDiagram
    actor Boss
    participant Page as Live Page
    participant Kronn as Kronn page action
    participant Wf as Workflow gate
    participant Script as gate_decide.py
    participant Api as Kronn API locale

    Boss->>Page: clic sur Approuver, Rejeter ou Changements
    Page->>Kronn: data-kronn-action bureau-gate, ligne run et decision de grows
    Kronn-->>Boss: carte avec la decision et un commentaire
    Boss->>Kronn: Lancer
    Kronn->>Wf: lance le workflow avec run_id, decision, comment
    Wf->>Script: python3 -c avec les trois arguments
    Script->>Api: GET pages id pour relire le dataset gates
    Api-->>Script: ligne du run avec wf et gate
    Script->>Api: POST workflows wf runs run decide avec gate_step
    Api-->>Script: success et new_status
    Script-->>Wf: message lisible sur stdout
    Kronn-->>Page: data-kronn-action-state mis a jour
    Note over Page,Api: Le cron live suivant republie gates sans cette ligne
```

## Notes

- Ni `run_id` ni `decision` ne sont saisis : Kronn les relit dans la ligne cliquée de `gates.grows` (`dynamic_binding`, `find(id)`, une ligne par gate et par décision) [src: file: page/office_template.html:95] [src: file: workflows/gates_snapshot.py:131].
- Le script retrouve workflow et étape dans le même dataset et envoie `gate_step` : Kronn refuse une décision périmée (le run n'attend plus cette gate) [src: file: workflows/gate_decide.py:7].
- `request_changes` sans commentaire échoue avant tout appel [src: file: workflows/gate_decide.py:38].
- La page observe `data-kronn-action-state` pour mettre à jour la carte [src: file: page/src/55-actions.js:103].

Les questions de discussion (KT-27) suivent la même séquence : bouton `data-kronn-action="bureau-answer"`, ligne relue dans `gates.qrows`, workflow « Le Bureau · réponse à une question » et `question_answer.py`, qui relit la question dans Kronn puis appelle `POST /api/discussions/{d}/questions/{q}/answer` ou `/decline` [src: file: workflows/question_answer.py:1].
