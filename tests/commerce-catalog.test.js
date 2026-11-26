import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_LIMITS,commerceProducts,projectAccount,instructionPrice,canUseInteractive,badgeUpgradePrice,bundlePrice,discountedPrice,themePrices,instructionProduct,indexedInstructionProducts} from '../src/menu/commerce-catalog.js';
test('catalog uses distinct SKUs and positive integer kopecks',()=>{
 assert.equal(new Set(commerceProducts.map(p=>p.id)).size,commerceProducts.length);
 assert.ok(commerceProducts.every(p=>Number.isSafeInteger(p.priceKopecks)&&p.priceKopecks>0));
});
test('slots accumulate, duplicated and revoked grants do not',()=>{
 const g=[{id:'a',sku:'slots-30'},{id:'a',sku:'slots-30'},{id:'b',sku:'slots-20'},{id:'c',sku:'slots-100',revoked:true}];
 assert.deepEqual(projectAccount(g,100).limits,{...BASE_LIMITS,projects:70,storageMiB:224});
});
test('plus adds capacity once and expired plus does not revoke permanent slots',()=>{
 const grants=[{id:'a',sku:'slots-30'},{id:'b',sku:'plus-1',expiresAt:200},{id:'c',sku:'plus-3',expiresAt:400}];
 const active=projectAccount(grants,100);
 assert.deepEqual(active.limits,{projects:90,storageMiB:288,versions:40,requestMiB:2});
 assert.equal(active.plusUntil,400);
 assert.deepEqual(projectAccount(grants,400).limits,{...BASE_LIMITS,projects:50,storageMiB:160});
});
test('badges and purchased access are retained without plus',()=>{
 const a=projectAccount([{id:'a',sku:'supporter'},{id:'b',kind:'instruction',setId:'42215-1'},{id:'c',kind:'theme',themeId:'carbon'}],100);
 assert.deepEqual(a.badges,['supporter']);assert.deepEqual(a.instructions,['42215-1']);assert.deepEqual(a.themes,['carbon']);
});
test('instruction tier boundaries and invalid counts',()=>{
 for(const [n,p] of [[1,0],[200,0],[201,0],[501,0],[600,0],[601,7900],[1000,7900],[1001,12900],[2001,17900],[4001,24900]])assert.equal(instructionPrice(n),p);
 for(const n of [0,-1,NaN,1.5,'200'])assert.throws(()=>instructionPrice(n),RangeError);
});
test('beta remains free, paid release supported set only after trial',()=>{
 const args={beta:false,supported:true,setId:'42215-1'};
 assert.equal(canUseInteractive({...args,step:10}),true);
 assert.equal(canUseInteractive({...args,step:11}),false);
 assert.equal(canUseInteractive({...args,step:11,beta:true}),true);
 assert.equal(canUseInteractive({...args,step:11,account:{plus:true}}),true);
 assert.equal(canUseInteractive({...args,step:11,account:{instructions:['42215-1']}}),true);
 assert.equal(canUseInteractive({...args,step:11,account:{instructions:['other']}}),false);
});

test('badge upgrades credit highest eligible owned tier; Founder remains independent',()=>{
 assert.equal(badgeUpgradePrice('gold-builder',['silver-builder']),30000);
 assert.equal(badgeUpgradePrice('gold-builder',['silver-builder','bronze-builder']),30000);
 assert.equal(badgeUpgradePrice('gold-builder',['gold-builder']),0);
 assert.equal(badgeUpgradePrice('founders-club',['diamond-patron']),149900);
});
test('bundle price excludes owned themes and bundle grants all six',()=>{
 assert.equal(bundlePrice(),69900);
 assert.ok(bundlePrice(['carbon'])<69900);
 assert.equal(bundlePrice(Object.keys(themePrices)),0);
 assert.deepEqual(projectAccount([{id:'b',sku:'theme-collection'}]).themes,Object.keys(themePrices));
});
test('plus discount uses integer kopecks',()=>{
 assert.equal(discountedPrice(12900,true),11610);
 assert.equal(discountedPrice(12900,false),12900);
 assert.throws(()=>discountedPrice(-1,true),RangeError);
});

test('all initial instruction products have more than 600 pieces and individual IDs',()=>{
 assert.equal(indexedInstructionProducts.length,13);
 assert.equal(new Set(indexedInstructionProducts.map(p=>p.id)).size,13);
 assert.ok(indexedInstructionProducts.every(p=>p.partCount>600&&p.priceKopecks===instructionPrice(p.partCount)));
 assert.equal(instructionProduct('12345-1','Small',600),null);
 assert.equal(instructionProduct('12345-1','Large',601).priceKopecks,7900);
 assert.equal(instructionProduct('invalid','Large',601),null);
});
