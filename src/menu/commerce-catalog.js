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
 [600,0],[1000,7900],[2000,12900],[4000,17900],[Number.MAX_SAFE_INTEGER,24900]
].map(Object.freeze));
export const FREE_INSTRUCTION_STEPS=10;
export const themePrices=Object.freeze({carbon:9900,neon:14900,blueprint:12900,titanium:17900,ember:19900,aurora:19900});
export const PLUS_DISCOUNT_PERCENT=10;
export function instructionPrice(partCount){
 if(!Number.isSafeInteger(partCount)||partCount<1)throw new RangeError('invalid_part_count');
 return instructionTiers.find(([max])=>partCount<=max)[1];
}
export const MIN_PAID_INSTRUCTION_PARTS=601;
export function instructionProduct(setId,title,partCount){
 if(typeof setId!=='string'||!/^\d{3,7}-\d{1,2}$/.test(setId)||typeof title!=='string'||!title.trim()||!Number.isSafeInteger(partCount)||partCount<MIN_PAID_INSTRUCTION_PARTS)return null;
 return Object.freeze({id:'instruction-'+setId,kind:'instruction',setId,title:title.trim().slice(0,150),partCount,priceKopecks:instructionPrice(partCount)});
}
// Initial inventory: indexed BrickLab sets; advertised piece counts from official LEGO set pages.
// Future audited sets can supply their own trusted metadata without changing this list.
export const indexedInstructionProducts=Object.freeze([
 ['10300-1','Back to the Future Time Machine',1872],['10307-1','Eiffel Tower',10001],
 ['10316-1','Rivendell',6167],['42143-1','Ferrari Daytona SP3',3778],
 ['42154-1','Ford GT',1468],['42171-1','Mercedes-AMG F1 W14',1643],
 ['42206-1','Oracle Red Bull Racing RB20 F1',1639],['42210-1','Nissan Skyline GT-R (R34)',1410],
 ['42215-1','Volvo EC500 Hybrid Excavator',2359],['42222-1','Bugatti Chiron Pur Sport',771],
 ['42223-1','1966 Ford GT40 MKII',793],['75313-1','AT-AT',6785],['76419-1','Hogwarts Castle and Grounds',2660]
].map(args=>instructionProduct(...args)));
export function productById(id){return commerceProducts.find(p=>p.id===id)}
// A grant ID is the unique persisted entitlement ID, not a SKU. Repeated
// purchases of storage therefore accumulate, but replaying one grant does not.
export function projectAccount(grants=[],now=Date.now()){
 const limits={...BASE_LIMITS},seen=new Set(),badges=new Set(),instructions=new Set(),themes=new Set();
 let plus=false,plusUntil=0;const future=[];
 for(const grant of grants){
  if(!grant||typeof grant.id!=='string'||!grant.id||seen.has(grant.id)||grant.revoked===true)continue;
  if(grant.expiresAt!==undefined&&(!Number.isFinite(grant.expiresAt)||grant.expiresAt<=now))continue;
  seen.add(grant.id);
  const p=productById(grant.sku);
  if(Number.isFinite(grant.grantedAt)&&grant.grantedAt>now){if(p?.kind==='subscription'&&Number.isFinite(grant.expiresAt))future.push(grant);continue;}
  if(p?.kind==='storage'){limits.projects+=p.slots;limits.storageMiB+=p.storageMiB}
  if(p?.kind==='subscription'&&Number.isFinite(grant.expiresAt)){plus=true;plusUntil=Math.max(plusUntil,grant.expiresAt)}
  if(p?.kind==='badge')badges.add(p.id);
  if(p?.kind==='themeBundle')for(const themeId of Object.keys(themePrices))themes.add(themeId);
  if(grant.kind==='instruction'&&typeof grant.setId==='string'&&/^\d+-\d+$/.test(grant.setId))instructions.add(grant.setId);
  if(grant.kind==='theme'&&['carbon','neon','blueprint','titanium','ember','aurora'].includes(grant.themeId))themes.add(grant.themeId);
 }
 if(plus){for(const g of future.sort((a,b)=>a.grantedAt-b.grantedAt))if(g.grantedAt<=plusUntil)plusUntil=Math.max(plusUntil,g.expiresAt);limits.projects+=40;limits.storageMiB+=128;limits.versions=40}
 return {limits,plus,plusUntil,badges:[...badges],instructions:[...instructions],themes:[...themes]};
}
// During OBT access stays unchanged; after release only supported sets with
// audited interactive metadata may be locked. The PDF is never restricted.
export function canUseInteractive({account,setId,step,beta=true,supported=false}={}){
 if(beta||!supported)return true;
 return Number.isInteger(step)&&step>=1&&step<=FREE_INSTRUCTION_STEPS||account?.plus===true||account?.instructions?.includes(setId)===true;
}

// These helpers are pricing proposals for a future server-authoritative order quote.
// Existing ownership and paid credit must come from persisted, verified orders.
export function badgeUpgradePrice(targetSku,ownedSkus=[]){
 const target=productById(targetSku);
 if(target?.kind!=='badge')throw new RangeError('invalid_badge');
 if(ownedSkus.includes(targetSku))return 0;
 if(!target.rank)return target.priceKopecks;
 const highest=Math.max(0,...ownedSkus.map(productById).filter(p=>p?.kind==='badge'&&p.rank&&p.rank<=target.rank).map(p=>p.priceKopecks));
 return target.priceKopecks-highest;
}
export function bundlePrice(ownedThemes=[]){
 const remaining=Object.entries(themePrices).filter(([id])=>!ownedThemes.includes(id));
 // Keep the collection discount proportional to the remaining items; no double charge.
 const total=Object.values(themePrices).reduce((a,b)=>a+b,0);
 return Math.round(remaining.reduce((a,[,p])=>a+p,0)*productById('theme-collection').priceKopecks/total);
}
export function discountedPrice(kopecks,plus){
 if(!Number.isSafeInteger(kopecks)||kopecks<0)throw new RangeError('invalid_amount');
 return plus===true?Math.round(kopecks*(100-PLUS_DISCOUNT_PERCENT)/100):kopecks;
}

export const PLUS_THEME_CHANGE_MS=30*86400000;
export function plusLoyalty(grants=[],now=Date.now()){
 const spans=grants.filter(g=>productById(g?.sku)?.kind==='subscription'&&g.revoked!==true&&Number.isFinite(g.grantedAt)&&Number.isFinite(g.expiresAt)&&g.grantedAt<Math.min(g.expiresAt,now))
 .map(g=>[g.grantedAt,Math.min(g.expiresAt,now)]).sort((a,b)=>a[0]-b[0]);
 let total=0,start=0,end=0;
 for(const [a,b] of spans){if(a>end){total+=end-start;start=a;end=b}else end=Math.max(end,b)}
 total+=end-start;
 const days=Math.floor(total/86400000);
 return {days,milestones:[1,3,6,12].filter(m=>days>=m*30)};
}
export function plusThemeState(account,selection,now=Date.now()){
 const chosen=account.plus&&Object.hasOwn(themePrices,selection?.theme??'')?selection.theme:null;
 const changedAt=chosen?new Date(selection.changedAt).getTime():0;
 return {chosen,nextChangeAt:chosen&&Number.isFinite(changedAt)?changedAt+PLUS_THEME_CHANGE_MS:0};
}
