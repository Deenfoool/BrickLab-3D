import {canUseInteractive} from '../src/menu/commerce-catalog.js'
// Only reviewed, canonical PDFs with a verified page-to-step map may enter
// the paid catalog. Empty on purpose: no set has yet passed the audit.
// Page maps use canonical book URL -> page number -> assembly step.
const audited=Object.freeze({});
export function instructionAccess({setId,book,page,account=null,release=false}){
 const bookSteps=Object.hasOwn(audited,setId)?audited[setId]?.[book]:null;
 const step=bookSteps?.[page];
 const supported=Number.isSafeInteger(step)&&step>0;
 return {mode:release?'release':'beta',supported,step:supported?step:null,
  interactive:canUseInteractive({account,setId,step,beta:!release,supported})};
}
