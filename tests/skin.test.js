// Thème d'interface (01-skin.js) : le choix de la personne (navigateur) passe avant celui de l'installation (ui.skin),
// puis celui que propose le plan (skin) ; une valeur inconnue retombe sur le thème Darkmode. Le dépôt livre Darkmode et
// Newsroom ; un pack d'équipe peut en ajouter.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

// pack d'équipe fictif (tests/fixtures/pack-exemple) : il apporte le thème Menthe
const PACK = {...require('./fixtures/bureau.config.json'), team: './tests/fixtures/pack-exemple', people: []};
const run = load({config: PACK, owner: 'p_bob'}).run;

test('thème : choix du navigateur, puis de l\'installation, puis darkmode', () => {
  assert.equal(run("skinFor('menthe','darkmode')"), 'menthe');
  assert.equal(run("skinFor(null,'menthe')"), 'menthe');
  assert.equal(run("skinFor('darkmode','menthe')"), 'darkmode');
  assert.equal(run("skinFor('inconnu','autre')"), 'darkmode');
  assert.equal(run('skinFor(null,undefined)'), 'darkmode');
});

test('thème : tous les thèmes posent data-skin (habillage pixel commun), le Darkmode compris', () => {
  run("applySkin('darkmode')");
  assert.equal(run('document.documentElement.dataset.skin'), 'darkmode');
  run("applySkin('menthe')");
  assert.equal(run('document.documentElement.dataset.skin'), 'menthe');
});

test('thème : sans thème de pack, ceux du dépôt (Darkmode, Newsroom) et le bouton 🎨', () => {
  const demo = load().run;
  assert.equal(demo('JSON.stringify(Object.keys(UI_SKINS))'), '["darkmode","newsroom"]');
  assert.equal(demo('skinChoice()'), true);
  assert.equal(demo("skinFor(null,'menthe')"), 'darkmode'); // thème d'un pack absent : retombe sur le Darkmode
  assert.equal(run('JSON.stringify(Object.keys(UI_SKINS))'), '["darkmode","newsroom","menthe"]');
});

test('thème : le plan propose le sien (skin) quand l\'installation n\'en choisit pas', () => {
  assert.equal(load({layout: 'newsroom'}).run('UI_SKIN'), 'newsroom');
  assert.equal(load({layout: 'darkmode'}).run('UI_SKIN'), 'darkmode');
  const cfg = {...require('./fixtures/bureau.config.json'), ui: {skin: 'darkmode'}};
  assert.equal(load({layout: 'newsroom', config: cfg}).run('UI_SKIN'), 'darkmode'); // ui.skin de l'installation d'abord
});
