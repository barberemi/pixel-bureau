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

const at = (d, hm) => Date.parse(`${d}T${hm}:00+02:00`);
const life = (d, hm) => J(`feedLifeEvents(${at(d, hm)}).map(e => ({t: e.t, imp: e.imp, txt: e.txt}))`);

test('cérémonies : planning du vendredi et rétro du jeudi à leur heure de début, dans « Tout » seulement', () => {
  run(`TEAM = mergedTeam(); DUCKGAME = null; DAY0 = parisMidnight(${at('2026-10-02', '12:00')});`);
  const pl = life('2026-10-02', '11:00').find(e => /Sprint planning/.test(e.txt));
  assert.equal(pl.t, at('2026-10-02', '10:00'));
  assert.equal(pl.imp, false);
  assert.match(pl.txt, /animé par <a [^>]*data-who=/);
  assert.equal(life('2026-10-02', '09:59').filter(e => /Sprint planning/.test(e.txt)).length, 0); // rejeu : pas encore
  run(`DAY0 = parisMidnight(${at('2026-10-01', '12:00')});`);
  assert.match(life('2026-10-01', '16:00').find(e => /Rétrospective/.test(e.txt)).txt, /animée par .* · 1 h/);
});

test('canard : succès du jour et caneton né en « Important », changement de stade en « Tout » ; rien d\'un autre jour', () => {
  run(`DAY0 = parisMidnight(${at('2026-10-05', '12:00')});
    TEAM = {sprint: {name: 'S2', start: new Date(${at('2026-10-05', '09:00')}).toISOString(), end: new Date(${at('2026-10-16', '17:00')}).toISOString()},
      people: [{name: 'Pam', tickets: [{key: 'DM-1', cat: 'done', points: 6, since: new Date(${at('2026-10-05', '11:00')}).toISOString()}]}], unassigned: []};
    DUCKGAME = {generated_at: 'x', target: 20, sprint: {name: 'S2'}, sprints: [{name: 'S1', held: true}],
      trophies: {relu_24h: {ok: true, at: new Date(${at('2026-10-05', '08:00')}).toISOString()}, zero_panne: {ok: true, at: new Date(${at('2026-09-28', '08:00')}).toISOString()}}};`);
  const e = life('2026-10-05', '12:00');
  const tr = e.filter(x => /succès/.test(x.txt));
  assert.equal(tr.length, 1);
  assert.match(tr[0].txt, /data-who="duck"[^>]*>Le canard<\/a> débloque un succès : <b>Relu dans la journée<\/b>/);
  assert.notEqual(tr[0].imp, false);
  const kid = e.find(x => /caneton<\/a> est né/.test(x.txt));
  assert.equal(kid.t, at('2026-10-05', '09:00'));
  assert.notEqual(kid.imp, false);
  const st = e.filter(x => /mue|passe <b>/.test(x.txt));
  assert.deepEqual(st.map(x => [x.imp, /mue/.test(x.txt) ? 'mue' : /Caneton/.test(x.txt) ? 'caneton' : '?']), [[false, 'mue'], [false, 'caneton']]);
});

test('visites (démo du 1er octobre) : Gandalf à la réouverture, Yoda à chaque prod réussie, David à son arrivée', () => {
  run(`TEAM = mergedTeam(); DUCKGAME = null; DAY0 = parisMidnight(${at('2026-10-01', '12:00')});`);
  const e = life('2026-10-01', '18:30').filter(x => /g_gandalf|g_yoda|g_david/.test(x.txt));
  assert.ok(e.every(x => x.imp === false));
  const g = e.find(x => /g_gandalf/.test(x.txt));
  assert.match(g.txt, /passe pour la réouverture de <a [^>]*data-tk="DM-7089"[^>]*>DM-7089<\/a> <small>« Vous ne passerez pas ! »<\/small>/);
  assert.equal(g.t, at('2026-10-01', '10:50'));
  assert.equal(e.filter(x => /g_yoda/.test(x.txt) && /passe féliciter <a [^>]*data-who="p_/.test(x.txt)).length, 4);
  assert.match(e.find(x => /g_david/.test(x.txt)).txt, /passe (voir <a [^>]*data-who="p_|au bureau).*jusqu'à \d\d:\d\d/);
  assert.equal(life('2026-10-01', '10:49').filter(x => /g_gandalf/.test(x.txt)).length, 0);
});
