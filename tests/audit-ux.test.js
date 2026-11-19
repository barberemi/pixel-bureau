// Rattrapage de l'audit UX/UI du 7 novembre (constats sans retouche du dessin du canvas) : jetons CSS tous définis,
// page toujours sombre, légende des enveloppes peinte depuis ENV_KIND, fenêtre des cartes Kronn accessible, microcopie.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');
const {withDom} = require('./helpers/fakedom.js');

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

// la carte Kronn dans un faux DOM : un bloc du panneau (slot-host) et son bouton ; renderSide reconstruit le panneau (un
// bouton neuf, mêmes action, liaisons et texte) ; le pont de Kronn ne referme sa carte que sur un clic avec activation
function kmScene(dom, active) {
  const run = page.run;
  const build = () => {
    dom.side.textContent = '';
    const other = dom.doc.createElement('button'); other.textContent = 'Autre'; dom.side.append(other);
    const host = dom.doc.createElement('div'); host.className = 'relaunch'; host.setAttribute('data-kronn-action-slot-host', '');
    host.innerHTML = '<div class="rl-n">Le Bureau · live</div><div class="rl-s">Cron</div>';
    const btn = dom.doc.createElement('button'); btn.textContent = '↻ Relancer';
    btn.setAttribute('data-kronn-action', 'bureau-relaunch'); btn.setAttribute('data-kronn-bindings', '{"wf_id":"w1"}');
    host.append(btn); dom.side.append(host);
    page.ctx.__km = {host, btn, other};
    run('kronnModal(__km.host,__km.btn,"Relancer un workflow",{tag:"↻ Relancer"})');
    return page.ctx.__km;
  };
  page.ctx.__build = build;
  page.ctx.navigator = {userActivation: {isActive: active}};
  run('var KM_OBS=[]; MutationObserver=function(cb){KM_OBS.push(cb);return {observe(){},disconnect(){}};}; renderSide=()=>__build();');
  return build();
}

test('3.3 et 5.5 : la fenêtre des cartes Kronn est un dialogue nommé, la page inerte, Tab boucle, Échap ferme et rend le focus', () => {
  const realNav = page.ctx.navigator, realRS = page.run('renderSide'), realMO = page.run('MutationObserver');
  try {
    withDom(page, dom => {
      const {host, btn} = kmScene(dom, false);
      btn.focus(); btn.click();
      btn.style.display = 'none'; // .kmodal [data-kronn-action]{display:none} (styles.css) : hors de l'ordre de tabulation
      assert.equal(host.getAttribute('role'), 'dialog');
      assert.equal(host.getAttribute('aria-modal'), 'true');
      assert.equal(host.getAttribute('aria-label'), 'Relancer un workflow');
      const head = host.querySelector('.bp-head.km-title');
      assert.ok(head, 'la barre de titre commune des fenêtres');
      assert.match(head.textContent, /Échap pour fermer/);
      const x = head.querySelector('.bp-x');
      assert.equal(dom.doc.activeElement, x, 'focus sur × à l\'ouverture');
      assert.equal(dom.wrap.inert, true, 'le plan et le reste de la page sont inertes');
      assert.equal(page.ctx.__km.other.inert, true, 'les autres blocs du panneau aussi');
      assert.equal(host.inert, false);
      const back = host.querySelector('.bp-back');
      dom.doc.activeElement = back; const ev = dom.doc.key('Tab');
      assert.equal(ev.defaultPrevented, true);
      assert.equal(dom.doc.activeElement, x, 'Tab sur « ↩ Annuler » (dernier élément) : retour à ×');
      dom.doc.key('Tab', {shiftKey: true});
      assert.equal(dom.doc.activeElement, back, 'Maj+Tab sur × : « ↩ Annuler »');
      dom.doc.key('Escape'); // pas encore de carte Kronn : Échap referme tout de suite
      assert.equal(page.run('KM_OPEN'), null);
      assert.equal(dom.wrap.inert, false, 'la page redevient active');
      assert.equal(page.ctx.__km.other.inert, false);
      assert.ok(page.ctx.__km.btn !== btn && page.ctx.__km.btn.isConnected, 'le panneau a été reconstruit');
      assert.equal(dom.doc.activeElement, page.ctx.__km.btn, 'focus rendu au bouton, retrouvé après renderSide');
      assert.equal(dom.doc.listeners.keydown.length, 0, 'une fois refermée, Échap ne la vise plus');
    });
  } finally { page.ctx.navigator = realNav; page.ctx.__rs = realRS; page.ctx.__mo = realMO; page.run('renderSide=__rs;MutationObserver=__mo;'); }
});

test('Échap sur une carte Kronn ouverte : sans activation, × prend le focus et le dit ; avec, le bouton est recliqué', () => {
  const realNav = page.ctx.navigator, realRS = page.run('renderSide'), realMO = page.run('MutationObserver');
  try {
    for (const active of [false, true]) withDom(page, dom => {
      const {host, btn} = kmScene(dom, active);
      let clicks = 0; btn.addEventListener('click', () => { clicks++; });
      btn.click(); clicks = 0;
      const slot = dom.doc.createElement('div'); slot.setAttribute('data-kronn-action-slot', ''); host.append(slot);
      page.run('KM_OBS.forEach(f=>f())'); // Kronn a posé sa carte
      const x = host.querySelector('.bp-x'), msg = host.querySelector('.km-esc');
      dom.doc.activeElement = host.querySelector('.bp-back');
      const ev = dom.doc.key('Escape');
      assert.equal(ev._stop, true, 'la fenêtre dessous (volet du Kanban) ne se ferme pas sur la même touche');
      if (active) {
        assert.equal(clicks, 1, 'activation encore valable : le bouton est recliqué, Kronn referme sa carte');
      } else {
        assert.equal(clicks, 0, 'un clic sans activation serait ignoré par le pont de Kronn');
        assert.equal(dom.doc.activeElement, x, '× prend le focus : Entrée (un vrai geste) referme la carte');
        assert.equal(msg.hidden, false);
        assert.match(msg.textContent, /vrai clic/);
        assert.equal(page.run('KM_OPEN') === host, true, 'la fenêtre reste : la carte Kronn ne resterait pas orpheline');
      }
      slot.remove(); host.querySelector('.bp-x').onclick(); // un vrai clic sur × : cancel, puis Kronn retire son emplacement
      page.run('KM_OPEN=null;');
    });
  } finally { page.ctx.navigator = realNav; page.ctx.__rs = realRS; page.ctx.__mo = realMO; page.run('renderSide=__rs;MutationObserver=__mo;'); }
});

test('3.3 : le Kanban d\'un bureau du 3e est une fenêtre nommée', () => {
  assert.match(read('page', 'src', '68-retours.js'), /title:'🛠 Kanban de '\+rtName\(r\)/);
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
  assert.match(html, /<span title="Statut Jira : To Review">En revue<\/span>/);
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

test('2.2 : noms des pièces du plan en 12 px (2.3 : 9,4 px affichés), encre à 50 % par défaut', () => {
  const js = read('page', 'src', '40-floor.js');
  assert.match(js, /g\.font=`bold 12px \$\{FONT_MONO\}`;g\.textAlign='center';/);
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
