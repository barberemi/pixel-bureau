// Page « Chaîne · bilan » (page/bilan.html) : son script chargé seul (vm, sans DOM) ; lecture du dataset bilan, agrégats
// (essais écartés par défaut, filtre de dépôt et de période), rendu complet, schéma mermaid dessiné sans script externe
// (CSP de Kronn), textes échappés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'bilan.html'), 'utf8');
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const B = ctx.window.BILAN;

const t = (run, o) => ({run, ticket: 'AB-' + run, titre: 'Titre ' + run, repo: 'dm/site', essai: false, partiel: false,
  debut: '2026-10-30T10:00:00+00:00', duree: 3600, issue: 'pr_prete', version: 'v2', tok: 300000,
  postes: {code: 200000, plan: 100000}, perdu: {echec: 30000, panne: 0}, gates: {plan: 600000},
  tours: {cadrage: 2, essais_code: 1, controles: 2, escalades: 0}, retours: {par_gate: {plan: 1}, par_cause: {perimetre: 1}},
  schema: {prevus: 2, prevus_touches: 1, touches_non_prevus: 1, prevus_non_touches: 1}, exig: {fait: 3, partiel: 1},
  doc: {plus: 4, moins: 1, fichiers: 1, a_maj: 0}, controles: {securite: {bloquants: [1, 1, 0], avis: [2, 0, 2]}}, ...o});
const DATA = {generated_at: '2026-11-01T12:00:00+00:00', versions: [{hash: 'v1', sujet: 'première chaîne', debut: '2026-10-20T10:00:00+00:00'},
  {hash: 'v2', sujet: 'code en une session', debut: '2026-10-27T10:00:00+00:00'}],
  tickets: [t('1'), t('2', {version: 'v1', tok: 600000, debut: '2026-10-20T10:00:00+00:00'}),
    t('3', {essai: true, tok: 900000}), t('4', {repo: 'dm/api', issue: 'escalade'})],
  fiches: {'1': {resume: {orchestrateur: 'Livré <b>vite</b>'}, mermaid: 'flowchart LR\n T[ticket] --> B[blocks/media.twig]\n B -.oublié.-> L[fr.yml]',
    plan: {lots: 1}, touches_non_prevus: ['c'], prevus_non_touches: ['b'], exigences: [{exigence: 'e', etat: 'fait'}],
    doc: {fichiers: [{fichier: 'docs/a.md', plus: 4, moins: 1}], a_mettre_a_jour: []}, retours: [],
    deroule: [{n: 'cadrage', at: '2026-10-30T10:00:00Z', ms: 60000, s: 'Success'}, {n: 'gate_plan', at: '2026-10-30T10:01:00Z', ms: 60000, s: 'Success'}]}},
  kpi: {value: '400 k', label: 'jetons par ticket', short: 'Chaîne · bilan'}};

test('lit le dataset bilan (objet, chaîne JSON, current)', () => {
  assert.equal(B.readBilan({datasets: {bilan: {current: JSON.stringify(DATA)}}}).tickets.length, 4);
  assert.equal(B.readBilan({datasets: {bilan: DATA}}).tickets.length, 4);
  assert.equal(B.readBilan({datasets: {}}), null);
  assert.equal(B.readBilan({datasets: {bilan: '{pas du json'}}), null);
});

test('agrégats : essais écartés, écart avec la version d\'avant, contrôles, schéma', () => {
  const a = B.aggregate(DATA, {jours: 30, repo: '', essais: false});
  assert.equal(a.n, 3);
  assert.equal(a.livres, 2);
  assert.equal(Math.round(a.tok), 400000);
  assert.equal(a.delta, -50); // v1 600 k, v2 300 k
  assert.equal(a.exig, 75);
  assert.deepEqual([...a.ctrl.securite], [9, 3, 6]); // tableaux du contexte vm : recopiés
  assert.deepEqual([...a.schema], [3, 3, 3]);
  assert.equal(B.aggregate(DATA, {jours: 30, essais: true}).n, 4);
  assert.equal(B.aggregate(DATA, {jours: 30, repo: 'dm/api'}).n, 1);
  assert.equal(B.aggregate(DATA, {jours: 7}).n, 2); // le ticket du 20 octobre sort de la semaine
  assert.deepEqual([...B.verdict([10, 7, 3])], ['ok', 'utile']);
  assert.deepEqual([...B.verdict([10, 1, 9])], ['err', 'à revoir']);
});

test('rendu sans coût relevé : les jetons de Kronn, une ligne par ticket, l\'analyse repliée, textes échappés', () => {
  const st = {jours: 30, repo: '', essais: false, sel: null, open: new Set(), tab: 'deroule'};
  const h = B.render(DATA, st);
  for (const s of ['jetons par ticket', 'Où partent les jetons', 'Par ticket', 'Analyse de la chaîne', 'Versions de la chaîne', 'Jetons perdus',
    'Allers-retours par ticket', 'Ce que trouvent les contrôles', 'Le schéma d\'impact a-t-il vu juste', 'Pourquoi tu dis', 'Déroulé'])
    assert.ok(h.includes(s), s);
  assert.ok(h.includes('Livré &lt;b&gt;vite&lt;/b&gt;'));
  assert.ok(!h.includes('<b>vite</b>'));
  assert.ok(/class="grp on" data-g="AB-1\|dm\/site"/.test(h), 'la fiche du plus récent, sa ligne de ticket en surbrillance');
  assert.ok(!h.includes(' $'), 'pas de coût sans journaux');
  assert.ok(!/<details class="analyse" open/.test(h));
  assert.ok(B.render({tickets: []}, {}).includes('Aucun run de la chaîne'));
});

test('coût réel : par ticket (ses runs regroupés), par poste et modèle, fiche en onglets, blocs du run', () => {
  const cout = (usd) => ({usd, cache: 9e6, sortie: 2e5, modeles: {opus: usd * 0.75, sonnet: usd * 0.25},
    postes: {Code: usd * 0.75, Tests: usd * 0.25}, postes_m: {Code: {opus: usd * 0.75}, Tests: {sonnet: usd * 0.25}}});
  const D = {...DATA, tickets: [t('1', {cout: cout(40)}), t('5', {ticket: 'AB-1', issue: 'panne', debut: '2026-10-29T10:00:00+00:00', cout: cout(8)})],
    fiches: {...DATA.fiches, '1': {...DATA.fiches['1'], blocs: [{n: 'Plan : comprendre', rows: [{n: '📋 Plan', m: 'opus', r: 3, c: 1e6, o: 1e4, usd: 2, subs: []}]},
      {n: 'Tour 2 : correction des bloquants', rows: [{n: '🔎 Contrôles', m: 'opus', r: 2, c: 1e5, o: 1e3, usd: 1, subs: [{n: '📏 Règles', m: 'opus', r: 4, c: 2e5, o: 3e3, usd: 3}]}]}]}}};
  const a = B.aggregate(D, {jours: 30});
  assert.equal(a.groups.length, 1, 'deux runs du même ticket : une ligne');
  assert.equal(Math.round(a.usdTicket), 48);
  assert.equal(a.usdPerdu, 8);
  assert.deepEqual({...a.postesUsd.Code.m}, {opus: 36}, 'le partage exact du poste, pas celui du ticket');
  const st = {jours: 30, open: new Set(['AB-1|dm/site']), tab: 'cout', sel: null};
  const h = B.render(D, st);
  for (const s of ['Où part l\'argent', '48,0 $', 'perdus dans des runs', 'O 75%', 'Coût détaillé', 'Tour 2', '└ 📏 Règles', 'Total du run : <b>6,00 $</b>'])
    assert.ok(h.includes(s), s);
  assert.ok(/class="row on" data-run="1"/.test(h), 'ses runs dépliés, le plus récent choisi');
  assert.ok(/<i class="tour"/.test(h), 'un tour de correction en rouge');
  assert.ok(B.render(D, {...st, tab: 'exig'}).includes('class="ex"'), 'les exigences en pleine largeur');
});

test('schéma mermaid dessiné en SVG : nœuds, flèches, arête pointillée', () => {
  const s = B.flowchart('flowchart LR\n T[ticket DM-1] --> B[blocks/media.twig]\n B --> C[Theme.php] & J[media.js]\n B -.oublié.-> L[fr.yml]');
  assert.equal((s.match(/<rect /g) || []).length, 5);
  assert.equal((s.match(/class="ed/g) || []).length, 4);
  assert.ok(s.includes('ed dash'));
  assert.ok(s.includes('<title>oublié</title>'), 'le libellé d\'une flèche au survol');
  assert.equal(B.flowchart(''), '');
});

test('formats', () => {
  assert.equal(B.fmtTok(455000), '455 k');
  assert.equal(B.fmtTok(1500000), '1,5 M');
  assert.equal(B.fmtDur(13200), '3 h 40');
  assert.equal(B.fmtDur(600), '10 min');
  assert.equal(B.fmtUsd(43.3), '43,3 $');
  assert.equal(B.fmtUsd(4.88), '4,88 $');
  assert.equal(B.fmtUsd(225.4), '225 $');
});
