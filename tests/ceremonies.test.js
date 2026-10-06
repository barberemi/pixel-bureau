// Cérémonies en salle de réunion (rhythm.planning, rhythm.retro ; ceremonyAt, 30-data.js) : sprint planning le vendredi
// de 10h à 10h30 animé par la facilitatrice, rétrospective un jeudi sur deux de 15h à 16h (à partir du 15 octobre 2026)
// animée par un collègue tiré au sort. Toute l'équipe en salle de réunion, l'animateur en bout de table ; en mode TV, leurs scènes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`${d}T${hm}:00${d >= '2026-10-25' ? '+01:00' : '+02:00'}`); // heure d'hiver le 25 octobre
const cr = (d, hm) => J(`(c=>c&&{k:c.k,title:c.title})(ceremonyAt(${at(d, hm)}))`);
run('TEAM=mergedTeam();');

test('sprint planning : chaque vendredi de 10h à 10h30', () => {
  for (const d of ['2026-10-02', '2026-10-09', '2026-10-16']) {
    assert.deepEqual(cr(d, '10:00'), {k: 'planning', title: 'Sprint planning'}, d);
    assert.equal(cr(d, '10:29').k, 'planning');
    assert.equal(cr(d, '10:30'), null);
    assert.equal(cr(d, '09:59'), null);
  }
  assert.equal(cr('2026-10-01', '10:10'), null); // jeudi
});

test('rétro : un jeudi sur deux de 15h à 16h, le 15 octobre et pas le 8 ni le 22', () => {
  assert.deepEqual(cr('2026-10-15', '15:00'), {k: 'retro', title: 'Rétrospective'});
  assert.equal(cr('2026-10-15', '15:59').k, 'retro');
  assert.equal(cr('2026-10-15', '16:00'), null);
  assert.equal(cr('2026-10-29', '15:30').k, 'retro');
  assert.equal(cr('2026-10-01', '15:30').k, 'retro'); // deux semaines avant : le jour de la démo
  for (const d of ['2026-10-08', '2026-10-22']) assert.equal(cr(d, '15:30'), null, d);
});

test('réglages : null retire la cérémonie, every = 1 la rend hebdomadaire', () => {
  const keep = J('RHYTHM.retro');
  try {
    run(`RHYTHM.retro=null;`);
    assert.equal(cr('2026-10-15', '15:30'), null);
    run(`RHYTHM.retro={day:'Thu',at:'15:00',minutes:60};`);
    assert.equal(cr('2026-10-22', '15:30').k, 'retro');
  } finally { run(`RHYTHM.retro=${JSON.stringify(keep)};`); }
});

test('animateurs : la facilitatrice au planning, un collègue tiré au sort à la rétro (le même pour une même date)', () => {
  const host = (d, hm) => J(`ceremonyHost(ceremonyAt(${at(d, hm)})).key`);
  assert.equal(host('2026-10-02', '10:05'), J(`chars.find(c=>c.roleKind==='sm').key`));
  const a = host('2026-10-15', '15:10');
  assert.equal(host('2026-10-15', '15:50'), a);
  assert.ok(J(`byKey.${a}.person`));
  const hosts = new Set(['2026-10-01', '2026-10-15', '2026-10-29', '2026-11-12', '2026-11-26', '2026-12-10'].map(d => host(d, '15:10')));
  assert.ok(hosts.size > 1, 'pas toujours le même');
});

test('sur le plan : toute l\'équipe en salle de réunion, l\'animateur en bout de table avec sa bulle', () => {
  const t = at('2026-10-02', '10:10'), host = J(`ceremonyHost(ceremonyAt(${t})).key`);
  const all = J(`chars.filter(c=>c.person).map(c=>{const s=stateAt(c,${t});return {k:c.key,st:s.st,zone:s.zone,visit:s.visit||null,bubble:s.bubble||null};})`);
  for (const s of all) {
    assert.equal(s.st, 'planning', s.k);
    if (s.k === host) {
      assert.deepEqual([s.zone, s.visit, s.bubble], ['visit', J('headSpot()'), '🗓️ Planning']);
    } else assert.equal(s.zone, 'meet', s.k);
  }
  assert.notEqual(J(`stateAt(byKey.${host},${at('2026-10-02', '10:31')}).st`), 'planning');
});

test('mode TV : les scènes suivent la cérémonie, P et R les forcent, le daily reste le daily', () => {
  run('TVSCENE.manual=null;');
  assert.equal(J(`sceneMode(${at('2026-10-02', '10:10')})`), 'planning');
  assert.equal(J(`sceneMode(${at('2026-10-15', '15:10')})`), 'retro');
  assert.equal(J(`sceneMode(${at('2026-10-15', '09:45')})`), 'daily');
  assert.equal(J(`sceneMode(${at('2026-10-14', '15:10')})`), false);
  assert.deepEqual(J(`planningScenes(${at('2026-10-02', '10:10')}).map(s=>s.t)`), ['Sprint planning', 'Ce qui reste', "Ce qu'on embarque", 'La charge de chacun']);
  assert.deepEqual(J(`retroScenes(${at('2026-10-15', '15:10')}).map(s=>s.t)`), ['Rétrospective', "Ce qu'on a livré", 'Ce qui a coincé', 'Les agents', 'Tour de table']);
  const t = at('2026-10-01', '15:10');
  for (const s of J(`retroScenes(${t}).map(s=>s.f(${t}))`)) assert.ok(s.length > 20);
  for (const s of J(`planningScenes(${t}).map(s=>s.f(${t}))`)) assert.ok(s.length > 20);
  const order = J(`retroOrder(ceremonyAt(${t})).map(c=>c.key)`);
  assert.equal(order[0], J(`ceremonyHost(ceremonyAt(${t})).key`)); // l'animateur commence le tour de table
  assert.equal(new Set(order).size, order.length);
});
