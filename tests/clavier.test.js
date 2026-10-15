// Accessibilité clavier (#2) : tuiles KPI cliquables, lignes du fil et titre de la loupe sont focalisables (tabindex 0,
// role button) et s'activent par Entrée ou Espace, comme au clic.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;

test('Entrée et Espace cliquent un role=button qui n\'est pas un vrai bouton, rien d\'autre', () => {
  const press = (key, el) => {
    const ev = {key, target: el, prevented: false, preventDefault() { this.prevented = true; }};
    page.ctx.__ev = ev;
    return [run('keyClick(__ev)'), ev.prevented];
  };
  const el = (tagName, role) => { const e = {tagName, clicks: 0, getAttribute: k => (k === 'role' ? role : null), click() { e.clicks++; }}; return e; };
  const tile = el('SECTION', 'button');
  assert.deepEqual(press('Enter', tile), [true, true]);
  assert.deepEqual(press(' ', tile), [true, true], 'Espace : pas de défilement de la page');
  assert.equal(tile.clicks, 2);
  assert.deepEqual(press('Tab', tile), [false, false]);
  const link = el('A', null), btn = el('BUTTON', 'button');
  assert.deepEqual(press('Enter', link), [false, false], 'un lien de la ligne garde son comportement');
  assert.deepEqual(press('Enter', btn), [false, false], 'un vrai bouton clique déjà seul');
  assert.equal(link.clicks + btn.clicks, 0);
});

// boîte qui garde le HTML posé (le bouchon de document rend un nouvel objet à chaque getElementById)
const box = id => run(`(()=>{globalThis.__boxes=globalThis.__boxes||{};const b=__boxes['${id}']={html:'',set innerHTML(h){this.html=h;},children:[],querySelector:()=>null};
  const g0=document.getElementById;document.getElementById=x=>x==='${id}'?b:g0(x);return true;})()`);

test('tuiles « La prod aujourd\'hui » et « Les agents » : focalisables comme des boutons, pas la tuile du sprint', () => {
  box('kpis');
  run(`setMode('live');T=DAY0+11*3600e3;tick(1);KPI_SIG='';KPI_FIG=[];renderKpis();`);
  const html = run('__boxes.kpis.html');
  const tiles = html.match(/<section[^>]*>/g);
  const of = k => tiles.find(t => t.includes(`dash ${k}`)) || '';
  assert.match(of('prod'), /data-open="tv" tabindex="0" role="button"/);
  assert.match(of('agents'), /data-open="paie" tabindex="0" role="button"/);
  assert.doesNotMatch(of('sprint'), /tabindex|role=/);
});

test('fil : une ligne qui ouvre quelque chose (personne, plateau TV, canard) est un bouton ; les autres non', () => {
  box('feed');
  run(`FEED_SIG='';FEED_PIN=[{t:0,duck:true,txt:'canard'},{t:0,txt:'rien'}];
    renderFeedList([{t:DAY0+9*3600e3,c:chars[0],txt:'a'},{t:DAY0+9*3600e3,tv:true,txt:'b'},{t:DAY0+9*3600e3,txt:'c'}],[]);`);
  const evs = run('__boxes.feed.html').match(/<div class="ev[" ][^>]*>/g);
  assert.equal(evs.length, 5);
  assert.deepEqual(evs.map(t => /tabindex="0" role="button"/.test(t)), [true, false, true, true, false]);
  run('FEED_PIN=[];FEED_SIG="";');
});

test('loupe : le titre de la légende est un bouton au clavier, à côté du bouton Fermer', () => {
  run(`(()=>{const g0=document.getElementById, ce=document.createElement;globalThis.__made=[];
    document.getElementById=x=>x==='loupecv'||x==='loupefly'?null:g0(x);
    document.createElement=t=>{const e=ce(t);e.addEventListener=(k,fn)=>{e['on_'+k]=fn;};__made.push(e);return e;};
    LOUPE.cur={box:{x:0,y:0,w:64,h:40},cap:{color:'#fff',ico:'🎉',title:'Pam',sub:'fête',lead:null},until:1e9};
    try{drawLoupe(0);}finally{document.getElementById=g0;document.createElement=ce;LOUPE.cur=null;}})()`);
  const fly = run('__made.find(e=>/class="lh"/.test(e.innerHTML))');
  assert.match(fly.innerHTML, /<b role="button" tabindex="0"><\/b>/);
  assert.equal(run('__made.find(e=>/class="lh"/.test(e.innerHTML)).on_keydown===keyClick'), true);
});
