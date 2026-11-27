import {ProjectError} from './projects.js'
export const achievementMetrics=["cloud","parts","designs","models","days","publications","likes","followers","age","lesson","gears","drive","engine","gearbox","tracks","suspension","belts","bugs"]
const categories=['construction','mechanics','learning','community','activity','special'],rarities=['common','uncommon','rare','epic','legendary','unique'],icons=['layers','settings','icon-trophy','book','play','icon-heart','icon-account','icon-cloud','icon-bug','icon-flask','folder']
export function validateAchievement(value){
 const fail=()=>{throw new ProjectError(400,'invalid_achievement')}
 if(!value||typeof value!=='object'||Array.isArray(value)||!/^custom-[a-z0-9-]{1,39}$/.test(value.id??'')||!categories.includes(value.cat)||!rarities.includes(value.rarity)||!icons.includes(value.icon)||!(value.metric===null||achievementMetrics.includes(value.metric))||!Number.isSafeInteger(value.target)||value.target<1||value.target>100000||(value.metric===null&&value.target!==1)||!Number.isSafeInteger(value.xp)||value.xp<0||value.xp>5000)fail()
 if(value.hidden!==undefined&&typeof value.hidden!=='boolean')fail()
 const out={hidden:value.hidden===true,id:value.id,cat:value.cat,rarity:value.rarity,icon:value.icon,metric:value.metric,target:value.target,xp:value.xp}
 for(const k of ['ru','en','descRu','descEn']){const v=value[k];if(typeof v!=='string'||!v.trim()||v.length>240||/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(v))fail();out[k]=v.trim()}
 return out
}
