// Rattrapage de l'audit UX/UI du 7 novembre (constats sans retouche du dessin du canvas) : jetons CSS tous définis,
// page toujours sombre, légende des enveloppes peinte depuis ENV_KIND, fenêtre des cartes Kronn accessible, microcopie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'page', 'src');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const srcFiles = fs.readdirSync(SRC).filter(f => /\.(css|js)$/.test(f));
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const page = load();
const J = c => JSON.parse(page.run('JSON.stringify(' + c + ')'));

test('1.1 : chaque var(--x) de la page a une définition (CSS, ou posée par le JS)', () => {
  const all = srcFiles.map(f => noComments(fs.readFileSync(path.join(SRC, f), 'utf8'))).join('\n') + read('page', 'office_template.html');
  const used = new Set([...all.matchAll(/var\(\s*--([\w-]+)/g)].map(m => m[1]));
  const def = new Set([...all.matchAll(/--([\w-]+)\s*:/g), ...all.matchAll(/setProperty\(\s*['"]--([\w-]+)/g)].map(m => m[1]));
  assert.deepEqual([...used].filter(u => !def.has(u)), []);
});

test('1.2 : page toujours sombre, plus de palette claire ni de bascule data-theme', () => {
  for (const f of srcFiles.filter(f => f.endsWith('.css'))) {
    const css = noComments(fs.readFileSync(path.join(SRC, f), 'utf8'));
    assert.doesNotMatch(css, /prefers-color-scheme|data-theme/, f);
  }
  assert.match(read('page', 'src', 'styles.css').match(/:root\{([^}]*)\}/)[1], /color-scheme:dark;[\s\S]*--bg:#17181c/);
});

test('1.9 : les carrés de la légende des enveloppes prennent la couleur de ENV_KIND, rien en dur dans le gabarit', () => {
  const tpl = read('page', 'office_template.html');
  assert.doesNotMatch(tpl, /class="sq" style="background:#/);
  const kinds = [...tpl.matchAll(/class="sq" data-env="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(kinds.sort(), Object.keys(J('ENV_KIND')).sort());
  const col = J(`(() => { const i = {dataset: {env: 'gate'}, classList: {contains: () => false}, style: {}};
    paintLegend({querySelectorAll: () => [i]}); return i.style.background; })()`);
  assert.equal(col, J('ENV_KIND.gate.c'));
});

test('3.3 et 5.5 : la fenêtre des cartes Kronn est un dialogue nommé qui se ferme à Échap', () => {
  const js = read('page', 'src', '55-actions.js');
  assert.match(js, /host\.setAttribute\('role','dialog'\);host\.setAttribute\('aria-modal','true'\)/);
  assert.match(js, /host\.setAttribute\('aria-label',title\|\|tag\)/);
  assert.match(js, /e\.key==='Escape'\)\{e\.preventDefault\(\);cancel\(\);/);
  assert.match(js, /document\.removeEventListener\('keydown',onKey\)/); // une fois refermée, Échap ne la vise plus
  assert.match(read('page', 'src', '68-retours.js'), /d\.setAttribute\('aria-label','Kanban de '\+rtName\(r\)\)/);
  assert.match(read('page', 'src', '69-attente.js'), /p\.setAttribute\('role','region'\);p\.setAttribute\('aria-label','Ce qui t\\'attend'\)/);
});

test('3.4 : fermer s\'écrit « × » partout', () => {
  for (const f of ['44-loupe.js', '68-retours.js']) assert.doesNotMatch(read('page', 'src', f), /aria-label="Fermer">✕/, f);
});

test('5.5 : le lecteur d\'écran entend une décision de plus, pas une de moins', () => {
  const said = J(`(() => {
    const lv = {textContent: ''}, ge = document.getElementById, out = [];
    document.getElementById = id => id === 'waitlive' ? lv : ge.call(document, id);
    try { WAIT_N = null; for (const n of [1, 1, 3, 2]) { waitAnnounce(n); out.push(lv.textContent); } }
    finally { document.getElementById = ge; }
    return out;
  })()`);
  assert.deepEqual(said, ['', '', '3 décisions t\'attendent.', '3 décisions t\'attendent.']);
});

test('7.2 : plus de tiret cadratin affiché pour une case vide', () => {
  for (const f of ['36-absences.js', '62-departs.js', '62-deploy.js', '63-kanban.js']) {
    const js = noComments(read('page', 'src', f));
    assert.doesNotMatch(js, /—/, f);
  }
});

test('7.3 : « jetons » partout dans le HTML de la page, plus « tokens »', () => {
  for (const f of ['47-rafraichir.js', '55-actions.js', '70-kpis-feed.js']) {
    const js = noComments(read('page', 'src', f));
    assert.doesNotMatch(js, /tokens (par|aujourd|7 jours|·)|(de|des|\}) tokens\b|Tokens par/, f);
  }
});

test('5.7 : la fiche d\'un ticket dit le statut en français, le statut Jira en infobulle', () => {
  const html = J(`(() => {
    const out = [], side = {appendChild(e) { out.push(e.innerHTML || e.textContent || ''); }}, lb = launchBlock, fs = foldSection;
    launchBlock = () => {}; foldSection = () => ({appendChild() {}});
    TEAM = {people: [{name: 'Pam', tickets: [{key: 'DM-2', cat: 'review', status: 'To Review', summary: 'b'}], prs: []}], unassigned: [], other_prs: []};
    try { renderTicket(side, 'DM-2'); } finally { launchBlock = lb; foldSection = fs; }
    return out.join('');
  })()`);
  assert.match(html, /<span title="Statut Jira : To Review">En review<\/span>/);
});

test('2.6 : l\'horloge de la page et du mode TV à la minute', () => {
  assert.match(read('page', 'src', '90-boot.js'), /getElementById\('clock'\)\.textContent=hm\(T\)/);
  assert.match(read('page', 'src', '75-tv.js'), /<span class="tvc">\$\{hm\(T\)\}<\/span>/);
});

// ---------- retouches du dessin (maquettes v15, choix du 9 novembre) ----------
test('3.10 : bulles, étiquettes et nuages aux coins crénelés (pixRect), plus de roundRect sur le plan', () => {
  for (const f of srcFiles.filter(f => f.endsWith('.js'))) assert.doesNotMatch(noComments(fs.readFileSync(path.join(SRC, f), 'utf8')), /\.roundRect\(/, f);
  const pts = J(`(() => { const l = []; const c = {beginPath() {}, moveTo: (x, y) => l.push([x, y]), lineTo: (x, y) => l.push([x, y]), closePath() {}};
    pixRect(c, 0, 0, 20, 10); return l; })()`);
  assert.equal(pts.length, 20);
  assert.ok(pts.every(([x, y]) => x >= 0 && x <= 20 && y >= 0 && y <= 10));
  assert.ok(!pts.some(([x, y]) => (x === 0 || x === 20) && (y === 0 || y === 10)), 'aucun angle droit : les coins sont en marches');
});

test('2.2 : noms des pièces du plan en 11 px, encre à 50 % par défaut', () => {
  const js = read('page', 'src', '40-floor.js');
  assert.match(js, /g\.font='bold 11px ui-monospace,Menlo,monospace';g\.textAlign='center';/);
  assert.match(js, /g\.fillStyle=l\.color\|\|'rgba\(0,0,0,\.5\)'/);
});

test('4.8 : un agent au repos montre son icône et son nom ; le métier et l\'heure au survol ou quand il travaille', () => {
  const said = J(`(() => {
    const c = chars.find(x => famOf(x) === 'wf' && !metierOf(x) && !x.temp);
    const out = [], ft = ctx.fillText, lt = labelText; ctx.fillText = t => out.push(String(t));
    labelText = () => '📰 Jim · Veille techno · ⏰ demain 9h30';
    const n0 = NAMES, st0 = c._st, h0 = hoverKey, p0 = c.pos; NAMES = 'all'; c.pos = c.pos || {x: 100, y: 100};
    try {
      c._st = {st: 'idle'}; NAME_BOXES = []; drawName(c);
      hoverKey = c.key; NAME_BOXES = []; drawName(c); hoverKey = h0;
      c._st = {st: 'work'}; NAME_BOXES = []; drawName(c);
    } finally { ctx.fillText = ft; labelText = lt; NAMES = n0; c._st = st0; c.pos = p0; }
    return out;
  })()`);
  assert.deepEqual(said, ['📰 Jim', '📰 Jim · Veille techno · ⏰ demain 9h30', '📰 Jim · Veille techno · ⏰ demain 9h30']);
});

test('1.4 : « t\'attend » sur le plan, un seul ambre (le --warn du thème) et son encre sombre', () => {
  assert.equal(J('WAIT_BG'), J('ST_TOKEN.warn'));
  assert.equal(J('ST_TOKEN.warn'), read('page', 'src', 'theme-classique.css').match(/--warn:(#[0-9a-f]{6})/)[1]);
  for (const f of ['68-atelier.js', '68-caserne.js', '68-redaction.js', '68-retours.js']) {
    const js = noComments(read('page', 'src', f));
    assert.doesNotMatch(js, /#(ffcf4a|a37a10)/i, f + ' : lampes et pastilles passent par WAIT_BG / WAIT_DIM');
    assert.doesNotMatch(js, /'#8a5a00'/, f + ' : ambre foncé seulement par WAIT_TXT (texte sur bulle claire)');
  }
});

test('7.3 : « jetons » aussi sur les tableaux du 2e', () => {
  assert.doesNotMatch(noComments(read('page', 'src', '68-redaction.js')), /k tokens/);
});
