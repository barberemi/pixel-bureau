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
