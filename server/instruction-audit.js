import {createHash} from 'node:crypto'
import {instructionProduct} from '../src/menu/commerce-catalog.js'
const digest=value=>createHash('sha256').update(value).digest('hex')
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const check=(condition,message)=>{if(!condition)throw Error(message)}
export function validateReviewedInstructionAudit(raw,approval){
 const document=JSON.parse(raw)
 check(document.schema===2&&document.sets&&typeof document.sets==='object'&&!Array.isArray(document.sets),'invalid_instruction_audit_schema')
 check(approval?.schema===1&&approval.approved===true&&approval.auditSha256===digest(raw)&&sha(approval.offerVersion)&&approval.rightsReviewed===true&&typeof approval.reviewer==='string'&&approval.reviewer.trim()&&Number.isFinite(Date.parse(approval.reviewedAt)),'instruction_approval_required')
 const result={},bookIds=new Set()
 for(const [setId,set] of Object.entries(document.sets)){
  const {title,partCount,volumes}=set
  check(!!instructionProduct(setId,title,partCount)&&Array.isArray(volumes)&&volumes.length>0&&volumes.length<=30&&set.reviewed===true,'invalid_reviewed_set')
  const record={metadata:{title,partCount,complete:true,finalBook:volumes.at(-1)?.id}}
  let lastStep=0,totalRegions=0
  for(const book of volumes){
   check(typeof book.id==='string'&&/^\d{1,12}$/.test(book.id)&&!bookIds.has(book.id)&&sha(book.pdfSha256)&&Number.isSafeInteger(book.pageCount)&&book.pageCount>0&&book.pageCount<=5000&&Array.isArray(book.pages)&&book.pages.length===book.pageCount,'invalid_reviewed_book')
   bookIds.add(book.id)
   let volumeRegions=0,volumeSteps=0
   record[book.id]=book.pages.map(p=>{
    check(p&&Number.isSafeInteger(p.step)&&p.step>=0&&p.step<=100000&&Array.isArray(p.regions)&&p.regions.length<=1000&&['verified','no-parts'].includes(p.review),'unreviewed_instruction_page')
    check((p.review==='verified')===(p.regions.length>0)&&(!p.regions.length||p.step>0),'invalid_reviewed_page')
    if(p.step>0){check(p.step>=lastStep,'instruction_step_regressed');lastStep=p.step;volumeSteps++}
    for(const a of p.regions){
     check(Array.isArray(a)&&a.length>=5&&a.length<=7&&a.slice(0,4).every(n=>Number.isFinite(n)&&n>=0&&n<=10000)&&a[2]>0&&a[3]>0&&a[0]+a[2]<=10000&&a[1]+a[3]<=10000&&typeof a[4]==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(a[4])&&a.slice(5).every(n=>n===null||typeof n==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(n)||Number.isSafeInteger(n)&&n>=0),'invalid_reviewed_region')
    }
    volumeRegions+=p.regions.length
    return {step:p.step,regions:p.regions}
   })
   check(volumeRegions>0&&volumeSteps>0,'empty_reviewed_volume')
   totalRegions+=volumeRegions
  }
  check(lastStep>10&&totalRegions>0,'empty_paid_instruction')
  result[setId]=record
 }
 check(Object.keys(result).length>0,'empty_reviewed_catalog')
 return {audit:result,offerVersion:approval.offerVersion,sha256:approval.auditSha256}
}
