// Lisibilité des étages : le plan prend la largeur de l'écran (sans dépasser sa hauteur), aucun texte sous 9 px affichés à
// 1440 px (hors décor), un poste au repos ou fini ne montre que son icône (68-atelier.js, 68-caserne.js, 68-retours.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./helpers/page.js');

const SRC = path.join(__dirname, '..', 'page', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

test('la page est large et le plan tient dans la hauteur de l\'écran (hors mode TV)', () => {
  const css = read('styles.css');
  assert.doesNotMatch(css, /\.wrap\{max-width:1360px/, 'plus de plafond à 1360 px');
  assert.match(css, /body:not\(\.tv\) \.cv-wrap>#cv\{width:min\(100%,calc\(\(100vh - 150px\) \* var\(--plan-ratio,2\)\)\);margin:0 auto\}/);
});

// règle en px affichés (audit UX 2.3) : taille × échelle du plan à 1440 × 900 ≥ 9 px. Échelles relevées dans Chrome (RDC, panneau
// ouvert : ×0,78 ; étages, panneau replié : ×0,868) et gardées par smoke.py --chrome ; d'où 12 px au RDC et 11 px aux étages
const LISI = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lisibilite.json'), 'utf8'));
const MIN = k => Math.ceil(LISI.affiche_min / LISI.echelles[k] - 1e-9);
const RE = /\b(\d+)px (?:ui-monospace|system-ui|ui-sans-serif|sans-serif|monospace)/g;
// décor : textes dessinés dans un petit objet, dont l'info est ailleurs (tuiles, fiche, fenêtre) ; repérés par la fonction ou le
// meuble qui les dessine
const DECOR = {
  drawPassion: 'le score et les « SWISH! » « POW! » des passions', rolePile: 'le nombre de documents d\'une pile',
  boss_desk: 'la plaque du boss', atBossDesk: 'la plaque du boss (étages)', toilets: 'le rouleau des toilettes',
  stage_closure: 'le panneau « FERMÉ » du plateau (l\'écran TV le dit en 12 px)', PAY_ENVELOPE: 'le « $ » de l\'enveloppe de paie',
  KANBAN_WALL: 'les nombres du mur Kanban', drawNote: 'les post-it des crons', drawLight: 'le panneau Sortie', exitSign: 'le panneau Sortie (étages)',
  fxDrawDuck: 'le « POUF » du canard', tombs: 'les tombes d\'Halloween', supportScreen: 'l\'écran Support du boss',
  DEPARTS_BOARD: 'le tableau des départs (la fenêtre donne tout)', atChantier: 'le casque', rvfDraw: 'les dossiers du casier',
};
const scopeOf = (L, i) => {
  for (let j = i; j >= 0; j--) {
    const m = /^(?:function (\w+)|(?:const|let) (\w+)\s*=|\{const F=furnType\('(\w+)'|\{const (\w+)=)/.exec(L[j]);
    if (m) return m[1] || m[2] || m[3] || m[4];
  }
  return null;
};
function tooSmall(files, min) {
  const bad = [];
  for (const f of files) read(f).split('\n').forEach((l, i, L) => {
    for (const m of l.matchAll(RE)) if (+m[1] < min && !(scopeOf(L, i) in DECOR)) bad.push(`${f}:${i + 1} : ${m[0]} (${scopeOf(L, i)})`);
  });
  return bad;
}
const SRCS = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));

test('les minimums suivent la règle en px affichés : 12 px au RDC, 11 px aux étages', () => {
  assert.equal(MIN('rdc'), 12);
  assert.equal(MIN('etages'), 11);
});

test('au RDC, aucun texte du plan sous 12 px, sauf le décor', () => {
  const files = SRCS.filter(f => /^(3[89]|4\d|62)-/.test(f));
  assert.ok(files.includes('40-floor.js') && files.includes('48-mail.js'));
  assert.deepEqual(tooSmall(files, MIN('rdc')), []);
});

test('aux étages, aucun texte sous 11 px, sauf le décor', () => {
  const files = SRCS.filter(f => /^68-/.test(f));
  assert.ok(files.length >= 5);
  assert.deepEqual(tooSmall(files, MIN('etages')), []);
});

test('le décor exempté existe encore (une entrée périmée de DECOR ne cache rien)', () => {
  const all = SRCS.map(f => read(f)).join('\n');
  for (const k of Object.keys(DECOR)) assert.match(all, new RegExp(`(?:function ${k}\\b|(?:const|let) ${k}\\s*=|furnType\\('${k}'|\\{const ${k}=)`), k);
});

test('l\'écran TV et l\'affiche de l\'employé du sprint grandissent jusqu\'à leurs textes en 12 px, autour de leur centre', () => {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  assert.deepEqual(J('atLeast({x:902,y:35,w:116,h:28},TV_MIN)'), {x: 890, y: 31, w: 140, h: 36});
  assert.deepEqual(J('atLeast({x:260,y:354,w:62,h:28},EMP_MIN)'), {x: 247, y: 353, w: 88, h: 30});
  assert.deepEqual(J('atLeast({x:10,y:10,w:200,h:50},TV_MIN)'), {x: 10, y: 10, w: 200, h: 50});
});

test('1er : une étiquette rentre dans l\'étage au bord du plan ; le titre d\'un bureau du haut ne passe pas sous l\'orchestrateur', () => {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run("ctx.measureText = t => ({width: t.length * 8}); var __R = []; ctx.fillRect = (x, y, w) => { __R.push([x, w]); };");
  p.run("atPill('🧯 Perf·a11y en panne : le pompier arrive', AT_W - 20, 400, '#a8323a'); atPill('x', 3, 400, '#000');");
  const [[x1, w1], [x2]] = J('__R');
  assert.ok(x1 + w1 <= J('AT_W') - 2 && x2 >= 2, JSON.stringify(J('__R')));
  const head = i => J(`atHead(AT_G[${i}], AT_G[${i}].L ? (AT_G[${i}].x0 + .5) * AT_TS : (AT_G[${i}].x1 - .5) * AT_TS, ['BUREAU ${i + 1}', 'DM-7911', 'site', 'tour 1/3', '64 k jetons'])`);
  assert.equal(head(1), 'BUREAU 2 · DM-7911 · site · tour 1/3'); // en haut à droite : les jetons sont sur le tableau
  assert.equal(head(3), 'BUREAU 4 · DM-7911 · site · tour 1/3 · 64 k jetons'); // en bas : la place ne manque pas
});

test('un poste au repos, fini ou sauté ne montre que son icône ; actif, en panne ou à ta décision, son nom aussi', () => {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  assert.equal(J("atPosteLbl({i: '🛠', n: 'Correction'}, false)"), '🛠');
  assert.equal(J("atPosteLbl({i: '🛠', n: 'Correction'}, true)"), '🛠 Correction');
  // 3e et -1 : le nom sur run, err et gate seulement
  p.run('var __L = []; const _ap = atPill; atPill = s => { __L.push(s); };');
  p.run("rtPill({i: '🧪', n: 'Contrôles'}, 'ok', 0, 0); rtPill({i: '🧪', n: 'Contrôles'}, 'run', 0, 0); csPostePill({i: '🔎', n: 'Logs'}, '', 0, 0); csPostePill({i: '🔎', n: 'Logs'}, 'gate', 0, 0);");
  assert.deepEqual(J('__L'), ['🧪', '🧪 Contrôles', '🔎', '🔎 Logs']);
  p.run('atPill = _ap;');
  // 2e, salle de revue : les étapes d'une revue suivent la même règle
  assert.equal(J("rvStepLbl({n: 'lecture', s: 'Success'})"), '🔍');
  assert.equal(J("rvStepLbl({n: 'lecture', s: 'Running'})"), '🔍 lecture');
  assert.equal(J("rvStepLbl({n: 'securite', s: 'Failed'})"), '🔒 sécu');
});
