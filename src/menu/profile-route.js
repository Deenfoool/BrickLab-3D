// Shared browser/server rules for canonical workshop links. Existing reserved handles retain legacy links.
export const reservedProfileNames=Object.freeze(['home','projects','examples','library','sets','account','community','store','project','editor','admin','workshop','profile','privacy','terms','api','login','register','settings','achievements','notifications','help','about','support','tutorial','rankings','logout'])
const reserved=new Set(reservedProfileNames)
const handle=/^[a-z0-9][a-z0-9_.-]{2,31}$/
const generated=/^id_[a-f0-9]{32}$/
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export const validNewUsername=value=>typeof value==='string'&&handle.test(value)&&!value.startsWith('id_')&&!reserved.has(value)&&!uuid.test(value)
export const isWorkshopHandle=value=>typeof value==='string'&&!reserved.has(value.toLowerCase())&&(handle.test(value.toLowerCase())||generated.test(value.toLowerCase()))
export function profileHref(username,id){const key=typeof username==='string'?username.toLowerCase():'';return isWorkshopHandle(key)?'#'+key:'#community/profile/'+(uuid.test(id??'')?id:encodeURIComponent(key))}
export function workshopRoute(route){const m=/^community\/profile\/([^/]+)$/.exec(route);if(m){const key=m[1].toLowerCase();return uuid.test(key)||handle.test(key)||generated.test(key)?key:null}return isWorkshopHandle(route)?route.toLowerCase():null}
