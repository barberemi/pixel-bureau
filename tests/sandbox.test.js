// La page vit dans un iframe sandbox="allow-scripts" (sans allow-forms) sous la CSP de Kronn (connect-src 'none',
// form-action 'none', img-src data: blob:) : ce qui y est bloqué ne doit pas entrer dans le code (#110 : un <form> rendait
// le « ＋ » de Mes todos muet dans Kronn). Le comportement réel, lui, est joué par tools/smoke.py --chrome (« sandbox Kronn »).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const dir = path.join(__dirname, '..', 'page', 'src');
const files = [path.join(__dirname, '..', 'page', 'office_template.html'),
  ...fs.readdirSync(dir).filter(f => /\.(js|html)$/.test(f)).map(f => path.join(dir, f))];
const code = f => fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'); // commentaires écartés

const BLOCKED = [
  [/<form[\s>]|type="submit"|\.onsubmit\b/, 'formulaire (pas d\'allow-forms : envoi bloqué avant submit)'],
  [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon/, 'réseau (connect-src \'none\')'],
  [/\bwindow\.open\s*\(/, 'fenêtre (pas d\'allow-popups : les liens passent par Kronn)'],
  [/new\s+(Shared)?Worker\b|importScripts/, 'worker (script-src inline seulement)'],
  [/<(img|script|link|iframe)\b[^>]*\b(src|href)\s*=\s*["']https?:/i, 'ressource externe (img-src data: blob:, rien d\'autre)'],
];

for (const [re, why] of BLOCKED) {
  test('rien de bloqué par la sandbox de Kronn : ' + why, () => {
    for (const f of files) assert.doesNotMatch(code(f), re, path.basename(f));
  });
}
