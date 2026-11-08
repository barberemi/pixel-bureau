// Ce qui t'attend, tous étages (69-attente.js) : la tuile « À toi » des chiffres du haut, la liste des décisions de tous les
// étages, la plus ancienne d'abord, et « Ouvrir » qui mène à l'étage, la décision ouverte.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; CFG.atelier = true; ATELIER = atelierDemo(); SUPPORT = supportDemo(); REDACTION = redactionDemo(); T = DAY0 + 11 * 36e5; setMode('pause');`);
  return {p, J};
}

test('la démo : quatre décisions sur trois étages, la plus ancienne d\'abord, avec leur âge', () => {
  const {J} = page();
  const L = J('waitList().map(x => [x.fl, x.a, waitAge(x.t)])');
  assert.deepEqual(L.map(x => x[0]), [1, -1, 3, 3]);
  assert.deepEqual(L[0], [1, 'DM-7305', '1 h 48']);
  const h = J('toiKpiHtml(waitList(), 2)');
  assert.match(h, /<h3>À toi<\/h3><div class="row"><div class="big">4<\/div><div class="grow">décisions<br>la plus ancienne 1 h 48/);
  assert.equal((h.match(/<li>/g) || []).length, 3, 'trois lignes au plus : le bandeau ne grandit pas');
  assert.equal((h.match(/<li>✋/g) || []).length, 2, 'les deux plus anciennes');
  assert.match(h, /<li>et 2 de plus · 🧯 <b>2 agents<\/b> en panne<\/li>/);
  assert.match(h, /data-open="attente"[^>]*aria-controls="waitlist"/, 'un clic déroule la liste');
  const rows = J('waitRowsHtml(waitList())');
  assert.equal((rows.match(/data-wl=/g) || []).length, 4);
  assert.match(rows, /class="wl-r old"><span class="wl-fl">🏭 1er<\/span>/, 'la plus ancienne en tête, marquée');
});

test('le tampon du 2e compte une fois, sa gate Kronn n\'est pas recomptée au RDC ; une gate sans personnage est au RDC', () => {
  const {p, J} = page();
  p.run(`REDACTION.tables[0].tickets.forEach(x => { x.etat = 'gate'; });
    GATES = [{run: 'g-ticket', wf_name: 'Le Bureau · un ticket', since: new Date(DAY0 + 9 * 36e5).toISOString()},
             {run: 'g-plan', wf_name: 'Le Bureau · plan', since: new Date(DAY0 + 10 * 36e5).toISOString()}];`);
  const L = J('waitList().map(x => [x.fl, x.a])');
  assert.equal(L.filter(x => x[0] === 2).length, 1);
  assert.deepEqual(L.filter(x => x[0] === 0), [[0, 'Le Bureau · plan']]);
});

test('« Ouvrir » mène à l\'étage, la décision ouverte dans le panneau', () => {
  const {p, J} = page();
  const at = fl => `waitList().find(x => x.fl === ${fl})`;
  p.run(`${at(3)}.go();`);
  assert.deepEqual(J('[FLOOR, RTSEL]'), [3, J(`${at(3)}.run`)]);
  p.run(`${at(1)}.go();`);
  assert.deepEqual(J('[FLOOR, ATSEL]'), [1, 'demo-a1']);
  p.run(`${at(-1)}.go();`);
  assert.deepEqual(J('[FLOOR, CS_SEL]'), [-1, 'd3']);
});

test('sans décision ni panne, pas de tuile ; la liste est vide hors des étages installés', () => {
  const {p, J} = page();
  p.run(`ATELIER = {rooms: [], queue: [], pannes: []}; RETOURS = {rooms: [], queue: [], pannes: [], events: []}; SUPPORT = {threads: []}; REDACTION = {tables: [], events: []};`);
  assert.deepEqual(J('waitList()'), []);
  assert.equal(J('toiKpiHtml([], 0)'), '');
  assert.match(J('toiKpiHtml([], 1)'), /class="dash toi click err"/, 'seulement une panne : la tuile, en rouge');
});
