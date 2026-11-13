// ---------- sprites ----------
// Les avatars sont assemblés ici à partir des calques LPC (LAYERS) et des recettes (RECIPES = cast.json),
// recettes surchargées par le dataset `avatars` (toute l'équipe) puis par les retouches locales.
const IMG={};
const ready=im=>!!im&&(im.complete===undefined||im.complete);
for(const k of Object.keys(SPR)){const im=new Image();im.onload=()=>renderSide();im.src=SPR[k];IMG[k]=im;}
const LIMG={}, LPX={};
let layersLoaded=false;
Promise.all(Object.entries(LAYERS.layers).map(([id,l])=>new Promise(res=>{
  const im=new Image();
  im.onload=im.onerror=()=>res();
  im.src=l.src;
  LIMG[id]=im;
}))).then(()=>{layersLoaded=true;});
function layerPx(id){
  if(id in LPX)return LPX[id];
  const im=LIMG[id]; if(!im||!im.naturalWidth)return LPX[id]=null;
  const c=document.createElement('canvas');c.width=576;c.height=384;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
  return LPX[id]=x.getImageData(0,0,576,384).data;
}
const rgbOf=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'');if(!m)return null;const n=parseInt(m[1],16);return [n>>16,n>>8&255,n&255];};
const isSet=v=>!!v&&v!=='none';
function specLayers(s){
  const sex=s.sex==='female'?'female':'male', skin=LAYERS.skin[s.skin]||(rgbOf(s.skin)?s.skin:LAYERS.skin.light), has=id=>!!LAYERS.layers[id];
  const torso=has('torso/'+s.torso+'/'+sex)?s.torso:'longsleeve/longsleeve', legs=has('legs/'+s.legs+'/'+sex)?s.legs:'pants';
  const L=[['body/'+sex,'mul',skin],['feet/'+sex,'lum',s.shoes||'#3a2a22'],['legs/'+legs+'/'+sex,'lum',s.legs_color||'#3b4a63'],['torso/'+torso+'/'+sex,'lum',s.shirt||'#8a8f99'],
    ['head/'+(sex==='female'?'female':has('head/'+s.head)?s.head:'male'),'mul',skin],['eyes','raw']];
  if(isSet(s.beard))L.push(['beard/'+s.beard,'lum',s.hair_color]);
  const hairId=h=>has('hair/'+h+'/'+sex)?'hair/'+h+'/'+sex:'hair/'+h+'/male';
  // hair_back : une autre coiffure vue de dos (des cheveux longs dans le dos sous une coupe à raie au milieu, par exemple)
  if(isSet(s.hair)&&isSet(s.hair_back)&&has(hairId(s.hair_back))){
    L.push([hairId(s.hair),'lum',s.hair_color,d=>d!=='up'],[hairId(s.hair_back),'lum',s.hair_color,d=>d==='up']);}
  else if(isSet(s.hair))L.push([hairId(s.hair),'lum',s.hair_color]);
  if(isSet(s.hat))L.push(['hat/'+s.hat,'lum',s.hat_color||'#6b4a2e']);
  if(isSet(s.glasses))L.push(['glasses/'+s.glasses,'raw']);
  return L;
}
// la direction d'une image de la planche (9 × 6 images de 64 px) : rangées 0 à 3 la marche (dos, gauche, face, droite),
// 4 le repos (dos, dos, face, face, gauche, droite), 5 les mains (de face)
const sheetDir=(col,row)=>row<4?['up','left','down','right'][row]:row===4?(col<2?'up':col<4?'down':col===4?'left':'right'):'down';
// zones d'une recette (un costume) : des zones de calques recolorées, valides seulement (calque, couleur #rrggbb)
// {layer: body|feet|legs|torso|head|eyes|beard|hair|hat, color, rows: [min, max], cols: [min, max] (pixels de l'image de
// 64 px), dirs: [up|down|left|right], every: n (une ligne sur n depuis rows[0]), flat: true (couleur pleine, sans le modelé),
// skip_arm: true (de profil, le bras reste hors de la zone)} ; la dernière zone qui convient l'emporte
const zonesOf=s=>(Array.isArray(s.zones)?s.zones:[]).filter(z=>z&&typeof z.layer==='string'&&rgbOf(z.color)).map(z=>({...z,rgb:rgbOf(z.color)}));
// de profil, le trait noir intérieur entre le bras et le buste (calque du haut) : sa colonne et le côté du bras (celui de la
// main, la peau du corps juste sous une manche, hors du pantalon), image par image. Quand le bras passe devant le ventre
// (la marche), le trait trouvé est le bord du buste : on garde celui du repos, pour que le buste ne clignote pas.
function armSeams(L){
  const find=k=>(L.find(l=>l[0].split('/')[0]===k)||[])[0], T=layerPx(find('torso')), B=layerPx(find('body')), G=layerPx(find('legs')), out={};
  if(!T||!B)return out;
  const A=(P,x,y)=>P?P[(y*576+x)*4+3]:0, V=(P,x,y)=>P[(y*576+x)*4];
  for(let row=0;row<5;row++)for(let col=0;col<9;col++){
    const dir=sheetDir(col,row);if(dir!=='left'&&dir!=='right')continue;
    const ox=col*64, oy=row*64, hx=[], xs=[];
    for(let y=42;y<50;y++)for(let x=0;x<64;x++)if(A(B,ox+x,oy+y)&&!A(T,ox+x,oy+y)&&!A(G,ox+x,oy+y)&&(A(T,ox+x,oy+y-1)||A(T,ox+x,oy+y-2)))hx.push(x);
    for(let y=37;y<48;y++)for(let x=0;x<64;x++)if(A(T,ox+x,oy+y))xs.push(x);
    if(!xs.length||!hx.length)continue;
    const cx=(Math.min(...xs)+Math.max(...xs))/2, h=hx.reduce((p,q)=>p+q,0)/hx.length, side=h>cx?1:-1, light=(x,y)=>A(T,ox+x,oy+y)&&V(T,ox+x,oy+y)>=60;
    let best=null;
    for(let y=40;y<48;y++)for(let x=1;x<63;x++)
      if(A(T,ox+x,oy+y)&&V(T,ox+x,oy+y)<60&&(light(x-1,y)||light(x+1,y))&&A(T,ox+x-1,oy+y)&&A(T,ox+x+1,oy+y)&&(h-x)*side>0&&(best===null||Math.abs(x-h)<Math.abs(best-h)))best=x;
    if(best!==null)out[col+','+row]={x:best,side};
  }
  for(const [k,sm] of Object.entries(out)){const [col,row]=k.split(',').map(Number), rest=out[(sheetDir(col,row)==='left'?4:5)+',4'];
    if(row<4&&rest&&(Math.abs(sm.x-rest.x)>4||sm.side!==rest.side))out[k]=rest;}
  return out;
}
function zoneAt(Z,kind,fx,fy,dir,seam){
  let hit=null;
  for(const z of Z){
    if(z.layer!==kind||(z.dirs&&!z.dirs.includes(dir)))continue;
    if(z.rows&&(fy<z.rows[0]||fy>z.rows[1]||(z.every>1&&(fy-z.rows[0])%z.every)))continue;
    if(z.cols&&(fx<z.cols[0]||fx>z.cols[1]))continue;
    if(z.skip_arm&&(dir==='left'||dir==='right')&&seam&&(fx-seam.x)*seam.side>=0)continue;
    hit=z;
  }
  return hit;
}
// même calcul que build_sprites.recolor : 'lum' = rampe de la couleur choisie, 'mul' = teinte de peau ; une recette avec
// des zones (ou une coiffure de dos) passe pixel par pixel par la direction de son image
function composePixels(s){
  const o=new Uint8ClampedArray(576*384*4), L=specLayers(s), Z=zonesOf(s), slow=Z.length>0||L.some(l=>l[3]);
  const seams=Z.some(z=>z.skip_arm)?armSeams(L):{};
  for(const [id,mode,col,only] of L){
    const p=layerPx(id); if(!p)continue; const t0=rgbOf(col)||[255,255,255], kind=id.split('/')[0];
    for(let i=0;i<p.length;i+=4){
      const a=p[i+3]; if(!a)continue;
      let r,g,b, t=t0, md=mode;
      if(slow){const px=(i>>2)%576, py=(i>>2)/576|0, cl=px>>6, rw=py>>6, dir=sheetDir(cl,rw);
        if(only&&!only(dir))continue;
        const z=Z.length&&zoneAt(Z,kind,px&63,py&63,dir,seams[cl+','+rw]);
        if(z){t=z.rgb;md=z.flat?'flat':'lum';}}
      if(md==='lum'){const k=.15+p[i]/255;r=t[0]*k;g=t[1]*k;b=t[2]*k;}
      else if(md==='flat'){r=t[0];g=t[1];b=t[2];}
      else if(md==='mul'){r=p[i]*t[0]/255;g=p[i+1]*t[1]/255;b=p[i+2]*t[2]/255;}
      else{r=p[i];g=p[i+1];b=p[i+2];}
      if(a===255||!o[i+3]){o[i]=r;o[i+1]=g;o[i+2]=b;o[i+3]=a;continue;}
      const sa=a/255, da=o[i+3]/255*(1-sa), na=sa+da;
      o[i]=(r*sa+o[i]*da)/na;o[i+1]=(g*sa+o[i+1]*da)/na;o[i+2]=(b*sa+o[i+2]*da)/na;o[i+3]=na*255;
    }
  }
  return o;
}
function composeSheet(s){
  const c=document.createElement('canvas');c.width=576;c.height=384;c.getContext('2d').putImageData(new ImageData(composePixels(s),576,384),0,0);return c;
}
// planches assemblées, par recette ; une file étale le travail sur plusieurs images (≈ 8 ms par image)
const SHEETS=new Map(), QUEUE=[];
let composeMs=0, composeN=0;
function sheetFor(spec){const k=JSON.stringify(spec);const c=SHEETS.get(k);if(c)return c;if(!QUEUE.includes(k))QUEUE.push(k);return null;}
function pumpSheets(budget){
  if(!layersLoaded||!QUEUE.length)return;
  const t0=performance.now();
  while(QUEUE.length&&performance.now()-t0<budget){
    const k=QUEUE.shift();
    const a=performance.now();
    SHEETS.set(k,composeSheet(JSON.parse(k)));
    composeMs+=performance.now()-a;
    composeN++;
    if(SHEETS.size>80)SHEETS.delete(SHEETS.keys().next().value);}
  if(!QUEUE.length)renderSide();
}
function lookOf(c){const base=RECIPES[c.sprite];if(!base)return null;const ov=avatarFor(c.key);return ov&&ov.look?{...base,...ov.look}:base;}
function spriteOf(c){if(!c)return null;if(SPR[c.sprite])return IMG[c.sprite];const spec=lookOf(c);return spec?sheetFor(spec):null;}

// ---------- avatars personnalisés (nom + apparence) ----------
// AV_TEAM = dataset `avatars` (enregistré pour toute l'équipe par le workflow « Le Bureau · avatars »),
// AV_LOCAL = retouches de ce navigateur, AV_DRAFT = éditeur ouvert. La plus récente (at) l'emporte.
let AV_TEAM={}, AV_LOCAL={}, AV_DRAFT=null;
try{AV_LOCAL=JSON.parse(localStorage.getItem('bureau:avatars')||'{}')||{};}catch(e){AV_LOCAL={};}
if(AV_LOCAL.boss&&!AV_LOCAL.p_remi){AV_LOCAL.p_remi=AV_LOCAL.boss;delete AV_LOCAL.boss;} // ancienne clé du boss (avant le roster)
const saveLocal=()=>{try{localStorage.setItem('bureau:avatars',JSON.stringify(AV_LOCAL));}catch(e){}};
function readAvatars(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.avatars;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&d.avatars&&typeof d.avatars==='object'?d.avatars:null;
  }catch(e){return null;}
}
function avatarFor(k){
  if(AV_DRAFT&&AV_DRAFT.k===k)return AV_DRAFT;
  const t=AV_TEAM[k], l=AV_LOCAL[k];
  if(l&&(!t||(+l.at||0)>(+t.at||0)))return l.reset?null:l;
  return t||null;
}
const localOnly=k=>{const t=AV_TEAM[k],l=AV_LOCAL[k];return !!l&&(!t||(+l.at||0)>(+t.at||0));};
function setTeamAvatars(a){
  AV_TEAM=a||{};
  for(const k of Object.keys(AV_LOCAL)){const t=AV_TEAM[k],l=AV_LOCAL[k];if(t&&(+t.at||0)>=(+l.at||0)||!t&&l.reset)delete AV_LOCAL[k];}
  saveLocal();applyNames();
}
function applyNames(){for(const c of chars){const ov=avatarFor(c.key);c.name=(ov&&ov.name)||c.baseName||c.name;}}

const DIRROW={up:0,left:1,down:2,right:3};
function frameFor(c,now){
  if(c.moving){const f=1+Math.floor(now/90)%8;return [f,DIRROW[c.dir]];}
  const p=c.pose;
  if(c.boss&&p!=='type'&&p!=='hands')return [c.dir==='up'?0:c.dir==='left'?4:c.dir==='right'?5:2,4];
  if(p==='hands'){const s=[0,1,2,1][Math.floor(now/260)%4];return [s,5];}
  if(p==='type'){if(c.dir==='left')return [4,4];if(c.dir==='right')return [5,4];return [2+(Math.floor(now/320+c.phase)%2),4];}
  if(c.dir==='up')return [Math.floor(now/900+c.phase)%2,4];
  if(c.dir==='left')return [4,4];
  if(c.dir==='right')return [5,4];
  return [2+(Math.floor(now/1100+c.phase)%2),4];
}

