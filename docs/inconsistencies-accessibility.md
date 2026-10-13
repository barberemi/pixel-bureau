# Accessibilité (audit ciblé 0.8.2, 2026-10-11)

Périmètre : la page (`page/office_template.html` + `page/src/*.js` + `page/src/*.css`), référentiel WCAG 2.1 AA. Les cartes d'action injectées par Kronn (`data-kronn-action-slot`) sont hors dépôt et hors périmètre.

| ID | Problem | Area | Severity |
|----|---------|------|----------|
| [TD-20261011-a11y-canvas-mouse-only](tech-debt/TD-20261011-a11y-canvas-mouse-only.md) | Zones du plan (canard, pages du boss, Kanban, planning, calendrier, employé du mois) et infobulles des piles accessibles seulement à la souris sur le `<canvas>` | Clavier | Medium |
| [TD-20261011-a11y-clickable-divs](tech-debt/TD-20261011-a11y-clickable-divs.md) | Tuiles KPI (`<section data-open>`), lignes du fil (`<div class="ev">`) et légende de la loupe (`<div class="lh">`) cliquables mais non focalisables | Clavier | Medium |
| [TD-20261011-a11y-bosspages-modal-focus](tech-debt/TD-20261011-a11y-bosspages-modal-focus.md) | La modale « Mes pages Kronn » (`aria-modal="true"`) ne piège pas le focus et ne le rend pas à la fermeture | Focus | Low |
| [TD-20261011-a11y-toggle-state-unexposed](tech-debt/TD-20261011-a11y-toggle-state-unexposed.md) | Boutons bascule (Direct/Rejouer, Loupe, Important/Tout, Récap) : état porté par la classe `on` seule, sans `aria-pressed` / `aria-expanded` | ARIA | Low |
| [TD-20261011-a11y-heading-structure](tech-debt/TD-20261011-a11y-heading-structure.md) | Saut `<h1>` → `<h4>` dans l'aide de la légende ; `<h2 role="button">` efface la sémantique de titre des groupes | Sémantique | Low |
| [TD-20261011-a11y-skip-link-main-landmark](tech-debt/TD-20261011-a11y-skip-link-main-landmark.md) | Pas de lien d'évitement ni de repère `<main>` (le contenu est dans `<div class="main">`) | Sémantique | Low |
| [TD-20261011-a11y-reduced-motion-canvas](tech-debt/TD-20261011-a11y-reduced-motion-canvas.md) | `prefers-reduced-motion` respecté en CSS seulement (bandeau TV, flash) ; animations du plan, effets de thème et loupe automatique l'ignorent | Mouvement | Low |

## Checklist

**A. Sémantique**
- `<html lang="fr">` présent [src: file: page/office_template.html:2].
- Champs : le curseur et la vitesse ont un `aria-label` [src: file: page/office_template.html:37] [src: file: page/office_template.html:39] ; éditeur d'avatar et canard aussi (`page/src/65-editor.js:123`, `page/src/39-duck.js:219`). Pas de champ à placeholder seul trouvé.
- Boutons vs liens : la carte « Qui fait quoi » est un `<button>` (`page/src/72-whoboard.js:80`), les pages du boss des `<a>` (`page/src/47-bosspages.js:45`). Écarts : voir TD-20261011-a11y-clickable-divs.
- Titres : voir TD-20261011-a11y-heading-structure.
- Repères : `<header>`, `<aside>`, `<footer>` présents, `<main>` absent (TD-20261011-a11y-skip-link-main-landmark).
- Listes : récap en `<ul>` (`page/src/69-recap.js:43`), étapes de l'éditeur en `<ol>` (`page/src/65-editor.js:252`) ; le fil est une pile de `<div class="ev">` (`page/src/70-kpis-feed.js:379`).
- Images : aperçus des pages du boss `alt=""` à côté du titre en texte (`page/src/47-bosspages.js:44`). SVG de fraîcheur `aria-hidden="true"` (`page/src/33-freshness.js:33`). Barre de tickets `role="img"` + `aria-label` (`page/src/60-fiches.js:238`).
- Canvas : `aria-label` sur `#cv` (`page/office_template.html:30`) ; l'équivalent texte du plan est le panneau latéral et « Qui fait quoi ».

**B. Clavier et focus**
- `tabindex` positif : aucun (seul `tabindex="0"`, `page/src/72-whoboard.js:76`, `page/src/50-panel.js:117`).
- Focus visible global : `:focus-visible{outline:2px solid var(--accent)}` (`page/src/styles.css:58`). Le seul `outline:none` (`page/src/styles.css:194`) est compensé par un `box-shadow` sur `.bp-card:focus-visible`.
- Panneau redessiné chaque seconde : le focus est restauré via `data-fid` (`page/src/50-panel.js:38`).
- Flèches haut/bas dans la liste des personnes (`page/src/50-panel.js:139-143`) ; Échap ferme loupe et modale (`page/src/44-loupe.js:133`, `page/src/47-bosspages.js:59`).
- Lien d'évitement, modale, canvas : voir TD.

**C. Couleurs et contraste**
- Les thèmes d'interface s'appliquent toujours (`classique` par défaut, `page/src/01-skin.js:4`) ; les variables claires de base de `page/src/styles.css:2-3` ne sont donc pas visibles. Contrastes calculés (texte sur `--panel`) : Classique ink 13.0, muted 5.83, on-accent/accent 6.25, err 5.25. Tous ≥ 4.5:1. `tests/test_theme.py` vérifie ces contrastes (`page/src/theme-classique.css:4`).
- États du plan : couleur doublée d'une forme d'anneau (pointillé / tirets) dans la légende (`page/office_template.html:50-51`). Pas de cue couleur seule constaté.

**D. ARIA**
- Pas de conflit `<a role="button">` ; conflit `<h2 role="button">` (TD-20261011-a11y-heading-structure).
- Live regions : `#tvscene` `aria-live="polite"`, `#tvbar` / `#tvwho` `aria-live="off"` (`page/office_template.html:31,90,92`).
- `aria-hidden` : uniquement sur des éléments décoratifs (chevrons, icônes).
- Erreurs de formulaire : les formulaires d'action sont rendus par Kronn, hors dépôt.

**E. Médias et dynamique**
- Vidéo : aucune.
- Éclair du thème Halloween : 2 flashs toutes les 37 s (`page/src/46-themes.js:207`), sous le seuil de 3 par seconde.
- Loupe : s'efface après 20 s (`LOUPE_MS`, `page/src/44-loupe.js:8`), désactivable par le bouton « 🔍 Loupe » et fermable (✕, Échap).
- Mouvement réduit : TD-20261011-a11y-reduced-motion-canvas.
