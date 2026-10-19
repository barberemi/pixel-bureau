// Palettes des états des personnages (35-state.js) : une seule table, ST_PALETTE, d'où sortent ST_COLOR (canvas, hex) et
// ST_CSS (HTML, var(--jeton) quand un jeton du thème la porte) ; légende du gabarit peinte depuis ces tables ; le violet
// « test / mise en prod » n'existe qu'une fois (MEP_COLOR, lu par le CSS en var(--mep)). Issue #10.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'page', 'src');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const page = load();
const t = JSON.parse(page.run('JSON.stringify({pal: ST_PALETTE, tok: ST_TOKEN, color: ST_COLOR, css: ST_CSS, tcat: TCAT, mep: MEP_COLOR})'));
const jsFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const HEX = /^#[0-9a-f]{6}$/;

test('chaque état a une couleur : réelle pour le canvas, var(--jeton) ou la même couleur pour le HTML', () => {
  for (const [k, v] of Object.entries(t.pal)) {
    if (v === 'transparent') { // absent, parti : pas d'anneau sur le plan, pastille vide
      assert.equal(t.color[k], undefined, k);
      assert.equal(t.css[k], 'transparent', k);
      continue;
    }
    assert.match(t.color[k], HEX, k);
    if (v in t.tok) assert.equal(t.css[k], `var(--${v})`, k);
    else assert.equal(t.css[k], t.color[k], k);
  }
  assert.deepEqual(Object.keys(t.css), Object.keys(t.pal));
});

test('les deux vues concordent : un même jeton donne la même couleur sur le canvas', () => {
  const byVar = {};
  for (const [k, css] of Object.entries(t.css)) {
    const m = css.match(/^var\(--(\w+)\)$/);
    if (!m) continue;
    (byVar[m[1]] = byVar[m[1]] || new Set()).add(t.color[k]);
  }
  for (const [tok, cols] of Object.entries(byVar)) assert.deepEqual([...cols], [t.tok[tok]], tok);
  // chaque jeton existe bien dans le thème de base (styles.css), que les thèmes et les packs redéfinissent
  const root = read('page', 'src', 'styles.css').match(/:root\{([^}]*)\}/)[1];
  for (const tok of Object.keys(t.tok)) assert.match(root, new RegExp(`--${tok}:#`), tok);
});

test('chaque état posé par la page a sa couleur, sauf ceux qui gardent volontairement la couleur par défaut', () => {
  // sans anneau sur le plan, pastille var(--idle) en HTML : leur donner une couleur changerait le rendu
  const sansCouleur = new Set(['duck', 'hatch', 'off', 'passion', 'proud', 'trophy', 'ufo']); // duck, hatch, trophy, ufo : pseudo-personnages de la loupe
  const states = new Set(jsFiles.flatMap(f => [...fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(/\bst:'([a-z]+)'/g)].map(m => m[1])));
  for (const st of states) assert.ok(st in t.css || sansCouleur.has(st), `état sans couleur : ${st}`);
  for (const st of sansCouleur) assert.ok(!(st in t.css), `${st} a maintenant une couleur : le retirer de la liste`);
});

test('#7a5cc8 : une seule copie (MEP_COLOR), lue par le CSS en var(--mep)', () => {
  assert.equal(t.mep, '#7a5cc8');
  assert.equal(t.tcat.test.c, t.mep);
  assert.equal(t.color.mep, t.mep);
  assert.equal(t.color.deliver, t.mep);
  const hits = jsFiles.flatMap(f => (fs.readFileSync(path.join(SRC, f), 'utf8').match(/#7a5cc8/gi) || []).map(() => f));
  assert.deepEqual(hits, ['30-data.js']);
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.css'))) assert.doesNotMatch(read('page', 'src', f), /#7a5cc8/i, f);
  assert.doesNotMatch(read('page', 'office_template.html'), /#7a5cc8/i);
  assert.match(read('page', 'src', '30-data.js'), /setProperty\('--mep',MEP_COLOR\)/);
  assert.match(read('page', 'src', 'styles.css'), /var\(--mep\)/);
});

test('légende du gabarit : pastilles sans couleur en dur, peintes depuis les tables comme avant', () => {
  const html = read('page', 'office_template.html');
  const legend = html.slice(html.indexOf('<div class="legend">'), html.indexOf('<h4>Enveloppes'));
  assert.doesNotMatch(legend, /<i[^>]*style=/); // plus de couleur en dur
  const swatches = [...legend.matchAll(/<i( class="([^"]*)")? data-(st|cat)="(\w+)"><\/i>/g)]
    .map(([, , cls = '', kind, key]) => ({classList: {contains: c => cls.split(' ').includes(c)}, dataset: {[kind]: key}, style: {}}));
  assert.equal(swatches.length, (legend.match(/<i\b/g) || []).length);
  page.ctx.__swatches = swatches;
  page.run('paintLegend({querySelectorAll: () => __swatches})');
  // les couleurs que le gabarit portait en dur avant #10
  const before = [
    ['background', 'var(--ok)'], ['background', 'var(--info)'], ['borderColor', 'var(--warn)'], ['borderColor', 'var(--err)'], ['background', 'var(--idle)'],
    ['background', '#2e9e5b'], ['background', '#4a7fe0'], ['background', '#7a5cc8'], ['background', '#2e9e9b'], ['background', '#8a8478'],
    ['background', 'var(--ok)'], ['background', 'var(--info)'], ['borderColor', 'var(--warn)'], ['borderColor', 'var(--err)'],
    ['background', '#7a5cc8'], ['background', '#2e9e9b'], ['borderColor', '#d97757'], ['background', '#7d8fa3'], ['background', 'var(--idle)'],
  ];
  assert.deepEqual(swatches.map(s => Object.entries(s.style)[0]), before);
});
