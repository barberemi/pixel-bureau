// Réglage système « réduire les animations » (#3) : lu une fois par matchMedia ; effets de thème au-dessus du plan
// coupés, loupe automatique éteinte par défaut (un choix du bouton passe avant), défilements instantanés.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const reduce = q => ({matches: q === '(prefers-reduced-motion: reduce)'});
const storage = init => { const m = new Map(Object.entries(init)); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
// nombre d'emojis dessinés par l'effet du thème de Noël (flocons, traîneau)
const overlayDraws = run => run(`(()=>{let n=0;const e0=E;E=()=>{n++;};THEME_FORCE='noel';
  try{themeOverlay(1000);}finally{E=e0;THEME_FORCE=null;}return n;})()`);

test('sans le réglage (ni matchMedia) : effets de thème, loupe allumée, défilement doux', () => {
  const {run} = load();
  assert.equal(run('REDUCED_MOTION'), false);
  assert.equal(run('LOUPE_ON'), true);
  assert.equal(run('SCROLL_BEHAVIOR'), 'smooth');
  assert.ok(overlayDraws(run) > 0);
  const off = load({globals: {matchMedia: () => ({matches: false})}});
  assert.equal(off.run('REDUCED_MOTION'), false);
});

test('avec prefers-reduced-motion: reduce : plus d\'effets de thème, loupe éteinte, défilement instantané', () => {
  const {run} = load({globals: {matchMedia: reduce}});
  assert.equal(run('REDUCED_MOTION'), true);
  assert.equal(run('LOUPE_ON'), false);
  assert.equal(run('SCROLL_BEHAVIOR'), 'auto');
  assert.equal(overlayDraws(run), 0);
});

test('le bouton Loupe déjà choisi dans ce navigateur passe avant le réglage système', () => {
  assert.equal(load({globals: {matchMedia: reduce, localStorage: storage({'bureau:loupe': '1'})}}).run('LOUPE_ON'), true);
  assert.equal(load({globals: {localStorage: storage({'bureau:loupe': '0'})}}).run('LOUPE_ON'), false);
});

test('matchMedia qui lève une erreur : animations normales', () => {
  const {run} = load({globals: {matchMedia: () => { throw new Error('bloqué'); }}});
  assert.equal(run('REDUCED_MOTION'), false);
});
