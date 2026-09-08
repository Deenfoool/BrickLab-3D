// Apply the production browser's local import aliases to Node physics tests.
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const html = readFileSync(new URL('index.html', root), 'utf8')
const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1])
const aliases = new Map(Object.entries(imports).filter(([key])=>key.startsWith('./')).map(([key,target])=>[new URL(key,root).href,new URL(target.split('?')[0],root).href]))
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier.startsWith('.') && context.parentURL){const resolved=new URL(specifier,context.parentURL);resolved.search='';const mapped=aliases.get(resolved.href);if(mapped)return nextResolve(mapped,context)}
  return nextResolve(specifier,context)
}})
