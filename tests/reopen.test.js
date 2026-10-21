// Ticket réouvert (team.events, passage au statut jira.flow.reopened) : le testeur va le dire au développeur pendant
// (face-à-face avec le mage, 3 min), puis chacun retourne à sa place. Démo : Karen réouvre DM-7089 de Pam à 10h50.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = hm => Date.parse(`2026-10-01T${hm}:00+02:00`);
const st = (key, hm) => J(`(s=>({st:s.st,zone:s.zone,visit:s.visit||null,label:s.label,bubble:s.bubble||null}))(stateAt(byKey.${key},${at(hm)}))`);

test('le reopen du jour : testeuse Karen, développeuse Pam', () => {
  run('TEAM=mergedTeam();');
  assert.deepEqual(J(`teamMoves().filter(m=>m.kind==='reopened').map(r=>[r.key,r.author.key,r.dev.key])`), [['DM-7089', 'p_karen', 'p_pam']]);
});

test('10h50 : le mage entre ; Pam d\'un côté, Karen et le mage en face, devant le bureau du boss ; il crie', () => {
  const pos = J('standoff()'), k = st('p_karen', '10:51'), p = st('p_pam', '10:51'), m = st('g_gandalf', '10:51');
  assert.deepEqual([k.st, k.visit, k.bubble], ['reopen', pos.tester, null]);
  assert.deepEqual([p.st, p.visit, p.bubble], ['reopen', pos.dev, '😨 7089']);
  assert.deepEqual([m.st, m.visit, m.bubble], ['reopen', pos.herald, 'Vous ne passerez pas !']);
  assert.equal(pos.dev[2], 'down'); // l'assigné d'un côté de la table de réunion, les deux autres en face
  assert.ok(pos.tester[2] === 'up' && pos.herald[2] === 'up' && pos.tester[1] > pos.dev[1]);
  assert.equal(J(`bubbleFor(byKey.g_gandalf,stateAt(byKey.g_gandalf,${at('10:51')}),${at('10:51')},0).big`), true);
  assert.equal(st('g_gandalf', '10:49').st, 'off'); // absent avant
  assert.equal(st('g_gandalf', '10:54').st, 'gone'); // repart par la porte
  assert.equal(st('g_gandalf', '11:00').st, 'off');
});

test('sans héraut dans le roster : l\'auteur va voir l\'assigné à sa place (scène d\'origine)', () => {
  run(`byKey.g_gandalf.on=null;`);
  try {
    const k = st('p_karen', '10:51');
    assert.deepEqual([k.zone, k.visit], ['visit', J(`besideSeat(byKey.p_pam.seat)`)]);
    assert.match(k.label, /Vient dire à Pam que DM-7089 est réouvert/);
  } finally { run(`byKey.g_gandalf.on='reopen';`); }
});

test('10h53 : fin du face-à-face, chacun retourne à sa place (pas de toilettes)', () => {
  for (const k of ['p_karen', 'p_pam']) assert.notEqual(st(k, '10:53').st, 'reopen', k);
  assert.notEqual(st('p_pam', '10:55').zone, 'wc');
});

test('mode TV : les bulles du reopen restent (ce ne sont pas des bulles de travail)', () => {
  run('TV=true;');
  try {
    assert.ok(J(`bubbleFor(byKey.p_pam,stateAt(byKey.p_pam,${at('10:51')}),${at('10:51')},0)`));
  } finally { run('TV=false;'); }
});

// ---------- les autres scènes d'équipe (37-scenes.js) ----------
test('ticket à tester : Gabe porte DM-6717 au bureau de Karen (11h10), le dossier rejoint sa pile', () => {
  const g = st('p_gabe', '11:11');
  assert.deepEqual([g.st, g.zone, g.bubble], ['deliver', 'visit', '📁 6717']);
  assert.deepEqual(g.visit, J(`besideSeat(byKey.p_karen.seat)`));
  assert.match(g.label, /Apporte DM-6717 à tester à Karen/);
  assert.notEqual(st('p_gabe', '11:13').st, 'deliver');
  assert.equal(J(`sprintTickets().filter(k=>k.cat==='test').length`) > 0, true); // la pile de dossiers de Karen n'est pas vide
});

test('ticket validé : Karen lève le pouce, Michael lève les bras (11h20, 2 min)', () => {
  const k = st('p_karen', '11:21'), m = st('p_michael', '11:21');
  assert.deepEqual([k.st, k.zone, k.bubble], ['thumbs', 'desk', '👍 6550 validé']);
  assert.deepEqual([m.st, m.zone, m.bubble], ['cheer', 'boss', '🙌']); // Michael est le boss : à son bureau de boss
  assert.notEqual(st('p_karen', '11:23').st, 'thumbs');
});

test('dernier jour du sprint : pizza à midi pour toute l\'équipe ; premier jour : 5 min devant le Kanban après le daily', () => {
  const sprint = J('TEAM.sprint');
  try {
    run(`TEAM.sprint.end='2026-10-01T15:00:00Z';`);
    const p = st('p_pam', '12:10');
    assert.deepEqual([p.st, p.bubble], ['pizza', '🍕']);
    assert.ok(['ktable', 'coffee', 'sofa'].includes(p.zone));
    assert.notEqual(st('p_pam', '12:45').st, 'pizza');
    run(`TEAM.sprint.end='2026-10-02T15:00:00Z';TEAM.sprint.start='2026-10-01T07:00:00Z';`);
    const k = st('p_andy', '09:56'); // daily 9h40 + 15 min
    assert.deepEqual([k.st, k.zone, k.bubble], ['kickoff', 'kanban', '🏁']);
    assert.notEqual(st('p_andy', '10:01').st, 'kickoff');
  } finally { run(`TEAM.sprint=${JSON.stringify(sprint)};`); }
});

test('sprint clôturé le matin de sa fin, le suivant déjà ouvert : pizzas quand même à midi (fin prévue du sprint précédent)', () => {
  const sprint = J('TEAM.sprint'), prev = run('JSON.stringify(TEAM.prev_sprint||null)');
  try {
    run(`TEAM.sprint={...TEAM.sprint,start:'2026-10-01T09:59:57Z',end:'2026-10-15T11:00:00Z'};
      TEAM.prev_sprint={...(TEAM.prev_sprint||{}),end:'2026-10-01T09:59:42Z',planned_end:'2026-10-01T14:00:00Z'};`);
    assert.deepEqual([st('p_pam', '12:10').st, st('p_pam', '12:10').bubble], ['pizza', '🍕']);
    run(`TEAM.prev_sprint={...TEAM.prev_sprint,planned_end:'2026-09-30T14:00:00Z',end:'2026-09-30T15:00:00Z'};`);
    assert.notEqual(st('p_pam', '12:10').st, 'pizza', 'sprint précédent fini la veille : pas de pizzas');
    run(`delete TEAM.prev_sprint.planned_end; TEAM.prev_sprint.end='2026-10-01T09:59:42Z';`);
    assert.equal(st('p_pam', '12:10').st, 'pizza', 'ancien dataset sans planned_end : date de clôture');
  } finally { run(`TEAM.sprint=${JSON.stringify(sprint)};TEAM.prev_sprint=${prev};`); }
});

test('appris en retard par le cron équipe (seen) : la scène part de la première vue, pour se jouer en direct', () => {
  run('TEAM=mergedTeam();');
  const saved = run('JSON.stringify(TEAM.events)');
  try {
    run(`TEAM.events=TEAM.events.map(e=>e.kind==='move'&&e.key==='DM-7089'&&e.to==='Reopen'?{...e,seen:'2026-10-01T10:58:00+02:00'}:e);MOVES_MEMO={team:null,list:[]};`);
    assert.deepEqual(J(`teamMoves().filter(m=>m.kind==='reopened').map(r=>r.t)`), [at('10:58')]);
    assert.equal(st('g_gandalf', '10:59').st, 'reopen'); // sans seen, la scène (10h50-10h53) serait finie
  } finally { run(`TEAM.events=${saved};MOVES_MEMO={team:null,list:[]};`); }
});
