// Proposed commercial catalog. Prices are integer kopecks, never client checkout input.
// Nothing in this module enables payments. Only verified persisted grants may be used
// as input to the account projection in a future payment integration.
export const BASE_LIMITS=Object.freeze({projects:20,versions:20,storageMiB:64,requestMiB:2});
const product=(id,kind,title,priceRub,extra={})=>Object.freeze({id,kind,title,priceKopecks:priceRub*100,...extra});
export const commerceProducts=Object.freeze([
 product('slots-20','storage','+20 проектов',99,{slots:20,storageMiB:64}),
 product('slots-30','storage','+30 проектов',129,{slots:30,storageMiB:96}),
 product('slots-100','storage','+100 проектов',349,{slots:100,storageMiB:320}),
 product('supporter','badge','Supporter',49,{rank:1}),
 product('bronze-builder','badge','Bronze Builder',149,{rank:2}),
 product('silver-builder','badge','Silver Builder',299,{rank:3}),
 product('gold-builder','badge','Gold Builder',599,{rank:4}),
 product('diamond-patron','badge','Diamond Patron',999,{rank:5}),
 product('founders-club','badge','Founder’s Club',1499,{betaOnly:true}),
 product('theme-collection','themeBundle','Signature Collection',699),
 product('plus-1','subscription','BrickLab Plus · 1 месяц',249,{months:1}),
 product('plus-3','subscription','BrickLab Plus · 3 месяца',649,{months:3}),
 product('plus-12','subscription','BrickLab Plus · 12 месяцев',2490,{months:12})
]);
export const instructionTiers=Object.freeze([
 [200,2900],[500,4900],[1000,7900],[2000,12900],[4000,17900],[Number.MAX_SAFE_INTEGER,24900]
].map(Object.freeze));
export const FREE_INSTRUCTION_STEPS=10;
export function instructionPrice(partCount){
 if(!Number.isSafeInteger(partCount)||partCount<1)throw new RangeError('invalid_part_count');
 return instructionTiers.find(([max])=>partCount<=max)[1];
}
export function productById(id){return commerceProducts.find(p=>p.id===id)}
// A grant ID is the unique persisted entitlement ID, not a SKU. Repeated
// purchases of storage therefore accumulate, but replaying one grant does not.
export function projectAccount(grants=[],now=Date.now()){
 const limits={...BASE_LIMITS},seen=new Set(),badges=new Set(),instructions=new Set(),themes=new Set();
 let plus=false,plusUntil=0;
 for(const grant of grants){
  if(!grant||typeof grant.id!=='string'||!grant.id||seen.has(grant.id)||grant.revoked===true)continue;
  if(grant.expiresAt!==undefined&&(!Number.isFinite(grant.expiresAt)||grant.expiresAt<=now))continue;
  seen.add(grant.id);
  const p=productById(grant.sku);
  if(p?.kind==='storage'){limits.projects+=p.slots;limits.storageMiB+=p.storageMiB}
  if(p?.kind==='subscription'&&Number.isFinite(grant.expiresAt)){plus=true;plusUntil=Math.max(plusUntil,grant.expiresAt)}
  if(p?.kind==='badge')badges.add(p.id);
  if(grant.kind==='instruction'&&typeof grant.setId==='string'&&/^\d+-\d+$/.test(grant.setId))instructions.add(grant.setId);
  if(grant.kind==='theme'&&['carbon','neon','blueprint','titanium','ember','aurora'].includes(grant.themeId))themes.add(grant.themeId);
 }
 if(plus){limits.projects+=40;limits.storageMiB+=128;limits.versions=40}
 return {limits,plus,plusUntil,badges:[...badges],instructions:[...instructions],themes:[...themes]};
}
// During OBT access stays unchanged; after release only supported sets with
// audited interactive metadata may be locked. The PDF is never restricted.
export function canUseInteractive({account,setId,step,beta=true,supported=false}={}){
 if(beta||!supported)return true;
 return Number.isInteger(step)&&step>=1&&step<=FREE_INSTRUCTION_STEPS||account?.plus===true||account?.instructions?.includes(setId)===true;
}
