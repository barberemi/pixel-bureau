// Fraîcheur : les parties publiées par un cron déjà listé (1er, 2e, 3e étage par live ; services extérieurs par office) ont
// leur ligne en retrait sous leur cron ; les crons des pages bilan ont leur nom quand leur dernier passage échoue.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

test('fraîcheur : chaque partie sous le cron qui la publie, dans l\'ordre du panneau', () => {
  const {run} = load();
  const order = JSON.parse(run('JSON.stringify(freshOrder().map(s=>s.key))'));
  assert.deepEqual(order.slice(0, 5), ['live', 'atelier', 'redaction', 'retours', 'office']);
  assert.equal(order[order.indexOf('office') + 1], 'statuts');
  assert.equal(order.length, run('FRESH_SRC.length'), 'aucune source perdue');
  assert.ok(JSON.parse(run('JSON.stringify(FRESH_SRC.filter(s=>s.cron).every(s=>FRESH_SRC.some(p=>!p.cron&&p.key===s.cron)))')), 'chaque partie a son cron');
});

test('fraîcheur : une partie suit le calendrier de son cron, et se dit en retard quand une étape la fige', () => {
  const {run} = load();
  const src = k => `FRESH_SRC.find(s=>s.key==='${k}')`;
  const now = run('Date.parse(LIVE&&LIVE.generated_at||new Date(DAY0+11*36e5).toISOString())');
  run(`ATELIER={...ATELIER,generated_at:new Date(${now}-20e3).toISOString()};REDACTION={...REDACTION,generated_at:new Date(${now}-7*60e3).toISOString()}`);
  const f = k => JSON.parse(run(`JSON.stringify(freshness(${src(k)}, ${now}))`));
  assert.equal(f('atelier').late, 0);
  assert.ok(f('redaction').late > 0, 'publiée il y a 7 min par un cron d\'une minute');
  run(`STATUTS={...STATUTS,generated_at:new Date(${now}-4*60e3).toISOString()}`);
  assert.equal(f('statuts').late, 0, 'au rythme du cron office (10 min)');
  run('STATUTS={...STATUTS,services:[]}');
  assert.equal(run(`String(freshness(${src('statuts')}, ${now}))`), 'null', 'sans service suivi : pas de ligne');
});

test('fraîcheur : l\'échec d\'un cron nomme ses parties plus publiées, et un cron bilan par son nom', () => {
  const {run} = load();
  const now = run('Date.now()');
  run('CFG.schedules={...CFG.schedules,live:"* * * * *"}'); // le diagnostic lit l\'heure réelle : live à toute heure
  run(`OFFICE={...OFFICE,bureau_failed:{live:{at:new Date(${now}-30e3).toISOString(),step:'retours',err:'script'},chaine_bilan:{at:new Date(${now}).toISOString()},inconnu:{}}};`
    + `ATELIER={...ATELIER,generated_at:new Date(${now}-20e3).toISOString()};REDACTION={...REDACTION,generated_at:new Date(${now}-7*60e3).toISOString()};`
    + `RETOURS={...RETOURS,generated_at:new Date(${now}-7*60e3).toISOString()}`);
  const d = run('diagTxt()');
  assert.match(d, /Direct \(runs, gates\) : dernier passage en échec à \d\d:\d\d \(étape retours : script\) ; plus publiés : 2e étage, 3e étage/);
  assert.doesNotMatch(d, /1er étage/);
  assert.match(d, /Chaîne · bilan : dernier passage en échec/);
  assert.match(d, /inconnu : dernier passage en échec/, 'un cron sans nom connu garde sa clé');
});
