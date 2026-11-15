// Minuit du jour (heure du bureau, rhythm.timezone) : juste dans tout fuseau, à l'ouest de l'UTC aussi (New York, Los
// Angeles), et les jours de changement d'heure (Europe le 29 mars, États-Unis les 8 mars et 1er novembre 2026).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./helpers/page.js');

const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bureau.config.json'), 'utf8'));
const wall = (tz, ms) => new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(ms)); // h23 : certains ICU écrivent minuit « 24:00 » avec hour12 false

test('minuit du jour dans tout fuseau, jours de changement d\'heure compris', () => {
  const cases = {
    'America/New_York': [['2026-11-13T03:30:00Z', '2026-11-12'], ['2026-11-13T23:30:00Z', '2026-11-13'], ['2026-03-08T12:00:00Z', '2026-03-08'], ['2026-11-01T12:00:00Z', '2026-11-01']],
    'America/Los_Angeles': [['2026-11-13T03:30:00Z', '2026-11-12']],
    'Europe/Paris': [['2026-11-13T23:30:00Z', '2026-11-14'], ['2026-03-29T12:00:00Z', '2026-03-29'], ['2026-10-25T12:00:00Z', '2026-10-25']],
    'Asia/Kolkata': [['2026-11-13T23:30:00Z', '2026-11-14']],
  };
  for (const [tz, list] of Object.entries(cases)) {
    const p = load({config: {...BASE, rhythm: {...(BASE.rhythm || {}), timezone: tz}}});
    for (const [iso, day] of list) assert.equal(wall(tz, p.run(`parisMidnight(Date.parse('${iso}'))`)), `${day}, 00:00`, `${tz} ${iso}`);
  }
});
