// Logique pure de la page : cron, horaires de Paris, MEP, paie, outils, places, KPI, éditeur d'avatar.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const Z = s => Date.parse(s); // instants UTC (Paris = UTC+2 en octobre 2026)
// JSON aller-retour : les objets créés dans le contexte vm ont d'autres prototypes que ceux de node
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

test('cronField : *, pas, plages, listes, valeur de départ avec pas', () => {
  const f = (expr, v, min = 0) => run(`cronField(${JSON.stringify(expr)},${v},${min})`);
  assert.equal(f('*', 7), true);
  assert.equal(f('*/10', 20), true);
  assert.equal(f('*/10', 25), false);
  assert.equal(f('1-5', 3, 1), true);
  assert.equal(f('1-5', 6, 1), false);
  assert.equal(f('8', 8), true);
  assert.equal(f('8', 9), false);
  assert.equal(f('5/15', 20), true); // 5, 20, 35, 50
  assert.equal(f('5/15', 10), false);
  assert.equal(f('1,3', 3), true);
  assert.equal(f('1,3', 2), false);
  assert.equal(f('0-30/10', 20), true);
  assert.equal(f('0-30/10', 40), false);
  assert.equal(f('*/2', 3, 1), true); // pour les jours, * part de 1 : 1, 3, 5...
});

test('cronMatch : expressions UTC à 5 champs', () => {
  const m = (expr, iso) => run(`cronMatch(${JSON.stringify(expr)}, new Date(${JSON.stringify(iso)}))`);
  assert.equal(m('*/10 5-19 * * 1-5', '2026-10-01T07:20:00Z'), true); // jeudi
  assert.equal(m('*/10 5-19 * * 1-5', '2026-10-01T07:25:00Z'), false);
  assert.equal(m('*/10 5-19 * * 1-5', '2026-10-03T07:20:00Z'), false); // samedi
  assert.equal(m('*/10 5-19 * * 1-5', '2026-10-01T20:00:00Z'), false);
  assert.equal(m('  0 7 1 10 *  ', '2026-10-01T07:00:00Z'), true); // espaces tolérés
  assert.equal(m('0 7 1 11 *', '2026-10-01T07:00:00Z'), false);
});

test('parisHM / stageClosed / inDaily : heure de Paris', () => {
  assert.deepEqual(J(`parisHM(${Z('2026-10-01T09:05:00Z')})`), {h: 11, m: 5, wd: 'Thu'});
  assert.deepEqual(J(`parisHM(${Z('2026-09-30T22:30:00Z')})`), {h: 0, m: 30, wd: 'Thu'}); // minuit : h=0, pas 24
  assert.equal(run(`stageClosed(${Z('2026-10-01T10:00:00Z')})`), false); // jeudi
  assert.equal(run(`stageClosed(${Z('2026-10-02T10:00:00Z')})`), true); // vendredi
  assert.equal(run(`stageClosed(${Z('2026-10-03T10:00:00Z')})`), true); // samedi
  assert.equal(run(`stageClosed(${Z('2026-10-04T10:00:00Z')})`), true); // dimanche
  assert.equal(run(`stageClosed(${Z('2026-10-05T10:00:00Z')})`), false); // lundi
  // daily de 9h40 à 9h55 heure de Paris, en semaine
  assert.equal(run(`inDaily(${Z('2026-10-01T07:39:00Z')})`), false);
  assert.equal(run(`inDaily(${Z('2026-10-01T07:40:00Z')})`), true);
  assert.equal(run(`inDaily(${Z('2026-10-01T07:54:59Z')})`), true);
  assert.equal(run(`inDaily(${Z('2026-10-01T07:55:00Z')})`), false);
  assert.equal(run(`inDaily(${Z('2026-10-02T07:45:00Z')})`), true); // vendredi
  assert.equal(run(`inDaily(${Z('2026-10-03T07:45:00Z')})`), false); // samedi
});

test('mepPhase : released -> staging -> staged -> prod -> done / failed', () => {
  const m = {
    released: '2026-10-01T08:00:00Z',
    staging: {start: '2026-10-01T08:10:00Z', end: '2026-10-01T08:20:00Z', conclusion: 'success'},
    prod: {start: '2026-10-01T09:00:00Z', end: '2026-10-01T09:15:00Z', conclusion: 'success'},
  };
  const ph = (mm, iso) => run(`mepPhase(${JSON.stringify(mm)}, ${Z(iso)})`);
  assert.equal(ph(m, '2026-10-01T07:59:00Z'), null);
  assert.equal(ph(m, '2026-10-01T08:05:00Z'), 'released');
  assert.equal(ph(m, '2026-10-01T08:15:00Z'), 'staging');
  assert.equal(ph(m, '2026-10-01T08:30:00Z'), 'staged');
  assert.equal(ph(m, '2026-10-01T09:05:00Z'), 'prod');
  assert.equal(ph(m, '2026-10-01T09:20:00Z'), 'done');
  assert.equal(ph({...m, prod: {...m.prod, conclusion: 'failure'}}, '2026-10-01T09:20:00Z'), 'failed');
  assert.equal(ph({...m, prod: null, staging: {...m.staging, conclusion: 'failure'}}, '2026-10-01T08:30:00Z'), 'failed');
  assert.equal(ph({released: null}, '2026-10-01T08:30:00Z'), null);
});

test('payFor + usd + fmtUsd : fiche de paie d\'un agent', () => {
  run(`PAYROLL={generated_at:'x',rate_usd_per_mtok:5,days:[],agents:[
    {wf:'aaaa1111-aaaa',name:'Revue A',today:{tok:1000,runs:2,fail:1},week:{tok:5000,runs:9,fail:2},days:[1,2,3,4,5,6,7]},
    {wf:'bbbb2222-bbbb',name:'Revue B',today:{tok:500,runs:1,fail:0},week:{tok:700,runs:3,fail:0},days:[10,0,0,0,0,0,1]},
    {wf:'99999999-cccc',name:'Autre',today:{tok:9,runs:9,fail:9},week:{tok:9,runs:9,fail:9},days:[9,9,9,9,9,9,9]}]}`);
  const p = J(`payFor({wf:['aaaa1111','bbbb2222']})`);
  assert.deepEqual(p.today, {tok: 1500, runs: 3, fail: 1});
  assert.deepEqual(p.week, {tok: 5700, runs: 12, fail: 2});
  assert.deepEqual(p.days, [11, 2, 3, 4, 5, 6, 8]);
  assert.deepEqual(p.names, ['Revue A', 'Revue B']);
  assert.equal(run(`payFor({wf:['00000000']})`), null);
  assert.equal(run(`payFor({wf:[]})`), null);
  assert.equal(run(`payFor(null)`), null);
  assert.equal(run('usd(2e6)'), 10);
  assert.equal(run(`fmtUsd(null)`), '');
  assert.equal(run(`fmtUsd(0.004)`), '< 0,01 $');
  assert.equal(run(`fmtUsd(0)`), '≈ 0,00 $');
  assert.equal(run(`fmtUsd(1.234)`), '≈ 1,23 $');
  assert.equal(run(`fmtUsd(12.6)`), '≈ 13 $');
  run('PAYROLL=null');
  assert.equal(run('usd(2e6)'), null);
  assert.equal(run(`payFor({wf:['aaaa1111']})`), null);
});

test('actText : bulle et libellé de l\'outil en cours', () => {
  assert.equal(run('actText(null)'), null);
  assert.deepEqual(J(`actText({t:'Read',x:'/src/app/Controller.php'})`), {ico: '📖', bubble: '📖 Controller.php', label: '📖 lit Controller.php'});
  assert.deepEqual(J(`actText({t:'Bash',x:'  npm run test -- --watch'})`), {ico: '⌨️', bubble: '⌨️ npm run', label: '⌨️ lance npm run'});
  assert.deepEqual(J(`actText({t:'Grep'})`), {ico: '🔎', bubble: '🔎 cherche', label: '🔎 cherche'});
  assert.deepEqual(J(`actText({t:'Inconnu',x:'truc'})`), {ico: '🛠️', bubble: '🛠️ truc', label: '🛠️ Inconnu truc'});
  const long = J(`actText({t:'Edit',x:'a/very_long_file_name_for_testing.ts'})`);
  assert.equal(long.bubble, ('✏️ very_long_file_name_for_testing.ts').slice(0, 22));
});

test('besideSeat : place debout côté allée', () => {
  assert.deepEqual(J('besideSeat([5,14])'), [4, 14, 'right']); // place à gauche de l'îlot 6, regarde à droite
  assert.deepEqual(J('besideSeat([7,15])'), [8, 15, 'left']);
  assert.deepEqual(J('besideSeat([22,8])'), [22, 9, 'up']); // pas une place d'îlot (bureau du boss)
});

test('runPartner : collègue concerné par un run (ticket ou auteur de PR)', () => {
  run(`TEAM={people:[],meps:[]};
    chars=[{key:'p_a',name:'Alice',person:'Alice',seat:[5,14],team:{tickets:[{key:'DM-1'}],gh:['AliceGH']}},
           {key:'p_b',name:'Bob',person:'Bob',seat:[7,14],team:{tickets:[{key:'DM-2'}],gh:[]}},
           {key:'p_c',name:'Sans place',person:'C',seat:null,team:{tickets:[{key:'DM-3'}],gh:[]}}];`);
  assert.equal(run(`runPartner({vars:{jira_ticket_key:'DM-2'}}).key`), 'p_b');
  assert.equal(run(`runPartner({vars:{'current_task.author':'alicegh'}}).key`), 'p_a'); // insensible à la casse
  assert.equal(run(`runPartner({vars:{jira_ticket_key:'DM-3'}})`), null); // pas de place
  assert.equal(run(`runPartner({vars:{jira_ticket_key:'DM-9'}})`), null);
  assert.equal(run(`runPartner({})`), null);
  run('TEAM=null');
  assert.equal(run(`runPartner({vars:{jira_ticket_key:'DM-2'}})`), null);
});

test('normLook : valeurs par défaut et options inconnues ramenées au défaut', () => {
  const l = J(`normLook({sex:'female',torso:'inconnu',legs:'formal',hair:'bob'})`);
  assert.equal(l.sex, 'female');
  assert.equal(l.torso, 'longsleeve/longsleeve');
  assert.equal(l.legs, 'formal');
  assert.equal(l.hair, 'bob');
  assert.equal(l.skin, 'light');
  assert.equal(l.glasses, 'none');
  assert.deepEqual(Object.keys(l), ['sex', 'skin', 'head', 'hair', 'hair_color', 'beard', 'torso', 'shirt', 'legs', 'legs_color', 'shoes', 'hat', 'hat_color', 'glasses']);
  assert.equal(J(`normLook({sex:'x'})`).sex, 'male');
});

test('editorEntry : nom tronqué, apparence omise si inchangée', () => {
  run(`EDIT={k:'jim',name:'  Un nom beaucoup trop long pour la fiche  ',base:normLook({}),look:normLook({}),hint:null}`);
  let e = J('editorEntry()');
  assert.equal(e.k, 'jim');
  assert.equal(e.n, 'Un nom beaucoup trop lon');
  assert.equal(e.l, null);
  assert.equal(typeof e.at, 'number');
  run(`EDIT.name='   '; EDIT.look={...EDIT.base,hair:'afro'}`);
  e = J('editorEntry()');
  assert.equal(e.n, null);
  assert.equal(e.l.hair, 'afro');
  run('EDIT=null');
});

test('daysLeft : jours calendaires à Paris', () => {
  const Z = s => Date.parse(s);
  assert.equal(run(`daysLeft(${Z('2026-10-02T11:00:00Z')}, ${Z('2026-10-01T09:00:00Z')})`), 1);
  assert.equal(run(`daysLeft(${Z('2026-10-02T11:00:00Z')}, ${Z('2026-10-02T06:00:00Z')})`), 0);
  assert.equal(run(`daysLeft(${Z('2026-10-02T11:00:00Z')}, ${Z('2026-10-05T06:00:00Z')})`), 0);
  assert.equal(run(`daysLeft(${Z('2026-10-01T22:30:00Z')}, ${Z('2026-10-01T09:00:00Z')})`), 1); // 00h30 à Paris le lendemain
});

test('dashData : sprint et prod', () => {
  run(`TEAM={sprint:{name:'S1',start:'2026-09-18T09:00:00Z',end:'2026-10-02T11:00:00Z'},
    people:[{tickets:[{key:'A',cat:'done',points:3},{key:'B',cat:'doing',points:5},{key:'C',cat:'review',points:2}],
      prs:[{n:1,review:'pending',draft:false,updated:'2026-09-29T09:00:00Z'},{n:2,review:'pending',draft:true},{n:3,review:'changes',draft:false}]}],
    unassigned:[{key:'D',cat:'todo',points:1}],meps:[]};
    DATA={runs:[{run:'r1',_s:0,_e:1,status:'Success',tok:100},{run:'r2',_s:0,_e:1,status:'Failed',tok:50,parent:'r1'}]};
    chars=[{key:'g',name:'Dwight',_st:{st:'gate'}},{key:'p',name:'Bob',person:'Bob',_st:{st:'error'}}];`);
  const d = JSON.parse(run(`JSON.stringify(dashData(${Date.parse('2026-10-01T09:00:00Z')}))`));
  assert.equal(d.sprint.j, 1);
  assert.equal(d.sprint.ptsDone, 3);
  assert.equal(d.sprint.ptsAll, 11);
  assert.deepEqual(d.sprint.cats, {todo: 1, doing: 1, review: 1, test: 0, done: 1});
  assert.equal(d.prod.done, 0);
  assert.deepEqual(d.agents, {runs: 2, ok: 1, ko: 1, tok: 100}); // tokens du parent seulement
});

test('teamEventTxt : statut Jira traduit, reviews, auteur retrouvé par son nom', () => {
  run(`TEAM={people:[{id:'a1',name:'Pam Beesly',tickets:[],prs:[{n:2012}]}],meps:[]};
    chars=[{key:'p_pam',name:'Pam',person:'Pam Beesly',team:{id:'a1'}},{key:'p_kelly',name:'Kelly',person:'Kelly Kapoor'}];`);
  const txt = e => { const r = JSON.parse(run(`JSON.stringify(teamEventTxt(${JSON.stringify(e)}))`)); return r && {c: r.c && r.c.key, txt: r.txt.replace(/<[^>]+>/g, '')}; };
  assert.deepEqual(txt({kind: 'move', key: 'DM-1', from: 'En cours', to: 'To Review', cat: 'review', who: null, who_name: 'Kelly Kapoor'}),
    {c: 'p_kelly', txt: '➜ Kelly : DM-1 en cours → review'});
  run(`TEAM.events=[{kind:'new',key:'DM-9'}]`);
  assert.equal(txt({kind: 'move', key: 'DM-9', from: 'Proposed', to: 'To Do'}), null);
  assert.deepEqual(txt({kind: 'review', state: 'approved', n: 2012, by: null, by_name: 'michaelscott', author: 'a1'}),
    {c: null, txt: '✓ michaelscott approuve la PR #2012 de Pam'});
  assert.equal(txt({kind: 'review', state: 'commented', n: 2012, by: 'a1', author: 'a1'}), null);
  assert.equal(run(`prOwnerChar(2012).key`), 'p_pam');
});

test('bestEmployee : sprint ouvert sans point livré → gagnant du dernier sprint fermé', () => {
  run(`TEAM={sprint:{name:'26-41'},people:[{id:'t',name:'Gabe L',tickets:[{key:'A',cat:'doing',points:3}]}],meps:[],
    prev_sprint:{name:'26-39',people:[{id:'t',name:'Gabe L',tickets:[{key:'B',cat:'done',points:5}]},{id:'a',name:'Pam B',tickets:[{key:'C',cat:'done',points:8}]}]}};
    chars=[{key:'p_pam',name:'Pam',person:'Pam B'},{key:'p_gabe',name:'Gabe',person:'Gabe L',team:{id:'t'}}];`);
  const r = JSON.parse(run(`(()=>{const r=bestEmployee();return JSON.stringify({sprint:r.sprint,prev:r.prev,first:r[0].p.name,pts:r[0].pts,who:empChar(r[0]).key})})()`));
  assert.deepEqual(r, {sprint: '26-39', prev: true, first: 'Pam B', pts: 8, who: 'p_pam'});
  run(`TEAM.people[0].tickets.push({key:'D',cat:'done',points:1})`);
  assert.equal(run(`bestEmployee().sprint`), '26-41');
});

test('sunAt / daylight : soleil à Paris le 2 octobre (lever ~7h55, coucher ~19h35, midi solaire ~13h45)', () => {
  const at = s => JSON.parse(run(`JSON.stringify(daylight(${Date.parse(s)}))`));
  const noon = at('2026-10-02T11:45:00Z');
  assert.ok(noon.elev > 36 && noon.elev < 41, 'hauteur à midi solaire : ' + noon.elev);
  assert.equal(noon.phase, 'jour');
  const rise = at('2026-10-02T05:55:00Z'); // 7h55 à Paris
  assert.ok(Math.abs(rise.elev) < 2.5, 'lever : ' + rise.elev);
  assert.equal(rise.morning, true);
  assert.equal(rise.phase, 'aube');
  const set = at('2026-10-02T17:35:00Z'); // 19h35
  assert.ok(Math.abs(set.elev) < 2.5, 'coucher : ' + set.elev);
  assert.equal(set.phase, 'crépuscule');
  assert.equal(at('2026-10-02T21:00:00Z').phase, 'nuit'); // 23h
  assert.equal(at('2026-10-02T21:00:00Z').k, 0);
  const winter = at('2026-12-21T07:00:00Z'); // 8h en hiver : encore la nuit ou l'aube
  assert.ok(winter.k < 0.5);
});

test('fraîcheur : prochain passage du cron live, puis retard', () => {
  run(`CFG.schedules={}; CFG.workflows={live:'wf-live'}; DATA={crons:[{wf:'wf-live',schedule:'* 5-19 * * *'}],runs:[]};
    LIVE={generated_at:'2026-10-03T06:49:20Z',runs:[]};`);
  const f = now => JSON.parse(run(`JSON.stringify(freshness(FRESH_SRC[0], ${Date.parse(now)}))`));
  const a = f('2026-10-03T06:49:40Z');
  assert.equal(new Date(a.eta).toISOString(), '2026-10-03T06:50:23.000Z'); // 06:50 + 20 s de run + 3 s
  assert.equal(a.late, 0);
  assert.ok(f('2026-10-03T06:53:00Z').late > 0); // plus de 2 min après l'arrivée prévue
  run(`LIVE={generated_at:'2026-10-03T19:59:10Z',runs:[]}`); // dernier passage du soir : prochain à 05:00 UTC, pas de retard la nuit
  assert.equal(f('2026-10-03T23:00:00Z').late, 0);
});

test('fraîcheur : texte d\'attente en secondes, en minutes, puis en pause hors des heures du cron', () => {
  run(`CFG.schedules={}; CFG.workflows={live:'wf-live',payroll:'wf-pay'};
    DATA={crons:[{wf:'wf-live',schedule:'* 5-19 * * *'},{wf:'wf-pay',schedule:'7 5-19 * * *'}],runs:[]};`);
  const w = (src, gen, now) => {
    run(`LIVE={generated_at:'${gen}',runs:[]}; PAYROLL={generated_at:'${gen}',agents:[]};`);
    return JSON.parse(run(`JSON.stringify(waitTxt(freshness(FRESH_SRC.find(s=>s.key==='${src}'), ${Date.parse(now)}), ${Date.parse(now)}))`));
  };
  assert.match(w('live', '2026-10-03T06:49:20Z', '2026-10-03T06:49:40Z').txt, /^dans \d+ s$/);
  assert.equal(w('payroll', '2026-10-03T06:07:05Z', '2026-10-03T06:20:00Z').txt, 'dans 48 min');
  // samedi 23h30 (Paris) : dernier passage à 21h59, reprise dimanche 7h00
  const p = w('live', '2026-10-03T19:59:10Z', '2026-10-03T21:30:00Z');
  assert.equal(p.txt, 'en pause · reprise demain à 7h00');
  assert.equal(p.paused, true);
  // après minuit : même jour
  assert.equal(w('live', '2026-10-03T19:59:10Z', '2026-10-03T22:30:00Z').txt, 'en pause · reprise à 7h00');
});

test('durées : jamais « 4 h 60 » ni « 60 min »', () => {
  const r = code => run(code);
  assert.equal(r(`sinceTxt(${4 * 3600e3 + 59.7 * 60e3})`), '5 h 00');
  assert.equal(r(`sinceTxt(${59.8 * 60e3})`), '1 h 00');
  assert.equal(r(`agoTxt(${2 * 3600e3 + 5 * 60e3})`), '2 h 05');
  assert.equal(r(`agoTxt(${12 * 60e3})`), '12 min');
});
