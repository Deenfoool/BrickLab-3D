const day=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2099-12-31')return null
 const ms=Date.parse(value+'T00:00:00Z')
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?ms:null
}
export function validExportRange(from,to){
 const a=day(from),b=day(to)
 return a!==null&&b!==null&&b>=a&&b-a<=30*86400000
}
const columns=['event_at','event_type','order_id','order_number','sku','provider','payment_id','amount_kopecks','provider_income_kopecks']
const numeric=new Set(['order_number','amount_kopecks','provider_income_kopecks'])
function cell(value,key){
 if(value==null)return '""'
 let s=value instanceof Date?value.toISOString():String(value)
 // Spreadsheet formula protection, including leading whitespace/control characters.
 if(!numeric.has(key)&&/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s
 if(numeric.has(key)&&! /^-?\d+$/.test(s))throw Error('invalid numeric export value')
 return '"'+s.replaceAll('"','""')+'"'
}
export function financeCsv(rows,environment){
 const header=['environment',...columns]
 return '\uFEFF'+header.join(',')+'\r\n'+rows.map(row=>[cell(environment,'environment'),...columns.map(key=>cell(row[key],key))].join(',')).join('\r\n')+(rows.length?'\r\n':'')
}
