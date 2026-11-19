// typographie (audit UX 2.1, 2.4, 2.5) : une échelle de tailles, deux familles, la police pixel à ses tailles nettes
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'page', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const css = read('styles.css') + read('pixel.css');

test('2.1 : plus de demi-pixel ni de taille hors échelle hors des cas à part nommés', () => {
  assert.doesNotMatch(css, /font(?:-size)?:(?!clamp)[^;}]*\b\d+\.\d+px/, 'pas de 10,5 / 11,5 / 12,5 px (une taille fluide clamp() du mode TV reste à part)');
  for (const t of ['meta:11', 'sec:12', 'panel:13', 'body:14', 'card:15', 'name:18', 'pix:24']) assert.match(css, new RegExp(`--fs-${t}px`));
  const left = [...css.matchAll(/font-size:(\d+)px/g)].map(m => +m[1]);
  assert.ok(left.every(n => [8, 16, 20, 30, 34].includes(n)), 'restent écrits : ' + left.join(', '));
});

test('2.5 : deux familles, en jetons dans le CSS et en constantes dans le plan', () => {
  assert.match(css, /--font-ui:/);
  assert.match(css, /--font-mono:/);
  assert.doesNotMatch(css, /font(?:-family)?:[^;}]*\b(?:system-ui,sans-serif|ui-monospace,Menlo)/, 'plus de famille écrite en dur dans le CSS');
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js'))) {
    assert.doesNotMatch(read(f), /\d+px (?:ui-monospace|system-ui|ui-sans-serif|sans-serif)/, `${f} : famille écrite en dur, utiliser FONT_UI ou FONT_MONO`);
  }
});

test('2.4 : départs, la police pixel en 16 px pour les noms seulement, le reste en monospace', () => {
  assert.match(css, /\.dep\{[^}]*font-family:var\(--font-mono\)/);
  assert.match(css, /\.dep \.dep-n\{[^}]*font:400 16px\/1\.3 'BureauPixel'/);
});
