// Invités de passage (clé guests du roster) : au plus une visite par jour ouvré, à une heure et pour une durée tirées
// au sort (les mêmes pour tout le monde), promenade dans les bureaux, hors de l'équipe, des listes et des compteurs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load(); // démo : David Wallace passe voir Dunder Mifflin
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const MIN = 60e3;
const day = iso => Date.parse(iso + 'T00:00:00+02:00'); // minuit à Paris (heure d'été)
const THU = day('2026-10-01'), SAT = day('2026-10-03');

// minutes de la journée où il est là (état autre que off ou gone)
const presence = (t0, key = 'g_david') => J(`Array.from({length:24*60},(_,m)=>m).filter(m=>{const s=guestState(byKey.${key},${t0}+m*60e3);return s.st!=='off'&&s.st!=='gone';})`);

test('invité de la démo : un visiteur hors équipe, avec sa recette d\'avatar', () => {
  const c = J(`(({key,guest,visitor,person,seat,role})=>({key,guest,visitor,person,seat,role}))(byKey.g_david)`);
  assert.deepEqual(c, {key: 'g_david', guest: true, visitor: true, seat: null, role: 'Directeur financier, de passage'});
  assert.equal(J(`chars.filter(c=>c.person).some(c=>c.key==='g_david')`), false); // ni dans l'équipe, ni au stand-up
  assert.ok(J('!!lookOf(byKey.g_david)'));
});

test('une seule visite, d\'un seul tenant, de 20 à 40 min, dans les heures de bureau avec une heure de marge', () => {
  const ms = presence(THU);
  assert.ok(ms.length >= 20 && ms.length <= 41, `${ms.length} min`);
  assert.equal(ms[ms.length - 1] - ms[0] + 1, ms.length); // pas de trou : une seule visite
  const [h0, h1] = J('RHYTHM.office_hours');
  assert.ok(ms[0] >= (h0 + 1) * 60 && ms[ms.length - 1] < (h1 - 1) * 60, `${ms[0]}..${ms[ms.length - 1]}`);
  assert.deepEqual(presence(THU), ms); // même tirage à chaque calcul
});

test('pas de visite le week-end ; chance 0 = jamais ; jours différents = heures différentes', () => {
  assert.deepEqual(presence(SAT), []);
  run(`byKey.g_david.chance=0;`);
  try { assert.deepEqual(presence(THU), []); } finally { run(`delete byKey.g_david.chance;`); }
  const starts = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(d => presence(day(d))[0]);
  assert.ok(new Set(starts).size > 1, String(starts));
});

test('pendant la visite : il se promène (collègues à leur bureau ou coins du bureau), puis repart', () => {
  const ms = presence(THU), t = m => THU + m * MIN;
  const states = ms.map(m => J(`guestState(byKey.g_david,${t(m)})`));
  assert.ok(states.every(s => s.st === 'idle' && /arrivé à .*repart vers/.test(s.label)));
  assert.ok(new Set(states.map(s => s.zone)).size > 1); // il change d'endroit
  const after = J(`guestState(byKey.g_david,${t(ms[ms.length - 1] + 1)})`);
  assert.equal(after.st, 'gone');
  assert.match(after.label, /^Passé de \d\d:\d\d à \d\d:\d\d$/);
});

test('ni dans Qui fait quoi, ni dans la liste des visiteurs, ni comme agent ; arrive par la porte et ressort', () => {
  const m = presence(THU)[5], t = THU + m * MIN;
  run(`T=${t};needTeleport=true;tick(0);`);
  assert.equal(J('byKey.g_david.present'), true);
  assert.equal(J(`whoCards(${t}).some(x=>x.c.key==='g_david')`), false);
  assert.equal(J(`chars.filter(c=>!c.person&&!c.visitor).some(c=>c.key==='g_david')`), false);
  run(`select('g_david');`); // la fiche s'ouvre sans erreur
  run(`select(null);T=${THU + 23 * 60 * MIN};tick(1);`);
  assert.equal(J('byKey.g_david._st.st'), 'gone');
});

test('tour de minuit (at, jitter, days all, tour, shout) : tous les soirs vers 00h10, toutes les salles dans l\'ordre, puis repart', () => {
  const g = `({key:'g_s',name:'Steph',guest:true,visitor:true,at:'00:10',jitter:5,days:'all',tour:true,stay:[16,16],shout:'JE SUIS TOUTE VERTE !'})`;
  for (const d of [day('2026-10-03'), THU]) { // samedi compris
    const ms = J(`Array.from({length:120},(_,m)=>m).filter(m=>{const s=guestState(${g},${d}+m*60e3);return s.st!=='off'&&s.st!=='gone';})`);
    assert.ok(ms[0] >= 5 && ms[0] <= 15, `arrivée à ${ms[0]} min`);
    assert.equal(ms.length, 16);
    const zones = [...new Set(ms.map(m => J(`guestState(${g},${d}+${m}*60e3).zone`)))];
    assert.deepEqual(zones, J('GUEST_TOUR.map(x=>x[0])'));
    assert.equal(J(`guestState(${g},${d}+${ms[3]}*60e3).bubble`), 'JE SUIS TOUTE VERTE !');
    assert.equal(J(`guestState(${g},${d}+${ms[ms.length - 1] + 1}*60e3).st`), 'gone');
  }
});

test('invité en marche : un pas sur deux, 1 px de rebond ; immobile ou collègue : aucun', () => {
  assert.equal(J(`guestBob({guest:true,moving:true},1)`), -1);
  assert.equal(J(`guestBob({guest:true,moving:true},2)`), 0);
  assert.equal(J(`guestBob({guest:true,moving:false},1)`), 0);
  assert.equal(J(`guestBob({person:'x',moving:true},1)`), 0);
});
