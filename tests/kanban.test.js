// Mur Kanban (63-kanban.js) : la barre de personnes filtre les colonnes sur les tickets d'un personnage (ceux de sa
// fiche), « Tous » sur le sprint entier, « Non assigné » sur les tickets sans personne.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const keys = () => J('kbCols().flatMap(c=>c.list.map(x=>x.key)).sort()');

test('« Tous » : tout le sprint, comme les colonnes du mur', () => {
  run("KB_WHO='';");
  assert.deepEqual(keys(), J('kanbanCols().flatMap(c=>c.list.map(x=>x.key)).sort()'));
  assert.ok(keys().length > 0);
});

test('un personnage : les tickets de sa fiche, et rien d\'autre', () => {
  const who = J('kbPeople()[0].key');
  run(`KB_WHO=${JSON.stringify(who)};`);
  assert.deepEqual(keys(), J(`byKey[${JSON.stringify(who)}].team.tickets.map(x=>x.key).sort()`));
  assert.match(J('kbTitle()'), new RegExp('· ' + J(`byKey[${JSON.stringify(who)}].name`)));
});

test('« Non assigné » : les tickets sans personne', () => {
  run("KB_WHO='-';");
  assert.deepEqual(keys(), J('(TEAM.unassigned||[]).map(x=>x.key).sort()'));
  run("KB_WHO='';");
});

test('la barre ne montre que les personnages qui ont des tickets', () => {
  assert.ok(J('kbPeople().every(c=>c.person&&c.team.tickets.length>0)'));
});

test('un lien de ticket ouvre le Kanban filtré sur la personne qui l\'a, la fiche dans le volet', () => {
  run('openWide=(k,t,f)=>{WIN_OPEN=null;};'); // la fenêtre elle-même : pas dans ce test
  const t = J('(()=>{const p=TEAM.people.find(q=>q.tickets.length);return {key:p.tickets[0].key,id:p.id};})()');
  run(`WIN_OPEN=null;openTicket(${JSON.stringify(t.key)});`);
  assert.deepEqual(J('KB_VOL'), {t: 'ticket', k: t.key});
  assert.equal(J('byKey[KB_WHO].team.id'), t.id);
  const pr = J('(()=>{const p=TEAM.people.find(q=>(q.prs||[]).length);return {id:prId(p.prs[0]),pid:p.id};})()');
  run(`openPr(${JSON.stringify(pr.id)});`);
  assert.deepEqual(J('KB_VOL'), {t: 'pr', id: pr.id});
  assert.equal(J('byKey[KB_WHO].team.id'), pr.pid, 'filtré sur l\'auteur de la PR');
});

test('une PR sans ticket dans le sprint est signalée dans le volet', () => {
  const r = J(`(()=>{const all=TEAM.people.flatMap(p=>p.prs||[]);
    const a=all.find(x=>(x.keys||[]).some(k=>ticketOf(k))), b=all.find(x=>!(x.keys||[]).some(k=>ticketOf(k)));
    return {a:a&&kbPrInSprint(prId(a)), b:b?kbPrInSprint(prId(b)):false};})()`);
  assert.equal(r.a, true);
  assert.equal(r.b, false);
});

test('déplacer : ◀ puis ▶, liés à leur ligne de actions.moves (Kronn y relit clé et statut) ; rien sans le workflow', () => {
  const t = J("TEAM.people.flatMap(p=>p.tickets).find(t=>t.cat==='review')");
  run(`ACTIONS.move=true;ACTION_BINDS['bureau-move']={jira_ticket_key:'id',target_status:'id'};
       ACTS={tickets:[],prs:[],moves:[{id:'${t.key}|next',key:'${t.key}',dir:'next',to:'To Test'},{id:'${t.key}|prev',key:'${t.key}',dir:'prev',to:'En cours'}]};`);
  const r = J(`mvRows(${JSON.stringify(t)}).map(x=>[x.m.dir,x.to,x.why,x.bind])`);
  assert.deepEqual(r, [['prev', 'doing', 'refusé en review', {jira_ticket_key: t.key + '|prev', target_status: t.key + '|prev'}],
                       ['next', 'test', 'review validée', {jira_ticket_key: t.key + '|next', target_status: t.key + '|next'}]]);
  run('ACTIONS.move=false;');
  assert.deepEqual(J(`mvRows(${JSON.stringify(t)})`), []);
});

test('un ticket réouvert (statut jira.flow.reopened) porte la pastille « ↺ Réouvert » ; les autres non', () => {
  assert.equal(J('kbReopened({status:FLOW.reopened,cat:"doing"})'), true);
  assert.equal(J('kbReopened({status:"En cours",cat:"doing"})'), false);
  assert.equal(J('kbReopened({cat:"doing"})'), false);
});

test('ticket qui traîne : seuils par colonne (3 j en attente, 10 j en cours), trois niveaux de toile, rien ailleurs', () => {
  const st = (col, days) => J(`kbStale({since: new Date(T - ${days} * 864e5).toISOString()}, ${JSON.stringify(col)})`);
  assert.equal(st('review', 2), null);
  assert.deepEqual(st('review', 3), {d: 3, lim: 3, lvl: 1});
  assert.deepEqual(st('deploy', 6), {d: 6, lim: 3, lvl: 2});
  assert.equal(st('doing', 9), null);
  assert.deepEqual(st('doing', 25), {d: 25, lim: 10, lvl: 2});
  assert.deepEqual(st('doing', 181), {d: 181, lim: 10, lvl: 3});
  assert.equal(st('todo', 400), null); // à faire et déployé : jamais
  assert.equal(st('done', 400), null);
  assert.equal(J('kbStale({}, "review")'), null); // date inconnue
  assert.match(J('kbWeb(3)'), /kb-spider/);
  assert.doesNotMatch(J('kbWeb(2)'), /kb-spider/);
});

test('ticket qui traîne : seuils réglables (ui.stale)', () => {
  run('CFG.ui = CFG.ui || {}; CFG.ui.stale = {review: 1};');
  try { assert.deepEqual(J('kbStale({since: new Date(T - 864e5).toISOString()}, "review")'), {d: 1, lim: 1, lvl: 1});
        assert.equal(J('kbStale({since: new Date(T - 50 * 864e5).toISOString()}, "doing")'), null); } // colonne absente du réglage
  finally { run('delete CFG.ui.stale;'); }
});
