// Résumé du rejeu dans la page du Bureau (90-boot.js) : readRejeuSum lit le dataset rejeu_resume (cron rejeu_bilan), REJEU_SUM
// le garde au démarrage et suit kronn:page-data ; sans dataset, ou illisible : null (la fiche de Palpatine marche sans).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const SUM = {date: '2026-11-20T10:00:00+00:00', temoin: {moyenne: 74, ecart: 6, version: 'b2c3d4e', version_prec: 'a1b2c3d', n: 5},
  dernier: {ticket: 'DM-2041', pr: 123, note: 82, cible: true, fini_le: '2026-11-20T10:00:00+00:00'}, lecons: {a_valider: 2, validees: 5}};
const src = v => ({datasets: {rejeu_resume: {current: v}}});

test('readRejeuSum : objet ou texte JSON, sinon null', () => {
  const {run} = load();
  const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
  assert.equal(J(`readRejeuSum(${JSON.stringify(src(SUM))}).temoin.moyenne`), 74);
  assert.equal(J(`readRejeuSum(${JSON.stringify(src(JSON.stringify(SUM)))}).lecons.a_valider`), 2);
  assert.equal(J(`readRejeuSum(${JSON.stringify(src({temoin: null}))})`), null);
  assert.equal(J(`readRejeuSum(${JSON.stringify(src('pas du json'))})`), null);
  assert.equal(J('readRejeuSum({datasets:{}})'), null);
  assert.equal(J('REJEU_SUM'), null, 'sans dataset (démo) : null');
});

test('REJEU_SUM au démarrage, puis à chaque kronn:page-data', () => {
  const on = {};
  const {run} = load({kronnPageData: src(SUM), globals: {addEventListener: (n, f) => { on[n] = f; }}});
  assert.equal(run('REJEU_SUM.dernier.ticket'), 'DM-2041');
  run('window.KronnPageData={datasets:{}}');
  on['kronn:page-data']({detail: src({...SUM, temoin: null, dernier: null})});
  assert.equal(run('REJEU_SUM.temoin'), null);
  on['kronn:page-data']({detail: {datasets: {}}});
  assert.equal(run('REJEU_SUM.lecons.validees'), 5, 'dataset absent de l\'événement : le résumé est gardé');
});
