// ---------- icônes pixel du plan (audit UX 8.2) ----------
// Les emojis du système changent d'un OS à l'autre (Apple, Noto, Segoe) et jurent avec le pixel art : dans les toiles, chaque
// emoji de PIX_ICONS est dessiné en icône de 12 × 12 (1 px d'icône = 1 px de toile ; ×2 à partir d'une police de 24 px, ×½ sous 9 px).
// fillText et measureText de CanvasRenderingContext2D sont enveloppés une fois : une chaîne sans ces emojis passe telle quelle ;
// avec, l'icône prend la place de l'emoji, centrée dans sa largeur d'origine (la mise en page ne bouge pas). emo() (46-themes.js)
// en profite aussi. Le panneau (HTML) garde ses emojis. ✓ ✗ et les flèches restent du texte : la police les rend nettement.
const PIX_PAL={"k":"#1c1f26","w":"#f4efe4","W":"#ffffff","g":"#a7adb8","G":"#5f6672","r":ST_VIF.err,"R":ST_FONCE.err,"y":"#f2c94c","o":ST_VIF.warn,"O":"#a8701a","b":ST_VIF.info,"B":"#2f4f9a","n":ST_VIF.ok,"N":ST_FONCE.ok,"t":"#d6a868","T":"#8a5a30","s":"#f2c9a0","S":"#c98f62","c":"#8fdcf0","p":"#f2a0b4","P":"#c86a86","q":"#ffd6e0"};
const PIX_ICONS={
  '✋':[ // t'attend, ta décision : quatre doigts fins de hauteurs différentes et un pouce écarté (plus de moufle)
    '......k.....','....kkskk...','...kskskskk.','...ksksksksk','...ksksksksk','.kkksksksksk','ksskssssssSk','.kssssssssSk','..ksssssssSk','..ksssssssSk','...kssssSSk.','....kkkkkk..'],
  '⏱':[ // relevé, durée
    '....kkkk....','.....kk.....','...kkkkkk.k.','..kwwwwwwkk.','.kwwwkwwwwk.','.kwwwkwwwwk.','.kwwwkkwwwk.','.kwwwwwwwwk.','.kwwwwwwwwk.','..kwwwwwwk..','...kkkkkk...','............'],
  '🧯':[ // poste en panne
    '....kkk.....','...kGGGkkk..','....kGk..k..','...kRRRk..k.','..kRrrrRk.k.','..krrwrrk.k.','..krrwrrkk..','..krrrrrk...','..krrrrrk...','..krrrrrk...','..kRRRRRk...','...kkkkk....'],
  '📦':[ // carton, entrepôt
    '............','..kkkkkkkk..','.ktttyyttTk.','kttttyytttTk','kkkkkkkkkkkk','ktttTyytttTk','ktttTyytttTk','ktttTyytttTk','ktttTwwttTTk','ktttTwwtTTTk','kTTTTTTTTTTk','.kkkkkkkkkk.'],
  '📤':[ // sortie, postées
    '.....kk.....','....knnk....','...knnnnk...','..kkknnkkk..','....knnk....','....knnk....','kkk.kkkk.kkk','kgk......kgk','kgkkkkkkkkgk','kgggggggggGk','kGGGGGGGGGGk','.kkkkkkkkkk.'],
  '📥':[ // appel à prendre
    '....knnk....','....knnk....','....knnk....','..kkknnkkk..','...knnnnk...','....knnk....','kkk..kk..kkk','kgk......kgk','kgkkkkkkkkgk','kgggggggggGk','kGGGGGGGGGGk','.kkkkkkkkkk.'],
  '🔒':[ // sécurité
    '....kkkk....','...kggggk...','..kgk..kgk..','..kgk..kgk..','..kgk..kgk..','.kkkkkkkkkk.','.kyyyyyyyOk.','.kyyykkyyOk.','.kyyykkyyOk.','.kyyyykyyOk.','.kOOOOOOOOk.','..kkkkkkkk..'],
  '🧪':[ // tests
    '...kkkkkk...','....kwwk....','....kwwk....','....kwwk....','....kwwk....','...kwwwwk...','...knnnnk...','..knnwnnnk..','..knnnnnnk..','..knNnnnNk..','...kNNNNk...','....kkkk....'],
  '👀':[ // relecture
    '............','.kkkk..kkkk.','kwwwwkkwwwwk','kwwwwkkwwwwk','kwbWbkkwbWbk','kwbkkkkwbkkk','kwbkkkkwbkkk','kwbbbkkwbbbk','kwwwwkkwwwwk','.kkkk..kkkk.','............','............'],
  '💬':[ // réponse, commentaire
    '............','..kkkkkkkk..','.kwwwwwwwwk.','kwwwwwwwwwwk','kwkkwkkwkkwk','kwwwwwwwwwwk','kwwwwwwwwwwk','.kwwwwwwwwk.','..kkwkkkkk..','...kwk......','...kk.......','............'],
  '📋':[ // plan, interventions
    '....kkkk....','.kkkkggkkkk.','.kTTkkkkTTk.','.kTwwwwwwTk.','.kTwkkkkwTk.','.kTwwwwwwTk.','.kTwkkkwwTk.','.kTwwwwwwTk.','.kTwkkkkwTk.','.kTwwwwwwTk.','.kTTTTTTTTk.','.kkkkkkkkkk.'],
  '✏':[ // fichiers modifiés
    '........kk..','.......krRk.','......kgkRk.','.....kykgk..','....kyyyk...','...kyyOk....','..kyyOk.....','.kyyOk......','.ktOk.......','.ktkk.......','.kk.........','............'],
  '⚡':[ // perf
    '......kkkk..','.....kyyyk..','....kyyyk...','...kyyyk....','..kyyyykkk..','.kyyyyyyyk..','.kkkkyyyk...','....kyyk....','...kyyk.....','...kyk......','..kyk.......','..kk........'],
  '🎯':[ // besoin
    '...kkkkkk...','..krrrrrrk..','.krrwwwwrrk.','krrwrrrrwrrk','krwrrwwrrwrk','krwrwkkwrwrk','krwrwkkwrwrk','krwrrwwrrwrk','krrwrrrrwrrk','.krrwwwwrrk.','..krrrrrrk..','...kkkkkk...'],
  '📏':[ // règles
    '............','............','............','kkkkkkkkkkkk','kyyyyyyyyyyk','kykykykykyOk','kykyyykyyyOk','kyyyyyyyyyOk','kOOOOOOOOOOk','kkkkkkkkkkkk','............','............'],
  '🔍':[ // lecture, loupe
    '..kkkkk.....','.kcccwwk....','kccccwcck...','kcccccccck..','kcccccccck..','kcccccccck..','.kcccccck...','..kkkkkkGk..','.......kGGk.','........kGGk','.........kGk','..........k.'],
  '🔎':[ // enquête
    '..kkkkk.....','.kcccwwk....','kccccwcck...','kcccccccck..','kcccccccck..','kcccccccck..','.kcccccck...','..kkkkkkGk..','.......kGGk.','........kGGk','.........kGk','..........k.'],
  '🛠':[ // correction
    'kkkk.....kk.','kGgGk...kgGk','kkgkk..kgk..','..kTk.kgk...','...kTkgk....','....kTk.....','...kgkTk....','..kgk.kTk...','.kgGk..kTk..','kgGk....kTk.','kGk......kk.','.k..........'],
  '🗂':[ // Kanban des fils
    '............','.kkk.kkk.kkk','.kbk.kok.knk','kkkkkkkkkkkk','kooooooooOOk','kowwwwwwwwOk','kowkkkkkkwOk','kowwwwwwwwOk','kowkkkkwwwOk','kowwwwwwwwOk','kOOOOOOOOOOk','kkkkkkkkkkkk'],
  '📚':[ // dépôts, docs
    '............','.kkk........','.krk.kkk....','.krk.kbkkkk.','.kRkkkbknnk.','.krkokbknnk.','.kRkokbkNnk.','.krkokBknnk.','.krkOkbknNk.','.kRkokbknnk.','kkkkkkkkkkkk','kTTTTTTTTTTk'],
  '✍':[ // rédaction
    '..........Rr','.........Oyk','kkkkkkkkOyk.','kwwwwwwOyk..','kwggggOyk...','kwwwwkykk...','kwgggggwk...','kwwwwtkwk...','kwwbwkwwk...','kwbwbwwwk...','kwwwwwwwk...','kkkkkkkkk...'],
  '🎫':[ // ticket Jira
    '............','............','kkkkkkkkkkkk','kooooowoooOk','.koooowoooOk','..kooowoOOk.','..kooowoOOk.','.koooowoooOk','kooooowoooOk','kkkkkkkkkkkk','............','............'],
  '📌':[ // intention épinglée
    '....kkkk....','...krrwrk...','...krrrRk...','....krRk....','...krrrRk...','..krrrrrRk..','..kkkkkkkk..','.....kk.....','.....kg.....','.....kg.....','.....k......','............'],
  '🗺':[ // contexte
    '............','kkkkk...kkkk','knnnkkkkknnn','knnnktttkrnn','knnnknntrWrn','knnnknntwrnn','knnnknwtkRnn','knnwkwntknnn','knwnktttknnn','knnnktttknnn','kkkkktttkkkk','....kkkkk...'],
  '🤖':[ // remplaçant
    '.....kk.....','.....rk.....','.....kk.....','.kkkkkkkkkk.','kggggggggggk','kgkkkggkkkgk','kgkcckkcckgk','kgkkkggkkkgk','kggggggggggk','kgggkkkkgggk','kGGGGGGGGGGk','.kkkkkkkkkk.'],
  '🧐':[ // critique
    '.kkkkkkkkkk.','.kwwwwwwwwk.','.kwggggggwk.','.kwwwwwwwwk.','.kwrrrrggwk.','.kwwwwwwwwk.','.kwggggggwk.','.kwwwwwrwrk.','.kwgggggrwk.','.kwrwwwrwrk.','.krwwwwwwwk.','.kkkkkkkkkk.'],
  '🪑':[ // salle d'attente
    '..kkkkkkk...','..ktttttk...','..kTkkkTk...','..ktttttk...','..kTkkkTk...','..ktttttk...','..kkkkkkkkk.','..kttttttTk.','..kkkkkkkkk.','..kTk...kTk.','..kTk...kTk.','..kkk...kkk.'],
  '🚨':[ // alerte, incident
    '.k...kk...k.','..k......k..','....kkkk....','...krwrrk...','..krwrrrRk..','..krwrrrRk..','..krrrrrRk..','..krrrrrRk..','.kkkkkkkkkk.','.kgggggggGk.','.kkkkkkkkkk.','............'],
  '🌙':[ // la garde dort
    '....kkkk....','..kkyyyk....','.kyyyyk.....','.kyyyk......','kyyyyk......','kyyyyk......','kyyyyk......','kyyyyyk.....','.kyyyyykkkk.','.kOyyyyyyyk.','..kkOOOOkk..','....kkkk....'],
  '📟':[ // bipeur, appel
    '............','.kkkkkkkkkk.','kGGGGGGGGGGk','kGkkkkkkkkGk','kGknnNnnnkGk','kGknNnnNnkGk','kGkkkkkkkkGk','kGGGGGGGGGGk','kGgGgGrGgGGk','kGGGGGGGGGGk','.kkkkkkkkkk.','............'],
  '📣':[ // annonce
    '.........kk.','.......kkrk.','.....kkrrrk.','.kkkkrrrrrk.','kwwkrrrrrrk.','kwwkrrrrrrk.','kwwkrrrrrrk.','.kkkkRrrrrk.','...kTkkRrrk.','...kTk.kkRk.','...kkk...kk.','............'],
  '🏷':[ // étiquette
    '............','.kkkkkk.....','.kttttTk....','.ktkktttk...','.ktkktttTk..','.kttttttttk.','.kttttttttTk','..kTtttttTk.','...kTtttTk..','....kTtTk...','.....kTk....','......k.....'],
  '🧩':[ // cause
    '............','...kkk......','..kbbbk.....','kkkbbbkkkk..','kbbbbbbbbk..','kbbbbbbbbkk.','kbbbbbbbbbbk','kbbbbbbbbbbk','kbbbbbbbbkk.','kbbbbbbbbk..','kBBBBBBBBk..','kkkkkkkkkk..'],
  '✉':[ // courrier
    '............','............','kkkkkkkkkkkk','kwkwwwwwwkwk','kwwkwwwwkwwk','kwwwkwwkwwwk','kwwwwkkwwwwk','kwwwwwwwwwwk','kwwwwwwwwwwk','kkkkkkkkkkkk','............','............'],
  '🔧':[ // en cours (Kanban)
    '.......kkk..','......kgk.k.','......kgkkgk','......kgggGk','.....kgggGk.','....kgGkkk..','...kgGk.....','..kgGk......','.kgGk.......','kgGk........','kGk.........','.k..........'],
  '📗':[ // fait (Kanban)
    '............','.kkkkkkkkk..','knnnnnnnnNk.','knwwwwwwnNk.','knnnnnnnnNk.','knnnnnnnnNk.','knnnnnnnnNk.','knnnnnnnnNk.','knnnnnnnnNk.','kNNNNNNNNNk.','kwwwwwwwwwk.','.kkkkkkkkk..'],
  '🧠':[ // la mémoire du soir : leçons à valider (49-marchand.js)
    '............','..kkkk.kkk..','.kqppkkppqk.','kqpPppkpPppk','kpPpPpkpPpPk','kppPppkppPpk','kpPpPpkpPppk','.kppPpkpPpk.','..kkppkppkk.','....kkkkk...','......kPk...','......kk....'],
  '🧻':[ // toilettes
    '............','...kkkkkk...','..kwwwwwwk..','.kwwkkwwwwk.','.kwkggkwwwk.','.kwkggkwwwk.','.kwwkkwwwwk.','.kwwwwwwwwk.','.kwwwwwwwwk.','.kwwwwwwwwwk','..kkkkkkkkkk','............'],
};
const PIX_IMG={};
function pixIcon(k){
  if(PIX_IMG[k])return PIX_IMG[k];
  const c=document.createElement('canvas');c.width=c.height=12;const g=c.getContext('2d');
  PIX_ICONS[k].forEach((r,y)=>{for(let x=0;x<12;x++)if(r[x]!=='.'){g.fillStyle=PIX_PAL[r[x]];g.fillRect(x,y,1,1);}});
  return PIX_IMG[k]=c;
}
const PIX_RX=new RegExp('('+Object.keys(PIX_ICONS).join('|')+')️?','gu');
const pixHas=s=>{PIX_RX.lastIndex=0;return PIX_RX.test(s);};
// la chaîne en morceaux : du texte, ou {ic, src} (l'emoji d'origine, pour garder sa largeur)
function pixParts(s){const out=[];let last=0;PIX_RX.lastIndex=0;
  for(const m of s.matchAll(PIX_RX)){if(m.index>last)out.push(s.slice(last,m.index));out.push({ic:m[1],src:m[0]});last=m.index+m[0].length;}
  if(last<s.length)out.push(s.slice(last));return out;}
const pixFont=g=>{const m=/(\d+(?:\.\d+)?)px/.exec(g.font);return m?+m[1]:12;};
const pixSize=px=>px<9?6:px>=24?24:12;
(()=>{
  if(typeof CanvasRenderingContext2D==='undefined')return; // tests sans navigateur
  const P=CanvasRenderingContext2D.prototype, ft=P.fillText, mt=P.measureText;
  const width=(g,ps)=>ps.reduce((w,p)=>w+(typeof p==='string'?mt.call(g,p).width:Math.max(mt.call(g,p.src).width,pixSize(pixFont(g)))),0);
  P.measureText=function(t){const s=String(t);if(!pixHas(s))return mt.call(this,t);
    const m=mt.call(this,s), w=width(this,pixParts(s));
    return {width:w,actualBoundingBoxLeft:0,actualBoundingBoxRight:w,actualBoundingBoxAscent:m.actualBoundingBoxAscent,actualBoundingBoxDescent:m.actualBoundingBoxDescent,
      fontBoundingBoxAscent:m.fontBoundingBoxAscent,fontBoundingBoxDescent:m.fontBoundingBoxDescent};};
  P.fillText=function(t,x,y,mw){const s=String(t);if(!pixHas(s))return ft.call(this,t,x,y,mw);
    const ps=pixParts(s), w=width(this,ps), al=this.textAlign, bl=this.textBaseline, px=pixFont(this), d=pixSize(px);
    let cx=al==='center'?x-w/2:al==='right'||al==='end'?x-w:x;
    // milieu de la ligne de texte, selon la ligne de base
    const cy=bl==='middle'?y:bl==='top'||bl==='hanging'?y+px*.5:bl==='bottom'||bl==='ideographic'?y-px*.5:y-px*.36;
    const sm=this.imageSmoothingEnabled;this.textAlign='left';this.imageSmoothingEnabled=false;
    for(const p of ps){
      if(typeof p==='string'){ft.call(this,p,cx,y);cx+=mt.call(this,p).width;continue;}
      const aw=Math.max(mt.call(this,p.src).width,d);this.drawImage(pixIcon(p.ic),Math.round(cx+(aw-d)/2),Math.round(cy-d/2),d,d);cx+=aw;}
    this.textAlign=al;this.imageSmoothingEnabled=sm;};
})();
