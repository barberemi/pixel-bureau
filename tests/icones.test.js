// icônes pixel du plan (audit UX 8.2) : 46-icones.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));

test('chaque icône fait 12 × 12, dans la palette du Bureau', () => {
  const icons = J('PIX_ICONS'), pal = J('PIX_PAL');
  assert.ok(Object.keys(icons).length >= 37);
  for (const [k, rows] of Object.entries(icons)) {
    assert.equal(rows.length, 12, k);
    for (const r of rows) {
      assert.equal(r.length, 12, k);
      for (const ch of r) assert.ok(ch === '.' || ch in pal, `${k} : couleur « ${ch} » hors palette`);
    }
  }
});

test('les icônes retenues : relecture, rédaction, contexte, critique et la main (V2)', () => {
  for (const k of ['👀', '✍', '🗺', '🧐', '✋', '🧯', '📦', '🔒', '🧪']) assert.ok(J(`'${k}' in PIX_ICONS`), k);
  assert.ok(!J("'✓' in PIX_ICONS") && !J("'→' in PIX_ICONS"), '✓ et les flèches restent du texte');
});

test('la main ✋ a un pouce et quatre doigts séparés, pas une moufle', () => {
  const m = J("PIX_ICONS['✋']"), skin = c => c === 's' || c === 'S';
  assert.ok(m.slice(5, 8).some(r => [...r.slice(0, 3)].some(skin)), 'un pouce à gauche, écarté de la paume');
  assert.equal(m[3].match(/[sS]+/g).length, 4, 'quatre doigts séparés par le contour');
  const top = [4, 6, 8, 10].map(x => m.findIndex(r => skin(r[x])));
  assert.ok(new Set(top).size > 1, 'des doigts de hauteurs différentes : ' + top);
});

test('une chaîne se coupe en texte et icônes, variante d\'emoji comprise ; 12 px, ×2 dès 24 px, ×½ sous 9 px', () => {
  assert.deepEqual(J("pixParts('📦 ENTREPÔT · 2')"), [{ic: '📦', src: '📦'}, ' ENTREPÔT · 2']);
  assert.deepEqual(J("pixParts('SORTIE · ✏️ 3')"), ['SORTIE · ', {ic: '✏', src: '✏️'}, ' 3']);
  assert.equal(J("pixHas('BUREAU 1 · DM-7305')"), false);
  assert.deepEqual(J('[pixSize(6), pixSize(12), pixSize(14), pixSize(24)]'), [6, 12, 12, 24]);
});
