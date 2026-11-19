// étiquettes d'état (audit UX 3.7) et styles en ligne du panneau (3.9)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'page', 'src');
const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
const TAGS = ['tk-tag', 'kb-rot', 'kb-age', 'kbv-tag', 'bp-tag', 'prchip', 'sp-tag', 'at-tag'];

test('un seul gabarit d\'étiquette : taille, graisse et marge intérieure ne sont écrites qu\'une fois', () => {
  const shared = /\.tag,\.tk-tag,\.kb-rot,\.kb-age,\.kbv-tag,\.bp-tag,\.prchip,\.sp-tag,\.atelier \.at-tag\{[^}]*font:700 var\(--fs-meta\)\/16px[^}]*padding:0 6px/;
  assert.match(css, shared);
  for (const t of TAGS) {
    for (const m of css.matchAll(new RegExp(`([^{}]*\\.${t}\\b[^{}]*)\\{([^}]*)\\}`, 'g'))) {
      if (/\.tag,/.test(m[1])) continue; // le gabarit commun
      assert.doesNotMatch(m[2], /font-size|font:|padding|font-weight/, `.${t} redéfinit le gabarit : ${m[0].trim().slice(0, 120)}`);
    }
  }
});

test('le panneau ne pose plus de style en ligne sur les titres de groupe ni sur ses notes', () => {
  const js = fs.readFileSync(path.join(SRC, '50-panel.js'), 'utf8');
  assert.doesNotMatch(js, /h\.style\.marginTop|\.style\.cssText='color:var\(--muted\)/);
  const pix = fs.readFileSync(path.join(SRC, 'pixel.css'), 'utf8');
  assert.doesNotMatch(pix, /div:not\(\[class\]\)\{margin:0 0 8px!important\}/, 'le contournement du thème pixel n\'a plus lieu d\'être');
});
