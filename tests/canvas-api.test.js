// Les appels au canvas de la page (ctx.xxx) : seulement des membres de CanvasRenderingContext2D. Le bouchon des tests
// (helpers/page.js) accepte n'importe quel nom ; un remplacement de texte qui mord un nom (ctx.stroke devenu
// ctx.etatroke, #164) passe les tests et casse l'étage dans le navigateur.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CANVAS = new Set(('arc arcTo beginPath bezierCurveTo canvas clearRect clip closePath createConicGradient createImageData '
  + 'createLinearGradient createPattern createRadialGradient direction drawFocusIfNeeded drawImage ellipse fill fillRect '
  + 'fillStyle fillText filter font fontKerning getImageData getLineDash getTransform globalAlpha globalCompositeOperation '
  + 'imageSmoothingEnabled imageSmoothingQuality isPointInPath isPointInStroke letterSpacing lineCap lineDashOffset lineJoin '
  + 'lineTo lineWidth measureText miterLimit moveTo putImageData quadraticCurveTo rect reset resetTransform restore rotate '
  + 'roundRect save scale setLineDash setTransform shadowBlur shadowColor shadowOffsetX shadowOffsetY stroke strokeRect '
  + 'strokeStyle strokeText textAlign textBaseline transform translate wordSpacing').split(' '));

test('ctx.xxx : des membres du canvas 2D, dans chaque fichier de la page', () => {
  const dir = path.join(__dirname, '..', 'page', 'src'), bad = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\bctx\.([A-Za-z]+)/g)) if (!CANVAS.has(m[1])) bad.push(f + ' : ctx.' + m[1]);
  }
  assert.deepEqual(bad, []);
});
