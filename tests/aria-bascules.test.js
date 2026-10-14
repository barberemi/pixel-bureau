// État des boutons bascule exposé aux lecteurs d'écran (#4) : aria-pressed sur « ● Direct », « ▶ Rejouer »,
// « 🔍 Loupe » et le filtre du fil « Important / Tout » ; aria-expanded (et aria-controls) sur « ☀ Récap ».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
// faux bouton : garde ses attributs et sa classe on
const fake = mode => { const b = {attrs: {}, dataset: {mode}, on: false, setAttribute: (k, v) => { b.attrs[k] = v; }, classList: {toggle: (c, v) => { b.on = v; }}}; return b; };

test('Direct et Rejouer : aria-pressed suit le mode, avec la classe on', () => {
  page.ctx.__live = fake(); page.ctx.__play = fake();
  run('liveBtn.classList=__live.classList;liveBtn.setAttribute=(k,v)=>__live.setAttribute(k,v);playBtn.classList=__play.classList;playBtn.setAttribute=(k,v)=>__play.setAttribute(k,v);');
  const st = () => [page.ctx.__live.attrs['aria-pressed'], page.ctx.__play.attrs['aria-pressed'], page.ctx.__live.on, page.ctx.__play.on];
  run("setMode('play')");
  assert.deepEqual(st(), ['false', 'true', false, true]);
  run("setMode('pause')");
  assert.deepEqual(st(), ['false', 'false', false, false]);
  run("setMode('live')");
  assert.deepEqual(st(), ['true', 'false', true, false]);
});

test('Loupe : aria-pressed à chaque bascule', () => {
  page.ctx.__lb = fake();
  run(`(()=>{const g0=document.getElementById;globalThis.__g0=g0;document.getElementById=id=>id==='loupebtn'?__lb:g0(id);})()`);
  try {
    run('setLoupe(false,false)');
    assert.deepEqual([page.ctx.__lb.attrs['aria-pressed'], page.ctx.__lb.on], ['false', false]);
    run('setLoupe(true,false)');
    assert.deepEqual([page.ctx.__lb.attrs['aria-pressed'], page.ctx.__lb.on], ['true', true]);
  } finally { run('document.getElementById=__g0'); }
});

test('filtre du fil Important / Tout : un seul bouton pressé, celui du mode', () => {
  page.ctx.__seg = [fake('important'), fake('all')];
  run(`(()=>{const g0=document.getElementById;globalThis.__g0=g0;document.getElementById=id=>id==='feedmode'?{querySelectorAll:()=>__seg}:g0(id);})()`);
  try {
    for (const m of ['important', 'all']) {
      run(`FEED_MODE='${m}';FEED_SIG='';renderFeedList([],[])`);
      assert.deepEqual(page.ctx.__seg.map(b => b.attrs['aria-pressed']), m === 'important' ? ['true', 'false'] : ['false', 'true']);
      assert.deepEqual(page.ctx.__seg.map(b => b.on), m === 'important' ? [true, false] : [false, true]);
    }
  } finally { run('document.getElementById=__g0'); }
});

test('Récap : aria-expanded suit l\'ouverture de la carte', () => {
  page.ctx.__rb = fake();
  run(`(()=>{const g0=document.getElementById;globalThis.__g0=g0;
    document.getElementById=id=>id==='recapbtn'?__rb:id==='recap'?{hidden:true,innerHTML:''}:g0(id);})()`);
  try {
    run('RECAP_OPEN=true;RECAP_SIG="";renderRecap()');
    assert.equal(page.ctx.__rb.attrs['aria-expanded'], 'true');
    run('RECAP_OPEN=false;renderRecap()');
    assert.equal(page.ctx.__rb.attrs['aria-expanded'], 'false');
  } finally { run('document.getElementById=__g0'); }
});

test('squelette : état de départ des bascules et Récap relié à sa carte', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'page', 'office_template.html'), 'utf8');
  assert.match(html, /id="recapbtn" aria-expanded="false" aria-controls="recap"/);
  assert.match(html, /<section class="card recap" id="recap" hidden>/);
  assert.match(html, /id="live" class="on" aria-pressed="true"/);
  assert.match(html, /id="play" aria-pressed="false"/);
  assert.match(html, /id="loupebtn" class="on" aria-pressed="true"/);
  assert.match(html, /data-mode="important" aria-pressed="false">Important<\/button><button data-mode="all" aria-pressed="false">Tout/);
});
