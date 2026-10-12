// Liens du fil (70-kpis-feed.js) : une fiche dans la page quand on la connaît, sinon Jira ou GitHub (↗), sinon du texte
// grisé qui dit pourquoi au survol.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;

test.beforeEach(() => run(`TEAM = {people: [{id: 'a1', name: 'Pam Beesly', tickets: [{key: 'DM-1', cat: 'doing', summary: 'Un'}],
    prs: [{n: 12, url: 'https://gh/12', keys: ['DM-1']}, {n: 13, url: 'https://gh/13', keys: []}, {n: 14, keys: ['DM-99']}]}],
  unassigned: [], other_prs: []};
  CFG.github_repo = 'acme/site';`));

test('personne : sa fiche si on la connaît, sinon son nom grisé et la raison', () => {
  assert.equal(run(`refWho({key: 'p_pam', name: 'Pam'})`), '<a href="#" class="lk lk-who" data-who="p_pam" title="Ouvrir sa fiche">Pam</a>');
  assert.equal(run(`refWho(null, 'Robert')`), '<span class="lk-off" title="Pas dans l\'équipe : pas de fiche">Robert</span>');
});

test('ticket : fiche s\'il est dans le sprint ; Jira sinon, ou toujours pour un ticket créé aujourd\'hui', () => {
  assert.match(run(`refTk('DM-1')`), /^<a href="#" class="lk lk-id" data-tk="DM-1"/);
  assert.match(run(`refTk('OPS-4')`), /class="lk lk-id lk-ext" href="[^"]*browse\/OPS-4" target="_blank"[^>]*title="Pas dans le sprint : ouvrir dans Jira">OPS-4</);
  assert.match(run(`refTk('DM-1', true)`), /lk-ext" href="[^"]*browse\/DM-1"[^>]*title="Ouvrir dans Jira"/);
  assert.equal(run(`refTk('')`), '');
});

test('PR : toujours sa fiche dans le panneau, nommée par son dépôt (celui de l\'équipe par défaut)', () => {
  assert.equal(run(`refPr(12)`), '<a href="#" class="lk lk-id" data-pr="acme/site#12" title="Fiche de la PR">site#12</a>');
  assert.match(run(`refPr(13)`), /data-pr="acme\/site#13"[^>]*>site#13</); // sans ticket : sa fiche aussi, plus GitHub
  run(`CFG.github_repo = null;`);
  assert.match(run(`refPr(99)`), /data-pr="#99"[^>]*>#99</); // dépôt inconnu : la fiche le dit
});

test('événements d\'équipe : chaque personne, ticket et PR devient un lien', () => {
  run(`chars = [{key: 'p_pam', name: 'Pam', person: 'Pam Beesly', team: TEAM.people[0]}];`);
  const rv = run(`teamEventTxt({kind: 'review', state: 'approved', n: 12, by: 'zz', by_name: 'Robert California', author: 'a1', author_name: 'Pam Beesly'}).txt`);
  assert.match(rv, /<span class="lk-off"[^>]*>Robert<\/span> approuve la PR <a [^>]*data-pr="acme\/site#12"[^>]*>site#12<\/a> de <a [^>]*data-who="p_pam"/);
  const mv = run(`teamEventTxt({kind: 'move', key: 'DM-1', from: 'En cours', to: 'To Review', cat: 'review', who: 'a1'}).txt`);
  assert.match(mv, /data-who="p_pam"[^>]*>Pam<\/a> : <a href="#" class="lk lk-id" data-tk="DM-1"/);
});

// revue multi-dépôts : le run dit le dépôt de la PR (current_task.repo) ; une PR d'un autre dépôt n'est jamais prise
// pour la PR de même numéro de l'équipe, et son lien mène à son dépôt
test('PR d\'un autre dépôt : lien vers son dépôt, nommé, jamais la PR de même numéro de l\'équipe', () => {
  const ref = JSON.parse(run(`JSON.stringify(runRef({vars: {'current_task.number': '12', 'current_task.repo': 'acme/image-server'}}))`));
  assert.deepEqual([ref.pr, ref.repo, ref.key, ref.t], ['12', 'acme/image-server', null, null]); // pas DM-1 (PR #12 de acme/site)
  assert.equal(run(`refPr('12', null, 'acme/image-server')`),
    '<a href="#" class="lk lk-id" data-pr="acme/image-server#12" title="Fiche de la PR">image-server#12</a>');
  const same = JSON.parse(run(`JSON.stringify(runRef({vars: {'current_task.number': '12', 'current_task.repo': 'Acme/Site'}}))`));
  assert.deepEqual([same.repo, same.key], [null, 'DM-1']); // le dépôt de l'équipe (casse comprise) : comme avant
  assert.match(run(`refPr('12', null, 'Acme/Site')`), /data-pr="acme\/site#12"[^>]*>site#12</);
});

// fiche d'une PR : ce que la page en sait (dataset team pour le dépôt de l'équipe, runs des agents pour les autres)
test('fiche PR : titre, auteur et ticket de la PR de l\'équipe ; auteur d\'une PR d\'un autre dépôt par son login', () => {
  run(`chars = [{key: 'p_pam', name: 'Pam', person: 'Pam Beesly', github: 'pambeesly', team: TEAM.people[0]},
    {key: 'dwight', name: 'Dwight', wf: ['rev'], runs: [
      {wf_name: 'Revue', status: 'Success', _s: 1, vars: {'current_task.number': '12', 'current_task.repo': 'acme/site'}},
      {wf_name: 'Revue', status: 'Success', _s: 2, vars: {'current_task.number': '12', 'current_task.repo': 'acme/image-server', 'current_task.author': 'PamBeesly'}}]}];
    T = 10;`);
  const mine = JSON.parse(run(`(() => { const x = prInfo('acme/site#12'); return JSON.stringify({url: x.url, owner: x.owner && x.owner.key, keys: x.pr.keys, runs: x.runs.map(y => y.r._s)}); })()`));
  assert.deepEqual(mine, {url: 'https://gh/12', owner: 'p_pam', keys: ['DM-1'], runs: [1]});
  const other = JSON.parse(run(`(() => { const x = prInfo('acme/image-server#12'); return JSON.stringify({url: x.url, owner: x.owner && x.owner.key, pr: x.pr, runs: x.runs.map(y => y.r._s)}); })()`));
  assert.deepEqual(other, {url: 'https://github.com/acme/image-server/pull/12', owner: 'p_pam', pr: null, runs: [2]});
});
