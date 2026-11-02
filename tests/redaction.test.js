// 2e étage, la rédaction des tickets et la revue des PR (68-redaction.js) : l'onglet, la table et le fil rouge de
// l'intention (un brin par ticket), le boss au tampon, la revue (l'auteur de la PR en face du relecteur, un remplaçant pour
// la PR du boss, les étapes lues du run), le panneau, le fil du RDC, ⌘K, la loupe, la galerie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

function page() {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run(`GATES = []; T = DAY0 + 11 * 36e5; setMode('live'); REDACTION = redactionDemo(); rdReset();`);
  return {p, J};
}

test("l'étage existe en démo ; ses onglets dans l'ordre des étages", () => {
  const {p, J} = page();
  assert.equal(J('redactionOn()'), true);
  assert.deepEqual(J('floorsOn()'), [3, 2, 1, 0, -1]);
  assert.deepEqual(J("[...floorTabsHtml().matchAll(/data-floor=\"(-?\\d)\"/g)].map(m => +m[1])"), [-1, 0, 1, 2, 3]);
  p.run('setFloor(2);');
  assert.equal(J('FLOOR'), 2);
});

test("la table : l'intention la plus ancienne, un clic sur le liège passe à la suivante ; le boss tamponne un ticket à la fois", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  assert.equal(J('rdTable().run'), 'demo-t1');
  assert.equal(J('RD_HITS.filter(h => h.kind === "ticket").length'), 3, 'un brin et une carte par ticket');
  p.run(`RDSEL = null; redactionClick({clientX: 0, clientY: 0}); RDSEL = rdTables()[1].run;`);
  assert.equal(J('rdTable().run'), 'demo-t2');
  p.run(`RDSEL = null; REDACTION.tables[0].poste = 'valider'; REDACTION.tables[0].tickets.forEach((x, k) => { x.etat = k === 1 ? 'gate' : 'wait'; }); renderRedaction(1100);`);
  assert.ok(J('RD_HITS.some(h => h.kind === "boss")'));
  assert.match(J('floorTabsHtml()'), /2e · rédaction <b>5<\/b> <b>✋ 1<\/b>/, 'deux intentions et trois revues, un tampon');
  p.run('T = DAY0 + 22.5 * 36e5; renderRedaction(1200);');
  assert.ok(J('RD_LIT.length') > 0, 'le soir : ceux au travail et le boss gardent leur lumière');
});

test("la revue : l'auteur de la PR en face du relecteur, un remplaçant pour la PR du boss, les étapes lues du run", () => {
  const {p, J} = page();
  assert.equal(J('rvActive().length'), 3);
  assert.equal(J("rvActive().find(r => r.run === 'demo-r3').steps.map(s => rvStepName(s.n)).join(' ')"), '📥 fils 🔒 sécu 🧠 lecture ✍ avis');
  p.run('setFloor(2); renderRedaction(1000);');
  const html = J('redactionListHtml()');
  assert.match(html, /Rédaction <span class="cnt">2/);
  assert.match(html, /T2 · Pistes audio dans le menu du lecteur · front_euronews · 2 pts/);
  assert.match(html, /Revue des PR <span class="cnt">3/);
  assert.match(J('tvRedactionHtml()'), /Rédaction[\s\S]*Revue des PR · 3/);
});

test("depuis le RDC : le fil et ⌘K ; la loupe du tampon ; la galerie rend le relevé tel quel", () => {
  const {p, J} = page();
  const feed = J('rdFeedEvents(DAY0 + 23 * 36e5).map(e => e.txt)').join('\n');
  assert.match(feed, /Une intention arrive à la rédaction/);
  assert.match(feed, /Un ticket créé dans Jira/);
  assert.ok(J('rdFeedEvents(DAY0 + 23 * 36e5).every(e => e.rd && e.fl === 2)'));
  assert.equal(J("rdSearchRows('lecteur').length"), 1);
  p.run(`rdGoto('demo-t2');`);
  assert.deepEqual(J('[FLOOR, RDSEL]'), [2, 'demo-t2']);
  p.run(`REDACTION.tables[0].poste = 'valider'; REDACTION.tables[0].tickets[0].etat = 'gate'; RDSEL = null;`);
  assert.ok(J("rdLoupeEvents().some(e => e.kind === 'rd_gate')"));
  assert.deepEqual(J('[...new Set(galleryScenes().map(x => x.fam))]'), ['2e étage']);
  p.run(`var __R = REDACTION; demoStart(galleryScenes().find(x => x.n === 'Le tampon')); demoEnd();`);
  assert.equal(p.run('REDACTION === __R'), true);
});
