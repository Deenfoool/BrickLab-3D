// Layout stores IDs only, never counts or scores. Empty is a valid layout.
export const defaultMetricIds=Object.freeze(['likes','builds','followers','xp','title','rank'])
export const metricCatalog=Object.freeze({
 likes:{ru:'Кол-во лайков',en:'Received likes',icon:'icon-heart'},
 builds:{ru:'Мои сборки',en:'My builds',publicRu:'Опубликованные сборки',publicEn:'Published builds',icon:'folder'},
 followers:{ru:'Подписчики',en:'Followers',icon:'icon-account'},
 xp:{ru:'Инженерный опыт',en:'Engineering XP',icon:'icon-trophy'},
 title:{ru:'Титул',en:'Title',icon:'icon-trophy'},
 rank:{ru:'Место в глобальном рейтинге',en:'Global rank',icon:'icon-trophy'},
 published:{ru:'Опубликованные сборки',en:'Published builds',icon:'layers'},
 downloads:{ru:'Скачивания',en:'Downloads',icon:'icon-cloud'},
 level:{ru:'Уровень',en:'Level',icon:'icon-trophy'},
 achievements:{ru:'Достижения',en:'Achievements',icon:'icon-trophy'}
})
export function validateMetricLayout(value){
 if(!Array.isArray(value)||value.length>Object.keys(metricCatalog).length||new Set(value).size!==value.length||value.some(id=>typeof id!=='string'||!Object.hasOwn(metricCatalog,id)))throw new TypeError('invalid_metric_layout')
 return [...value]
}
export function readMetricLayout(value){try{return validateMetricLayout(value)}catch{return [...defaultMetricIds]}}
export function moveMetric(ids,from,to){const next=validateMetricLayout(ids);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=next.length||to>=next.length)return next;const [id]=next.splice(from,1);next.splice(to,0,id);return next}
export function metricItems({layout,lang='ru',owner=false,values={},portfolio}){
 const l=lang==='ru'?'ru':'en',visible=key=>portfolio?.blocks?.some(b=>b.key===key&&b.visible)===true
 return readMetricLayout(layout).filter(id=>owner||(!(id==='followers'&&!visible('followers'))&&!(['xp','title','rank','level','achievements'].includes(id)&&!visible('awards'))&&!(id==='published'&&readMetricLayout(layout).includes('builds')))).map(id=>{
 const d=metricCatalog[id],label=!owner&&id==='builds'?d[l==='ru'?'publicRu':'publicEn']:d[l],v=values[id]
 return {id,label,icon:d.icon,value:v===null||v===undefined?'—':typeof v==='number'?new Intl.NumberFormat(l).format(v):String(v)}
 })
}
