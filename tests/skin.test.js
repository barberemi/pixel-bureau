// Thème d'interface (01-skin.js) : le choix de la personne (navigateur) passe avant celui de l'installation (ui.skin),
// une valeur inconnue retombe sur le thème classique.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const run = load().run;

test('thème : choix du navigateur, puis de l\'installation, puis classique', () => {
  assert.equal(run("skinFor('equipe','classique')"), 'equipe');
  assert.equal(run("skinFor(null,'equipe')"), 'equipe');
  assert.equal(run("skinFor('classique','equipe')"), 'classique');
  assert.equal(run("skinFor('inconnu','autre')"), 'classique');
  assert.equal(run('skinFor(null,undefined)'), 'classique');
});

test('thème : tous les thèmes posent data-skin (habillage pixel commun), le Classique compris', () => {
  run("applySkin('classique')");
  assert.equal(run('document.documentElement.dataset.skin'), 'classique');
  run("applySkin('equipe')");
  assert.equal(run('document.documentElement.dataset.skin'), 'equipe');
});
