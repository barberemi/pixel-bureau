// Liens sortants (50-panel.js, #6) : seul https passe dans un href venu des données ; javascript:, data: et les autres
// schémas donnent un lien inactif (sans href). Les liens du courrier gardent message:// (48-mail.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

const page = load();
const run = page.run;
const J = code => JSON.parse(run('JSON.stringify(' + code + ')'));
const BAD = ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
  'http://exemple.org/', 'vbscript:x', '//exemple.org/', '/relatif', '', null, undefined, 42, {}];

test('safeUrl : https gardé tel quel', () => {
  for (const u of ['https://github.com/dunder/front/pull/12', 'HTTPS://exemple.org/a?b=1&c=2'])
    assert.equal(J(`safeUrl(${JSON.stringify(u)})`), u);
});

test('safeUrl : javascript:, data: et tout autre schéma écartés', () => {
  for (const u of BAD) assert.equal(J(`safeUrl(${u === undefined ? 'undefined' : JSON.stringify(u)})`), null, String(u));
});

test('hrefOf : attribut échappé pour https, rien pour un schéma refusé', () => {
  assert.equal(J(`hrefOf('https://x.example/?a="b"&c')`), 'href="https://x.example/?a=&quot;b&quot;&amp;c"');
  assert.equal(J(`hrefOf('javascript:alert(1)')`), '');
  assert.equal(J(`hrefOf('data:text/html,x')`), '');
});

test('lien du fil (extA) et ligne de PR : un schéma refusé donne un lien inactif', () => {
  const ok = J(`extA('https://github.com/x/y/pull/1', 't', 'y#1')`);
  assert.match(ok, /href="https:\/\/github\.com\/x\/y\/pull\/1"/);
  for (const u of ['javascript:alert(1)', 'data:text/html,x']) {
    const a = J(`extA(${JSON.stringify(u)}, 't', 'y#1')`);
    assert.doesNotMatch(a, /href=/);
    assert.match(a, />y#1<\/a>/); // le texte reste affiché
    assert.doesNotMatch(J(`prRowHtml({n: 7, title: 'x', url: ${JSON.stringify(u)}})`), /href=/);
  }
  assert.match(J(`prRowHtml({n: 7, title: 'x', url: 'https://github.com/x/y/pull/7'})`), /href="https:\/\/github\.com\/x\/y\/pull\/7"/);
});

test('courrier : message:// et https gardés, javascript: et data: écartés', () => {
  assert.equal(J(`safeMailUrl('message://%3Cm1%3E')`), 'message://%3Cm1%3E');
  assert.equal(J(`safeMailUrl('https://outlook.office.com/mail/')`), 'https://outlook.office.com/mail/');
  assert.equal(J(`safeMailUrl('javascript:alert(1)')`), null);
  assert.equal(J(`safeMailUrl('data:text/html,x')`), null);
});
