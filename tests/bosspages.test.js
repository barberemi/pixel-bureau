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

// DOM minimal pour la fenêtre : éléments chaînés, focus, inert ; le HTML des cartes donne une carte (a) par .bp-card
function fakeDom() {
  const doc = {activeElement: null};
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.kids = []; this.parent = null; this.inert = false; this.className = ''; this.focusable = /^(A|BUTTON)$/.test(this.tagName); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    hasAttribute(k) { return k in this.attrs; }
    set tabIndex(v) { this.attrs.tabindex = String(v); this.focusable = true; }
    get isConnected() { let e = this; while (e.parent) e = e.parent; return e === doc.body; }
    get children() { return this.kids; }
    append(...xs) { for (const x of xs) { x.parent = this; this.kids.push(x); } }
    remove() { if (this.parent) this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; }
    contains(x) { for (; x; x = x.parent) if (x === this) return true; return false; }
    focus() { if (this.focusable && this.isConnected) doc.activeElement = this; }
    matches(sel) {
      return sel.split(',').some(s => { s = s.trim().replace('[href]', ''); return s[0] === '.' ? this.className.split(' ').includes(s.slice(1)) : this.tagName === s.toUpperCase(); });
    }
    querySelectorAll(sel) { const out = []; const walk = e => { for (const k of e.kids) { if (k.matches(sel)) out.push(k); walk(k); } }; walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    set innerHTML(h) {
      const x = new El('button'); x.className = 'bp-x'; this.append(x);
      for (const m of h.matchAll(/class="bp-card"/g)) { const a = new El('a'); a.className = 'bp-card'; this.append(a); }
    }
  }
  doc.body = new El('body');
  doc.createElement = t => new El(t);
  doc.querySelector = s => doc.body.querySelector(s);
  doc.querySelectorAll = s => doc.body.querySelectorAll(s);
  const wrap = new El('div'); wrap.className = 'wrap';
  const btn = new El('button'); wrap.append(btn); // un bouton de la page, qui avait le focus avant l'ouverture
  const cv = new El('canvas'); wrap.append(cv);
  doc.body.append(wrap);
  doc.getElementById = id => (id === 'cv' ? cv : null);
  doc.activeElement = doc.body;
  return {doc, wrap, btn, cv};
}

test('fenêtre : page inerte, Tab et Maj+Tab bouclent dedans, Échap rend le focus à l\'élément d\'avant', () => {
  const real = page.ctx.document, dom = fakeDom();
  page.ctx.document = dom.doc;
  try {
    run(`BOSS_PAGES=${JSON.stringify(PAGES)};TV=false;`);
    dom.btn.focus();
    run('openBossPages()');
    const box = dom.doc.querySelector('.bp-modal'), cards = box.querySelectorAll('.bp-card'), x = box.querySelector('.bp-x');
    assert.equal(cards.length, 2);
    assert.equal(box.attrs['aria-modal'], 'true');
    assert.equal(dom.wrap.inert, true, 'le reste de la page est inerte');
    assert.equal(dom.doc.activeElement, cards[0], 'focus sur la première carte');
    let prevented = 0;
    const key = (k, shift = false) => { page.ctx.__ev = {key: k, shiftKey: shift, preventDefault() { prevented++; }}; run('bossPagesKey(__ev)'); };
    dom.doc.activeElement = cards[1]; key('Tab');
    assert.equal(dom.doc.activeElement, x, 'Tab sur la dernière carte : retour au premier élément (Fermer)');
    key('Tab', true);
    assert.equal(dom.doc.activeElement, cards[1], 'Maj+Tab sur le premier : la dernière carte');
    dom.doc.activeElement = dom.doc.body; key('Tab');
    assert.equal(dom.doc.activeElement, x, 'focus perdu hors de la fenêtre : Tab y revient');
    assert.equal(prevented, 3);
    dom.doc.activeElement = cards[0]; key('Tab');
    assert.equal(prevented, 3, 'au milieu, Tab suit son cours');
    key('Escape');
    assert.equal(dom.doc.querySelector('.bp-modal'), null);
    assert.equal(dom.wrap.inert, false, 'la page redevient active');
    assert.equal(dom.doc.activeElement, dom.btn, 'focus rendu à l\'élément d\'avant');
  } finally { page.ctx.document = real; }
});

test('fenêtre ouverte depuis le plan (canvas, rien de focalisable) : le bouton Fermer rend le focus au plan, hors tabulation', () => {
  const real = page.ctx.document, dom = fakeDom();
  page.ctx.document = dom.doc;
  try {
    run(`BOSS_PAGES=${JSON.stringify(PAGES)};TV=false;`);
    run('openBossPages()'); // focus sur <body> au clic sur le canvas
    run('openBossPages()'); // rouverte par-dessus : l'élément d'origine est gardé
    const box = dom.doc.querySelector('.bp-modal');
    assert.equal(dom.doc.querySelectorAll('.bp-modal').length, 1);
    box.querySelector('.bp-x').onclick();
    assert.equal(dom.doc.querySelector('.bp-modal'), null);
    assert.equal(dom.wrap.inert, false);
    assert.equal(dom.doc.activeElement, dom.cv);
    assert.equal(dom.cv.attrs.tabindex, '-1');
  } finally { page.ctx.document = real; }
});
