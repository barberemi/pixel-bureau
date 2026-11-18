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
  assert.match(J('floorTabsHtml()'), />✍<\/span>2e<b>5<\/b><b class="h">✋1<\/b>/, 'deux intentions et trois revues, un tampon');
  p.run('T = DAY0 + 22.5 * 36e5; renderRedaction(1200);');
  assert.ok(J('RD_LIT.length') > 0, 'le soir : ceux au travail et le boss gardent leur lumière');
});

test("la revue : l'auteur de la PR en face du relecteur, un remplaçant pour la PR du boss, les étapes lues du run", () => {
  const {p, J} = page();
  assert.equal(J('rvActive().length'), 3);
  // les postes de la revue (sous-workflows) et l'avis, lus du run ; les étapes d'API et du worktree ne se montrent pas
  assert.equal(J("rvSteps(rvActive().find(r => r.run === 'demo-r3')).map(s => rvStepName(s.n)).join(' ')"), '🗺 contexte 📚 docs 🔍 lecture 🔒 sécu 🧐 avis ✍ postée');
  // demo-r1 a un « Ce qu'il fait » lu (sa dernière phrase) ; demo-r3 a un agent sans lecteur : la bulle de son étape reste
  assert.deepEqual(J("rvActive().map(rvBubble)"), ['« je cherche qui appelle… »', 'je cadre la PR…', 'je cherche la faille…']);
  p.run('REDACTION.revue.fait = {};');
  assert.deepEqual(J("rvActive().map(rvBubble)"), ['je lis le diff…', 'je cadre la PR…', 'je cherche la faille…'], 'sans fait : comme avant');
  p.run("CFG.revue_postes_wf = ['abcd1234'];");
  assert.deepEqual(J("[rvPosteWf('abcd1234-0000'), rvPosteWf('ffff0000-0000'), rvWf('abcd1234-0000')]"), [true, false, false], 'un poste ne passe pas au RDC');
  p.run('setFloor(2); renderRedaction(1000);');
  const html = J('redactionListHtml()');
  assert.match(html, /Rédaction <span class="cnt">2/);
  assert.match(html, /<b>T2<\/b> Pistes audio dans le menu du lecteur <span class="mut">· dm\/site · 2 pts/);
  assert.match(html, /Revue des PR <span class="cnt">3/);
  assert.match(J('tvRedactionHtml()'), /Rédaction[\s\S]*Revue des PR · 3/);
  // audit UX 4.9 : une carte par revue en cours, la PR, son auteur et la barre des postes
  const tv = J('tvRedactionHtml()');
  assert.equal((tv.match(/class="tv-steps"/g) || []).length, 3);
  assert.match(tv, /dm\/api|api#\d+/);
  assert.match(tv, /<span class="ok">[^<]+ ✓<\/span>/, 'un poste fait est coché');
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
  assert.equal(lv.length, 4, 'la salle de rédaction et les trois bureaux de la revue (une seule rangée)');
  assert.equal(lv[0], 1, 'une intention est sur la table');
  assert.deepEqual(lv.slice(1), [...Array(3).keys()].map(k => (k < l ? 1 : 0)));
  p.run(`DATA.runs = DATA.runs.filter(r => r.run !== 'demo-r3'); var __rv = rvDemo; rvDemo = () => __rv().filter(r => r.run !== 'demo-r3'); for (let k = 1; k < 30; k++) renderRedaction(1000 + k * 1000);`);
  assert.deepEqual(J('RD_NIGHT.lv').slice(1).map(Math.round), [1, 1, 0], 'un bureau libre reste dans l\'ombre');
  p.run('rvDemo = __rv;');
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
  assert.deepEqual(J('RD_NIGHT.lv.slice(1)'), J('[0, 1, 2].map(k => rvActive()[k] ? 1 : 0)'), 'chaque bureau de revue occupé s\'allume, un libre resterait dans l\'ombre');
  p.run('demoEnd();');
  assert.equal(p.run('REDACTION === __R && T === __T'), true, 'la page revient à ses données et à son heure');
});

test("une revue à la demande prend un seul bureau : le run du lanceur (review_one) cède la place à celui de la PR", () => {
  const q = load({demo: false}), Q = c => JSON.parse(q.run('JSON.stringify(' + c + ')'));
  q.run(`CFG.revue_wf = ['aaaa1111', 'bbbb2222']; CFG.revue_one_wf = ['bbbb2222']; CFG.revue_cron_wf = []; T = DAY0 + 10 * 36e5;
    DATA.runs = [{run: 'one', wf: 'bbbb2222-x', status: 'Running', _s: T - 6e4, vars: {}},
      {run: 'kid', wf: 'aaaa1111-x', parent: 'one', status: 'Running', _s: T - 5e4,
        vars: {'current_task.number': '2074', 'current_task.repo': 'dm/site', 'current_task.author': 'pambeesly'}, steps: []}];`);
  assert.deepEqual(Q('rvActive().map(r => r.run)'), ['kid']);
  q.run(`DATA.runs.forEach(r => { r.status = 'Success'; r._e = T; });`);
  assert.equal(Q("rvRuns().filter(r => r.status === 'Success').length"), 1, 'une revue postée, pas deux');
  q.run('setFloor(2); renderRedaction(1000);');
  assert.equal(Q('FLOOR'), 2);
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
  assert.match(J("rvfHover({kind: 'casier'})"), /L'entrepôt, à relire \(cron de 09:30, dans l'ordre\) : mobile#311, api#2063/);
  assert.match(J("rvfHover({kind: 'author', author: 'pambeesly'})"), /sa PR est lue, encore 1 PR à l'entrepôt/);
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
  frames(p, 300, 1200); // la corbeille est sous le bureau de droite : l'aller-retour prend une vingtaine de secondes
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
  assert.deepEqual(r, [[24.5, 11.5], [22.8, 11.5], [22.8, 16.4], [23.4, 16.4], [23.4, 18.1]], 'par la colonne le long du mur, jamais à travers les chaises');
});

test("la file : au passage suivant du cron, Bernard vide la corbeille et pose la fournée à l'entrepôt ; au-delà de quatre palettes, « +n »", () => {
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
  assert.ok(J('RVF_M.cas.length') > 4);
  p.run(`var __ap = atPill, __pl = []; atPill = (s, ...a) => { __pl.push(s); return __ap(s, ...a); }; renderRedaction(41300); atPill = __ap;`);
  assert.ok(J('__pl.includes("+" + (RVF_M.cas.length - 3))'), 'trois palettes, puis « +n » à la quatrième place');
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
  assert.equal(J('RD_STAIR.y + RD_STAIR.h'), J('RD_HH'), 'collée au bord du bas, avant même d\'être affiché');
  p.run('setFloor(2);');
  assert.equal(J('RD_STAIR.y + RD_STAIR.h'), J('AT_H'));
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

test("au clic sur un ticket (sa carte à la table, ou sa ligne du panneau) : sa fiche, ce qui sera créé pour lui seul", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  const h = J('RD_HITS.find(h => h.kind === "ticket" && h.k === 0)');
  p.run(`rdHitAt = () => RD_HITS.find(h => h.kind === "ticket" && h.k === 0); redactionClick({clientX: 0, clientY: 0});`);
  assert.deepEqual(J('RDTK'), {run: 'demo-t1', k: 0});
  assert.ok(h);
  const html = J('rdTicketHtml(rdTables()[0], 0)');
  assert.match(html, /← Les tickets/);
  assert.match(html, /T1 /);
  assert.match(html, /Lecteur : les sous-titres/);
  assert.match(html, /Story · 3 pts · dm\/api/);
  assert.match(html, /Servir les pistes WebVTT/);
  assert.match(J('rdTicketHtml(rdTables()[0], 1)'), /Le détail arrive au prochain relevé/); // pas encore de détail
  assert.match(J('redactionListHtml()'), /class="rd-tk" data-run="demo-t1" data-k="2"/); // chaque ticket : son bouton
  p.run('RDTK = {run: "disparu", k: 0};');
  assert.equal(J('rdTicketOpen()'), null); // l'intention n'est plus en cours : retour à la liste
  assert.equal(J('RDTK'), null);
});

test("plus de quatre tickets : la table et le liège montrent les quatre premiers et « +n », le panneau les liste tous", () => {
  const {p, J} = page();
  p.run(`var __ap = atPill, __pl = []; atPill = (s, ...a) => { __pl.push(s); return __ap(s, ...a); };
    const t = REDACTION.tables[0], x0 = t.tickets[0];
    t.tickets = Array.from({length: 7}, (_, i) => ({...x0, i, summary: 'Page ' + (i + 1)}));
    setFloor(2); renderRedaction(1000);`);
  assert.equal(J('RD_HITS.filter(h => h.kind === "ticket").length'), 4);
  assert.ok(J('__pl.includes("+3")'), 'le « +3 » posé sur la table');
  assert.ok(J('__pl.includes("+ 3 tickets : dans le panneau")'));
  p.run('atPill = __ap;');
});

test("le 2e s'ouvre avec la revue seule : la salle de rédaction absente le dit (audit produit F1)", () => {
  const q = load({demo: false}), Q = c => JSON.parse(q.run('JSON.stringify(' + c + ')'));
  q.run('CFG.ticket = null; CFG.revue_wf = [];');
  assert.equal(Q('redactionOn()'), false, 'ni rédaction ni revue : pas de 2e');
  q.run("CFG.revue_wf = ['abcd1234'];");
  assert.equal(Q('redactionOn()'), true, 'la revue seule ouvre le 2e');
  assert.equal(Q('ticketOn()'), false);
  assert.ok(Q('floorsOn()').includes(2));
  assert.match(Q('redactionListHtml()'), /La rédaction \(créer un ticket\) n'est pas installée/);
  q.run('setFloor(2); renderRedaction(1000); renderRedaction(1100);'); // la salle vide se dessine
  assert.equal(Q('FLOOR'), 2);
  assert.equal(Q("rdGalleryScenes().filter(x => x.fam === '2e étage · rédaction' && x.n !== 'Le soir au 2e').every(x => !x.ok && !!x.why)"), true);
  q.run("CFG.ticket = {wf: 'ffff0000'}; CFG.revue_wf = [];");
  assert.equal(Q('redactionOn()'), true, 'la rédaction seule aussi');
  assert.doesNotMatch(Q('redactionListHtml()'), /pas installée/);
});

test('« Qui fait quoi » du RDC : un bloc du 2e, les intentions puis les revues en cours (audit UX 4.1)', () => {
  const p = load(), J = c => JSON.parse(p.run('JSON.stringify(' + c + ')'));
  p.run('T = DAY0 + 11 * 36e5; setMode("live");');
  const rows = J('rdWhoRows(T)');
  assert.ok(rows.some(x => x.kind === 'rd') && rows.some(x => x.kind === 'rv'), 'intentions et revues');
  const html = J('rdWhoHtml(T)');
  assert.match(html, /✍ 2e étage <span class="cnt">\d+/);
  assert.match(html, /data-rd-run="[^"]+" data-rd-kind="rv"/);
  assert.match(html, /<span class="ws">revue/);
});

// ---------- tableaux noirs rejouables (audit produit F8) ----------
const inks = (p, code) => JSON.parse(p.run(`(() => { const out = [], ft = ctx.fillText; ctx.fillText = function (t, ...r) { out.push([String(t), ctx.fillStyle]); return ft.call(this, t, ...r); };
  try { ${code} } finally { ctx.fillText = ft; } return JSON.stringify(out); })()`));
// le tableau de la rédaction se dessine sous le bandeau du tampon (rdLate) : on le prend tout de suite
const rdTxt = p => inks(p, 'var __rl = rdLate; rdLate = (pp, f) => f(); try { rdBoard([]); } finally { rdLate = __rl; }');

test('F8, 2e : TICKETS DU JOUR à l\'heure du curseur ; les jetons, non datés, ceux du relevé en ⏱', () => {
  const {p, J} = page();
  // la démo : t0 arrive à 8 h 30, sa gate à 9 h 06, crée deux tickets (9 h 12, 9 h 18), finit à 9 h 24 ; t1 arrive à 10 h 12
  p.run(`setMode('pause'); T = DAY0 + (9 + 9 / 60) * 36e5;`);
  assert.deepEqual(J('rdJourAt(T)'), {crees: 0, tampon: 2, cours: 1, tok: 38400, tokRel: true, at: J('DAY0 + 11 * 36e5')}, '9 h 09 : t0 au tampon, ses deux tickets à venir');
  let b = rdTxt(p);
  assert.ok(b.some(x => x[0] === '0 ticket créé aujourd\'hui') && b.some(x => x[0] === '2 tickets au tampon'), b.map(x => x[0]).join(' | '));
  assert.deepEqual(b.find(x => /jetons/.test(x[0])), ['⏱38 k jetons à 11:00', '#8e9a90']);
  p.run('T = DAY0 + 10.5 * 36e5;');
  assert.deepEqual(J('[rdJourAt(T).crees, rdJourAt(T).tampon, rdJourAt(T).cours]'), [2, 0, 1], '10 h 30 : les deux tickets créés, t1 en recherche');
  // en direct : le relevé, comme avant
  p.run(`setMode('live'); T = DAY0 + 11 * 36e5;`);
  b = rdTxt(p);
  assert.ok(b.some(x => x[0] === '~38 k jetons' && x[1] === '#e8e2d0'));
  assert.ok(!b.some(x => /⏱/.test(x[0])));
});

test('F8, 2e : REVUES DU JOUR selon le statut des relectures à l\'heure du curseur ; leurs jetons, ceux du relevé', () => {
  const {p, J} = page();
  const rv = () => J(`(() => { const l = rvRuns(); return [rvActive().length, l.filter(r => r.status === 'Success' && r._s >= DAY0).length]; })()`);
  // la démo : demo-k1 relit de 9 h 31 à 9 h 42, demo-k2 de 9 h 42 à 9 h 59 ; trois relectures commencent à 10 h
  p.run(`setMode('pause'); T = DAY0 + (9 + 40 / 60) * 36e5;`);
  assert.deepEqual(rv(), [1, 5], '9 h 40 : demo-k1 encore en lecture');
  p.run('T = DAY0 + 10.5 * 36e5;');
  assert.deepEqual(rv(), [3, 7], '10 h 30 : les deux postées, trois en lecture');
  const b = inks(p, 'setFloor(2); renderRedaction(1000);');
  assert.ok(b.some(x => /^⏱\d+ k jetons$/.test(x[0]) && x[1] === '#8e9a90'), 'les jetons de la revue : le relevé, en ⏱');
  p.run(`setMode('live'); T = DAY0 + 11 * 36e5;`);
  assert.ok(inks(p, 'renderRedaction(1100);').some(x => /^~\d+ k jetons$/.test(x[0])), 'en direct : comme avant');
  assert.deepEqual(J(`[rvActive().length]`), [3]);
  p.run('setFloor(0);');
});

test("le panneau du 2e ne montre que les gates du modèle ticket : pas celle d'« Implémenter un ticket » (1er) ni de « Réestimer un ticket »", () => {
  const {p} = page();
  p.run(`CFG.ticket = {wf: 'aaaaaaaa'}; GATES = [
    {run: 'r-tk', wf: 'aaaaaaaa-1111', wf_name: 'Créer un ticket', gate: 'tampon', since: new Date(T).toISOString()},
    {run: 'r-impl', wf: 'cccccccc-2222', wf_name: 'Implémenter un ticket', gate: 'ton plan', since: new Date(T).toISOString()},
    {run: 'r-est', wf: 'dddddddd-3333', wf_name: 'Réestimer un ticket', gate: 'valider', since: new Date(T).toISOString()}];
    sel = null; RDF = null; RDTK = null;`);
  const runs = JSON.parse(p.run(`(() => { const out = [], gc = gateCard; gateCard = (parent, run) => out.push(run.run);
    try { drawRedactionSide(document.createElement('div')); } finally { gateCard = gc; } return JSON.stringify(out); })()`));
  assert.deepEqual(runs, ['r-tk']);
});

// ---------- le 2e sur une rangée (40 × 20 cases) : la revue sans second niveau, l'entrepôt en haut du couloir ----------
const pills = (p, code) => JSON.parse(p.run(`(() => { const out = [], ap = atPill; atPill = (s, x, y, ...r) => { out.push([String(s), x, y]); return ap(s, x, y, ...r); };
  try { ${code} } finally { atPill = ap; } return JSON.stringify(out); })()`));

test('le 2e fait 40 × 20 cases : la toile, le décor et tout ce qui est cliquable tiennent dans 640 px', () => {
  const {p, J} = page();
  assert.equal(J('AT_ROWS[2]'), 20);
  p.run('setFloor(2); renderRedaction(1000);');
  assert.deepEqual(J('[AT_H, cv.width, cv.height, RD_BG.height]'), [640, 1280, 640, 640]);
  const out = J('RD_HITS.filter(h => h.kind !== "author" && (h.y < 0 || h.y + h.h > AT_H + 1)).map(h => h.kind)');
  assert.deepEqual(out, [], 'aucune zone cliquable hors du plan');
  assert.ok(J('RD_JIRA.y <= AT_H && RD_SOFA.y + 12 <= AT_H && RVF.bench.y + 12 <= AT_H'), 'la boîte Jira et les canapés tiennent en bas');
});

test('la revue : trois bureaux sur une seule rangée, plus de second niveau (ni bureaux libres du bas, ni étagère « À relire »)', () => {
  const {p, J} = page();
  p.run(`setFloor(2); var __rv = rvDemo; rvDemo = () => __rv().filter(r => !['demo-r2', 'demo-r3'].includes(r.run));`);
  const l = pills(p, 'renderRedaction(1000);');
  const libres = l.filter(x => x[0] === 'bureau libre');
  assert.equal(libres.length, 2, 'les deux bureaux des revues à la demande, libres');
  assert.ok(libres.every(x => x[2] < 13 * 32), 'tous en haut');
  assert.ok(!l.some(x => /À RELIRE/.test(x[0])), 'plus d\'étagère « À relire »');
  p.run('rvDemo = __rv; renderRedaction(1100);');
  assert.deepEqual(J('RD_HITS.filter(h => h.kind === "review").map(h => Math.round(h.x + h.w / 2))'), J('[0, 1, 2].map(k => Math.round(rvDeskX(k)))'), 'trois revues, trois bureaux');
  assert.equal(J('RV_DESKS'), 3);
});

test("l'entrepôt en haut du couloir : une palette par PR qui attend, avec son étiquette ; la panne en rouge ; le panneau centré", () => {
  const {p, J} = page();
  p.run('setFloor(2);');
  const E = J('RVF_E');
  assert.ok(E.x0 >= J('RD_X1 * RD_T') && E.x1 <= J('RD_VX * RD_T'), 'dans le couloir, entre les deux salles');
  assert.ok(E.y1 < J('7.7 * RD_T - 32'), 'au-dessus du distributeur');
  const cartons = () => JSON.parse(p.run(`(() => { const out = [], ac = atCarton; atCarton = (x, y, l, c, ...r) => { out.push([l, c, x, y]); return ac(x, y, l, c, ...r); };
    const rl = rdLate; rdLate = (pp, f) => f(); try { rdReset(); renderRedaction(1000); } finally { atCarton = ac; rdLate = rl; } return JSON.stringify(out); })()`));
  let c = cartons();
  assert.equal(c.length, 2, 'mobile#311 et api#2063 attendent');
  assert.match(c[0][0], /^(mobile )?#311$/, 'dans l\'ordre du cron ; le dépôt quand il tient dans la place');
  assert.equal(c[1][0], 'api #2063');
  assert.ok(c.every(x => x[2] > E.x0 && x[2] < E.x1 && x[3] > E.y0 && x[3] < E.y1), 'posées dans la zone');
  const sign = pills(p, 'var __rl = rdLate; rdLate = (pp, f) => f(); try { renderRedaction(1100); } finally { rdLate = __rl; }').find(x => /ENTREPÔT/.test(x[0]));
  assert.equal(sign[0], '📦 ENTREPÔT · 2 à relire');
  assert.equal(sign[1], (E.x0 + E.x1) / 2, 'centré au-dessus de la zone');
  assert.ok(sign[2] < E.y0);
  // une revue de la fournée en panne : sa palette en rouge, à la dernière place
  p.run(`var __rv = rvDemo; rvDemo = () => __rv().map(r => r.run === 'demo-k1' ? {...r, status: 'Failed'} : r);`);
  c = cartons();
  assert.deepEqual(c.map(x => x[0]).slice(1), ['api #2063', '🧯 #2042']);
  assert.equal(c[2][1], '#a8323a');
  p.run('rvDemo = __rv;');
  assert.ok(J("RD_HITS.some(h => h.kind === 'casier' && h.x === RVF_E.x0)"), 'un clic sur l\'entrepôt ouvre la file');
});

test("la salle de revue centrée : bureaux espacés, la corbeille sous le bureau de droite", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  const mid = J('(RD_VX * RD_T + AT_W) / 2'), xs = J('[0, 1, 2].map(k => rvDeskX(k))');
  assert.ok(Math.abs(xs[1] - mid) < 1 && xs[1] - xs[0] === xs[2] - xs[1] && xs[1] - xs[0] >= 6 * 32, 'trois bureaux espacés de 6 cases, centrés');
  const board = pills(p, 'var __rl = rdLate; rdLate = (pp, f) => f(); try { renderRedaction(1100); } finally { rdLate = __rl; }');
  assert.ok(J('RVF.basket.x') > xs[2] - 32 && J('RVF.basket.y') > J('RV_FEET + 4 * 32') && J('RVF.basket.y + 30 < rvfChair(0).y - 26'), 'la corbeille sous le bureau de droite, au-dessus des chaises');
  assert.ok(J('RVF.relx < rvDeskX(0) - 48 && RVF.col < rvDeskX(0) - 48 && RVF.relx > RD_VX * RD_T'), 'les colonnes du relecteur et des auteurs, le long du mur');
  assert.ok(board.some(x => /POSTÉES/.test(x[0])), 'la corbeille a son étiquette');
});

test("la salle d'attente et le canapé de la revue, tout en bas, sans vide dessous ; le relecteur va chercher son dossier à l'entrepôt", () => {
  const {p, J} = page();
  p.run('setFloor(2); renderRedaction(1000);');
  const lbl = pills(p, 'var __rl = rdLate; rdLate = (pp, f) => f(); try { renderRedaction(1100); } finally { rdLate = __rl; }').find(x => /SALLE D'ATTENTE/.test(x[0]));
  assert.ok(lbl[2] > J('AT_H') - 2 * 32 && lbl[2] + 9 <= J('AT_H'), 'l\'étiquette dans les deux dernières rangées');
  assert.ok(J('rvfChair(0).y > AT_H - 2 * 32 && RVF.bench.y > AT_H - 2 * 32'), 'les chaises et le canapé aussi');
  assert.ok(J('RVF.lane < rvfChair(0).y - 26 && RVF.rely < rvfChair(0).y - 26'), 'les allées passent au-dessus des chaises');
  // à 9 h 42, la PR suivante de Holly : le relecteur pose l'avis, monte à l'entrepôt par le couloir et revient
  p.run(`T = DAY0 + 9.69 * 36e5; rdReset(); renderRedaction(1000); T = DAY0 + 9.71 * 36e5; var __minx = 1e9, __miny = 1e9;
    for (let i = 0; i < 260; i++) { renderRedaction(1100 + i * 100); const w = RVF_M.rel && RVF_M.rel.w; if (w) { __minx = Math.min(__minx, w.pos.x); __miny = Math.min(__miny, w.pos.y); } }`);
  assert.ok(J('__minx < RD_VX * RD_T && __miny < RVF.pick.y + 12'), 'il est passé sous la première palette');
  assert.equal(J('RVF_M.rel.seat'), true, 'puis il est revenu à son bureau');
});
