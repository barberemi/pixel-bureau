// Thème d'interface (theme-*.css, sur l'habillage commun pixel.css) : classique (sombre, celui du dépôt), puis ceux du
// pack d'équipe. Le choix de la personne, gardé dans ce navigateur (bureau:skin), passe avant celui de l'installation (ui.skin,
// posé par le profil d'équipe à l'installation).
const UI_SKINS={classique:'Classique',...(CFG.skins||{})}; // thèmes de page/src/ et du pack d'équipe (assemble.themes)
const skinChoice=()=>Object.keys(UI_SKINS).length>1; // bouton 🎨 : seulement s'il y a un autre thème (celui du pack)
function skinFor(stored,cfgSkin){return UI_SKINS[stored]?stored:UI_SKINS[cfgSkin]?cfgSkin:'classique';}
let UI_SKIN=(()=>{let s=null;try{s=localStorage.getItem('bureau:skin');}catch(e){}return skinFor(s,(CFG.ui||{}).skin);})();
function applySkin(s,remember=false){
  UI_SKIN=skinFor(s);
  if(remember)try{localStorage.setItem('bureau:skin',UI_SKIN);}catch(e){}
  const root=document.documentElement;
  root.dataset.skin=UI_SKIN; // tous les thèmes sont pixel : l'attribut active pixel.css et les couleurs du thème
  const b=document.getElementById('skinbtn');
  if(b){b.textContent='🎨 '+UI_SKINS[UI_SKIN];b.title='Thème de la page : '+UI_SKINS[UI_SKIN]+' (cliquer pour changer)';
    b.style.display=skinChoice()?'':'none';}
}
applySkin(UI_SKIN);
document.getElementById('skinbtn')?.addEventListener('click',()=>{const ids=Object.keys(UI_SKINS);applySkin(ids[(ids.indexOf(UI_SKIN)+1)%ids.length],true);});
