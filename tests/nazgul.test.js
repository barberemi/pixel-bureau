// Le Nazgûl, messager de l'Œil (69-nazgul.js) : le rapport du matin avant le daily (ce qui est arrivé depuis la veille à
// 18 h), puis chaque nouveauté du jour pour toi ; ni brouillon, ni sans la tour ; sa scène dans la galerie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const iso = h => J(`new Date(DAY0 + ${h} * 36e5).toISOString()`);
const setup = () => run(`OEIR = {x: 1160, y: 412}; RHYTHM.daily = '09:40'; OEIL = {generated_at: '${iso(15)}', me: 'moi', warnings: [],
  mine: [{id: 'a/site#1', repo: 'a/site', n: 1, title: 'Un', draft: false, review: 'changes', threads: 1, ci: null, conflict: false, updated: '${iso(-3)}',
      last: {who: 'jimh', at: '${iso(-3)}', text: 'x', k: 'changes'}},
    {id: 'a/site#2', repo: 'a/site', n: 2, title: 'Deux', draft: false, review: 'review', threads: 2, ci: null, conflict: false, updated: '${iso(14)}',
      last: {who: 'pam', at: '${iso(14)}', text: 'y', k: 'fil'}},
    {id: 'a/site#3', repo: 'a/site', n: 3, title: 'Brouillon', draft: true, review: 'changes', threads: 4, ci: null, conflict: false, updated: '${iso(11)}',
      last: {who: 'pam', at: '${iso(11)}', text: 'z', k: 'fil'}}],
  asked: [{id: 'b/api#7', repo: 'b/api', n: 7, title: 'Sept', author: 'dwight', since: '${iso(8)}', draft: false, ci: null, conflict: false}]};`);

test('rapport du matin : 10 min avant le daily, ce qui est arrivé depuis la veille à 18 h ; rien sans nouveauté', () => {
  setup();
  const r = J(`nazReport(${J('DAY0')} + 12 * 36e5)`);
  assert.equal(r.at, J(`DAY0 + (9 * 60 + 30) * 60e3`));
  assert.deepEqual(r.news.map(x => x.k.slice(0, 10)), ['f:a/site#1', 'a:b/api#7']); // la veille à 21 h, ce matin à 8 h
  run(`OEIL = {...OEIL, mine: [], asked: []}`);
  assert.equal(J(`nazReport(DAY0 + 12 * 36e5)`), null);
});

test('livraisons du jour : le rapport, puis chaque nouveauté arrivée après ; pas de brouillon ; rien sans la tour', () => {
  setup();
  const d = J(`nazDeliveries(DAY0 + 12 * 36e5).map(x => [x.id.split(':').slice(0, 2).join(':'), x.txt])`);
  assert.deepEqual(d.map(x => x[0]), ['naz:rapport', 'naz:f']);
  assert.match(d[0][1], /Le rapport de l'Œil : 2 nouveautés depuis hier soir/);
  assert.match(d[1][1], /site#2 : un fil · pam/);
  assert.ok(!d.some(x => /#3/.test(x[1])), 'un brouillon ne fait pas venir le Nazgûl');
  run(`OEIR = null`);
  assert.deepEqual(J(`nazDeliveries(DAY0 + 12 * 36e5)`), []);
});

test('galerie : « Le Nazgûl messager » parmi les petits moments, avec la tour', () => {
  setup();
  assert.ok(J(`galleryScenes().some(x => x.fam === 'Petits moments' && x.n === 'Le Nazgûl messager')`));
  run(`OEIR = null`);
  assert.ok(!J(`galleryScenes().some(x => x.n === 'Le Nazgûl messager')`));
});

test('la figure : la planche générée (nazgul_vol), battement d\'ailes ou plané, le parchemin sous les griffes, en miroir vers la gauche', () => {
  assert.ok(J(`!!SPR.nazgul_vol && SPR.nazgul_vol.startsWith('data:image/png;base64,')`), 'la planche est embarquée');
  const draw = code => J(`(() => { const out = [], keep = ctx, keepImg = IMG.nazgul_vol;
    ctx = {save() {}, restore() {}, translate(x, y) { out.push(['t', x, y]); }, scale(x) { out.push(['s', x]); },
      drawImage(im, sx) { out.push(['i', sx / im.height]); }};
    IMG.nazgul_vol = {complete: true, height: 83};
    try { ${code}; } finally { ctx = keep; IMG.nazgul_vol = keepImg; } return out; })()`);
  assert.deepEqual(draw(`nazFigure(100, 50, 1, 0, false)`), [['t', 100, 50], ['s', 1], ['i', 1]]); // ailes hautes
  assert.deepEqual(draw(`nazFigure(100, 50, -1, null, true)`), [['t', 100, 50], ['s', -1], ['i', 5], ['i', 0]]); // plané, le parchemin d'abord
  assert.deepEqual(draw(`for (let k = 0; k < 6; k++) nazFigure(0, 0, 1, k / 6, false)`).filter(x => x[0] === 'i').map(x => x[1]), [1, 2, 3, 4, 3, 2]);
  assert.deepEqual(J(`(() => { const keepImg = IMG.nazgul_vol; IMG.nazgul_vol = {complete: false}; const keep = ctx; let n = 0;
    ctx = {save() { n++; }}; try { nazFigure(0, 0, 1, 0, true); } finally { ctx = keep; IMG.nazgul_vol = keepImg; } return n; })()`), 0); // pas chargée : rien
});
