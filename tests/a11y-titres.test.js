// Accessibilité (#12, #13) : les titres repliables restent des titres (un bouton dedans porte aria-expanded), la légende
// n'a plus de h4 sans h3, la page a une zone <main> et des liens d'évitement vers le plan, le fil et le panneau.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');
const {withDom} = require('./helpers/fakedom.js');

const page = load();
const run = page.run;
const src = f => fs.readFileSync(path.join(__dirname, '..', 'page', f), 'utf8');
const html = src('office_template.html');

test('titre repliable : un <h2> sans role, et dedans un bouton avec aria-expanded qui bascule', () => withDom(page, () => {
  run(`var __n=0; var __h=grpHead('grp',true,'Les agents <span class="cnt">3</span>',()=>{__n++},'grp:Les agents');`);
  const h = page.ctx.__h, b = h.querySelector('button');
  assert.equal(h.tagName, 'H2');
  assert.equal(h.getAttribute('role'), null, 'le titre reste un titre');
  assert.equal(b.className, 'grp-b');
  assert.equal(b.getAttribute('aria-expanded'), 'false');
  assert.equal(b.dataset.fid, 'grp:Les agents', 'le focus clavier survit au redessin du panneau');
  assert.match(b.textContent, /▸Les agents 3/);
  b.click();
  assert.equal(run('__n'), 1);
}));

test('plus de role="button" sur un titre (panneau, fiches, « Qui fait quoi »)', () => {
  for (const f of ['50-panel.js', '60-fiches.js', '72-whoboard.js']) {
    const s = src(path.join('src', f));
    assert.doesNotMatch(s, /<h2[^>]*role="button"/, f);
    assert.doesNotMatch(s, /h\.setAttribute\('role','button'\)/, f);
  }
  assert.match(run(`grpBtn(false,'Qui fait quoi',' data-who-toggle')`), /^<button type="button" class="grp-b" aria-expanded="true" data-who-toggle>/);
});

test('légende : des h3 sous le titre du plan, plus de h4', () => {
  assert.doesNotMatch(html, /<h4/);
  assert.equal([...html.matchAll(/<div data-tab="\w+"><h3>/g)].length, 4);
});

test('une zone <main> et des liens d\'évitement vers le plan, le fil et le panneau, en tête de page', () => {
  assert.match(html, /<main class="main">[\s\S]*<\/main>/);
  const skip = html.match(/<nav class="skip"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(skip && html.indexOf(skip[0]) < html.indexOf('<header>'), 'avant l\'en-tête : la première tabulation');
  const targets = [...skip[1].matchAll(/data-skip="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(targets, ['cv', 'feed', 'side']);
  for (const id of targets) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('lien d\'évitement : le focus va à la cible (tabindex -1 si elle n\'en a pas) ; le lien ne suit pas l\'ancre', () => withDom(page, dom => {
  let scrolled = null;
  dom.side.scrollIntoView = o => { scrolled = o; };
  run(`skipTo('side')`);
  assert.equal(dom.side.getAttribute('tabindex'), '-1');
  assert.equal(dom.doc.activeElement, dom.side);
  assert.equal(scrolled.block, 'start');
  assert.doesNotThrow(() => run(`skipTo('absent')`));
  assert.match(src('src/80-input.js'), /addEventListener\('click',e=>\{e\.preventDefault\(\);skipTo\(a\.dataset\.skip\);\}\)/,
    'pas de navigation : dans le cadre de Kronn, une ancre rechargerait la page');
}));
