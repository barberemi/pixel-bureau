// Vidéoprojecteur de la salle de réunion (47-projo.js) : en mode TV, les pages cochées « 📽 Projeter en TV » passent sur
// une toile, leur chiffre clé (kpi) sinon leur miniature ; veille dès que quelqu'un est dans la salle.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'open-space'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const PAGES = [{id: 'pa', title: 'Migration des blocks', kpi: {value: '55 %', label: 'blocks migrés', pct: 54.9, short: 'Migration blocks'}},
               {id: 'pb', title: 'Core Web Vitals', tv: true, kpi: null},
               {id: 'pc', title: 'Revue <de> PR', kpi: {value: '<b>31</b>', label: 'PR relues'}}];
const reset = () => run(`BOSS_PAGES=${JSON.stringify(PAGES)};PAGELIST=null;PAGE_TV=null;TV=false;ACTIONS.pages=true;`);

test('la salle de réunion : la pièce du plan qui contient le tableau blanc', () => {
  assert.deepEqual(J('projoRoom()'), {x: 18 * 32, y: 40, w: 9 * 32, h: 4 * 32 - 8});
});

test('pages projetées : la liste tv de pagelist, sinon le drapeau tv de bosspages ; seulement en mode TV', () => {
  reset();
  assert.deepEqual(J('projoPages().map(p=>p.id)'), ['pb']);
  assert.equal(J('projoOn()'), false, 'hors mode TV : l\'écran mural, rien de projeté');
  run("TV=true;PAGE_TV=['pa','pc'];");
  try {
    assert.deepEqual(J('projoPages().map(p=>p.id)'), ['pa', 'pc']);
    assert.equal(J('projoOn()'), true);
    run("PAGE_TV=[];");
    assert.equal(J('projoOn()'), false, 'aucune page cochée : pas de projecteur');
  } finally { run('TV=false;'); }
});

test('demande acceptée par Kronn : la projection suit tout de suite', () => {
  reset();
  run("projoSent('tv_on','pa');");
  assert.deepEqual(J('PAGE_TV'), ['pb', 'pa']);
  run("projoSent('tv_off','pb');projoSent('remove','pa');");
  assert.deepEqual(J('PAGE_TV'), ['pa']);
});

test('veille : quelqu\'un dans la salle de réunion', () => {
  reset();
  run("var KEEP=chars.map(c=>c.pos);chars.forEach(c=>{c.pos={x:40,y:600};});");
  try {
    assert.equal(J('projoBusy()'), false);
    run('chars[0].pos={x:20*32,y:3*32};');
    assert.equal(J('projoBusy()'), true);
  } finally { run('chars.forEach((c,i)=>{c.pos=KEEP[i];});'); }
});

test('fenêtre : sous chaque page, projeter ou non et ce que la toile montrera (texte échappé)', () => {
  reset();
  const a = J("projoFoot(BOSS_PAGES[0])"), b = J("projoFoot(BOSS_PAGES[1])"), c = J("projoFoot(BOSS_PAGES[2])");
  assert.match(a, /data-op="tv_on"[^>]*aria-pressed="false"/);
  assert.match(a, /📊 55 %<\/b><span>blocks migrés<\/span>/);
  assert.match(a, /Sur la toile : « Migration blocks »/);
  assert.match(b, /data-op="tv_off"/);
  assert.match(b, /⚠ pas de chiffre : projetée en miniature/);
  assert.match(c, /&lt;b&gt;31&lt;\/b&gt;/);
  assert.doesNotMatch(c, /<b>31<\/b>/);
  assert.match(J('projoInfoHtml()'), /"kpi": \{/);
});
