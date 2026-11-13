// Zones d'une recette d'avatar (20-sprites.js) : un costume déclaré dans cast.json (calque, lignes, colonnes, directions,
// couleur), une coiffure vue de dos (hair_back), et de profil le bras gardé hors d'une zone (skip_arm).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/page.js');

// faux calques : une planche 576 × 384 vide, et des pixels posés (image col,row ; x,y dans l'image ; gris v)
const FAKE = `(()=>{globalThis.fake=()=>new Uint8ClampedArray(576*384*4);
  globalThis.put=(P,col,row,x,y,v=200)=>{const i=((row*64+y)*576+col*64+x)*4;P[i]=P[i+1]=P[i+2]=v;P[i+3]=255;};
  globalThis.at=(P,col,row,x,y)=>{const i=((row*64+y)*576+col*64+x)*4;return [P[i],P[i+1],P[i+2],P[i+3]];};})()`;

test('zones : seules les zones valides (calque, couleur #rrggbb) comptent', () => {
  const {run} = load();
  const z = JSON.parse(run(`JSON.stringify(zonesOf({zones:[{layer:'body',color:'#8e1f22'},{layer:'body',color:'rouge'},{color:'#ffffff'},null,{layer:'legs',color:'#c4a878',rows:[50,51]}]}).map(z=>z.layer+z.color))`));
  assert.deepEqual(z, ['body#8e1f22', 'legs#c4a878']);
  assert.equal(run('zonesOf({}).length'), 0);
});

test('zones : la direction de chaque image de la planche', () => {
  const {run} = load();
  const d = JSON.parse(run('JSON.stringify([[0,0],[0,1],[0,2],[0,3],[0,4],[2,4],[4,4],[5,4],[1,5]].map(([c,r])=>sheetDir(c,r)))'));
  assert.deepEqual(d, ['up', 'left', 'down', 'right', 'up', 'down', 'left', 'right', 'down']);
});

test('zones : lignes, colonnes, directions, une ligne sur n ; la dernière qui convient l\'emporte', () => {
  const {run} = load();
  run(`var Z=zonesOf({zones:[{layer:'torso',rows:[39,47],cols:[25,38],dirs:['up','down'],color:'#f08a1c'},
    {layer:'torso',rows:[40,46],every:2,cols:[31,32],dirs:['down'],color:'#b8560e',flat:true}]})`);
  const hit = (x, y, dir) => run(`(zoneAt(Z,'torso',${x},${y},'${dir}',null)||{}).color||null`);
  assert.equal(hit(30, 40, 'down'), '#f08a1c');
  assert.equal(hit(31, 40, 'down'), '#b8560e', 'le lacet, posé après');
  assert.equal(hit(31, 41, 'down'), '#f08a1c', 'une ligne sur deux');
  assert.equal(hit(31, 40, 'up'), '#f08a1c', 'pas de lacet dans le dos');
  assert.equal(hit(24, 40, 'down'), null, 'hors des colonnes');
  assert.equal(hit(30, 48, 'down'), null, 'hors des lignes');
  assert.equal(hit(30, 40, 'left'), null, 'hors des directions');
  assert.equal(run(`zoneAt(Z,'legs',30,40,'down',null)`), null, 'un autre calque');
});

test('zones : de profil, skip_arm laisse le bras (côté de la main par rapport au trait) hors de la zone', () => {
  const {run} = load();
  run(`var Z=zonesOf({zones:[{layer:'torso',rows:[39,47],dirs:['left','right'],skip_arm:true,color:'#f08a1c'}]})`);
  const hit = (x, seam) => run(`!!zoneAt(Z,'torso',${x},42,'left',${seam})`);
  assert.equal(hit(30, '{x:37,side:1}'), true, 'le buste');
  assert.equal(hit(39, '{x:37,side:1}'), false, 'le bras, côté main');
  assert.equal(hit(37, '{x:37,side:1}'), false, 'le trait lui-même reste noir');
  assert.equal(hit(39, 'null'), true, 'sans trait trouvé : toute la ligne');
});

test('zones : le trait bras/buste trouvé de profil depuis la main, et celui du repos quand le bras passe devant', () => {
  const {run} = load();
  run(FAKE);
  // calques factices, profil gauche au repos (image 4,4) et une image de marche (3,1) : buste x 26-41, trait noir à x 37,
  // main (peau du corps sous la manche) vers x 39-40 ; en marche, un trait de plus au bord avant (x 27) et la main devant
  run(`var TT=fake(),BB=fake(),GG=fake();
    for(const [c,r] of [[4,4],[3,1]]){for(let y=37;y<48;y++)for(let x=26;x<=41;x++)put(TT,c,r,x,y,200);for(let y=40;y<46;y++)put(TT,c,r,37,y,20);}
    for(let y=40;y<46;y++)put(TT,3,1,27,y,20);
    for(const x of [39,40])put(BB,4,4,x,48);for(const x of [29,30])put(BB,3,1,x,48);
    LPX['torso/longsleeve/longsleeve/female']=TT;LPX["body/female"]=BB;LPX["legs/pants/female"]=GG;`);
  const s = JSON.parse(run(`JSON.stringify(armSeams(specLayers({sex:'female'})))`));
  assert.deepEqual(s['4,4'], {x: 37, side: 1});
  assert.deepEqual(s['3,1'], {x: 37, side: 1}, 'trait du repos : le buste ne clignote pas pendant la marche');
});

test('zones : hair_back pour les images de dos, la coiffure de face ailleurs, et les pixels recolorés', () => {
  const {run} = load();
  run(FAKE);
  run(`var HF=fake(),HB=fake(),BD=fake();put(HF,2,4,30,20);put(HF,0,4,30,20);put(HB,0,4,31,40);put(HB,2,4,31,40);put(BD,2,4,30,45,180);
    LPX['hair/curtains_long/male']=HF;LPX['hair/long_straight/male']=HB;LPX['body/female']=BD;
    LAYERS.layers['hair/curtains_long/male']=LAYERS.layers['hair/curtains_long/male']||{};LAYERS.layers['hair/long_straight/male']=LAYERS.layers['hair/long_straight/male']||{};
    var S={sex:'female',skin:'pale',hair:'curtains_long',hair_back:'long_straight',hair_color:'#141210',zones:[{layer:'body',rows:[43,50],color:'#8e1f22',flat:true}]};
    var P=composePixels(S);`);
  const px = (c, r, x, y) => JSON.parse(run(`JSON.stringify(at(P,${c},${r},${x},${y}))`));
  assert.equal(px(2, 4, 30, 20)[3], 255, 'de face : la coiffure de face');
  assert.equal(px(0, 4, 30, 20)[3], 0, 'de dos : pas la coiffure de face');
  assert.equal(px(0, 4, 31, 40)[3], 255, 'de dos : les cheveux longs');
  assert.equal(px(2, 4, 31, 40)[3], 0, 'de face : pas les cheveux de dos');
  assert.deepEqual(px(2, 4, 30, 45).slice(0, 3), [142, 31, 34], 'la main : le gant, couleur pleine');
  const L = JSON.parse(run(`JSON.stringify(specLayers({...S,hair_back:'inconnue'}).filter(l=>l[0].startsWith('hair/')).map(l=>l[0]))`));
  assert.deepEqual(L, ['hair/curtains_long/male'], 'coiffure de dos inconnue : la coiffure seule');
});
