// Mode TV : tous les noms des collègues, mais un agent (workflow) n'a son nom que s'il travaille vraiment
// (bureau, serveurs, réunion, validation en attente) ou s'il est survolé ; hors TV, la règle « Sur le plan » ne change pas.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));

test('mode TV : noms des agents au travail ou survolés seulement', () => {
  run(`T=Date.parse('2026-10-01T11:00:00+02:00');for(const c of chars)c._st=stateAt(c,T);chars.filter(c=>famOf(c)==='wf')[0]._st={st:'work'};TV=true;NAMES='all';hoverKey=null;sel=null;`);
  try {
    const r = J(`chars.filter(c=>famOf(c)==='wf').map(c=>({k:c.key,busy:AGENT_BUSY.includes(c._st.st),shown:nameShown(c)}))`);
    const busy = r.filter(x => x.busy), idle = r.filter(x => !x.busy);
    assert.ok(busy.length && idle.length, 'la démo a des agents au travail et d\'autres non');
    for (const x of r) assert.equal(x.shown, x.busy, x.k);
    run(`hoverKey=${JSON.stringify(idle[0].k)};`);
    assert.equal(J(`nameShown(byKey[${JSON.stringify(idle[0].k)}])`), true); // survolé
    assert.ok(J(`chars.filter(c=>famOf(c)==='team').every(nameShown)`)); // les collègues gardent leur nom
  } finally { run(`TV=false;NAMES='hover';hoverKey=null;`); }
});

test('hors TV : « Tous » affiche aussi les agents inactifs, « survol » aucun nom', () => {
  run(`TV=false;NAMES='all';`);
  assert.ok(J(`chars.filter(c=>famOf(c)==='wf').every(nameShown)`));
  run(`NAMES='hover';`);
  assert.ok(J(`chars.every(c=>!nameShown(c))`));
});

test('« Qui fait quoi » de l\'écran mural : carte d\'agent nommée par son métier, depuis quand, texte complet au survol', () => {
  const h = run(`tvWhoCard({c:{key:'ag',name:'Dwight'},st:{st:'work'},what:'⚙ Review PR',sub:'Étape review',tip:'',since:'12 min'},'🔎 Reviewer de PR')`);
  assert.match(h, /^<div class="tw ag" title="⚙ Review PR\nÉtape review"/);
  assert.match(h, /<span class="wn">🔎 Reviewer de PR<span class="ws">au travail · 12 min<\/span>/);
  assert.match(run(`tvWhoCard({c:{key:'p',name:'Pam',person:'Pam'},st:{st:'work',human:true},what:'DM-1 Un',sub:''},'Pam')`), /^<div class="tw" /);
});

test('stand-up de la testeuse : réouverts d\'abord, pleine largeur, étiquette « Reopen » rouge ; puis les testés', () => {
  const h = run(`(() => { const t0 = TEAM; TEAM = {people: [], work: {q: {written: [], triaged: [],
      tested: [{key: 'DM-1', summary: 'Un', cat: 'test', status: 'To Test'}], reopened: [{key: 'DM-2', summary: 'Deux', cat: 'doing', status: 'Reopen'}]}}};
    try { return personScene({key: 'k', name: 'Karen', person: 'Karen', roleKind: 'qa', jira_id: 'q'}, Date.now()); } finally { TEAM = t0; } })()`);
  assert.ok(h.indexOf('Réouverts (1)') < h.indexOf('Testés depuis le dernier daily (1)'));
  assert.doesNotMatch(h, /sc-cols/);
  assert.match(h, /<span class="st st-reopen">Reopen<\/span><b>DM-2<\/b>/);
  assert.match(h, /<span class="st st-test">To Test<\/span><b>DM-1<\/b>/);
});
