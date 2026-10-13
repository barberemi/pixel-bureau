// L'écran du boss montre ses autres pages Kronn (dataset bosspages publié par le cron fiche de paie, clé boss_pages) :
// diaporama dans l'écran du bureau du boss, et au clic une fenêtre de cartes qui ouvrent chaque page dans Kronn.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const IMG = 'data:image/jpeg;base64,QUJD';
const PAGES = [{id: 'pa', title: 'Veille <techno>', updated: new Date(Date.now() - 2 * 3600e3).toISOString(), img: IMG},
               {id: 'pb', title: 'Core Web Vitals', updated: null, img: 'javascript:alert(1)'}];

test('lecture du dataset : objet, texte JSON, absent ou cassé', () => {
  const ds = v => `readBossPages({datasets:{bosspages:{current:${JSON.stringify(v)}}}})`;
  assert.deepEqual(J(ds({generated_at: 'x', pages: PAGES})).map(p => p.id), ['pa', 'pb']);
  assert.deepEqual(J(ds(JSON.stringify({pages: [{id: 'pa'}, {title: 'sans id'}]}))).map(p => p.id), ['pa']);
  assert.equal(J('readBossPages({datasets:{}})'), null);
  assert.equal(J(ds('{cassé')), null);
});

test('rien sans pages ni en mode TV ; sinon l\'écran du boss est une zone cliquable', () => {
  run('BOSS_PAGES=[];TV=false;');
  assert.equal(J('bossPagesOn()'), false);
  run(`BOSS_PAGES=${JSON.stringify(PAGES)};`);
  assert.equal(J('bossPagesOn()'), true);
  run('TV=true;');
  try { assert.equal(J('bossPagesOn()'), false); } finally { run('TV=false;'); }
  const r = J('bossScreenRect()'); // l'écran du bureau du boss (plan type : bureau en 21-23, rangée 9)
  assert.deepEqual(r, {x: 21 * 32 + 4, y: 9 * 32 - 32, w: 18, h: 13});
});

test('cartes : lien Kronn vers chaque page, titre échappé, image data: seulement, âge de la mise à jour', () => {
  run(`BOSS_PAGES=${JSON.stringify(PAGES)};`);
  const html = J('bossPagesHtml()');
  // /index.html : Kronn traite le lien comme externe et l'ouvre dans un nouvel onglet (sa propre adresse : onglet courant)
  assert.match(html, /href="http:\/\/localhost:5173\/index\.html#page\/pa" target="_blank"/);
  assert.match(html, /Veille &lt;techno&gt;/);
  assert.match(html, new RegExp(`<img src="${IMG}"`));
  assert.ok(!html.includes('javascript:'), 'une image qui n\'est pas une data: image n\'est jamais insérée');
  assert.match(html, /Pas d'aperçu/);
  assert.match(html, /Mise à jour il y a 2 h/);
  run(`BOSS_PAGES[0].updated=new Date(Date.now()-50*3600e3).toISOString();`);
  assert.match(J('bossPagesHtml()'), /Mise à jour il y a 2 j/); // au-delà d'un jour, en jours
});
