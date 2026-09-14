import { createShadowResolverV4, SHADOW_RESOLVER_VERSION_V4 } from '../connectors-v4/shadow-resolver-v4.js'
import { finalizeConnectorIdentitiesV4 } from '../connectors-v4/identity-v4.js'
import { validateConnectorV4 } from '../connectors-v4/schema-v4.js'

const button=document.querySelector('#run'),status=document.querySelector('#status'),rows=document.querySelector('#results')
button.addEventListener('click',async()=>{
  button.disabled=true;rows.replaceChildren();status.textContent='Проверка…'
  try{
    const response=await fetch('./tests/fixtures/connector-inheritance-v4.json?v=connector-sites-20260914-v2')
    if(!response.ok)throw new Error(`Fixtures HTTP ${response.status}`)
    const fixture=await response.json()
    const options={fetchOfficialText:async p=>fixture.official[p]??null,fetchShadowText:async p=>fixture.shadow[p]??null}
    const before=createShadowResolverV4({...options,inheritancePaths:new Set()}),after=createShadowResolverV4(options)
    let passed=0
    for(const [id,expected] of [['32123a',1],['32089',1],['3713',1],['60470',7],['4488',11],['3001',16],['3708',2],['3894',23],['3648',5]]){
      const file=`${id}.dat`,a=await before.resolve(file),b=await after.resolve(file)
      const endpoints=finalizeConnectorIdentitiesV4(file,b.connectors).connectors
      const repeated=finalizeConnectorIdentitiesV4(file,(await createShadowResolverV4(options).resolve(file)).connectors).connectors
      const pass=b.connectors.length===expected&&!b.warnings.length&&endpoints.every(c=>validateConnectorV4(c).valid)&&new Set(endpoints.map(c=>c.endpointId)).size===endpoints.length&&JSON.stringify(endpoints)===JSON.stringify(repeated)
      if(pass)passed++
      const row=document.createElement('tr')
      for(const value of [id,a.connectors.length,b.connectors.length,[...new Set(b.connectors.map(c=>c.family))].join(', '),pass?'PASS':'FAIL']){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}
      rows.append(row)
    }
    status.textContent=`${passed}/9 PASS — ${SHADOW_RESOLVER_VERSION_V4}`
    document.querySelector('#detail').textContent=`LDraw ${fixture.geometryCommit}\nShadow ${fixture.shadowCommit}\nСчётчики — описания интерфейсов до дедупликации. Snap/physics в этой странице не проверяются.`
  }catch(error){status.textContent=`Ошибка проверки: ${error.message}`}
  finally{button.disabled=false}
})
