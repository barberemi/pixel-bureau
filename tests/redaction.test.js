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
  // les postes de la revue (sous-workflows) et l'avis, lus du run ; les étapes d'API et du worktree ne se montrent pas
  assert.equal(J("rvSteps(rvActive().find(r => r.run === 'demo-r3')).map(s => rvStepName(s.n)).join(' ')"), '🗺 contexte 📚 docs 🔍 lecture 🔒 sécu 🧐 avis ✍ postée');
  assert.deepEqual(J("rvActive().map(rvBubble)"), ['je lis le diff…', 'je cadre la PR…', 'je cherche la faille…']);
  p.run("CFG.revue_postes_wf = ['abcd1234'];");
  assert.deepEqual(J("[rvPosteWf('abcd1234-0000'), rvPosteWf('ffff0000-0000'), rvWf('abcd1234-0000')]"), [true, false, false], 'un poste ne passe pas au RDC');
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
  assert.deepEqual(J('[...new Set(galleryScenes().map(x => x.fam))]'), ['2e étage · rédaction', '2e étage · revue des PR']);
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

// la file de la salle de revue (68-revue.js) : les PR retenues par le cron attendent au casier, leurs auteurs en salle d'attente
function frames(p, n, from) { // n images de 100 ms : les marcheurs avancent
  p.run(`for (let i = 0; i < ${n}; i++) renderRedaction(${from} + i * 100);`);
}
test("la file : posée en arrivant (casier dans l'ordre du cron, corbeille, une chaise par auteur, l'auteur lu au bureau)", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  assert.deepEqual(J('RVF_M.cas.map(f => f.p.key)'), ['dm/mobile#311', 'dm/api#2063']);
  assert.deepEqual(J('RVF_M.basket'), ['comment', 'approve']);
  assert.deepEqual(J('Object.fromEntries(Object.entries(RVF_M.who).map(([a, h]) => [a, h.spot]))'), {pambeesly: {k: 'face'}, darrylphilbin: {k: 'chair', j: 0}});
  assert.equal(J('RVF_M.rel.seat'), true);
  assert.equal(J('rvActive().length'), 3, 'la PR de la file compte parmi les PR en lecture');
  assert.match(J("rvfHover({kind: 'casier'})"), /cron de 09:30, dans l'ordre\) : mobile#311, api#2063/);
  assert.match(J("rvfHover({kind: 'author', author: 'pambeesly'})"), /sa PR est lue, encore 1 PR au casier/);
});

test("la file : Holly reste au bureau entre ses deux PR ; le relecteur tamponne, pose à la corbeille et prend le dossier suivant", () => {
  const {p, J} = page();
  p.run('setFloor(2); T = DAY0 + 9.69 * 36e5; rdReset(); renderRedaction(1000);');
  assert.deepEqual(J('RVF_M.cas.map(f => f.p.n)'), [2060, 2051, 311, 2063]);
  assert.deepEqual(J('RVF_M.who.hollyflax.spot'), {k: 'face'});
  p.run('T = DAY0 + 9.71 * 36e5;');
  frames(p, 1, 1100);
  assert.equal(J('RVF_M.who.hollyflax.w'), null, 'sa PR suivante est la prochaine : elle ne bouge pas');
  assert.ok(J('RVF_M.rel.w') && J('RVF_M.stamp.v') === 'comment', 'le verdict tamponné au bureau');
  frames(p, 200, 1200);
  assert.deepEqual(J('RVF_M.basket'), ['comment']);
  assert.deepEqual(J('RVF_M.cas.map(f => f.p.n)'), [2051, 311, 2063], 'le dossier pris, les autres remontent');
  assert.equal(J('RVF_M.rel.seat'), true);
});

test("la file : Pam retourne s'asseoir quand quelqu'un passe avant sa PR suivante ; on ne redescend qu'après sa dernière", () => {
  const {J} = page();
  assert.deepEqual(J("rvfSpots({reading: {author: 'pam'}, queue: [{author: 'darryl'}, {author: 'pam'}]})"), {pam: {k: 'face'}, darryl: {k: 'chair', j: 0}});
  assert.deepEqual(J("rvfSpots({reading: {author: 'darryl'}, queue: [{author: 'pam'}]})"), {darryl: {k: 'face'}, pam: {k: 'chair', j: 0}});
  assert.deepEqual(J("rvfSpots({reading: {author: 'pam'}, queue: []})"), {pam: {k: 'face'}});
  const r = J("rvfRoute({k: 'face'}, {k: 'chair', j: 0}).map(q => [Math.round(q.x / AT_TS * 10) / 10, Math.round(q.y / AT_TS * 10) / 10])");
  assert.deepEqual(r, [[28.5, 11.5], [27.6, 11.5], [27.6, 22.9], [26.6, 22.9], [26.6, 24.6]], 'par la colonne à droite du casier, jamais à travers');
});

test("la file : au passage suivant du cron, Bernard vide la corbeille et range la fournée ; au-delà de six dossiers, « +n »", () => {
  const {p, J} = page();
  p.run(`setFloor(2); renderRedaction(1000);
    REDACTION.revue.batches['demo-c2'] = Array.from({length: 9}, (_, i) => ['dm/site', 3000 + i, 'gabelewis']);
    REDACTION.revue.starts['demo-c2'] = new Date(DAY0 + 10.99 * 36e5).toISOString();`);
  frames(p, 1, 1100);
  assert.ok(J('RVF_M.bern'), 'Bernard monte');
  assert.equal(J('RVF_M.cas.filter(f => f.filed).length'), 0, 'rien n\'apparaît avant qu\'il range (le cron reprend lui-même les PR non relues)');
  frames(p, 400, 1200);
  assert.deepEqual(J('RVF_M.basket'), [], 'corbeille vidée');
  assert.equal(J('RVF_M.cas.filter(f => f.filed).length'), 9);
  assert.equal(J('RVF_M.bern'), null, 'il est redescendu');
  assert.ok(J('RVF_M.cas.length') > 6);
});

test("les postes du ticket (CFG.ticket.postes_wf) et ceux de la revue travaillent au 2e : ni au RDC, ni dans « Nouvel agent »", () => {
  const {p, J} = page();
  p.run(`(() => {
    CFG.ticket = {wf: 'aaaaaaaa', postes_wf: ['bbbbbbbb', 'dddddddd']}; CFG.revue_postes_wf = ['eeeeeeee'];
    const d = JSON.parse(JSON.stringify(DATA)), at = new Date(T - 60e3).toISOString();
    d.runs.push({wf: 'aaaaaaaa-0000', wf_name: 'Le Bureau · créer un ticket', run: 'tk', status: 'Running', start: at, end: null, steps: [], vars: {}},
      {wf: 'bbbbbbbb-0000', wf_name: 'Le Bureau · ticket · 📚 recherche', run: 'rech', parent: 'tk', status: 'Running', start: at, end: null, steps: [], vars: {}},
      {wf: 'dddddddd-0000', wf_name: 'Le Bureau · ticket · 🎫 un ticket', run: 'un', parent: 'tk', status: 'Running', start: at, end: null, steps: [], vars: {}},
      {wf: 'eeeeeeee-0000', wf_name: 'Le Bureau · revue de PR · 🔍 lecture', run: 'lect', status: 'Running', start: at, end: null, steps: [], vars: {}});
    setData(d, true);
    ASKABLE = [{wf: 'bbbbbbbb-0000', name: 'ticket recherche'}, {wf: 'eeeeeeee-0000', name: 'revue lecture'}, {wf: 'cccccccc-0000', name: 'Autre'}];
  })()`);
  assert.deepEqual(J("DATA.runs.filter(r => ['tk', 'rech', 'un', 'lect'].includes(r.run)).map(r => r.run)"), ['tk']);
  assert.equal(J("chars.some(c => c.temp && (c.wf || []).some(w => ['bbbbbbbb', 'dddddddd', 'eeeeeeee'].includes(w)))"), false, 'aucun intérimaire');
  assert.deepEqual(J('workflowsWithoutAgent().map(w => w.name)').filter(n => /recherche|lecture/.test(n)), []);
});

test("la porte de l'escalier du 2e : en bas du couloir, collée au bord ; les auteurs et Bernard partent de derrière elle", () => {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  assert.equal(J('RD_STAIR.y + RD_STAIR.h'), J('AT_H'), 'collée au bord du bas');
  assert.ok(J('RD_STAIR.x > RD_X1 * RD_T && RD_STAIR.x + RD_STAIR.w < RD_VX * RD_T'), 'entre la rédaction et la revue');
  assert.ok(J('RVF.stairLow.y > AT_H && rvfOut(RVF.stairLow)'), 'ils attendent hors du plan, sans pancarte');
  assert.equal(J('rvfOut(RVF.stair)'), false, 'puis sortent par la porte');
  assert.equal(J('typeof rvfStairA'), 'undefined', 'plus de fondu sur des marches');
});

test("galerie : les scènes de la revue des PR se jouent sur la journée de démo, à l'heure du moment, et la journée revient", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(500); var __R = REDACTION, __T = T;');
  const sc = J("galleryScenes().filter(x => x.fam === '2e étage · revue des PR').map(x => [x.n, x.ok])");
  assert.deepEqual(sc.map(x => x[0]), ['La fournée du cron', 'Le relecteur prend un dossier', "L'avis est posté", "L'auteur repart", 'Une revue à la demande']);
  assert.ok(sc.every(x => x[1]));
  // la fournée : 1,5 s avant le passage du cron, rien ; puis Bernard monte avec le transpalette
  p.run(`demoStart(galleryScenes().find(x => x.n === 'La fournée du cron')); renderRedaction(1000);`);
  assert.equal(J('RVF_M.bern'), null);
  p.run('T += 2000; renderRedaction(1100);');
  assert.ok(J('!!RVF_M.bern && RVF_M.bern.fresh.length === 5'), 'cinq dossiers à ranger');
  assert.ok(J('RVF_M.bern.w.pos.y > AT_H'), 'il part de derrière la porte');
  p.run('demoEnd();');
  assert.equal(p.run('REDACTION === __R && T === __T'), true);
  // le relecteur : le dossier du haut est à lui
  p.run(`demoStart(galleryScenes().find(x => x.n === 'Le relecteur prend un dossier')); renderRedaction(2000); T += 2000; renderRedaction(2100);`);
  assert.equal(J('RVF_M.reading'), 'dm/site#2042');
  p.run('demoEnd();');
  // sans revue installée (hors démo), rien à jouer
  const q = load({demo: false});
  q.run('CFG.revue_cron_wf = []; CFG.revue_wf = [];');
  assert.equal(q.run("rvGalleryScenes().every(x => !x.ok && !!x.why)"), true);
});
