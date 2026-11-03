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

test("la table : l'intention la plus ancienne, un clic sur le liège passe à la suivante ; le boss tamponne les tickets", () => {
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
  assert.match(html, /T2 · Pistes audio dans le menu du lecteur · dm\/site · 2 pts/);
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

test("le boss au tampon : assis au bureau du RDC, sans la pose de frappe (il ne danse plus)", () => {
  const {p, J} = page();
  p.run(`setFloor(2); var __dc = drawChar, __b = []; drawChar = (c, n) => { if (c.boss) __b.push({tile: c.tile, pose: c.pose, y: c.pos.y}); return __dc(c, n); };
    renderRedaction(1000); drawChar = __dc;`);
  const b = J('__b[0]');
  assert.deepEqual(b.tile, J('BOSS_SEAT'), 'dans le fauteuil : 9 px plus bas, comme au RDC');
  assert.equal(b.pose, 'stand');
  assert.equal(b.y, J('RD_DESK.y'));
});

test("la nuit comme au RDC : la salle de rédaction et les bureaux de revue occupés s'allument, les bureaux libres restent dans l'ombre", () => {
  const {p, J} = page();
  p.run('setFloor(2); T = DAY0 + 22.5 * 36e5; renderRedaction(1000);');
  const lv = J('RD_NIGHT.lv'), l = J('rvActive().length');
  assert.equal(lv.length, 7, 'la salle de rédaction et les six bureaux de la revue');
  assert.equal(lv[0], 1, 'une intention est sur la table');
  assert.deepEqual(lv.slice(1), [...Array(6).keys()].map(k => (k < l ? 1 : 0)));
});

test("floorNight : le voile suit le soleil ; hors des heures de bureau (le week-end à midi), la veilleuse quand même", () => {
  const {p, J} = page();
  const day = 'T = DAY0 + 2 * 864e5 + 12 * 36e5;'; // le samedi à midi
  p.run(day + 'var __S = {}, __R = {rooms: [[0, 0, 3, 3, true]]}; floorNight(__S, __R, 1000);');
  assert.equal(J('__S.lv'), null, 'en plein jour, pas de voile');
  p.run('floorNight(__S, {...__R, closed: true}, 1300);');
  assert.deepEqual(J('__S.lv'), [1], 'le week-end, la veilleuse et la pièce allumée');
});

test("redaction_sprite : le boss du 2e est dessiné avec son dessin de l'étage, sinon avec le sien ; seul le boss le porte", () => {
  const {p, J} = page();
  assert.equal(J('CAST.filter(c => "redaction_sprite" in c || "atelier_sprite" in c).length'), 0, 'le pack de démo ne les règle pas');
  p.run(`setFloor(2); var __b = chars.find(c => c.boss), __d = drawChar, __seen = [];
    drawChar = (c, now) => { if (c.key === __b.key) __seen.push(c.sprite); __d(c, now); };`);
  const drawn = () => { p.run('__seen = []; renderRedaction(2000);'); return J('__seen[0]'); };
  assert.equal(drawn(), J('__b.sprite'));
  p.run(`__b.redaction_sprite = 'cs_pomp0';`);
  assert.equal(drawn(), 'cs_pomp0');
  p.run(`__b.redaction_sprite = 'absent_du_pack';`);
  assert.equal(drawn(), J('__b.sprite'), 'sprite introuvable : repli sur le sien');
  p.run('delete __b.redaction_sprite; drawChar = __d;');
});

test("la scène « Le soir au 2e » : la nuit tombe, la salle de rédaction et les bureaux de revue occupés s'allument, puis la page revient", () => {
  const {p, J} = page();
  p.run('setFloor(2); var __R = REDACTION, __T = T;');
  assert.ok(J("galleryScenes().some(x => x.n === 'Le soir au 2e' && x.ok)"));
  p.run(`demoStart(galleryScenes().find(x => x.n === 'Le soir au 2e')); renderRedaction(1000);`);
  assert.equal(J('atOpen()'), false, 'hors des heures de bureau');
  assert.equal(J('RD_NIGHT.lv[0]'), 1, 'la salle de rédaction est allumée');
  assert.ok(J('RD_NIGHT.lv.slice(1).includes(0)'), 'un bureau de revue libre reste dans l\'ombre');
  p.run('demoEnd();');
  assert.equal(p.run('REDACTION === __R && T === __T'), true, 'la page revient à ses données et à son heure');
});
