// Services extérieurs (48-statuts.js) : dataset statuts, bandeau « flash info » sous l'écran Mises en prod du plateau TV,
// fiche au clic, incidents du jour dans le fil (et le bandeau du mode TV), conseil d'une panne « agent indisponible ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const H = h => `DAY0+${h}*3600e3`;

test('statuts : le lecteur garde les services nommés et les incidents datés, au bon impact', () => {
  const {run} = load();
  const d = {generated_at: '2026-10-01T09:00:00Z', services: [{k: 'claude', n: 'Claude', st: 'op'}, {n: 'sans clé'}, null],
    incidents: [{k: 'claude', name: 'ok', impact: 'partial', from: '2026-10-01T08:00:00Z'}, {k: 'claude', impact: 'inconnu', from: '2026-10-01T08:00:00Z'},
      {k: 'claude', impact: 'major'}]};
  const got = JSON.parse(run(`JSON.stringify(readStatuts({datasets:{statuts:{current:${JSON.stringify(JSON.stringify(d))}}}}))`));
  assert.deepEqual(got.services.map(s => s.k), ['claude']);
  assert.deepEqual(got.incidents.map(i => i.name), ['ok']);
  assert.equal(run('readStatuts({datasets:{}})'), null);
});

test('statuts : l\'état se rejoue par les incidents, et l\'état relevé ne compte que près du relevé', () => {
  const {run} = load();
  // démo : GitHub ralenti de 9 h à 9 h 36, Claude en panne partielle de 10 h 15 à 10 h 54, relevé à 11 h tout au vert
  const bad = h => JSON.parse(run(`JSON.stringify(svBad(${H(h)}).map(x=>x.s.k+':'+x.st))`));
  assert.deepEqual(bad(9.2), ['github:degraded']);
  assert.deepEqual(bad(10), []);
  assert.deepEqual(bad(10.75), ['claude:partial']);
  assert.deepEqual(bad(10.95), []);
  run(`STATUTS.services[0].st='degraded'`); // relevé de 11 h : GitHub ralenti sur sa page, sans incident déclaré
  assert.deepEqual(bad(11.3), ['github:degraded']);
  assert.deepEqual(bad(12), [], 'loin du relevé : seuls les incidents comptent');
  // un service injoignable au relevé : point gris, pas de bandeau
  run(`STATUTS.services[2].st=null`);
  assert.equal(run(`svState(STATUTS.services[2],${H(11)})`), null);
  assert.deepEqual(bad(11).filter(x => x.startsWith('jira')), []);
});

test('statuts : le bandeau sous l\'écran du plateau, une ligne par service touché, le pire en haut', () => {
  const {run} = load();
  assert.equal(run(`svRect(${H(10)}).h`), 8, 'tout au vert : la rangée de points');
  run(`STATUTS.incidents.push({k:'jira',name:'Lenteurs',impact:'degraded',from:new Date(${H(10.6)}).toISOString(),to:null,link:'https://x'})`);
  const r = JSON.parse(run(`JSON.stringify(svRect(${H(10.75)}))`));
  assert.equal(r.h, 6 + 15 * 2); // une ligne de 15 px par service, en 12 px
  assert.deepEqual(r.bad.map(x => x.s.k), ['claude', 'jira']);
  assert.ok(r.y >= run('TVR.y+TVR.h'), 'sous l\'écran');
  assert.ok(Math.abs(r.x + r.w / 2 - run('TVR.x+TVR.w/2')) <= 1, 'centré sur l\'écran');
  assert.equal(run(`svLine(svRect(${H(10.75)}).bad[0])`), '⚠ CLAUDE · panne partielle');
  run(`T=${H(10.75)};SV_BAND.draw()`); // dessin sans erreur
  run('STATUTS=null');
  assert.equal(run(`svRect(${H(10.75)})`), null, 'sans relevé : rien sous l\'écran');
});

test('statuts : survol et clic du bandeau ouvrent la fiche des services', () => {
  const {run} = load();
  run(`T=${H(10.75)}`);
  const r = JSON.parse(run('JSON.stringify(svRect(T))'));
  run('cv.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H})'); // la toile à sa taille, sans mise à l'échelle
  const z = run(`hitZone({clientX:${r.x + 5},clientY:${r.y + 5}})`);
  assert.equal(z, 'services');
  assert.match(run('svTip()'), /^Services extérieurs : Claude : panne partielle$/);
  run(`T=${H(12)}`);
  assert.match(run('svTip()'), /tout est au vert \(GitHub, Claude, Jira, Confluence\)/);
  // la fiche, dans un panneau de test qui garde ses enfants (le faux DOM ne relit pas innerHTML du vrai panneau)
  const side = run(`(() => { T=${H(10.75)}; const s = {kids: [], appendChild(x) { this.kids.push(x); }}; renderServices(s);
    return s.kids.map(k => k.textContent + (k.innerHTML || '')).join(''); })()`);
  assert.match(side, /Services extérieurs/);
  assert.match(side, /En cours/);
  assert.match(side, /Taux d&#39;erreurs élevé sur l&#39;API/, 'échappé');
  assert.match(side, /Plus tôt aujourd'hui/);
  assert.match(side, /09:00 → 09:36/);
});

test('statuts : début et fin de chaque incident du jour dans le fil, repris par le bandeau du mode TV', () => {
  const {run} = load();
  const ev = JSON.parse(run(`JSON.stringify(svFeedEvents(${H(10.75)}))`));
  assert.deepEqual(ev.map(e => e.txt.replace(/<[^>]+>/g, '')), [
    '⛅ GitHub : ralenti « Retards sur les Actions et les webhooks »',
    '☀️ GitHub rétabli « Retards sur les Actions et les webhooks » · après 36 min',
    '🌧️ Claude : panne partielle « Taux d&#39;erreurs élevé sur l&#39;API »']);
  assert.ok(ev.every(e => e.team && e.sv && e.imp), 'Important, et dans le bandeau du mode TV (lignes team)');
  run(`STATUTS.incidents[0].impact='maint'`);
  assert.equal(JSON.parse(run(`JSON.stringify(svFeedEvents(${H(10.75)}))`))[0].imp, false, 'une maintenance n\'est pas Important');
  run(`T=${H(10.75)};renderFeed()`);
  assert.ok(run('FEED_EV.some(e=>e.sv&&/Claude/.test(e.txt))'), 'dans le fil de la page');
});

test('statuts : le conseil d\'une panne « agent indisponible » dit si Claude a un incident', () => {
  const {run} = load();
  run(`T=${H(10.75)}`);
  assert.match(run('atConseil({cause_type:"agent"})'), /^Claude signale un incident depuis 10:15 \(« Taux d'erreurs élevé sur l'API »\) : ce n'est pas le ticket\./);
  run(`T=${H(12)}`);
  assert.match(run('atConseil({cause_type:"agent"})'), /^L'agent ou l'API n'a pas répondu/);
});

test('statuts : les 24 dernières heures dans la fiche, une case par heure, du pire incident de l\'heure', () => {
  const {run} = load();
  const h = (k, t) => JSON.parse(run(`JSON.stringify(svHours('${k}',${H(t)}))`));
  const c = h('claude', 11), g = h('github', 11);
  assert.equal(c.length, 24);
  assert.deepEqual([c[22], c[23]], ['partial', 'op'], '10 h : panne partielle ; 11 h, l\'heure en cours : rétabli');
  assert.equal(g[21], 'degraded', '9 h : GitHub ralenti');
  assert.ok(c.slice(0, 22).every(x => x === 'op'));
  assert.equal(h('claude', 10.3)[23], 'partial', 'l\'heure en cours s\'arrête à t');
  assert.equal(h('claude', 10.2)[23], 'op', 'pas encore commencé à 10 h 12');
  const html = run(`svBandHtml(${H(11)})`);
  assert.match(html, /Les dernières 24 h/);
  assert.equal((html.match(/<i /g) || []).length, 24 * 4, 'quatre services');
  assert.match(html, /title="10:00 · Claude : panne partielle"/);
  run('STATUTS=null');
  assert.equal(run(`svBandHtml(${H(11)})`), '');
});
