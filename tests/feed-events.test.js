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

// un agent dont un run passe par une validation : à 10h05, décidée (s) au bout de d minutes, ou encore en attente
function gateAgent(s, d) {
  run(`chars = [{key: 'dwight', name: 'Dwight', runs: [{run: 'g1', wf_name: 'Revue', status: 'Success', _s: ${at('2026-10-01', '10:00')}, _ve: ${at('2026-10-01', '11:00')},
    vars: {jira_ticket_key: 'DM-1'}, steps: [{n: 'publier', k: 'Gate', s: '${s}', at: new Date(${at('2026-10-01', '10:05')}).toISOString(), ms: ${d * M}}]}]},
    {key: 'p_michael', name: 'Michael', person: 'Michael', boss: true}];
    GATES = []; DUCKS = []; TEAM = {sprint: {name: 'S9', start: new Date(${at('2026-09-18', '09:00')}).toISOString(), end: new Date(${at('2026-10-02', '13:00')}).toISOString()}, people: [], unassigned: []};`);
}

test('validation en attente : en haut (« En ce moment »), avec depuis quand ; décidée : ta décision dans le fil', () => {
  gateAgent('WaitingApproval', 0);
  const p = J(`feedPins(${at('2026-10-01', '10:43')}).map(e => e.txt)`);
  assert.match(p[0], /✋ <a [^>]*data-who="dwight"[^>]*>Dwight<\/a> attend ta validation <small>« publier » · <a [^>]*>DM-1<\/a><\/small> <b class="since">depuis 10:05 · 38 min<\/b>/);
  gateAgent('Success', 25);
  assert.equal(J(`feedPins(${at('2026-10-01', '10:20')})`).filter(e => /attend ta validation/.test(e.txt)).length, 1); // rejeu : pas encore décidée
  assert.equal(J(`feedPins(${at('2026-10-01', '10:43')})`).filter(e => /attend ta validation/.test(e.txt)).length, 0);
  const g = J(`gateSteps(${at('2026-10-01', '10:43')})`)[0];
  assert.deepEqual([g.waiting, g.ok, (g.end - g.since) / M], [false, true, 25]);
  gateAgent('Failed', 3);
  assert.equal(J(`gateSteps(${at('2026-10-01', '10:43')})`)[0].ok, false);
});

test('repères du jour : une seule ligne, déduite du calendrier', () => {
  gateAgent('Success', 1);
  const lm = t => run(`landmarks(${t})`).replace(/<[^>]+>/g, '');
  assert.equal(lm(at('2026-10-01', '09:00')), '📌 Dernière MEP de la semaine plateau fermé demain · Fin du sprint S9 demain'); // jeudi
  assert.equal(lm(at('2026-10-02', '09:00')), '📌 Pas de MEP aujourd\'hui (vendredi) · Dernier jour du sprint S9');
  assert.match(run(`landmarks(${at('2026-10-02', '09:00')})`), /<a href="#" class="lk lk-id" data-sprint[^>]*>S9<\/a>/);
  assert.equal(lm(at('2026-10-02', '16:00')), '📌 Pas de MEP aujourd\'hui (vendredi) · Bon week-end'); // sprint fini à 13h : sa ligne est dans le fil
  assert.equal(lm(at('2026-09-29', '09:00')), '📌 Fin du sprint S9 dans 3 jours'); // mardi
  assert.equal(lm(at('2026-09-22', '09:00')), ''); // rien à signaler
});

test('tes actions : lancements à la main en « Important », commentaires, questions et canard en « Tout »', () => {
  const r = (id, h, extra) => `{run: '${id}', wf_name: 'Implémentation ticket', status: 'Success', _s: ${at('2026-10-01', '00:00')} + ${h} * 3600e3, _ve: ${at('2026-10-01', '00:00')} + ${h} * 3600e3 + 6e4, ${extra}}`;
  run(`DAY0 = parisMidnight(${at('2026-10-01', '12:00')});
    chars = [{key: 'ryan', name: 'Ryan', wf: ['a61eba94'], runs: [${r('a', 8, '')}, ${r('b', 9, 'man: 1')}, ${r('c', 17, "man: 1, vars: {jira_ticket_key: 'DM-7911'}")}]},
      {key: 'kevin', name: 'Kevin', wf: ['e709e91c'], runs: [${r('d', 10, 'man: 1')}]}];
    DATA = {actions: [{k: 'comment', at: new Date(${at('2026-10-01', '11:00')}).toISOString(), ok: true, key: 'DM-7089', txt: 'Je regarde'},
      {k: 'ask', at: new Date(${at('2026-10-01', '09:15')}).toISOString(), wf: 'e709e91c-0000', q: 'Pourquoi ?'},
      {k: 'comment', at: new Date(${at('2026-09-30', '11:00')}).toISOString(), ok: true, key: 'DM-1', txt: 'hier'}]};
    DUCKS = [{id: 'k', title: '🦆 Le build casse', created: new Date(${at('2026-10-01', '14:20')}).toISOString(), awaiting: false}];`);
  const e = J(`feedMyActions(${at('2026-10-01', '18:00')}).sort((a, b) => a.t - b.t).map(x => [x.imp === false ? 'tout' : 'imp', x.txt.replace(/<[^>]+>/g, '')])`);
  assert.deepEqual(e, [
    ['imp', '🔁 Tu relances Ryan Implémentation ticket'],
    ['tout', '❓ Tu interroges Kevin « Pourquoi ? »'],
    ['imp', '▶️ Tu lances Kevin Implémentation ticket'],
    ['tout', '💬 Tu commentes DM-7089 « Je regarde »'],
    ['tout', '🦆 Tu ouvres une discussion avec le canard « Le build casse »'],
    ['imp', '🤖 Tu lances Implémentation ticket sur DM-7911 Ryan s\'y met']]);
  assert.match(run(`feedMyActions(${at('2026-10-01', '18:00')}).find(x => /DM-7911/.test(x.txt)).txt`), /Tu lances <a [^>]*data-who="ryan"[^>]*>Implémentation ticket<\/a>/);
  assert.equal(J(`feedMyActions(${at('2026-10-01', '09:30')}).length`), 2); // rejeu : relance de 9h et question de 9h15
});

test('types : chaque événement du fil a le sien ; une pastille éteinte retire ses lignes, et elle est retenue', () => {
  run(`TEAM = mergedTeam(); refreshAll(); DUCKGAME = null; DUCKS = []; GATES = []; T = DAY0 + 18.5 * 3600e3; FEED_MODE = 'all'; FEED_OFF = new Set(); renderFeed();`);
  const tys = J(`[...new Set(FEED_ALL.map(e => e.ty))].sort()`);
  assert.deepEqual(tys, ['agents', 'equipe', 'mep', 'pr', 'tickets']);
  assert.equal(J(`FEED_EV.filter(e => !e.ty).length`), 0);
  run(`FEED_OFF = new Set(['agents', 'mep']); showFeed();`);
  assert.ok(J(`FEED_VIEW.length`) > 0);
  assert.equal(J(`FEED_VIEW.filter(e => e.ty === 'agents' || e.ty === 'mep').length`), 0);
  assert.equal(J(`FEED_ALL.length`) > J(`FEED_VIEW.length`), true);
  run(`FEED_OFF = new Set();`);
});
