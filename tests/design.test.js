// Retouches de design (audit du 4 octobre) : badge du rejeu, tuiles à la couleur de leur alerte, tuile qui clignote.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

test('badge : en rejeu, l\'heure rejouée et celle des données', () => {
  const p = load();
  assert.match(p.run('badgeText()'), /^Instantané du /);
  p.run(`setMode('pause');T=DAY0+9.5*3600e3;`);
  assert.match(p.run('badgeText()'), /^Rejeu 09:30 · données de \d\d:\d\d$/);
});

test('tuiles : « Les agents » en rouge si un agent est en panne, en ambre s\'il y a des échecs', () => {
  const p = load();
  p.run('setMode("pause");T=DAY0+11*3600e3;tick(1);');
  const cls = () => p.run(`KPI_SIG='';renderKpis();(KPI_SIG.match(/class="dash agents click([^"]*)"/)||[])[1]`);
  p.run(`for(const c of chars)if(c._st&&c._st.st==='error')c._st={...c._st,st:'idle'};`);
  assert.match(cls(), /warn/); // la démo a des échecs, plus de panne
  p.run(`chars.find(c=>!c.person&&!c.visitor)._st={st:'error'};`);
  assert.match(cls(), /err/);
});

test('tuiles : seule celle dont un chiffre change clignote, ni au premier affichage ni quand le temps avance', () => {
  const p = load();
  p.run(`globalThis.__flash=[];
    globalThis.__box={set innerHTML(h){this.children=(h.match(/<section/g)||[]).map((_,i)=>({classList:{add:c=>__flash.push(i+':'+c)}}));}};
    const g0=document.getElementById; document.getElementById=id=>id==='kpis'?__box:g0(id);
    setMode('live');T=DAY0+11*3600e3;tick(1);KPI_SIG='';KPI_FIG=[];renderKpis();`);
  const flashes = () => JSON.parse(p.run('JSON.stringify(__flash)'));
  assert.deepEqual(flashes(), []); // premier affichage
  p.run('T+=60e3;renderKpis();'); // une minute passe : le repère du temps du sprint bouge, aucun chiffre
  assert.deepEqual(flashes(), []);
  p.run(`KPI_FIG[1]='autre';KPI_SIG='autre';renderKpis();`); // un chiffre de la 2e tuile était différent
  assert.deepEqual(flashes(), ['1:flash']);
});
