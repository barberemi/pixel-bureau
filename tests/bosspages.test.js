// L'écran mural de la salle de réunion montre les autres pages Kronn du boss (#61 ; dataset bosspages publié par le cron
// fiche de paie, liste rangée par la page dans pagelist) : 4 miniatures et une case « + », et au clic une fenêtre de
// cartes qui ouvrent chaque page dans Kronn, avec × pour retirer et « + Ajouter » (code copié pour la carte Kronn).
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
  const r = J('wallRect()'); // l'écran mural, centré sur le tableau blanc du plan type (case 20, rangée 1)
  assert.deepEqual(r, {x: 20 * 32 + 48 - 56, y: 32 + 5, w: 112, h: 21});
  run('BOSS_PAGES=[];ACTIONS.pages=true;');
  try { assert.equal(J('bossPagesOn()'), true, 'sans page mais avec le workflow : la case « + » suffit'); } finally { run('ACTIONS.pages=false;'); }
});

test('liste rangée par la page (pagelist) : son ordre, retrait immédiat, page ajoutée sans aperçu en attendant le cron', () => {
  run(`BOSS_PAGES=${JSON.stringify(PAGES)};BOSS_CHOICES=[{id:'pc',title:'Revue de PR'}];`);
  assert.deepEqual(J(`readPageList({datasets:{pagelist:{current:${JSON.stringify(JSON.stringify({pages: ['pb', 'pc', 7]}))}}}})`), ['pb', 'pc']);
  assert.equal(J('readPageList({datasets:{}})'), null);
  run("PAGELIST=['pb','pc'];");
  try {
    assert.deepEqual(J('shownPages().map(p=>[p.id,p.title,p.img])'), [['pb', 'Core Web Vitals', 'javascript:alert(1)'], ['pc', 'Revue de PR', null]]);
  } finally { run('PAGELIST=null;'); }
  assert.deepEqual(J('readBossPages({datasets:{bosspages:{current:{pages:[],choices:[{id:"pz",title:"Z"},{title:"sans id"}]}}}}) && BOSS_CHOICES'), [{id: 'pz', title: 'Z'}]);
});

test('fenêtre avec le workflow pages : × par carte, case « + Ajouter » et liste des pages pas encore sur l\'écran ; code PAGES1', () => {
  run(`BOSS_PAGES=${JSON.stringify(PAGES)};BOSS_CHOICES=[{id:'pa',title:'Veille'},{id:'pc',title:'Revue <de> PR'}];ACTIONS.pages=true;`);
  try {
    const html = J('bossPagesHtml()'), add = J('bossAddHtml()');
    assert.equal((html.match(/class="bp-del" data-kronn-action="bureau-pages" data-id="p[ab]"/g) || []).length, 2);
    assert.match(html, /bp-plus/);
    assert.match(add, /<option value="pc">Revue &lt;de&gt; PR<\/option>/);
    assert.ok(!add.includes('value="pa"'), 'une page déjà sur l\'écran n\'est pas proposée');
    assert.match(add, /data-kronn-action="bureau-pages" disabled/);
    const code = J("pagesCode('remove','pa')");
    assert.deepEqual(Object.assign(JSON.parse(Buffer.from(code.slice(7), 'base64').toString()), {at: 0}), {op: 'remove', id: 'pa', at: 0});
  } finally { run('ACTIONS.pages=false;'); }
  assert.ok(!J('bossPagesHtml()').includes('bp-del'), 'sans le workflow : ni × ni « + »');
  assert.equal(J('bossAddHtml()'), '');
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
      return sel.split(',').some(s => { if (/:not\(\[disabled\]\)/.test(s) && this.disabled) return false; s = s.trim().replace(/\[href\]|:not\(\[disabled\]\)/g, ''); return s[0] === '.' ? this.className.split(' ').includes(s.slice(1)) : this.tagName === s.toUpperCase(); });
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

test('écran de validation (× ou Ajouter) : la grille se replie, l\'aide ne suit que la demande lancée d\'ici, retour à la grille à jour', () => {
  run(`BOSS_PAGES=${JSON.stringify(PAGES)};BOSS_CHOICES=[{id:'pc',title:'Revue <de> PR'}];PAGELIST=null;BP_ADDED=null;BP_SENT=null;ACTIONS.pages=true;
    var OBS=[], COPIED=null, CLICKED=0; MutationObserver=function(cb){OBS.push(cb);return {observe(){}};}; codeHint=(h,c)=>{COPIED=c;h.innerHTML='steps';};
    var tHint={innerHTML:''}, tBack={textContent:'↩ Annuler'}, tGrid={innerHTML:''}, tMsg={innerHTML:''};
    var tBox={cls:new Set(),scrollTop:5,classList:{add(c){tBox.cls.add(c);},remove(c){tBox.cls.delete(c);},contains(c){return tBox.cls.has(c);}},
      q:{'.bp-grid':tGrid,'.bp-hint':tMsg},querySelector(s){return this.q[s]||null;},querySelectorAll(){return [];}};
    var tConf={hidden:true,set innerHTML(h){this.html=h;tBox.q['.bp-confirm .hint']=tHint;tBox.q['.bp-back']=tBack;},get innerHTML(){return this.html;},
      querySelector(s){return s==='.hint'?tHint:s==='.bp-back'?tBack:null;}};
    tBox.q['.bp-confirm']=tConf;
    var TB={attrs:{'data-kronn-action-state':'succeeded'},getAttribute(k){return this.attrs[k];},click(){CLICKED++;}};
    bpAsk(tBox,TB,'add',()=>'pc'); OBS[0]();`); // état « succeeded » d'une demande précédente : ignoré
  try {
    assert.equal(run('BP_ADDED'), null);
    run('TB.onclick()');
    assert.deepEqual(J('[tBox.classList.contains("bp-on"), tConf.hidden, tBox.scrollTop]'), [true, false, 0]);
    assert.match(J('tConf.html'), /Ajouter à l'écran mural.*Revue &lt;de&gt; PR/s);
    assert.match(J('tConf.html'), /↩ Annuler/);
    assert.deepEqual(JSON.parse(Buffer.from(J('COPIED').slice(7), 'base64').toString()).id, 'pc');
    run('TB.attrs["data-kronn-action-state"]="launching";OBS[0]();TB.attrs["data-kronn-action-state"]="succeeded";OBS[0]();');
    assert.equal(J('BP_ADDED'), 'pc');
    assert.match(J('tHint.innerHTML'), /C'est fait.*est sur l'écran mural/);
    assert.equal(J('tBack.textContent'), '↩ Retour à mes pages');
    run('PAGELIST=["pa","pc"];tBox.q["[data-kronn-action-slot]"]={};bpBack(tBox);');
    assert.equal(J('CLICKED'), 1, 'carte Kronn encore ouverte : refermée par un second clic sur son bouton');
    assert.deepEqual(J('[tBox.classList.contains("bp-on"), tConf.hidden]'), [false, true]);
    assert.match(J('tGrid.innerHTML'), /⏳ Miniature en cours…[\s\S]*bp-badge">✓ Ajoutée/, 'la page ajoutée, en attendant sa miniature');
    assert.match(J('tMsg.innerHTML'), /C'est fait/);
  } finally { run('ACTIONS.pages=false;PAGELIST=null;BP_ADDED=null;BP_SENT=null;'); }
});

test('case « + Ajouter » de la grille : ouvre directement la liste des pages à ajouter', () => {
  run(`var OPENED=0, PK={scrollIntoView(){},focus(){},showPicker(){OPENED++;}}, PL={};
    bpWireGrid({querySelectorAll:()=>[],querySelector:s=>s==='.bp-plus'?PL:s==='.bp-pick'?PK:null}); PL.onclick();`);
  assert.equal(J('OPENED'), 1);
});

test('fenêtre : 4 colonnes (6 pages et « + Ajouter » tiennent en 2 rangées sur un portable), 2 sous 900 px', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'page', 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.bp-grid\{display:grid;grid-template-columns:repeat\(4,1fr\)/);
  assert.match(css, /@media \(max-width:900px\)\{\.bp-grid\{grid-template-columns:repeat\(2,1fr\)\}\}/);
});
