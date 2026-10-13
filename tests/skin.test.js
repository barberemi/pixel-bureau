// Thème d'interface (01-skin.js) : le choix de la personne (navigateur) passe avant celui de l'installation (ui.skin),
// une valeur inconnue retombe sur le thème classique. Le dépôt n'a que le Classique : les autres viennent du pack d'équipe.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

// pack d'équipe fictif (tests/fixtures/pack-exemple) : il apporte le thème Menthe
const PACK = {...require('./fixtures/bureau.config.json'), team: './tests/fixtures/pack-exemple', people: []};
const run = load({config: PACK, owner: 'p_bob'}).run;

test('thème : choix du navigateur, puis de l\'installation, puis classique', () => {
  assert.equal(run("skinFor('menthe','classique')"), 'menthe');
  assert.equal(run("skinFor(null,'menthe')"), 'menthe');
  assert.equal(run("skinFor('classique','menthe')"), 'classique');
  assert.equal(run("skinFor('inconnu','autre')"), 'classique');
  assert.equal(run('skinFor(null,undefined)'), 'classique');
});

test('thème : tous les thèmes posent data-skin (habillage pixel commun), le Classique compris', () => {
  run("applySkin('classique')");
  assert.equal(run('document.documentElement.dataset.skin'), 'classique');
  run("applySkin('menthe')");
  assert.equal(run('document.documentElement.dataset.skin'), 'menthe');
});

test('thème : sans thème de pack, le Classique seul et pas de bouton 🎨', () => {
  const demo = load().run;
  assert.equal(demo('JSON.stringify(Object.keys(UI_SKINS))'), '["classique"]');
  assert.equal(demo('skinChoice()'), false);
  assert.equal(demo("skinFor(null,'menthe')"), 'classique'); // thème d'un pack absent : retombe sur le Classique
  assert.equal(run('skinChoice()'), true);
});
