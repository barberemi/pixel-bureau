// Page « Rédaction · bilan » (page/redaction-bilan.html) : son script chargé seul (vm, sans DOM) ; lecture du dataset
// redaction_bilan, agrégats (entonnoir en tickets, tampon, tours de critique, postes, notes de la critique qui reviennent,
// causes de tes retours, projet × type, semaines), filtres de période, de projet et des essais, rendu complet, fiche,
// textes échappés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'redaction-bilan.html'), 'utf8');
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const B = ctx.window.REDACTION_BILAN;

const gate = o => ({visites: 1, changements: 0, attente_ms: 360000, decision: 'approuvee', ...o});
const postes = {recherche: {ms: 240000, cout: 0.38, passages: 1, modele: 'claude-sonnet-5'}, redaction: {ms: 180000, cout: 0.3, passages: 2, modele: 'claude-sonnet-5'},
  critique: {ms: 80000, cout: 0.09, passages: 2, modele: 'claude-sonnet-5'}};
const r = (run, o) => ({run, at: '2026-11-03T10:00:00Z', intention: 'Intention ' + run, type: 'Story', points: '3', sprint: 'backlog', parent: '', essai: false,
  partiel: false, composants: ['dm/site'], proposes: 1, versions: 1, tours: 1, crees: [{key: 'DM-' + run, title: 'T ' + run, composant: 'dm/site', points: 3}],
  issue: 'cree', panne: null, creations_ko: 0, duree_ms: 1800000, avant_tampon_ms: 840000, postes, gate: gate(), cout: 0.77, tok: 12000,
  critique: {notes: [], revenues: [], tours: 1, reserves: false}, causes: [], ...o});
const DATA = {generated_at: '2026-11-04T16:00:00+00:00', jira_site: 'https://dm.atlassian.net', error: null,
  intentions: [
    r('1', {at: '2026-11-04T10:00:00Z', intention: 'Refondre le <lecteur>', composants: ['dm/site', 'dm/api'], proposes: 2, versions: 3, tours: 2,
      crees: [{key: 'DM-7853', title: 'Lecteur : sous-titres', composant: 'dm/api', points: '3'}, {key: 'DM-7854', title: 'Pistes', composant: 'dm/site', points: 2}],
      gate: gate({visites: 2, changements: 1}), critique: {notes: ['langue', 'criteres', 'langue'], revenues: ['langue'], tours: 3, reserves: false}, causes: ['decoupage']}),
    r('2', {crees: [], issue: 'rejetee', gate: gate({decision: 'rejetee'}), critique: {notes: ['decoupage'], revenues: [], tours: 1, reserves: true}, cout: 0.5}),
    r('3', {crees: [], issue: 'panne', panne: 'recherche', gate: {visites: 0, changements: 0, attente_ms: 0, decision: null}, proposes: 0, versions: 0, avant_tampon_ms: null, cout: 0.2}),
    r('4', {essai: true, intention: '[ESSAI du Bureau] x'}),
    r('5', {crees: [], issue: 'panne', panne: 'chaque', creations_ko: 1, composants: ['dm/api'], type: 'Bug'}),
    r('6', {at: '2026-09-01T10:00:00Z'}),
  ],
  fiches: {'1': {intention: 'Refondre le <lecteur>', recherche: {composants: ['dm/site', 'dm/api'], pistes: ['site/Player.vue : le <lecteur>']},
    versions: [{v: 1, tickets: [{summary: 'Player: subtitles'}, {summary: 'Pistes'}]}, {v: 2, tickets: [{summary: 'Lecteur : sous-titres'}, {summary: 'Pistes'}]}],
    critiques: [{v: 1, verdict: 'a_retoucher', notes: [{ticket: 1, note: 'Titre en anglais'}, {ticket: 0, note: 'à découper'}]}, {v: 2, verdict: 'ok', notes: []}],
    retours: [{at: 'x', texte: 'Fusionne <T1>', cause: 'decoupage'}],
    deroule: [{n: 'recherche', at: '2026-11-04T10:00:00Z', ms: 240000, s: 'Success'}, {n: 'redaction', at: '2026-11-04T10:04:00Z', ms: 100000, s: 'Success'},
      {n: 'critique', at: '2026-11-04T10:06:00Z', ms: 40000, s: 'Success'}, {n: 'redaction', at: '2026-11-04T10:07:00Z', ms: 80000, s: 'Success'},
      {n: 'relire', at: '2026-11-04T10:14:00Z', ms: 360000, s: 'Success'}, {n: 'chaque', at: '2026-11-04T10:30:00Z', ms: 3000, s: 'Success'}]}},
  kpi: {value: '3', label: 'tickets créés (30 j) · 0,39 $ / ticket', short: 'Rédaction · bilan'}};

test('lit le dataset redaction_bilan (objet, chaîne JSON, current)', () => {
  assert.equal(B.readRedactionBilan({datasets: {redaction_bilan: {current: JSON.stringify(DATA)}}}).intentions.length, 6);
  assert.equal(B.readRedactionBilan({datasets: {redaction_bilan: DATA}}).intentions.length, 6);
  assert.equal(B.readRedactionBilan({datasets: {}}), null);
  assert.equal(B.readRedactionBilan({datasets: {redaction_bilan: '{pas du json'}}), null);
});

test('agrégats : entonnoir en tickets, tampon, critique, postes, causes, projet × type', () => {
  const a = B.aggregate(DATA, {jours: 30, projet: '', essais: false});
  assert.equal(a.n, 4, 'hors essai et hors des 30 jours');
  assert.equal(a.essais, 1);
  assert.equal(a.crees, 2);
  assert.deepEqual({...a.funnel}, {intentions: 4, proposes: 4, ok: 3, tamponnes: 3, crees: 2, panneAvant: 1, enCours: 0, reserves: 1, rejetes: 1, attente: 0, creationsKo: 1});
  assert.equal(a.gated, 3);
  assert.equal(a.premierCoup, 1, 'la 5 approuvée sans changement ; la 1 après un changement ; la 2 rejetée');
  assert.equal(a.rejetees, 1);
  assert.equal(a.tours, 1.5);
  assert.equal(a.avantTampon, 840000);
  assert.equal(Math.round(a.coutTicket * 100), Math.round((0.77 + 0.5 + 0.2 + 0.77) / 2 * 100));
  assert.equal(a.postes.redaction.n, 4);
  assert.equal(a.renvois, 2);
  assert.deepEqual({...a.notes}, {langue: 2, criteres: 1, decoupage: 1});
  assert.deepEqual({...a.revenues}, {langue: 1});
  assert.deepEqual({...a.causes}, {decoupage: 1});
  assert.deepEqual([...a.types], ['Story']);
  assert.deepEqual({...a.heat.api}, {Story: 1});
  assert.deepEqual([...a.decoupe], [2, 1, 0]);
  assert.equal(B.aggregate(DATA, {jours: 30, projet: 'dm/api', essais: false}).n, 2);
  assert.equal(B.aggregate(DATA, {jours: 90, projet: '', essais: true}).n, 6);
});

test('semaines ISO', () => {
  assert.equal(B.week('2026-11-04T10:00:00Z').l, 'S45');
  assert.equal(B.week('2026-01-01T10:00:00Z').l, 'S1');
  assert.equal(B.week('rien'), null);
});

test('rendu complet : chiffres, sections, fiche de la plus récente, liens Jira, textes échappés', () => {
  const h = B.render(DATA, {jours: 30, projet: '', essais: false, sel: null});
  for (const s of ['tickets créés dans Jira', '1 essai écarté du bilan', 'De l\'intention à Jira', 'Les postes', 'Ce que relève la critique',
    'Pourquoi tu demandes des changements', 'Où vont les tickets', 'Par semaine', 'Historique', 'Déroulé', 'Ce qu\'a trouvé la recherche',
    'Notes de la critique', 'Versions', 'Tickets créés', 'Coût par poste', 'titre ou texte pas dans la langue', '2 · 1 ↺',
    '1 en panne avant le tampon', '1 passé au tampon avec les réserves', '1 rejeté au tampon', '1 en panne à la création',
    'renvoie 2 fois sur 6', 'https://dm.atlassian.net/browse/DM-7853', '✍ Rédaction v2', 'identique', 'découpage : à découper',
    '✍ Rédaction → « découpage à revoir »', 'en panne (recherche)'])
    assert.ok(h.includes(s), s);
  assert.ok(h.includes('Refondre le &lt;lecteur&gt;'));
  assert.ok(h.includes('Fusionne &lt;T1&gt;'));
  assert.ok(!/undefined|NaN/.test(h));
  assert.ok(!h.includes('[ESSAI du Bureau]'), 'essais écartés par défaut');
  assert.ok(B.render(DATA, {jours: 30, projet: '', essais: true, sel: null}).includes('[ESSAI du Bureau]'));
  const h2 = B.render(DATA, {jours: 30, projet: '', essais: false, sel: '2'});
  assert.ok(h2.includes('Fiche détaillée gardée pour les intentions les plus récentes'));
});

test('sans historique : un message, pas de tableau vide', () => {
  assert.ok(B.render({intentions: []}, {jours: 30}).includes('Aucune intention dans l\'historique'));
  const h = B.render({...DATA, intentions: DATA.intentions.filter(x => x.issue === 'panne' && x.panne === 'recherche'), fiches: {}}, {jours: 30, projet: '', essais: false, sel: null});
  assert.ok(h.includes('0 changement demandé') && h.includes('Aucun ticket créé sur la période'));
  assert.ok(!/undefined|NaN/.test(h));
});
