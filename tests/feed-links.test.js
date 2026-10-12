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

test('PR : la fiche de son ticket du sprint, sinon GitHub (son adresse, ou celle du dépôt), sinon texte', () => {
  assert.match(run(`refPr(12)`), /data-tk="DM-1" title="Fiche du ticket DM-1 : ses PR et ses actions">#12</);
  assert.match(run(`refPr(13)`), /lk-ext" href="https:\/\/gh\/13"[^>]*>#13</); // sans ticket
  assert.match(run(`refPr(14)`), /lk-ext" href="https:\/\/github.com\/acme\/site\/pull\/14"/); // ticket hors sprint, pas d'adresse
  run(`CFG.github_repo = null;`);
  assert.match(run(`refPr(99)`), /^<span class="lk-off" title="Dépôt GitHub inconnu">#99<\/span>$/);
});

test('événements d\'équipe : chaque personne, ticket et PR devient un lien', () => {
  run(`chars = [{key: 'p_pam', name: 'Pam', person: 'Pam Beesly', team: TEAM.people[0]}];`);
  const rv = run(`teamEventTxt({kind: 'review', state: 'approved', n: 12, by: 'zz', by_name: 'Robert California', author: 'a1', author_name: 'Pam Beesly'}).txt`);
  assert.match(rv, /<span class="lk-off"[^>]*>Robert<\/span> approuve la PR <a [^>]*data-tk="DM-1"[^>]*>#12<\/a> de <a [^>]*data-who="p_pam"/);
  const mv = run(`teamEventTxt({kind: 'move', key: 'DM-1', from: 'En cours', to: 'To Review', cat: 'review', who: 'a1'}).txt`);
  assert.match(mv, /data-who="p_pam"[^>]*>Pam<\/a> : <a href="#" class="lk lk-id" data-tk="DM-1"/);
});

// revue multi-dépôts : le run dit le dépôt de la PR (current_task.repo) ; une PR d'un autre dépôt n'est jamais prise
// pour la PR de même numéro de l'équipe, et son lien mène à son dépôt
test('PR d\'un autre dépôt : lien vers son dépôt, nommé, jamais la PR de même numéro de l\'équipe', () => {
  const ref = JSON.parse(run(`JSON.stringify(runRef({vars: {'current_task.number': '12', 'current_task.repo': 'acme/image-server'}}))`));
  assert.deepEqual([ref.pr, ref.repo, ref.key, ref.t], ['12', 'acme/image-server', null, null]); // pas DM-1 (PR #12 de acme/site)
  assert.equal(run(`refPr('12', null, 'acme/image-server')`),
    '<a class="lk lk-id lk-ext" href="https://github.com/acme/image-server/pull/12" target="_blank" rel="noopener" title="Ouvrir sur GitHub (acme/image-server)">image-server#12</a>');
  const same = JSON.parse(run(`JSON.stringify(runRef({vars: {'current_task.number': '12', 'current_task.repo': 'Acme/Site'}}))`));
  assert.deepEqual([same.repo, same.key], [null, 'DM-1']); // le dépôt de l'équipe (casse comprise) : comme avant
  assert.match(run(`refPr('12', null, 'acme/site')`), /data-tk="DM-1"/);
});
