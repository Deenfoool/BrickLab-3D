import {readFile,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
const names=['offer','privacy','refund','requisites']
const sha=s=>createHash('sha256').update(s).digest('hex')
// Approval is an explicit operator action. Never generate this file from draft text.
// Only read a fixed allowlist of legal files; the approval file lives outside the public web root.
export async function loadApprovedLegal({directory,approvalFile}={}){
 if(!approvalFile)return null
 const manifest=JSON.parse(await readFile(approvalFile,'utf8'))
 if(manifest.approved!==true||!Number.isFinite(Date.parse(manifest.approvedAt))||!manifest.files)throw Error('invalid_legal_approval')
 const pages={}
 for(const name of names){
  const path=join(directory,name+'.html')
  if((await stat(path)).size>256*1024)throw Error('legal_document_too_large')
  const text=await readFile(path,'utf8')
  if(!text.trim()||/ПРОЕКТ · НЕ УТВЕРЖДЕНО|не является действующей офертой/i.test(text)||manifest.files[name]!==sha(text))throw Error('legal_document_not_approved')
  pages['/'+name]=text
 }
 const version=sha(names.map(name=>manifest.files[name]).join(':'))
 return {version,pages}
}
export function liveCommerceConfig(env=process.env,legal=null){
 const shopId=env.BRICKLAB_YOOKASSA_LIVE_SHOP_ID??'',secret=env.BRICKLAB_YOOKASSA_LIVE_SECRET??''
 // The owner must have verified the NPD receipt process and approved the exact documents.
 // No production charges from a draft or from test credentials.
 const enabled=env.BRICKLAB_YOOKASSA_LIVE_ENABLED==='true'&&env.BRICKLAB_NPD_RECEIPTS_READY==='true'&&legal?.version?.length===64&&/^\d{1,20}$/.test(shopId)&&secret.startsWith('live_')&&secret.length>=16&&shopId!==env.BRICKLAB_YOOKASSA_TEST_SHOP_ID
 return {enabled:enabled===true,environment:'live',shopId,secret,offerVersion:legal?.version??null}
}
