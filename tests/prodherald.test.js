// Mise en prod réussie avec un héraut (invité on: « prod », Yoda par défaut, le sage dans la démo) : il entre pendant la
// fête, monte sur la scène à côté de l'auteur (le boss au sax), le félicite en grand 3 min puis repart.
// Démo : prod d'Andy (17.107.0) finie à 10h42, prod de Pam (17.107.1) finie à 9h38, juste avant le daily de 9h40.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => Date.parse(`2026-10-01T${hm}:00+02:00`);
const st = (key, hm) => J(`(s=>({st:s.st,zone:s.zone||null,label:s.label,bubble:s.bubble||null,big:!!s.big}))(stateAt(byKey.${key},${at(hm)}))`);

test('10h43 : le sage sur la scène avec Andy (fête) et Michael (au sax), il le félicite en grand', () => {
  run('TEAM=mergedTeam();');
  const s = st('g_yoda', '10:43'), a = st('p_andy', '10:43'), m = st('p_michael', '10:43');
  assert.deepEqual([s.st, s.zone, s.bubble, s.big], ['proud', 'stage', 'Fier de toi, je suis.', true]);
  assert.match(s.label, /Félicite Andy pour la mise en prod 17\.107\.0/);
  assert.deepEqual([a.st, a.zone], ['party', 'stage']);
  assert.equal(m.zone === 'stagesax' || m.zone === 'stage', true);
  assert.equal(J(`bubbleFor(byKey.g_yoda,stateAt(byKey.g_yoda,${at('10:43')}),${at('10:43')},0).big`), true);
});

test('il se place sur la scène à côté de l\'auteur', () => {
  run(`T=${at('10:43')};for(const c of chars)c._st=stateAt(c,T);`);
  const p = J(`(()=>{const taken=new Set(),a=pickSpot(byKey.p_andy,'stage',taken);taken.add(a.key);const s=pickSpot(byKey.g_yoda,'stage',taken);return {a:[a.x,a.y],s:[s.x,s.y]};})()`);
  assert.equal(p.a[1], p.s[1]);
  assert.equal(Math.abs(p.a[0] - p.s[0]), 1);
});

test('3 min de scène, puis il repart par la porte et disparaît', () => {
  assert.equal(st('g_yoda', '10:41').st, 'off'); // pas encore en prod
  assert.equal(st('g_yoda', '10:45').st, 'proud');
  assert.equal(st('g_yoda', '10:46').st, 'gone');
  assert.equal(st('g_yoda', '10:48').st, 'off');
});

test('prod finie juste avant le daily : il félicite Pam au daily', () => {
  const s = st('g_yoda', '09:41');
  assert.deepEqual([s.st, s.zone, s.bubble], ['proud', 'daily', 'Fier de toi, je suis.']);
});

test('{name} dans la réplique : le prénom de l\'auteur, retiré avec sa virgule s\'il est inconnu', () => {
  const m = J('TEAM.meps.find(x=>x.tag==="17.107.0")');
  run(`byKey.g_yoda.shout='Fier de toi, {name}, je suis.';`);
  try {
    assert.equal(st('g_yoda', '10:43').bubble, 'Fier de toi, Andy, je suis.');
    run('Object.assign(TEAM.meps.find(x=>x.tag==="17.107.0"),{who:null,who_name:null});');
    const s = st('g_yoda', '10:43');
    assert.equal(s.bubble, 'Fier de toi, je suis.');
    assert.match(s.label, /Félicite l'équipe/);
  } finally {
    run(`byKey.g_yoda.shout='Fier de toi, je suis.';Object.assign(TEAM.meps.find(x=>x.tag==="17.107.0"),${JSON.stringify({who: m.who, who_name: m.who_name})});`);
  }
});

test('prod en échec : pas de héraut', () => {
  const m = J('TEAM.meps.find(x=>x.tag==="17.107.0").prod');
  try {
    run('TEAM.meps.find(x=>x.tag==="17.107.0").prod.conclusion="failure";');
    assert.equal(st('g_yoda', '10:43').st, 'off');
  } finally { run(`TEAM.meps.find(x=>x.tag==="17.107.0").prod=${JSON.stringify(m)};`); }
});

test('le héraut des reopens et celui des prods ne se confondent pas', () => {
  assert.equal(st('g_gandalf', '10:43').st, 'off');
  assert.notEqual(st('g_yoda', '10:51').st, 'proud');
});
