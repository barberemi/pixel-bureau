// couleurs des états (audit UX 1.4) : une seule table (02-etats.js), la même que les jetons du thème Classique
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const SRC = path.join(__dirname, '..', 'page', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));

test('la table des états est celle du thème Classique : ton vif = --ok …, ton foncé = --ok-deep …', () => {
  const css = read('theme-classique.css'), tok = k => (css.match(new RegExp(`--${k}:\\s*(#[0-9a-f]{6})`)) || [])[1];
  for (const k of ['ok', 'info', 'warn', 'err', 'idle']) {
    assert.equal(J(`ST_VIF.${k}`), tok(k), k);
    assert.equal(J(`ST_FONCE.${k}`), tok(k + '-deep'), k + '-deep');
  }
  assert.deepEqual(J('ST_TOKEN'), J('ST_VIF'), 'le plan du RDC lit la même table');
});

test('les étages lisent la table : AT_ST, les icônes pixel, t\'attend', () => {
  assert.deepEqual(J('[AT_ST.ok[0], AT_ST.run[0], AT_ST.bloq[0], AT_ST.avis[0], AT_ST.wait[0]]'), J('[ST_VIF.ok, ST_VIF.info, ST_VIF.err, ST_VIF.warn, ST_VIF.warn]'));
  assert.deepEqual(J('[PIX_PAL.n, PIX_PAL.o, PIX_PAL.r, PIX_PAL.b]'), J('[ST_VIF.ok, ST_VIF.warn, ST_VIF.err, ST_VIF.info]'));
  assert.equal(J('WAIT_TXT'), J('ST_FONCE.warn'));
});

// teintes d'état retirées : elles ne reviennent pas, sauf dans le décor nommé ici (meubles, sprites, thèmes, marque d'un étage)
const RETIREES = ['#e0a020', '#d08a10', '#d08a12', '#c98a00', '#a37a10', '#9a6a10', '#b7791f', '#2e9e5b', '#3fbf6a', '#2f9e55',
  '#24784a', '#2fbf5a', '#d1453b', '#e0614f', '#c0392b', '#c62828', '#4a7fe0', '#5b8def'];
const DECOR = {
  WALL_CAL: 'le calendrier mural (bandeau rouge)', drawPassion: 'les objets des passions', WALL_DECOR: 'le tableau blanc',
  boss_desk: 'le bureau du boss (photo)', counter: 'le comptoir de la cuisine', kitchen_table: 'la table de la cuisine', PAY_ENVELOPE: 'le « $ » de l\'enveloppe de paie',
  drawApprentice: 'le pompon du mortier de l\'apprenti', CONFETTI: 'les confettis du plateau', drawScreen: 'les écrans (veille, plantage)',
  supportScreen: 'l\'écran Support du boss', CLOTH_COLORS: 'les couleurs de vêtements de l\'éditeur', ETAGES: 'la couleur d\'un étage (onglets, TV)',
  atBossDesk: 'le bureau du boss (étages)', rdShelf: 'les livres des bibliothèques', rdStrand: 'le fil rouge du liège', rdSheet: 'le tampon rouge',
};
const scopeOf = (L, i) => {
  for (let j = i; j >= 0; j--) {
    const m = /^(?:function (\w+)|(?:const|let) (\w+)\s*=|\{const F=furnType\('(\w+)'|\{const (\w+)=)/.exec(L[j]);
    if (m) return m[1] || m[2] || m[3] || m[4];
  }
  return null;
};

test('aucune teinte d\'état retirée dans page/src, hors du décor nommé', () => {
  const bad = [];
  for (const f of fs.readdirSync(SRC).filter(f => /\.(js|css)$/.test(f))) read(f).split('\n').forEach((l, i, L) => {
    for (const h of RETIREES) if (l.toLowerCase().includes(h) && !(f.endsWith('.js') && scopeOf(L, i) in DECOR)) bad.push(`${f}:${i + 1} ${h} (${scopeOf(L, i)})`);
  });
  assert.deepEqual(bad, []);
});

test('le décor exempté existe encore', () => {
  const all = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).map(read).join('\n');
  for (const k of Object.keys(DECOR)) assert.match(all, new RegExp(`(?:function ${k}\\b|(?:const|let) ${k}\\s*=|furnType\\('${k}'|\\{const ${k}=)`), k);
});
