// Fiche d'un ticket (62-ticket.js) : les boutons de lancement selon son statut et ses PR, liés à la ligne du dataset
// actions (clé du ticket, n° de PR), le gel des mises en prod, et la lecture du dataset.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const at = (d, hm) => Date.parse(`2026-10-${d}T${hm}:00+02:00`);

// boutons proposés pour un ticket : [action, liaison, grisé ?]
function buttons(key, {acts = true, now = at('07', '11:00'), comment = false} = {}) {
  return J(`(() => {
    const calls = [], lb = launchBlock, fs = foldSection, dn = Date.now;
    launchBlock = (box, o) => { calls.push([o.action, o.bind, !!o.off]); box.childElementCount++; };
    foldSection = () => ({childElementCount: 0, appendChild() { this.childElementCount++; }});
    Date.now = () => ${now};
    TEAM = {people: [{name: 'Pam', tickets: [
        {key: 'DM-1', cat: 'todo', status: 'À faire', summary: 'a'}, {key: 'DM-2', cat: 'review', status: 'To Review', summary: 'b'},
        {key: 'DM-3', cat: 'deploy', status: 'To Deploy', summary: 'c'}, {key: 'DM-4', cat: 'doing', status: 'En cours', summary: 'd'}],
      prs: [{n: 12, title: 'DM-2 b', review: 'pending', keys: ['DM-2']}, {n: 13, title: 'DM-4 d', review: 'changes', keys: ['DM-4']},
            {n: 14, title: 'DM-4 brouillon', draft: true, review: 'pending', keys: ['DM-4']}]}],
      unassigned: [], other_prs: []};
    ACTS = ${acts ? `{tickets: ['DM-1', 'DM-2', 'DM-3', 'DM-4'].map(key => ({key})), prs: [{n: '12'}, {n: '13'}, {n: '14'}]}` : 'null'};
    try { renderTicket({appendChild() {}}, ${JSON.stringify(key)}); } finally { launchBlock = lb; foldSection = fs; Date.now = dn; }
    return calls;
  })()`).filter(c => comment || c[0] !== 'bureau-comment');
}

test('à faire, sans PR : Implémenter, lié à la clé du ticket', () => {
  assert.deepEqual(buttons('DM-1'), [['bureau-impl', {key: 'DM-1'}, false]]);
});

const ID = n => ({id: 'dunder-mifflin/site-web#' + n}); // identité d'une PR du dépôt principal (#56)
test('en review avec une PR en attente : Faire relire, lié au dépôt et au n° de PR', () => {
  assert.deepEqual(buttons('DM-2'), [['bureau-review', ID(12), false]]);
});

test('changements demandés : Corriger et Faire relire ; un brouillon a aussi les siens ; une PR ouverte retire Implémenter', () => {
  assert.deepEqual(buttons('DM-4'), [['bureau-fix', ID(13), false], ['bureau-review', ID(13), false], ['bureau-review', ID(14), false]]);
});

test('à déployer : Mettre en prod, grisé pendant le gel (vendredi)', () => {
  assert.deepEqual(buttons('DM-3'), [['bureau-mep', {key: 'DM-3'}, false]]); // mercredi
  assert.deepEqual(buttons('DM-3', {now: at('09', '11:00')}), [['bureau-mep', {key: 'DM-3'}, true]]); // vendredi
});

test('sans dataset actions, aucun bouton (il arrive au prochain passage du cron équipe)', () => {
  assert.deepEqual(buttons('DM-1', {acts: false}), []);
});

test('dataset actions : objet ou texte JSON ; absent ou cassé = null', () => {
  const ok = {tickets: [{key: 'DM-1'}], prs: []};
  assert.deepEqual(J(`readActs({datasets: {actions: {current: ${JSON.stringify(ok)}}}})`), ok);
  assert.deepEqual(J(`readActs({datasets: {actions: {current: ${JSON.stringify(JSON.stringify(ok))}}}})`), ok);
  assert.equal(J('readActs({datasets: {}})'), null);
  assert.equal(J('readActs({datasets: {actions: {current: "{cassé"}}})'), null);
});

test('liaisons envoyées à Kronn : le nom de chaque variable liée (pas le champ de recherche), avec la valeur de la ligne', () => {
  // Kronn refuse une clé qui n'est pas le nom d'une valeur liée (« unknown dynamic action binding `key` »)
  assert.deepEqual(J(`bindsFor('bureau-impl', {key: 'DM-1'})`), {jira_ticket_key: 'DM-1'});
  assert.deepEqual(J(`bindsFor('bureau-mep', {key: 'DM-3'})`), {jira_ticket_key: 'DM-3', pr_number: 'DM-3'});
  assert.deepEqual(J(`bindsFor('bureau-review', {id: 'a/b#12'})`), {repo: 'a/b#12', pr: 'a/b#12'});
  assert.deepEqual(J(`bindsFor('bureau-fix', {id: 'a/b#13'})`), {pr: 'a/b#13'}); // notes : saisie, pas liée ; repo : facultatif
  assert.equal(J(`bindsFor('bureau-impl', {n: '13'})`), null); // pas le bon champ : pas de bouton
});

test('Commenter : sur tout ticket du sprint, quel que soit son statut, en dernier ; la saisie se fait dans la carte Kronn', () => {
  for (const key of ['DM-1', 'DM-2', 'DM-3', 'DM-4']) assert.deepEqual(buttons(key, {comment: true}).at(-1), ['bureau-comment', {key}, false]);
  assert.deepEqual(buttons('DM-1', {comment: true, acts: false}), []);
  assert.deepEqual(J(`bindsFor('bureau-comment', {key: 'DM-2'})`), {jira_ticket_key: 'DM-2'}); // comment : saisi, pas lié
});

test('Réestimer (launch.estimate) : sur un ticket non terminé du sprint seulement, Story Points et raison saisis dans la carte', () => {
  const est = (key, cat) => J(`(() => {
    const calls = [], lb = launchBlock, fs = foldSection, a0 = ACTIONS.estimate;
    launchBlock = (box, o) => { calls.push([o.action, o.bind]); box.childElementCount++; };
    foldSection = () => ({childElementCount: 0, appendChild() { this.childElementCount++; }});
    ACTIONS.estimate = true;
    TEAM = {people: [{name: 'Pam', tickets: [{key: ${JSON.stringify(key)}, cat: ${JSON.stringify(cat)}, status: 's', summary: 'a'}], prs: []}],
      unassigned: [], other_prs: []};
    ACTS = {tickets: [{key: ${JSON.stringify(key)}}], prs: []};
    try { renderTicket({appendChild() {}}, ${JSON.stringify(key)}); } finally { launchBlock = lb; foldSection = fs; ACTIONS.estimate = a0; }
    return calls.filter(c => c[0] === 'bureau-estimate');
  })()`);
  for (const cat of ['todo', 'doing', 'review', 'test', 'deploy']) assert.deepEqual(est('DM-7', cat), [['bureau-estimate', {key: 'DM-7'}]], cat);
  assert.deepEqual(est('DM-8', 'done'), []); // déployé : rien à réestimer
});

// ---------- #56 : PR de plusieurs dépôts, identifiées par « owner/dépôt#n » ----------
// deux #16 : front_web (dépôt principal du test, dunder-mifflin/site-web) et front_api ; boutons de la fiche d'une PR
const TWO16 = `TEAM = {people: [{id: 'acc-p', name: 'Pam', tickets: [{key: 'DM-5', cat: 'review', status: 'To Review', summary: 'e'}],
    prs: [{n: 16, repo: 'dunder-mifflin/site-web', title: 'DM-9 web', review: 'approved', keys: ['DM-9']},
          {n: 16, repo: 'dunder-mifflin/front_api', title: 'DM-5 api', review: 'changes', keys: ['DM-5']}]}],
  unassigned: [], other_prs: []};
  ACTS = {tickets: [{key: 'DM-5'}], prs: [{id: 'dunder-mifflin/site-web#16', n: '16', repo: 'dunder-mifflin/site-web'},
    {id: 'dunder-mifflin/front_api#16', n: '16', repo: 'dunder-mifflin/front_api'}]};`;
function prButtons(id, {fixAnyRepo = false, acts = true} = {}) {
  return J(`(() => {
    const calls = [], lb = launchBlock, fs = foldSection, f0 = CFG.fix_any_repo;
    launchBlock = (box, o) => { calls.push([o.action, o.bind, o.name]); box.childElementCount++; };
    foldSection = () => ({childElementCount: 0, appendChild() { this.childElementCount++; }});
    CFG.fix_any_repo = ${fixAnyRepo};
    ${TWO16}
    ${acts ? '' : 'ACTS = null;'}
    try { renderPr({appendChild() {}}, ${JSON.stringify(id)}); } finally { launchBlock = lb; foldSection = fs; CFG.fix_any_repo = f0; }
    return calls;
  })()`);
}

test('#56 fiche d\'une PR d\'un autre dépôt : Faire relire lié à « owner/dépôt#n », nommée « front_api#16 »', () => {
  assert.deepEqual(prButtons('dunder-mifflin/front_api#16'),
    [['bureau-review', {id: 'dunder-mifflin/front_api#16'}, 'Faire relire · front_api#16']]); // Corriger : workflow sans repo
  assert.deepEqual(prButtons('dunder-mifflin/front_api#16', {fixAnyRepo: true}).map(c => c[0]), ['bureau-fix', 'bureau-review']);
  assert.deepEqual(prButtons('dunder-mifflin/front_api#16', {acts: false}), []); // dataset actions pas encore là
});

test('#56 deux #16 de deux dépôts ne se confondent pas : la PR du dépôt principal est approuvée, rien à lancer', () => {
  assert.deepEqual(prButtons('dunder-mifflin/site-web#16'), []);
  const info = id => J(`(() => { ${TWO16} const x = prInfo(${JSON.stringify(id)}); return {title: x.pr && x.pr.title, h: prNum({repo: x.repo, n: x.n})}; })()`);
  assert.deepEqual(info('dunder-mifflin/front_api#16'), {title: 'DM-5 api', h: 'front_api#16'});
  assert.deepEqual(info('dunder-mifflin/site-web#16'), {title: 'DM-9 web', h: '#16'});
});

test('#56 fiche du ticket : sa PR d\'un autre dépôt, ses boutons liés au bon dépôt ; liaison Kronn = repo et pr relus par id', () => {
  const calls = J(`(() => {
    const calls = [], lb = launchBlock, fs = foldSection;
    launchBlock = (box, o) => { calls.push([o.action, o.bind]); box.childElementCount++; };
    foldSection = () => ({childElementCount: 0, appendChild() { this.childElementCount++; }});
    ${TWO16}
    try { renderTicket({appendChild() {}}, 'DM-5'); } finally { launchBlock = lb; foldSection = fs; }
    return calls.filter(c => c[0] === 'bureau-review' || c[0] === 'bureau-fix');
  })()`);
  assert.deepEqual(calls, [['bureau-review', {id: 'dunder-mifflin/front_api#16'}]]);
  assert.deepEqual(J(`bindsFor('bureau-review', {id: 'dunder-mifflin/front_api#16'})`),
    {repo: 'dunder-mifflin/front_api#16', pr: 'dunder-mifflin/front_api#16'}); // Kronn : prs.find(id).repo, prs.find(id).n
  assert.deepEqual(J(`[prId({n: 3}), prId({n: 3, repo: 'a/b'}), prNum({n: 3, repo: 'dunder-mifflin/site-web'}), prNum({n: 3, repo: 'a/b'})]`),
    ['dunder-mifflin/site-web#3', 'a/b#3', '#3', 'b#3']);
});

test('« 🚀 Mise en prod » d\'une PR (#58) : dépôt de mep_repos, ni brouillon ni changements demandés, gelée le vendredi', () => {
  run("var MR0 = CFG.mep_repos, MA0 = ACTIONS.mep_pr; CFG.mep_repos = ['dunder-mifflin/site-web']; ACTIONS.mep_pr = true;");
  try {
    assert.deepEqual(buttons('DM-2'), [['bureau-meppr', ID(12), false], ['bureau-review', ID(12), false]]);
    assert.deepEqual(buttons('DM-2', {now: at('09', '11:00')})[0], ['bureau-meppr', ID(12), true]);
    assert.ok(!buttons('DM-4').some(b => b[0] === 'bureau-meppr'), 'changements demandés (#13) ou brouillon (#14) : pas de MEP');
    run("CFG.mep_repos = ['dunder-mifflin/intranet'];");
    assert.ok(!buttons('DM-2').some(b => b[0] === 'bureau-meppr'), 'dépôt sans réglages de MEP');
  } finally { run('CFG.mep_repos = MR0; ACTIONS.mep_pr = MA0;'); }
});
