// Nouveaux événements du fil (70-kpis-feed.js, KT-21) : chacun daté par les données, donc rejouable.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const M = 60e3;

// runs de premier niveau d'un agent : f = échec, s = succès, un par minute (fini 30 s après son début)
const runs = s => [...s].map((x, i) => ({run: 'r' + i, wf_name: 'Erreurs prod', status: x === 'f' ? 'Failed' : 'Success', _s: i * M, _ve: i * M + 30e3}));

test('panne : au 3e échec d\'affilée, rétabli au succès suivant ; un ou deux échecs ne comptent pas', () => {
  const d = J(`agentDowns({runs: ${JSON.stringify(runs('ffsffffsfs'))}}, 1e9)`);
  assert.deepEqual(d.map(x => [x.t / M, x.up, x.n]), [[5.5, false, 3], [7.5, true, 4]]);
});

test('panne : rejouable, rien après l\'heure affichée', () => {
  const d = J(`agentDowns({runs: ${JSON.stringify(runs('fffs'))}}, 2.6 * ${M})`);
  assert.deepEqual(d.map(x => x.up), [false]);
});

test('en « Important », les lignes de panne remplacent le regroupement « ×N » de l\'agent ; « Tout » garde les deux', () => {
  const c = `{key: 'creed', name: 'Creed'}`;
  const ev = `(() => {const c = ${c}; return [
    {t: 9, c, down: 'creed', txt: 'panne'},
    ...[1, 2, 3, 4, 5, 6].map(i => ({t: i, c, agent: true, grp: 'creed|wf', kind: 'ko', wf: 'Erreurs prod', txt: 'ko'}))];})()`;
  const imp = J(`feedView(${ev}, 'important').map(e => e.txt)`);
  assert.deepEqual(imp, ['panne']);
  const all = J(`feedView(${ev}, 'all').map(e => e.txt)`);
  assert.equal(all.length, 2);
  assert.match(all[1], /×6/);
});
