// Panneau de droite et fenêtres : « ← » ramène à la vue d'avant (historique), Échap aussi ; le Kanban et le calendrier
// s'ouvrent en fenêtre large, et quand on en sort par un ticket ou un nom, « ← » les rouvre.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load({layout: 'darkmode'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
run('renderSide=()=>{};OPENED=[];openKanban=()=>{OPENED.push("kanban")};openCalendar=()=>{OPENED.push("calendar")};');
const who = J('chars.find(c=>c.person).key');

test('« ← » ramène à la vue d\'avant, puis à toute l\'équipe', () => {
  run(`select(null);select(${JSON.stringify(who)});select('paie');select('ticket:DM-1');`);
  assert.equal(J('backLabel(SEL_BACK[SEL_BACK.length-1])'), 'Fiche de paie');
  run('goBack()');
  assert.equal(J('sel'), 'paie');
  assert.equal(J('backLabel(SEL_BACK[SEL_BACK.length-1])'), J(`byKey[${JSON.stringify(who)}].name`));
  run('goBack()');
  assert.equal(J('sel'), who);
  run('goBack()');
  assert.equal(J('sel'), null);
  assert.deepEqual(J('SEL_BACK'), []);
});

test('re-cliquer la vue affichée ne l\'empile pas ; « Toute l\'équipe » vide l\'historique', () => {
  run(`select(null);select('paie');select('paie');`);
  assert.deepEqual(J('SEL_BACK'), [null]);
  run(`select('tv');select(null);`);
  assert.deepEqual(J('SEL_BACK'), []);
});

test('le Kanban et le calendrier s\'ouvrent en fenêtre, sans toucher au panneau', () => {
  run(`OPENED=[];select(null);select('paie');select('kanban');select('calendar');`);
  assert.deepEqual(J('OPENED'), ['kanban', 'calendar']);
  assert.equal(J('sel'), 'paie');
});

test('un ticket cliqué dans le Kanban s\'ouvre dans son volet, le panneau ne bouge pas', () => {
  run(`select(null);select('paie');WIN_OPEN='kanban';KB_VOL=null;KB_BACK=[];openTicket('DM-7');`);
  assert.equal(J('sel'), 'paie');
  assert.deepEqual(J('KB_VOL'), {t: 'ticket', k: 'DM-7'});
  run(`openPr('o/r#12');`);
  assert.deepEqual(J('KB_VOL'), {t: 'pr', id: 'o/r#12'});
  assert.deepEqual(J('KB_BACK'), [{t: 'ticket', k: 'DM-7'}], '« ← DM-7 » dans le volet de la PR');
  run(`openTicket('DM-7');`);
  assert.deepEqual(J('KB_BACK'), [], 'revenir au ticket ne l\'empile pas deux fois');
  run(`WIN_OPEN=null;KB_VOL=null;`);
});

test('quitter le Kanban par le portrait d\'un agent : sa fiche dans le panneau, « ← Mur Kanban » rouvre la fenêtre', () => {
  run(`OPENED=[];select(null);select('paie');WIN_OPEN='kanban';winGo(${JSON.stringify(who)});`);
  assert.equal(J('sel'), who);
  assert.equal(J('WIN_OPEN'), null);
  assert.equal(J('backLabel(SEL_BACK[SEL_BACK.length-1])'), 'Mur Kanban');
  run('goBack()');
  assert.equal(J('sel'), 'paie', 'la vue d\'où le Kanban avait été ouvert');
  assert.deepEqual(J('OPENED'), ['kanban']);
});

test('hors du Kanban, un lien de ticket ouvre le Kanban (son volet), sans toucher au panneau', () => {
  run(`OPENED=[];select(null);select(${JSON.stringify(who)});openTicket('DM-9');`);
  assert.deepEqual(J('OPENED'), ['kanban']);
  assert.equal(J('sel'), who);
});

test('portrait : les planches générées (Palpatine, Yoda), plus petites, sont cadrées plus bas ; les autres comme avant', () => {
  const oy = sprite => J(`(() => { const keepCe = document.createElement, keepImg = IMG[${JSON.stringify(sprite)}]; let y = null;
    document.createElement = () => ({style: {}, getContext: () => ({drawImage(im, sx, sy) { y = sy; }})});
    IMG[${JSON.stringify(sprite)}] = {complete: true}; SPR[${JSON.stringify(sprite)}] = SPR[${JSON.stringify(sprite)}] || 'x';
    try { portrait({key: 'p', sprite: ${JSON.stringify(sprite)}, person: true}, 64); } finally { document.createElement = keepCe; IMG[${JSON.stringify(sprite)}] = keepImg; }
    return y - 4 * 64; })()`);
  assert.equal(oy('palpatine'), 12);
  assert.equal(oy('yoda'), 14);
  assert.equal(oy('mage'), 8);
});

test('l\'amiral Ackbar : son portrait cadré comme Yoda, et il crie bras levés devant une grosse PR', () => {
  assert.equal(J('PORTRAIT_DY.ackbar'), J('PORTRAIT_DY.yoda'));
  assert.equal(J(`poseOf({st: 'bigpr'}, 'visit')`), 'hands');
  assert.equal(J(`poseOf({st: 'reopen'}, 'visit')`), 'idle');
  assert.equal(J(`poseOf({st: 'work'}, 'desk')`), 'type');
});
