// Le panneau de droite est construit chaque seconde, mais posé seulement s'il a changé (#20) : ce qu'on lit garde sa place
// (le détail d'un ticket au 2e repartait en haut à chaque seconde), et quand il change vraiment, ce qui défile, ce qui est
// saisi et le focus survivent au remplacement. Faux DOM : tests/helpers/fakedom.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');
const {withDom} = require('./helpers/fakedom.js');

const page = load();
const run = page.run;
// une vue de panneau pilotée par le test : __view = HTML posé par drawSide
run(`var __view='', __draws=0; drawSide=box=>{__draws++;const d=document.createElement('div');d.innerHTML=__view;box.append(...d.childNodes);};
  EDIT=null; KM_OPEN=null; SIDE_FOLDED=false; FLOOR=0; PRESS_HOLD=0; SIDE_SIG=null;`);
const render = (view, force) => { page.ctx.__view = view; run(`renderSide(${force ? 'true' : ''})`); };
const DETAIL = '<div class="rd-det">' + 'ligne du ticket. '.repeat(40) + '</div>';

test('rien n\'a changé : le panneau n\'est pas touché, le détail lu garde sa position', () => withDom(page, dom => {
  render('<h2>T1</h2>' + DETAIL);
  const det = dom.side.querySelector('.rd-det');
  det.scrollTop = 240; dom.side.scrollTop = 90;
  const draws = run('__draws');
  render('<h2>T1</h2>' + DETAIL);
  render('<h2>T1</h2>' + DETAIL, true);
  assert.equal(run('__draws'), draws + 2, 'construit à chaque fois (à part)');
  assert.equal(dom.side.querySelector('.rd-det'), det, 'même élément : rien de recréé');
  assert.equal(det.scrollTop, 240);
  assert.equal(dom.side.scrollTop, 90);
}));

test('le panneau change : remplacé, le détail encore là retrouve sa position, le panneau aussi', () => withDom(page, dom => {
  render('<h2>T1</h2><p>en cours</p>' + DETAIL);
  dom.side.querySelector('.rd-det').scrollTop = 240; dom.side.scrollTop = 90;
  render('<h2>T1</h2><p>créé</p>' + DETAIL);
  assert.match(dom.side.textContent, /créé/);
  assert.equal(dom.side.querySelector('.rd-det').scrollTop, 240, 'même texte : même position');
  assert.equal(dom.side.scrollTop, 90);
}));

test('un autre détail (autre ticket) repart en haut', () => withDom(page, dom => {
  render('<h2>T1</h2>' + DETAIL);
  dom.side.querySelector('.rd-det').scrollTop = 240;
  render('<h2>T2</h2><div class="rd-det">' + 'autre ticket. '.repeat(40) + '</div>');
  assert.equal(dom.side.querySelector('.rd-det').scrollTop, 0);
}));

test('le panneau vidé par ailleurs est reconstruit, même sans changement', () => withDom(page, dom => {
  render('<h2>T1</h2>');
  dom.side.textContent = '';
  render('<h2>T1</h2>');
  assert.match(dom.side.textContent, /T1/);
}));

test('une construction qui change de vue en route (redessin imbriqué) n\'écrase pas le panneau qu\'elle a fait poser', () => withDom(page, dom => {
  run(`var __nested=true; var __ds=drawSide; drawSide=box=>{if(__nested){__nested=false;__view='<h2>RDC</h2>';renderSide(true);return;}__ds(box);};`);
  try {
    render('<h2>étage</h2>');
    assert.match(dom.side.textContent, /RDC/);
  } finally { run('drawSide=__ds'); }
}));

test('signature : le HTML et l\'image des toiles (un portrait qui change sans changer le HTML)', () => {
  const sig = img => run(`sideSig({innerHTML:'<canvas></canvas>',querySelectorAll:()=>[{toDataURL:()=>${JSON.stringify(img)}}]})`);
  assert.notEqual(sig('data:a'), sig('data:b'));
  assert.equal(sig('data:a'), sig('data:a'));
  assert.doesNotThrow(() => run(`sideSig({innerHTML:'',querySelectorAll:()=>[{toDataURL(){throw new Error('teintée')}}]})`));
});
