// Page « Support · bilan » (page/support-bilan.html) : son script chargé seul (vm, sans DOM) ; lecture du dataset
// support_bilan, agrégats (entonnoir, postes par investigation, gate, causes de tes retours, projet × catégorie), filtres de
// période et de projet, rendu complet, fiche, textes échappés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'support-bilan.html'), 'utf8');
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {window: {}};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const B = ctx.window.SUPPORT_BILAN;

const gate = o => ({visites: 1, changements: 0, refus: 0, attente_ms: 120000, decision: 'approuvee', ...o});
const d = (msg, o) => ({msg, at: '2026-10-30T10:00:00Z', from: 'Pam', subject: 'Sujet ' + msg, url: 'https://teams/' + msg, state: 'done',
  by: null, relance: false, resolu: false, projet: 'site-web', categorie: 'bug', runs: 1, run: 'r' + msg, disc: 'd' + msg,
  poste_at: '2026-10-30T11:00:00Z', reponse_s: 3600, reponse_brut_s: 3600, cout: 0.4,
  postes: {tri: {ms: 40000, cout: 0.02, passages: 1, modele: 'claude-haiku-4-5'}, cause: {ms: 300000, cout: 0.3, passages: 1, modele: 'claude-sonnet-5'},
    reponse: {ms: 60000, cout: 0.08, passages: 1, modele: 'claude-sonnet-5'}},
  gate: gate(), renvois: 0, causes: [], certitude: 'etablie', verifs: 2, outils: ['Fastly'], deja_traite: false, ...o});
const DATA = {generated_at: '2026-11-02T16:00:00+00:00', canal: 'Support Scranton', kronn_ui: 'http://localhost:5173/', error: null,
  demandes: [
    d('1', {at: '2026-11-01T20:33:00Z', subject: '404 <dans> le menu', resolu: true, gate: gate({changements: 1, visites: 2}), causes: ['longueur'],
      renvois: 1, certitude: 'supposee', piste: 'valider les liens', postes: {tri: {ms: 40000, cout: 0.02, passages: 1}, cause: {ms: 300000, cout: 0.3, passages: 1},
        reponse: {ms: 60000, cout: 0.08, passages: 2}, relecture: {ms: 20000, cout: 0.01, passages: 2}}}),
    d('2', {projet: 'api', categorie: 'accès', relance: true, reponse_s: 7200, runs: 2, cout: 0.8, gate: gate({refus: 1, visites: 2})}),
    d('3', {runs: 0, state: 'answered', by: 'Dwight', projet: null, categorie: null, poste_at: null, reponse_s: null, cout: 0, postes: {}, gate: gate({visites: 0, decision: null})}),
    d('4', {runs: 0, state: 'skipped', projet: null, categorie: null, poste_at: null, reponse_s: null, cout: 0, postes: {}, gate: gate({visites: 0, decision: null})}),
    d('5', {state: 'failed', poste_at: null, reponse_s: null, gate: gate({visites: 0, decision: null})}),
    d('6', {at: '2026-09-01T10:00:00Z'}),
  ],
  fiches: {'1': {extrait: 'x', reactions: ['👍', 'custom'], replies: 1, comment: 'check <vite>', versions: 2,
    postes: {tri: {categorie: 'bug', urgence: 'haute'}, logs: {verifs: 2, outils: ['Fastly']}, cause: {certitude: 'supposee'}, relecture: {verdicts: ['revoir', 'ok']}},
    retours: [{at: 'x', cause: 'longueur', texte: 'Trop long'}], reponse: '🔎 Cause : slug <b>',
    deroule: [{n: 'open', at: '2026-11-02T10:15:00Z', ms: 100, s: 'Success'}, {n: 'tri', at: '2026-11-02T10:15:01Z', ms: 40000, s: 'Success'},
      {n: 'gate', at: '2026-11-02T10:16:00Z', ms: 600000, s: 'Success'}, {n: 'post', at: '2026-11-02T10:26:00Z', ms: 3000, s: 'Success'}]}},
  kpi: {value: '1 h 30', label: 'médiane avant réponse (h. ouvrées)', short: 'Support · bilan'}};

test('lit le dataset support_bilan (objet, chaîne JSON, current)', () => {
  assert.equal(B.readSupportBilan({datasets: {support_bilan: {current: JSON.stringify(DATA)}}}).demandes.length, 6);
  assert.equal(B.readSupportBilan({datasets: {support_bilan: DATA}}).demandes.length, 6);
  assert.equal(B.readSupportBilan({datasets: {}}), null);
  assert.equal(B.readSupportBilan({datasets: {support_bilan: '{pas du json'}}), null);
});

test('agrégats : entonnoir, gate, coût par investigation, postes, causes, projet × catégorie', () => {
  const a = B.aggregate(DATA, {jours: 30, projet: ''});
  assert.equal(a.n, 5, 'la demande de septembre sort des 30 jours');
  assert.deepEqual({...a.funnel}, {demandes: 5, inv: 3, propose: 2, poste: 2, traite: 1, skipped: 1, answered: 1, sans: 0, panne: 1, refusees: 0, relancees: 1});
  assert.equal(a.medReponse, 5400);
  assert.equal(a.premierCoup, 0);
  assert.equal(a.gated, 2);
  assert.equal((a.refus), 1);
  assert.equal(a.changements, 1);
  assert.equal(a.relances, 1);
  assert.equal(Math.round(a.coutMoy * 100), 40, '1,60 $ pour 4 runs');
  assert.equal(a.postes.cause.n, 4, 'moyenne par run : la demande relancée compte deux fois');
  assert.equal(a.postes.reponse.reprises, 1, 'une reprise du poste ✉');
  assert.equal(a.notes.supposee, 1);
  assert.deepEqual({...a.causes}, {longueur: 1});
  assert.deepEqual([...a.cats], ['bug', 'accès']);
  assert.equal(a.heat['site-web'].bug, 2);
  assert.equal(B.aggregate(DATA, {jours: 30, projet: 'api'}).n, 1);
  assert.equal(B.aggregate(DATA, {jours: 90, projet: ''}).n, 6);
});

test('rendu complet : chiffres, sections, fiche de la plus récente, textes échappés', () => {
  const h = B.render(DATA, {jours: 30, projet: '', sel: null});
  for (const s of ['Support Scranton', 'demandes sur le canal', 'Du message au ✅', 'Les postes', 'Pourquoi tu demandes des changements',
    'D\'où viennent les demandes', 'Historique', 'Le parcours', 'Ce qu\'ont trouvé les postes', 'La réponse postée', 'Et ensuite',
    'trop long, trop technique', 'pas encore de run', 'supposée 1 fois sur 3', '« revoir » 1 fois', 'reprise 1 fois',
    '💡 Piste de fond : valider les liens', 'version 2', 'relancé', '🙂+', '#discussion-d1'])
    assert.ok(h.includes(s), s);
  assert.ok(h.includes('404 &lt;dans&gt; le menu'));
  assert.ok(h.includes('check &lt;vite&gt;'));
  assert.ok(h.includes('slug &lt;b&gt;'));
  assert.ok(!/undefined|NaN/.test(h));
  assert.ok(h.includes('1 🔕 ignorée · 1 prise par un collègue'), 'accords au singulier');
  const h2 = B.render(DATA, {jours: 30, projet: '', sel: '3'});
  assert.ok(h2.includes('Pas d\'investigation : pris par un collègue'));
});

test('sans historique : un message, pas de tableau vide', () => {
  assert.ok(B.render({demandes: []}, {jours: 30}).includes('Aucune demande dans l\'historique'));
  const h = B.render({...DATA, demandes: DATA.demandes.filter(x => !x.runs), fiches: {}}, {jours: 30, projet: '', sel: null});
  assert.ok(h.includes('0 changement demandé') && h.includes('Aucune investigation sur la période'));
});

test('durées lisibles', () => {
  assert.equal(B.fmtDur(45), '45 s');
  assert.equal(B.fmtDur(3600 + 5 * 60), '1 h 05');
  assert.equal(B.fmtDur(null), '–');
});
