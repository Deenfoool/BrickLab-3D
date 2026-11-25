import { fileURLToPath } from 'node:url'
import {createPaymentsHandler,paymentConfig} from './payments.js'
import { createBrickLabServer } from './http.js'
import { createRebrickableHandler } from './rebrickable.js'
import { createCspReportHandler } from './csp-report.js'
import {createAccountSecurityHandler} from './account-security.js'
import {createMailer} from './mail.js'
import { createAuthHandler } from './auth.js'
import { createProjectsHandler } from './projects.js'
import { createProfileHandler } from './profile.js'
import { createActivityHandler } from './activity.js'
import {createBureauHandler} from './bureau.js'
import { createCommunityHandler } from './community.js'

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535')
let store, auth, projects, profile, activity, community, bureau, security, payments, cleanup
if (process.env.PGPASSWORD) {
  const { connectAuthStore } = await import('./db/auth-store.js')
  store = connectAuthStore()
  try {
    await store.ready()
    const origin=process.env.PUBLIC_ORIGIN||'http://localhost:8080',registrationEnabled=process.env.BRICKLAB_REGISTRATION_ENABLED==='true'
    payments=createPaymentsHandler({store,origin,config:paymentConfig()})
    security=createAccountSecurityHandler({store,origin,registrationEnabled,mail:createMailer()})
    auth = createAuthHandler({ store, origin: process.env.PUBLIC_ORIGIN || 'http://localhost:8080',
      registrationEnabled: registrationEnabled && new URL(origin).protocol==='http:',
      trustedProxyIp: process.env.BRICKLAB_TRUSTED_PROXY_IP || '' })
    projects = createProjectsHandler({ store, origin: process.env.PUBLIC_ORIGIN || 'http://localhost:8080' })
    profile = createProfileHandler({store,origin:process.env.PUBLIC_ORIGIN || 'http://localhost:8080'})
    activity = createActivityHandler({store,origin:process.env.PUBLIC_ORIGIN || 'http://localhost:8080'})
    community = createCommunityHandler({store,origin:process.env.PUBLIC_ORIGIN || 'http://localhost:8080',enabled:process.env.BRICKLAB_COMMUNITY_ENABLED==='true'})
    bureau=createBureauHandler({store,origin:process.env.PUBLIC_ORIGIN||'http://localhost:8080',enabled:process.env.BRICKLAB_COMMUNITY_ENABLED==='true'})
    cleanup = setInterval(() => store.cleanup().catch(error => console.error('Session cleanup failed:', error.code || error.name)), 3600_000).unref()
  } catch (error) {
    await store.close()
    throw error
  }
}
const server = createBrickLabServer({ root: fileURLToPath(new URL('../', import.meta.url)), auth, projects, profile, activity, community, bureau, security, payments,
  rebrickable:createRebrickableHandler({apiKey:process.env.BRICKLAB_REBRICKABLE_API_KEY || ''}), cspReport:createCspReportHandler() })
server.on('error', async error => {
  console.error('Unable to start BrickLab:', error.message)
  clearInterval(cleanup)
  await store?.close()
  process.exitCode = 1
})
server.listen(port, host, () => console.log(`BrickLab listening on ${host}:${port}`))
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  clearInterval(cleanup)
  const timeout = setTimeout(() => server.closeAllConnections(), 10_000).unref()
  server.close(async error => {
    clearTimeout(timeout)
    await store?.close()
    if (error) process.exitCode = 1
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
