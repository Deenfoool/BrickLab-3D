import { mountPartsLibrary, LIBRARY_KEYS } from '../ldraw/library-view-v1.js?v=parts-library-20260912-v3'
import { libraryItems } from '../ldraw/library-model-v1.js?v=parts-library-20260912-v3'
const fixtures=[
  ['3001','Brick 2 x 4','Brick'],['3020','Plate 2 x 4','Plate'],['3068b','Tile 2 x 2','Tile'],
  ['32073','Technic Axle 5','Technic'],['3708','Technic Axle 12','Technic'],['3894','Technic Brick 1 x 6 with Holes','Technic'],
  ['32523','Technic Liftarm 1 x 3 Thick','Technic'],['32316','Technic Liftarm 1 x 5 Thick','Technic'],['2780','Technic Pin with Friction','Technic'],['3673','Technic Pin without Friction','Technic'],
  ['3648','Technic Gear 24 Tooth','Technic'],['3647','Technic Gear 8 Tooth','Technic'],['32270','Technic Gear 12 Tooth Double Bevel','Technic'],
  ['6578','Tyre 30.4 x 14','Tyre'],['2994','Wheel 20 x 12','Wheel'],['6579','Tyre 43.2 x 28','Tyre'],['6580a','Wheel 22 x 24','Wheel'],
  ['3437','Duplo Brick 2 x 2','Duplo'],['53401','Electric Motor Power Functions M','Electric'],['53400','Train Track Straight','Train'],
  ['32553','Bionicle Head','Constraction'],['73590a','Hose Flexible','Hose'],
].map(([code,description,category])=>({code,file:`${code}.dat`,description,category}))
const storage={getItem:key=>localStorage.getItem(`qa.${key}`),setItem:(key,value)=>localStorage.setItem(`qa.${key}`,value)}
const root=document.getElementById('ldrawCatalogV3'),panel=root.parentElement,log=document.getElementById('qa-log')
let view,project=[]
function mount(){
  view=mountPartsLibrary(root,{storage,language:()=>document.documentElement.lang,
    insert:async item=>{project.push(item.key);log.textContent=`Insertion callback: ${item.key}\n${project.length} QA placement(s)`;return true},
    preview:item=>`https://www.ldraw.org/library/official/images/parts/${item.code}.png`,
    context:()=>({project,compatible:['ldraw-2994']}),
    onClose:()=>document.getElementById('qa-toggle').click(),
  });view.setItems(libraryItems(fixtures,[]))
}
document.getElementById('qa-toggle').onclick=()=>{panel.classList.toggle('panel-hidden');document.getElementById('qa-toggle').textContent=panel.classList.contains('panel-hidden')?'Open library':'Close library';if(!panel.classList.contains('panel-hidden'))view.refresh()}
document.getElementById('qa-reset').onclick=()=>{view.destroy();for(const key of Object.values(LIBRARY_KEYS))localStorage.removeItem(`qa.${key}`);mount()}
document.getElementById('qa-language').onclick=()=>{document.documentElement.lang=document.documentElement.lang==='en'?'ru':'en';view.languageChanged()}
mount()
