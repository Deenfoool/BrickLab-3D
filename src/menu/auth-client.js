export class AuthError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status }
}
export function authOriginAllowed(location) {
  return location.protocol === 'https:' || (location.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname))
}
export function createAuthClient({ fetcher = globalThis.fetch, location = globalThis.location } = {}) {
  const allowed = authOriginAllowed(location)
  async function call(route, body) {
    if (!allowed) throw new AuthError('https_required')
    let response
    try {
      response = await fetcher('/api/auth/' + route, {
        method: ['me','config'].includes(route) ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
        ...(body === undefined ? {} : {body:JSON.stringify(body)})
      })
    } catch { throw new AuthError('auth_unavailable') }
    let data
    try { data = await response.json() } catch { throw new AuthError('auth_unavailable', response.status) }
    if (route === 'me' && response.status === 401 && data?.error === 'unauthenticated') return null
    if (!response.ok) throw new AuthError(typeof data?.error === 'string' ? data.error : 'auth_unavailable', response.status)
    if(route==='config'&&typeof data?.registrationEnabled==='boolean')return data
    if(['register','reset-request'].includes(route)&&data?.pending===true)return {pending:true}
    if(['verify','reset-confirm','revoke-others'].includes(route)&&data?.ok===true)return data
    if (route === 'logout' && data?.ok === true) return null
    if (route !== 'logout' && typeof data?.user?.id === 'string' && typeof data.user.email === 'string' && typeof data.user.displayName === 'string') {
      const {id,email,displayName} = data.user
      return {id,email,displayName,...(typeof data.user.username==='string'?{username:data.user.username}:{}),...(data.user.admin===true?{admin:true}:{})}
    }
    throw new AuthError('auth_unavailable', response.status)
  }
  return {allowed, me:()=>call('me'), login:({email,password})=>call('login',{email,password}), register:({email,password,displayName})=>call('register',{email,password,displayName}), logout:()=>call('logout'),config:()=>call('config'),verify:data=>call('verify',data),resetRequest:email=>call('reset-request',{email}),resetConfirm:data=>call('reset-confirm',data),revokeOthers:()=>call('revoke-others')}
}
