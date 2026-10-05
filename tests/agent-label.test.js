// Étiquettes des agents : prénom de The Office + métier court + icône, pour savoir quel workflow est qui.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const ag = (role, extra = '') => `({key:'x',name:'Dwight',role:${JSON.stringify(role)},wf:['abcd1234']${extra}})`;

test('icône devinée depuis le rôle (nom du workflow), réglable dans la config', () => {
  const ico = role => J(`agentIcon(${ag(role)})`);
  assert.equal(ico('Cron PR Review — multi-repo'), '🔎');
  assert.equal(ico('Veille techno — refresh (page)'), '📰');
  assert.equal(ico('Erreurs prod — Fastly 5xx (horaire)'), '🚨');
  assert.equal(ico('Couverture E2E Playwright · refresh (page)'), '🧪');
  assert.equal(ico('Migration des blocks · refresh (page)'), '🧳');
  assert.equal(ico('Surveillance des stats'), '📊');
  assert.equal(ico('Quelque chose de neuf'), '⚙');
  assert.equal(J(`agentIcon(${ag('Veille techno', ",icon:'🦉'")})`), '🦉');
});

test('métier court : sans « Cron », « refresh (page) » ni cadence, coupé proprement ; short de la config prioritaire', () => {
  const short = role => J(`agentShort(${ag(role)})`);
  assert.equal(short('Veille techno — refresh (page)'), 'Veille techno');
  assert.equal(short('Erreurs prod — Fastly 5xx (horaire)'), 'Erreurs prod');
  assert.equal(short('Cron PR Review — multi-repo (générique, fenêtre glissante)'), 'PR Review');
  assert.equal(short('Live (1 min)'), 'Live');
  assert.equal(short('Implémentation du ticket et mise en prod du front'), 'Implémentation du ticket…');
  assert.equal(J(`agentShort(${ag('Veille techno', ",short:'Veille'")})`), 'Veille');
});

test('étiquette : les deux par défaut, métier seul en mode TV, prénom seul sur réglage ; collègues inchangés', () => {
  assert.equal(J(`labelText(${ag('Reviewer de PR')})`), '🔎 Dwight · Reviewer de PR');
  run('TV=true;');
  try { assert.equal(J(`labelText(${ag('Reviewer de PR')})`), '🔎 Reviewer de PR'); } finally { run('TV=false;'); }
  run(`CFG.ui=Object.assign({},CFG.ui,{agent_label:'office'});`);
  try { assert.equal(J(`labelText(${ag('Reviewer de PR')})`), '🔎 Dwight'); } finally { run(`delete CFG.ui.agent_label;`); }
  assert.equal(J(`labelText(byKey.p_pam)`), 'Pam');
  assert.equal(J(`agentTag(byKey.p_pam)`), '');
});
