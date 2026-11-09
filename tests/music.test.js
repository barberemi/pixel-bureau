// Carte « Son écoute » : Kronn pose le lecteur Suno par-dessus le bloc texte, à partir de l'URL complète du lecteur.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;

test('le bloc porte l’URL du lecteur Suno (contrat data-kronn-embed de Kronn), jamais l’ancien couple fournisseur/id', () => {
  const html = run(`(() => {
    const children = [];
    const fold = foldSection;
    foldSection = () => ({appendChild: el => children.push(el)});
    MUSIC.zz = {title: 'Été 🦀', url: 'https://suno.com/song/abc', suno_id: '08fca036-317a-4cd5-9860-166c62c0180f'};
    try { musicCard({}, {key: 'zz'}); } finally { foldSection = fold; delete MUSIC.zz; }
    return children[0].innerHTML;
  })()`);
  assert.match(html, /data-kronn-embed="https:\/\/suno\.com\/embed\/08fca036-317a-4cd5-9860-166c62c0180f"/);
  assert.doesNotMatch(html, /data-kronn-embed-id|data-kronn-embed="suno"/);
  assert.match(html, /mt-embed/);
});

test('sans morceau Suno, pas de lecteur : le lien vers la page du morceau reste seul', () => {
  const html = run(`(() => {
    const children = [];
    const fold = foldSection;
    foldSection = () => ({appendChild: el => children.push(el)});
    MUSIC.zz = {title: 'Sans Suno', url: 'https://example.com/x'};
    try { musicCard({}, {key: 'zz'}); } finally { foldSection = fold; delete MUSIC.zz; }
    return children[0].innerHTML;
  })()`);
  assert.doesNotMatch(html, /data-kronn-embed/);
  assert.match(html, /mplay/);
});

test('pochette : seule une image en data URI est affichée, jamais un attribut glissé par le pack', () => {
  const card = cover => run(`(() => {
    const children = [];
    const fold = foldSection;
    foldSection = () => ({appendChild: el => children.push(el)});
    MUSIC.x = {title: 'Piège', url: 'https://example.com/x', cover: ${JSON.stringify(cover)}};
    try { musicCard({}, {key: 'x'}); } finally { foldSection = fold; delete MUSIC.x; }
    return children[0].innerHTML;
  })()`);
  for (const bad of ['x" onerror="globalThis.P=1', 'javascript:globalThis.P=1', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA" onerror="globalThis.P=1']) {
    const html = card(bad);
    assert.doesNotMatch(html, /<img/i, bad);
    assert.doesNotMatch(html, /onerror/, bad);
  }
  assert.equal(run('typeof globalThis.P'), 'undefined');
  assert.match(card('data:image/jpeg;base64,/9j/4AAQ+Zw=='), /<img src="data:image\/jpeg;base64,\/9j\/4AAQ\+Zw==" alt="">/);
});
