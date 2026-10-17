// Agent cron : programme en clair à l'heure du bureau (Kronn lit les crons en UTC), prochain passage sur la fiche
// (« ⏰ Son programme », « ↻ Passer maintenant ») et dans l'étiquette du plan ; relance sans carte à remplir.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const {run} = load();
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const OCT = 'Date.parse("2026-10-17T20:00:00Z")'; // samedi 17 octobre, 22h à Paris (heure d'été)
const JAN = 'Date.parse("2026-01-14T10:00:00Z")'; // mercredi 14 janvier, heure d'hiver

test('programme en clair : heures UTC du cron dites à l\'heure de Paris, jours regroupés', () => {
  const txt = (e, t = OCT) => J(`cronText(${JSON.stringify(e)}, ${t})`);
  assert.equal(txt('30 7,10,13,16,19 * * 1-5'), 'Du lundi au vendredi toutes les 3 heures de 9h30 à 21h30');
  assert.equal(txt('30 7,10,13,16,19 * * 1-5', JAN), 'Du lundi au vendredi toutes les 3 heures de 8h30 à 20h30', 'heure d\'hiver');
  assert.equal(txt('45 9 * * *'), 'Tous les jours à 11h45');
  assert.equal(txt('30 7 * * 1-5'), 'Du lundi au vendredi à 9h30');
  assert.equal(txt('0 12 * * 5'), 'Le vendredi à 14h');
  assert.equal(txt('5 * * * *'), 'Toutes les heures, à la minute 05');
  assert.equal(txt('0 * * * *'), 'Toutes les heures pile');
  assert.equal(txt('*/10 4-20 * * *'), 'Toutes les 10 min de 6h à 22h50');
  assert.equal(txt('* 4-20 * * *'), 'Toutes les minutes de 6h à 22h59');
  assert.equal(txt('0 8 * * 6,0'), 'Le week-end à 10h');
  assert.equal(txt('0 8 * * 1,3'), 'Le lundi et mercredi à 10h');
  assert.equal(txt('0 7,9 * * 1'), 'Le lundi à 9h et 11h');
  assert.equal(txt('0 6 1 1 *'), 'Cron « 0 6 1 1 * » (heure UTC)', 'rien dans les 7 jours : le cron tel quel');
});

test('prochain et précédent passage ; « demain », jour de la semaine, « dans … »', () => {
  const e = JSON.stringify('30 7,10,13,16,19 * * 1-5');
  const nx = J(`cronNext(${e}, ${OCT})`);
  assert.equal(new Date(nx).toISOString(), '2026-10-19T07:30:00.000Z', 'lundi 9h30 à Paris');
  assert.equal(new Date(J(`cronPrev(${e}, ${OCT})`)).toISOString(), '2026-10-16T19:30:00.000Z', 'vendredi 21h30');
  assert.equal(J(`whenTxt(${nx}, ${OCT})`), 'lundi 9h30');
  assert.equal(J(`whenTxt(${nx}, ${nx} - 3600e3*12)`), 'demain 9h30');
  assert.equal(J(`whenTxt(${nx}, ${nx} - 3600e3)`), '9h30');
  assert.equal(J(`whenTxt(${nx}, ${nx} - 3600e3, 1)`), "aujourd'hui à 9h30");
  assert.equal(J(`whenTxt(${nx}, ${OCT}, 1)`), 'lundi à 9h30');
  assert.equal(J(`inTxt(65*60e3)`), 'dans 1 h 05');
  assert.equal(J(`inTxt(30e3)`), 'dans 1 min');
  assert.equal(J(`inTxt(3*864e5)`), 'dans 3 j');
  assert.equal(J(`cronNext("0 6 1 1 *", ${OCT})`), null, 'plus de 8 jours : pas de prochain passage');
});

test('crons d\'un agent (DATA.crons) : prochain passage le plus proche ; étiquette du plan, sauf au travail ou en mode TV', () => {
  run(`DATA.crons=[{wf:'aaaa1111-0000',name:'Revue',schedule:'0 10 * * *'},{wf:'bbbb2222-0000',name:'Veille',schedule:'0 8 * * *'}];
    var AG={key:'zz',name:'Dwight',role:'Revue des PR',wf:['aaaa1111','bbbb2222','cccc3333'],runs:[],_st:{st:'idle'}};T=${OCT};`);
  assert.deepEqual(J('cronsOf(AG).map(x=>x.name)'), ['Revue', 'Veille']);
  assert.equal(new Date(J('agentNext(AG,T)')).toISOString(), '2026-10-18T08:00:00.000Z');
  assert.match(J('labelText(AG)'), / · ⏰ demain 10h$/);
  assert.equal(J('cronTag(AG)'), '⏰ demain 10h', 'même texte sous son état, dans la liste du panneau');
  assert.doesNotMatch(J('(AG._st={st:"work"},labelText(AG))'), /⏰/, 'au travail : pas d\'heure');
  assert.doesNotMatch(J('(AG._st={st:"idle"},TV=true,labelText(AG))'), /⏰/, 'mode TV');
  run('TV=false');
  assert.doesNotMatch(J('labelText({key:"m",name:"Clark",role:"Issue GitHub",wf:["dddd4444"],runs:[],_st:{}})'), /⏰/, 'agent manuel');
});

test('fiche : « ⏰ Son programme » pour chaque cron, « ↻ Passer maintenant » lié à la ligne (wf_id et params), hors de « Relancer »', () => {
  run(`document.createElement = t => ({tag: t, attrs: {}, kids: [], style: {}, dataset: {}, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html || ''; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, appendChild(x) { this.kids.push(x); }, append(...x) { this.kids.push(...x); },
      addEventListener() {}});
    var MO = typeof MutationObserver === 'undefined' ? null : MutationObserver; MutationObserver = function () { this.observe = () => {}; };
    kronnModal = () => {}; COLLAPSED = {};
    ACTIONS.relaunch = true; TV = false;
    RELAUNCH = [{wf: 'aaaa1111-0000', name: 'Revue', trigger: 'cron', params: ''}, {wf: 'cccc3333-0000', name: 'Manuel', trigger: 'manual', params: ''}];
    var SIDE = {kids: [], appendChild(x) { this.kids.push(x); }};`);
  run('programmeBlock(SIDE, AG); relaunchBlock(SIDE, AG);');
  const out = J(`(() => { const all = []; const walk = n => { if (!n) return; all.push(n); (n.kids || []).forEach(walk); }; SIDE.kids.forEach(walk);
    return {heads: all.filter(n => n.tag === 'h2').map(n => n.html), btns: all.filter(n => n.tag === 'button').map(n => ({t: n.textContent, b: n.attrs['data-kronn-bindings']})),
      html: all.map(n => n.html || '').join('')}; })()`);
  assert.match(out.heads[0], /⏰ Son programme/);
  assert.match(out.heads[1], /Relancer/);
  assert.match(out.html, /Tous les jours à 12h/);
  assert.match(out.html, /Prochain passage demain à 12h \(dans 14 h\)/);
  assert.deepEqual(out.btns, [{t: '↻ Passer maintenant', b: '{"wf_id":"aaaa1111-0000","params":"aaaa1111-0000"}'},
    {t: '↻ Relancer', b: '{"wf_id":"cccc3333-0000","params":"cccc3333-0000"}'}], 'le cron n\'est pas relancé deux fois');
});
