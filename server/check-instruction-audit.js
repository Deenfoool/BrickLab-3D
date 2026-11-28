import {loadInstructionPolicy} from './instruction-access.js'
const [path,offerVersion]=process.argv.slice(2)
try{
 if(!path?.startsWith('/app/private-instructions/')||!offerVersion||! /^[a-f0-9]{64}$/.test(offerVersion))throw Error('invalid_instruction_check_arguments')
 const policy=await loadInstructionPolicy(path,{requireEvidence:true})
 if(policy.offerVersion!==offerVersion||!policy.products.length)throw Error('instruction_offer_not_approved')
 console.log(JSON.stringify({sets:policy.products.length,volumes:policy.count,auditSha256:policy.auditSha256}))
}catch(error){console.error('Instruction release check failed:',error.message);process.exitCode=1}
