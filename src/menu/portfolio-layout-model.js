// Twelve-column, ordered rows. Store only bounded integers/booleans, never arbitrary styles.
export const portfolioSpans=Object.freeze([3,4,6,8,9,12])
const fullWidth=new Set(['featured','publications','collections','activity'])
export function defaultPortfolioSpan(key){return fullWidth.has(key)?12:6}
export function portfolioSpan(block){return portfolioSpans.includes(block?.span)?block.span:defaultPortfolioSpan(block?.key)}
export function validateBlockLayout(block){
 const out={}
 if(block.span!==undefined){if(!portfolioSpans.includes(block.span))throw new TypeError('invalid_portfolio');out.span=block.span}
 if(block.newRow!==undefined){if(typeof block.newRow!=='boolean')throw new TypeError('invalid_portfolio');if(block.newRow)out.newRow=true}
 return out
}
export function planPortfolioGrid(blocks,{mobile=false}={}){
 let row=1,col=1
 const positions=[]
 for(const block of blocks){
  if(!block.visible)continue
  const span=mobile?12:portfolioSpan(block)
  if(col>12||col+span-1>12||(block.newRow&&col!==1)){row++;col=1}
  positions.push({key:block.key,row,column:col,span})
  col+=span
 }
 return positions
}
export function placePortfolioBlock(node,position){
 node.setAttribute('data-layout-span',String(position.span))
 node.setAttribute('data-layout-row',String(position.row))
 node.setAttribute('data-layout-column',String(position.column))
 // Browser CSS variables are sourced solely from the validated grid planner.
 if(node.style?.setProperty){node.style.setProperty('--portfolio-span',String(position.span));node.style.setProperty('--portfolio-column',String(position.column));node.style.setProperty('--portfolio-row',String(position.row))}
}
export function nearestPortfolioSpan(value){
 return portfolioSpans.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,portfolioSpans[0])
}
export function movePortfolioBlock(blocks,key,target){
 const next=blocks.map(b=>({...b})),from=next.findIndex(b=>b.key===key),to=next.findIndex(b=>b.key===target)
 if(from<0||to<0||from===to)return next
 const [item]=next.splice(from,1);next.splice(to,0,item);return next
}
const presets={
 classic:[['featured',12],['publications',12],['collections',12],['awards',6],['activity',12],['statistics',6],['about',6],['followers',6]],
 minimal:[['about',8],['followers',4],['publications',12]],
 portfolio:[['featured',8],['about',4],['publications',12],['collections',8],['followers',4],['awards',6],['statistics',6]],
 engineering:[['statistics',8],['followers',4],['featured',8],['awards',4],['publications',12],['activity',12],['collections',8],['about',4]]
}
export const portfolioPresetIds=Object.freeze(Object.keys(presets))
export function applyPortfolioPreset(blocks,id){
 const preset=presets[id];if(!Object.hasOwn(presets,id))return blocks.map(b=>({...b}))
 const byKey=new Map(blocks.map(b=>[b.key,b])),seen=new Set()
 const next=preset.filter(([key])=>byKey.has(key)).map(([key,span])=>{seen.add(key);return {key,span,visible:id==='classic'?byKey.get(key).visible:true}})
 for(const block of blocks)if(!seen.has(block.key))next.push({key:block.key,span:portfolioSpan(block),visible:false})
 return next
}
