// Lisibilité des étages : le plan prend la largeur de l'écran (sans dépasser sa hauteur), aucun texte des étages sous 10 px
// (hors décor), un poste au repos ou fini ne montre que son icône (68-atelier.js, 68-caserne.js, 68-retours.js).
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

test('aux étages, aucun texte sous 10 px, sauf le décor (le casque, la plaque du boss, les dossiers du casier)', () => {
  const DECOR = ["'CASQUE'", "WORLD'S BEST BOSS", 'rvfFolder(']; // le casque, la plaque du boss, l'étiquette d'un dossier du casier (2e)
  for (const f of ['68-atelier.js', '68-caserne.js', '68-redaction.js', '68-retours.js', '68-revue.js']) {
    read(f).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/\b(\d+)px (?:ui-monospace|system-ui|ui-sans-serif|sans-serif)/g))
        if (+m[1] < 10) assert.ok(DECOR.some(d => l.includes(d)), `${f}:${i + 1} : ${m[0]}`);
    });
  }
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
