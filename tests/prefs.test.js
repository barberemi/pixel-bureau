// Préférences du navigateur (#16, 00-prefs.js) : une seule écriture de « bureau:<k> », JSON ou texte tel quel ;
// stockage refusé (cadre de Kronn) ou valeur abîmée : la valeur par défaut, sans erreur.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const store = () => {
  const m = new Map();
  return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)};
};

test('JSON pour les objets, texte tel quel pour les chaînes ; dropPref efface', () => {
  const s = store(); page.ctx.localStorage = s;
  run(`setPref('collapsed',{who:true});setPref('feed','tout');setPref('floor','2')`);
  assert.equal(s.m.get('bureau:collapsed'), '{"who":true}');
  assert.equal(s.m.get('bureau:feed'), 'tout', 'pas de guillemets : relu par les anciennes versions aussi');
  assert.deepEqual(J(`pref('collapsed',{})`), {who: true});
  assert.equal(J(`prefStr('floor','0')`), '2');
  run(`dropPref('feed')`);
  assert.equal(J(`prefStr('feed','important')`), 'important');
});

test('une valeur gardée avant #16 se relit pareil (thème et TV en texte, avatars en JSON)', () => {
  const s = store(); page.ctx.localStorage = s;
  s.setItem('bureau:skin', 'classique'); s.setItem('bureau:tv', '1'); s.setItem('bureau:avatars', '{"p_x":{"hair":2}}');
  assert.equal(J(`prefStr('skin',null)`), 'classique');
  assert.equal(J(`prefStr('tv','')==='1'`), true);
  assert.deepEqual(J(`pref('avatars',{})`), {p_x: {hair: 2}});
});

test('stockage refusé ou JSON abîmé : la valeur par défaut, aucune erreur', () => {
  page.ctx.localStorage = {getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('x'); }};
  assert.deepEqual(J(`pref('collapsed',{})`), {});
  assert.equal(J(`prefStr('skin','x')`), 'x');
  assert.doesNotThrow(() => run(`setPref('tv','1');dropPref('tv')`));
  const s = store(); page.ctx.localStorage = s; s.setItem('bureau:decided', '{pas du json');
  assert.deepEqual(J(`pref('decided',{})`), {});
});

test('plus aucune lecture ni écriture directe de localStorage hors de 00-prefs.js (sauf le sondage des todos)', () => {
  const dir = path.join(__dirname, '..', 'page', 'src');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== '00-prefs.js')) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l) && !l.includes('bureau:probe')).join('\n');
    assert.doesNotMatch(code, /localStorage\.(getItem|setItem|removeItem)/, f);
  }
});
