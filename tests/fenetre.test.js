// Le seul gabarit de fenêtre (audit UX, constat 14) : openDialog et closeDialog de 47-fenetre.js, dans un faux DOM
// (tests/helpers/fakedom.js). Dialogue nommé, page inerte, Tab qui boucle, Échap et le fond qui ferment, focus rendu,
// une seule fenêtre à la fois, focus sur le premier élément du contenu (sinon ×), corps seul à défiler.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');
const {withDom} = require('./helpers/fakedom.js');

const page = load();
const run = page.run;
const key = (k, shift = false) => { let n = 0; page.ctx.__ev = {key: k, shiftKey: shift, preventDefault() { n++; }}; run('dialogKey(__ev)'); return n; };
const open = o => { page.ctx.__o = o; return run('openDialog(__o)'); };

test('dialogue nommé (titre sans pictogramme), barre commune, sous-titre, corps à part', () => withDom(page, dom => {
  const box = open({k: 'essai', title: '📌 Mes essais', sub: 'PR · auteur · 3 fils', cls: 'td-modal', body: el => { el.innerHTML = '<p>Rien</p>'; }});
  assert.equal(box.getAttribute('role'), 'dialog');
  assert.equal(box.getAttribute('aria-modal'), 'true');
  assert.equal(box.getAttribute('aria-label'), 'Mes essais');
  assert.equal(box.dataset.win, 'essai');
  assert.equal(box.className, 'bp-modal td-modal');
  const kids = box.children.map(e => e.className);
  assert.deepEqual(kids, ['bp-head', 'bp-sub', 'bp-body'], 'la barre et le sous-titre restent hors du corps qui défile');
  assert.match(box.querySelector('.bp-head').textContent, /📌 Mes essais\s*Échap pour fermer\s*×/);
  assert.equal(box.querySelector('.bp-sub').textContent, 'PR · auteur · 3 fils');
  assert.equal(box.querySelector('.bp-x').getAttribute('aria-label'), 'Fermer');
  assert.equal(open({title: 'Sans sous-titre', label: 'Nom donné'}).querySelector('.bp-sub'), null);
  assert.equal(dom.doc.querySelector('.bp-modal').getAttribute('aria-label'), 'Nom donné');
  open({title: 'Large', wide: true});
  assert.equal(dom.doc.querySelector('.bp-modal').className, 'bp-modal bp-wide');
  run('closeDialog()');
}));

test('page inerte ; Tab et Maj+Tab bouclent ; Échap ferme, rend le focus et prévient (onClose)', () => withDom(page, dom => {
  dom.btn.focus();
  page.ctx.__closed = 0;
  const box = open({title: 'Essai', onClose: () => { page.ctx.__closed++; }, body: el => { el.innerHTML = '<input class="a"><select class="b"></select><button type="button" class="c" disabled>c</button><a class="d" href="#">d</a>'; }});
  const x = box.querySelector('.bp-x'), a = box.querySelector('.a'), d = box.querySelector('.d');
  assert.equal(dom.wrap.inert, true, 'le plan et le reste de la page sont inertes');
  assert.equal(dom.side.inert, true, 'le panneau aussi');
  assert.equal(dom.doc.querySelector('.bp-backdrop').inert, false, 'le fond reste cliquable');
  assert.equal(dom.doc.activeElement, a, 'focus sur le premier élément du contenu');
  dom.doc.activeElement = d;
  assert.equal(key('Tab'), 1);
  assert.equal(dom.doc.activeElement, x, 'Tab sur le dernier : retour à × (premier de la fenêtre)');
  assert.equal(key('Tab', true), 1);
  assert.equal(dom.doc.activeElement, d, 'Maj+Tab sur × : le dernier (le bouton désactivé est sauté)');
  dom.doc.activeElement = dom.btn;
  assert.equal(key('Tab'), 1, 'focus parti hors de la fenêtre : Tab y revient');
  assert.equal(dom.doc.activeElement, x);
  dom.doc.activeElement = a;
  assert.equal(key('Tab'), 0, 'au milieu, Tab suit son cours');
  key('Escape');
  assert.equal(dom.doc.querySelector('.bp-modal'), null);
  assert.equal(dom.doc.querySelector('.bp-backdrop'), null);
  assert.equal(dom.wrap.inert, false, 'la page redevient active');
  assert.equal(dom.side.inert, false);
  assert.equal(dom.doc.activeElement, dom.btn, 'focus rendu à l\'élément d\'avant');
  assert.equal(page.ctx.__closed, 1);
  key('Escape');
  assert.equal(page.ctx.__closed, 1, 'fermée : Échap ne fait plus rien');
}));

test('un élément caché n\'est pas dans la boucle de Tab', () => withDom(page, dom => {
  const box = open({title: 'Essai', body: el => { el.innerHTML = '<button type="button" class="a">a</button><div hidden><button type="button">caché</button></div><button type="button" class="z" style="x">z</button><button type="button" class="n">n</button>'; }});
  box.querySelector('.n').style.display = 'none';
  dom.doc.activeElement = box.querySelector('.z');
  key('Tab');
  assert.equal(dom.doc.activeElement, box.querySelector('.bp-x'), 'z est le dernier élément visible');
  run('closeDialog()');
}));

test('clic sur le fond ou sur × : fermée ; ouverte depuis le plan, le focus revient au plan', () => withDom(page, dom => {
  open({title: 'Essai'});
  assert.equal(dom.doc.activeElement, dom.doc.querySelector('.bp-x'), 'rien de focalisable dans le contenu : ×');
  dom.doc.querySelector('.bp-backdrop').click();
  assert.equal(dom.doc.querySelector('.bp-modal'), null);
  assert.equal(dom.doc.activeElement, dom.cv, 'ouverte d\'un clic sur le canvas (focus sur body) : retour au plan');
  assert.equal(dom.cv.getAttribute('tabindex'), '-1', 'hors de l\'ordre de tabulation');
  dom.btn.focus();
  open({title: 'Essai'});
  dom.doc.querySelector('.bp-x').click();
  assert.equal(dom.doc.querySelector('.bp-modal'), null);
  assert.equal(dom.doc.activeElement, dom.btn);
}));

test('une seule fenêtre à la fois : la nouvelle remplace l\'ancienne et garde l\'élément d\'origine', () => withDom(page, dom => {
  dom.btn.focus();
  const seen = [];
  page.ctx.__seen = seen;
  open({k: 'a', title: 'A', onClose: () => seen.push('a')});
  open({k: 'b', title: 'B', focus: '.f', body: el => { el.innerHTML = '<button type="button">1</button><input class="f">'; }});
  assert.equal(dom.doc.querySelectorAll('.bp-modal').length, 1);
  assert.equal(dom.doc.querySelectorAll('.bp-backdrop').length, 1);
  assert.deepEqual(seen, ['a'], 'la première est refermée (son onClose)');
  assert.equal(run('DLG.k'), 'b');
  assert.equal(dom.doc.activeElement, dom.doc.querySelector('.f'), 'focus : le sélecteur demandé');
  assert.equal(dom.wrap.inert, true);
  run('closeDialog()');
  assert.equal(dom.wrap.inert, false, 'rien ne reste inerte');
  assert.equal(dom.doc.activeElement, dom.btn, 'focus rendu à l\'élément d\'avant la première');
}));

test('fenêtre large : WIN_OPEN, contenu dans .bp-wbody, suit les données ; volet du Kanban fermé avant la fenêtre', () => withDom(page, dom => {
  page.ctx.__n = 0;
  run("openWide('essai','Essai large',b=>{__n++;b.innerHTML='<button type=\"button\" class=\"w\">w</button>';},{cls:'sr-win'})");
  const box = dom.doc.querySelector('.bp-modal');
  assert.equal(box.className, 'bp-modal bp-wide sr-win');
  assert.equal(run('WIN_OPEN'), 'essai');
  assert.ok(box.querySelector('.bp-body>.bp-wbody>.w'));
  assert.equal(dom.doc.activeElement, box.querySelector('.w'), 'focus sur le premier élément, plus sur ×');
  run('wideRefresh()');
  assert.equal(page.ctx.__n, 2);
  run('closeDialog()');
  assert.equal(run('WIN_OPEN'), null);
  run("KB_VOL=null;openWide('kanban','Mur Kanban',b=>{});KB_VOL={t:'ticket',k:'DM-1'};");
  key('Escape');
  assert.equal(run('KB_VOL'), null, 'Échap ferme d\'abord le volet');
  assert.ok(dom.doc.querySelector('.bp-modal'));
  key('Escape');
  assert.equal(dom.doc.querySelector('.bp-modal'), null);
}));

test('carte Kronn ouverte au-dessus (KM_OPEN) : Échap et Tab sont les siens, la fenêtre dessous ne bouge pas', () => withDom(page, dom => {
  open({title: 'Essai'});
  run('KM_OPEN={};');
  try {
    key('Escape');
    assert.ok(dom.doc.querySelector('.bp-modal'));
  } finally { run('KM_OPEN=null;closeDialog();'); }
}));

test('le corps défile seul : la barre de défilement ne pousse plus × (CSS)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'page', 'src', 'styles.css'), 'utf8');
  const px = fs.readFileSync(path.join(__dirname, '..', 'page', 'src', 'pixel.css'), 'utf8');
  assert.match(css, /\.bp-modal\{[^}]*overflow:hidden;display:flex;flex-direction:column/);
  assert.match(css, /\.bp-body\{flex:1 1 auto;min-height:0;overflow:auto\}/);
  assert.match(px, /\.kmodal\{border:0!important;margin:var\(--px\)!important/, 'la carte Kronn à la même place que les fenêtres');
  for (const sel of ['.rt-kb{', '.rt-kbw', '.rt-kbh', '.rt-x']) assert.ok(!css.includes(sel), sel + ' : plus de fenêtre à part au 3e');
});

test('un seul gabarit : aucune autre fenêtre ne pose role=dialog elle-même', () => {
  const dir = path.join(__dirname, '..', 'page', 'src');
  const own = fs.readdirSync(dir).filter(f => f.endsWith('.js') && /setAttribute\('role','dialog'\)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(own.sort(), ['47-fenetre.js', '55-actions.js']);
});
