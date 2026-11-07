// « Comment lire le plan » à l'étage affiché (46-legende.js) : la légende et les onglets de chaque étage, les postes tirés
// de la liste que le dessin de l'étage utilise (un poste ajouté y paraît avec sa phrase), le RDC tiré du gabarit.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./helpers/page.js');

const page = load();
const J = c => JSON.parse(page.run('JSON.stringify(' + c + ')'));
const FLOORS = {1: 'AT_POSTES', 2: 'RD_POSTES', 3: 'RT_POSTES', '-1': 'CS_POSTES'};

test('chaque poste de chaque étage a sa phrase, et chaque étape d\'une revue', () => {
  for (const list of Object.values(FLOORS))
    for (const p of J(list)) assert.ok(p.d && p.d.length > 8, `${list} ${p.k}`);
  for (const [k, s] of Object.entries(J('RV_STEP'))) assert.ok(s[2] && s[2].length > 8, `RV_STEP ${k}`);
});

test("l'onglet Postes d'un étage se tire de sa liste : un poste ajouté y paraît", () => {
  for (const [f, list] of Object.entries(FLOORS)) {
    const html = J(`legPane(${f}, 'postes')`);
    for (const p of J(list)) assert.ok(html.includes(p.n) && html.includes(p.d.replace(/'/g, '&#39;')), `${f} : ${p.n}`);
  }
  assert.match(J("legPane(2, 'postes')"), /<h5>Rédaction<\/h5>.*<h5>Revue d&#39;une PR<\/h5>.*🔍 lecture<\/b> : lit le diff/s, 'au 2e, la rédaction puis les étapes d\'une revue');
  page.run("AT_POSTES.push({k: 'essai', i: '🧫', n: 'Essai', d: 'un poste ajouté pour le test'});");
  assert.match(J("legPane(1, 'postes')"), /🧫 Essai<\/b> : un poste ajouté pour le test/);
  page.run('AT_POSTES.pop();');
});

test('chaque étage a sa légende et ses onglets, sans rien du RDC', () => {
  assert.deepEqual(J('LEG_FLOOR_TABS.map(t => t[0])'), ['qui', 'ou', 'postes', 'moments', 'scenes']);
  for (const f of Object.keys(FLOORS)) {
    const bar = J(`floorHelp(${f}).bar()`);
    assert.ok(bar.length > 40, `${f} : la ligne de légende`);
    for (const t of ['qui', 'ou', 'moments']) {
      const html = J(`legPane(${f}, '${t}')`);
      assert.ok(html.length > 60, `${f} ${t}`);
      for (const rdc of ['Toilettes', 'Plateau TV', 'Enveloppes', 'Hologrammes']) assert.ok(!html.includes(rdc) && !bar.includes(rdc), `${f} ${t} : ${rdc}`);
    }
  }
  assert.equal(J("legPane(0, 'qui')"), null, 'au RDC, les blocs du gabarit');
});

test('au RDC : un bloc du gabarit par onglet, dans l\'ordre des onglets, puis les scènes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'office_template.html'), 'utf8');
  const tabs = [...html.matchAll(/<div data-tab="(\w+)"><h4>/g)].map(m => m[1]);
  assert.deepEqual(tabs, J('LEG_RDC_TABS.map(t => t[0])').slice(0, -1));
  assert.equal(J('LEG_RDC_TABS.at(-1)[0]'), 'scenes');
});

test('les couleurs de la légende : une pastille par libellé, en ordre', () => {
  assert.equal(J("legSwatches({a: ['#111', 'un'], b: ['#222', 'deux'], c: ['#333', 'un']})"),
    '<span class="lk"><i class="sq" style="background:#111"></i>un</span><span class="lk"><i class="sq" style="background:#222"></i>deux</span>');
  assert.match(J('floorHelp(1).bar()'), /validé.*en cours.*bloquant.*avis.*t&#39;attend.*sauté.*en panne/s, 'au 1er, AT_ST');
});

test('les anneaux de la légende ne prennent pas le style des cartes KPI (.dash)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'office_template.html'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'page', 'src', '68-caserne.js'), 'utf8');
  assert.doesNotMatch(html, /class="ring (dash|dot)"/);
  assert.match(html, /class="ring ring-dash"/);
});
