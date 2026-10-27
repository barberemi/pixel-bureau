// « ↻ Rafraîchir » une page de l'écran mural (47-rafraichir.js) : le bouton et l'état du jour sur la carte, puis une ligne
// par workflow de la page (bosspages.pages[].feeds) : coût (0 token, ou tokens par run de la fiche de paie), dernier run,
// « ↻ Relancer » (bureau-relaunch) seulement pour un workflow relançable qui ne tourne pas déjà.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const strip = h => h.replace(/<[^>]+>/g, '');
run(`ACTIONS.relaunch = true; var QA = chars.find(c => !c.person && !c.visitor && !c.temp); QA.runs = [];
  var qrun = (wf, status, min, end) => ({wf, run: 'r' + min, status, _s: T - min * 60e3, _e: end == null ? null : T - end * 60e3});
  var QP = {id: 'page-1', title: 'Livraisons', feeds: [{wf: 'wf-cron', name: 'Livraisons · refresh', trigger: 'cron', ai: false, via: null, last: null},
    {wf: 'wf-ia', name: 'Relire les PR', trigger: 'cron', ai: true, via: 'Relire une PR', last: {status: 'Failed', at: '2026-09-25T09:47:00Z'}},
    {wf: 'wf-saisie', name: 'Relire une PR', trigger: 'manual', ai: true, via: null, last: null}]};
  RELAUNCH = [{wf: 'wf-cron', params: 'wf-cron'}, {wf: 'wf-ia', params: 'wf-ia'}];
  PAYROLL = {rate_usd_per_mtok: 3, agents: [{wf: 'wf-ia', name: 'Relire les PR', today: {tok: 0, runs: 0, fail: 0}, week: {tok: 336000, runs: 7, fail: 0}, days: []}]};`);

test('carte : le bouton, et l\'état du jour (en cours, sinon le dernier run fini)', () => {
  assert.match(J('rfFoot(QP)'), /<button type="button" class="rf-btn" data-id="page-1">↻ Rafraîchir<\/button>$/);
  run(`QA.runs = [qrun('wf-cron', 'Success', 90, 85), qrun('wf-ia', 'Failed', 40, 30)]`);
  assert.match(strip(J('rfFoot(QP)')), /✗ Échec à \d\d:\d\d$/, 'le plus récent fini');
  run(`QA.runs.push(qrun('wf-cron', 'Running', 5))`);
  assert.match(strip(J('rfFoot(QP)')), /⏳ Rafraîchissement en cours depuis \d\d:\d\d$/);
  assert.doesNotMatch(J('rfFoot(QP)'), /disabled/, 'un autre workflow relançable ne tourne pas');
  run(`QA.runs.push(qrun('wf-ia', 'WaitingApproval', 3))`);
  assert.match(J('rfFoot(QP)'), /disabled/, 'tous les relançables tournent');
  assert.equal(J(`rfFoot({id: 'x', feeds: []})`), '', 'aucun workflow connu : pas de bouton');
  run(`ACTIONS.relaunch = false`); assert.equal(J('rfFoot(QP)'), ''); run(`ACTIONS.relaunch = true; QA.runs = []`);
});

test('écran : coût, déclencheur, dernier run et bouton de chaque workflow', () => {
  const rows = J('QP.feeds.map(rfRow)');
  assert.match(strip(rows[0]), /0 token automatique \(cron\)Pas encore de run↻ Relancer$/);
  assert.match(rows[0], /class="on rf-go" data-wf="wf-cron"/);
  assert.match(strip(rows[1]), /🤖 IA · ~48 k tokens par runmoyenne des 7 derniers jours · ≈ 0,14 \$ · automatique \(cron\) · lance « Relire une PR »/);
  assert.match(strip(rows[1]), /Dernier run : ✗ le 25\/09 \(échec\)/);
  assert.match(strip(rows[2]), /coût par run pas encore connu/);
  assert.match(strip(rows[2]), /demande une saisie : à lancer depuis Kronn$/);
  assert.doesNotMatch(rows[2], /<button/, 'pas dans la liste des relançables : pas de bouton');
  run(`QA.runs = [qrun('wf-cron', 'Running', 4)]`);
  assert.match(J('rfRow(QP.feeds[0])'), /<button type="button" disabled>⏳ En cours<\/button>/);
  assert.match(strip(J('rfRow(QP.feeds[0])')), /⏳ En cours depuis \d\d:\d\d/);
  run(`QA.runs = []`);
});
