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

test('en review avec une PR en attente : Faire relire, lié au n° de PR', () => {
  assert.deepEqual(buttons('DM-2'), [['bureau-review', {n: '12'}, false]]);
});

test('changements demandés : Corriger et Faire relire ; un brouillon n\'a pas de bouton ; une PR ouverte retire Implémenter', () => {
  assert.deepEqual(buttons('DM-4'), [['bureau-fix', {n: '13'}, false], ['bureau-review', {n: '13'}, false]]);
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
  assert.deepEqual(J(`bindsFor('bureau-review', {n: '12'})`), {repo: '12', pr: '12'});
  assert.deepEqual(J(`bindsFor('bureau-fix', {n: '13'})`), {pr: '13'}); // notes : saisie, pas liée
  assert.equal(J(`bindsFor('bureau-impl', {n: '13'})`), null); // pas le bon champ : pas de bouton
});

test('Commenter : sur tout ticket du sprint, quel que soit son statut, en dernier ; la saisie se fait dans la carte Kronn', () => {
  for (const key of ['DM-1', 'DM-2', 'DM-3', 'DM-4']) assert.deepEqual(buttons(key, {comment: true}).at(-1), ['bureau-comment', {key}, false]);
  assert.deepEqual(buttons('DM-1', {comment: true, acts: false}), []);
  assert.deepEqual(J(`bindsFor('bureau-comment', {key: 'DM-2'})`), {jira_ticket_key: 'DM-2'}); // comment : saisi, pas lié
});
