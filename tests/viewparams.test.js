// Adresse Kronn #page/<id>?tv=1&scene=standup : Kronn transmet les paramètres dans KronnPageData.page.params ;
// la page les applique une fois (mode TV, stand-up), sans toucher au réglage mémorisé.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

// pack d'équipe fictif : un deuxième thème (Menthe) en plus du Classique
const page = load({config: {...require('./fixtures/bureau.config.json'), team: './tests/fixtures/pack-exemple', people: []}, owner: 'p_bob'});
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const reset = () => run(`VIEW_PARAMS_DONE=false;if(TV)setTv(false,false);TVSCENE.manual=null;`);

test('tv=1 : la page passe en mode TV, une seule fois', () => {
  reset();
  run(`applyViewParams({page:{id:'x',params:{tv:'1'}}});`);
  assert.equal(J('TV'), true);
  run(`setTv(false,false);applyViewParams({page:{id:'x',params:{tv:'1'}}});`); // un envoi suivant ne la remet pas en TV
  assert.equal(J('TV'), false);
});

test('scene=standup : le stand-up démarre avec le mode TV ; tv=0 force le plan', () => {
  reset();
  run(`applyViewParams({page:{params:{tv:'1',scene:'standup'}}});`);
  assert.deepEqual(J('[TV,TVSCENE.manual,TVSCENE.idx]'), [true, true, 0]);
  reset();
  run(`setTv(true,false);VIEW_PARAMS_DONE=false;applyViewParams({page:{params:{tv:'0'}}});`);
  assert.equal(J('TV'), false);
});

test('sans paramètres (vue intégrée, mosaïque) : rien ne change et le premier envoi qui en a reste attendu', () => {
  reset();
  run(`applyViewParams({page:{id:'x'}});applyViewParams(null);applyViewParams({datasets:{}});`);
  assert.deepEqual(J('[TV,VIEW_PARAMS_DONE]'), [false, false]);
  run(`applyViewParams({page:{params:{tv:'1'}}});`);
  assert.equal(J('TV'), true);
  reset();
});

test('skin=classique : l\'écran mural prend le thème de l\'adresse, sans le mémoriser ; un thème inconnu ne change rien', () => {
  reset();
  run(`applySkin('menthe');localStorage.removeItem&&localStorage.removeItem('bureau:skin');applyViewParams({page:{params:{tv:'1',skin:'classique'}}});`);
  assert.deepEqual(J('[TV,UI_SKIN]'), [true, 'classique']);
  reset();
  run(`applySkin('menthe');applyViewParams({page:{params:{skin:'parchemin'}}});`);
  assert.equal(J('UI_SKIN'), 'menthe');
});
