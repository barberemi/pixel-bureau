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

test('déplacer : l\'infobulle dit le passage par le statut principal (Reopen) et l\'affectation d\'un ticket que personne n\'a vers En cours', () => {
  run("CFG.jira_main={doing:'En cours',review:'To Review'};");
  const m = {dir: 'next', to: 'To Review'};
  assert.equal(J(`mvTitle({status:'Reopen',cat:'doing'},${JSON.stringify(m)})`),
    "Avancer : passer le ticket en To Review dans Jira, en passant par En cours si Jira l'exige depuis Reopen");
  assert.equal(J(`mvTitle({status:'En cours',cat:'doing'},${JSON.stringify(m)})`), 'Avancer : passer le ticket en To Review dans Jira');
  assert.equal(J(`mvTitle({status:'À faire',cat:'todo',owner:null},${JSON.stringify(m)},'doing')`),
    "Avancer : passer le ticket en To Review dans Jira, et t'y affecte (personne ne l'a)");
  assert.equal(J(`mvTitle({status:'À faire',cat:'todo',owner:'Pam'},${JSON.stringify(m)},'doing')`), 'Avancer : passer le ticket en To Review dans Jira');
  assert.equal(J(`mvTitle({status:'En cours',cat:'doing',owner:null},${JSON.stringify(m)},'review')`), 'Avancer : passer le ticket en To Review dans Jira');
  run('CFG.jira_main=undefined;');
  assert.equal(J(`mvTitle({status:'Reopen',cat:'doing'},${JSON.stringify(m)})`), 'Avancer : passer le ticket en To Review dans Jira');
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

test('ordre du board : les colonnes suivent le rang Jira (sans rang : l\'ordre d\'avant) ; priorité en chevrons ; rang dans la colonne', () => {
  const r = J(`(() => { const t0 = TEAM; TEAM = {people: [{name: 'Pam', tickets: [
      {key: 'DM-3', cat: 'doing', rank: 9, prio: 'Low'}, {key: 'DM-1', cat: 'doing', rank: 2, prio: 'High'},
      {key: 'DM-7', cat: 'doing'}, {key: 'DM-5', cat: 'review', rank: 1, prio: 'Medium'}]}], unassigned: []};
    try { const c = kanbanCols(); return {doing: c[1].list.map(x => x.key), line: prioLine(c[1].list[1]), first: prioLine(c[1].list[0]),
      ico: prioIco('Highest'), none: prioIco('Inconnue') + prioLine({key: 'DM-7', cat: 'doing'})}; } finally { TEAM = t0; } })()`);
  assert.deepEqual(r.doing, ['DM-1', 'DM-3', 'DM-7']);
  assert.match(r.first, /Priorité <b>Haute<\/b> · 1<sup>er<\/sup> de la colonne En cours/);
  assert.match(r.line, /Priorité <b>Basse<\/b> · 2<sup>e<\/sup> de la colonne En cours/);
  assert.match(r.ico, /title="Priorité Jira : Très haute"/);
  assert.equal(r.none, '');
});
