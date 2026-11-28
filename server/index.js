import { fileURLToPath } from 'node:url'
import {createPaymentsHandler,paymentConfig} from './payments.js'
import {createYookassaAdapter} from './yookassa.js'
import {startTestPaymentReconciliation} from './payment-reconciliation.js'
import {startCommerceTelegram} from './commerce-telegram.js'
import {startReceiptDelivery,createReceiptMailer} from './receipt-delivery.js'
import {createInstructionRegions} from './instruction-regions.js'
import {loadInstructionPolicy} from './instruction-access.js'
import {loadApprovedLegal,liveCommerceConfig,liveProviderConfig} from './legal-release.js'
import {createTelegramHubHandler} from './telegram-hub.js'
import { createBrickLabServer } from './http.js'
import { createInstructionsHandler } from './instructions.js'
import { createInstructionFetch } from './instruction-fetch.js'
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
let hub, store, auth, projects, profile, activity, community, bureau, security, payments, cleanup, legal, reconciliation, liveReconciliation, telegram, receiptDelivery
if (process.env.PGPASSWORD) {
  const { connectAuthStore } = await import('./db/auth-store.js')
  store = connectAuthStore()
  try {
    await store.ready()
    const origin=process.env.PUBLIC_ORIGIN||'http://localhost:8080',registrationEnabled=process.env.BRICKLAB_REGISTRATION_ENABLED==='true'
    const instructionRelease=process.env.BRICKLAB_INSTRUCTIONS_RELEASE==='true'
    const instructionPolicy=await loadInstructionPolicy(instructionRelease?process.env.BRICKLAB_PRIVATE_INSTRUCTION_AUDIT||'':'',{requireEvidence:instructionRelease})
    if(instructionRelease&&!instructionPolicy.products.length)throw Error('Paid instructions require a reviewed private catalog')
    try{legal=await loadApprovedLegal({directory:fileURLToPath(new URL('../assets/legal/',import.meta.url)),approvalFile:process.env.BRICKLAB_COMMERCE_APPROVAL_FILE||''})}catch{legal=null;console.error('Legal approval unavailable; new live checkout remains closed')}
    const commerceMode=process.env.BRICKLAB_COMMERCE_MODE||'test'
    const liveCheckoutScope=process.env.BRICKLAB_LIVE_CHECKOUT_SCOPE||'closed'
    if(!['closed','pilot','public'].includes(liveCheckoutScope))throw Error('Invalid live checkout scope')
    if(!['test','live'].includes(commerceMode))throw Error('Invalid commerce mode')
    const receiptMailer=createReceiptMailer()
    const liveConfig=liveCommerceConfig(process.env,legal)
    const liveProvider=liveProviderConfig(process.env)
    const liveYookassa=createYookassaAdapter({store,origin,config:liveProvider})
    const liveCheckoutReady=liveConfig.enabled&&!!receiptMailer
    const testYookassa=createYookassaAdapter({store,origin})
    const fullCatalog=!!legal&&process.env.BRICKLAB_COMMERCE_FULL_CATALOG_OFFER_VERSION===legal.version
    payments=createPaymentsHandler({store,origin,config:paymentConfig(),legal,fullCatalog,commerceMode,liveCheckoutScope,liveCheckoutReady,liveYookassa,instructionPolicy,instructionRelease,yookassa:testYookassa,regions:createInstructionRegions(fileURLToPath(new URL('../catalog/sets/',import.meta.url)))})
    security=createAccountSecurityHandler({store,origin,registrationEnabled,mail:createMailer(),codeSecret:process.env.BRICKLAB_MAIL_KEY||undefined})
    auth = createAuthHandler({ store, origin: process.env.PUBLIC_ORIGIN || 'http://localhost:8080',
      registrationEnabled: registrationEnabled && new URL(origin).protocol==='http:',
      trustedProxyIp: process.env.BRICKLAB_TRUSTED_PROXY_IP || '' })
    hub=createTelegramHubHandler({store,origin,keyFile:process.env.BRICKLAB_HUB_KEY_FILE||'',ownerId:process.env.BRICKLAB_HUB_OWNER_ID||''})
    projects = createProjectsHandler({ store, origin: process.env.PUBLIC_ORIGIN || 'http://localhost:8080' })
    profile = createProfileHandler({store,origin:process.env.PUBLIC_ORIGIN || 'http://localhost:8080'})
    activity = createActivityHandler({store,origin:process.env.PUBLIC_ORIGIN || 'http://localhost:8080'})
    community = createCommunityHandler({store,origin:process.env.PUBLIC_ORIGIN || 'http://localhost:8080',enabled:process.env.BRICKLAB_COMMUNITY_ENABLED==='true'})
    bureau=createBureauHandler({store,origin:process.env.PUBLIC_ORIGIN||'http://localhost:8080',enabled:process.env.BRICKLAB_COMMUNITY_ENABLED==='true'})
    reconciliation=startTestPaymentReconciliation({store,adapter:testYookassa})
    liveReconciliation=startTestPaymentReconciliation({store,adapter:liveYookassa,environment:'live'})
    telegram=startCommerceTelegram({store})
    receiptDelivery=startReceiptDelivery({store,mailer:receiptMailer})
    cleanup = setInterval(() => store.cleanup().catch(error => console.error('Session cleanup failed:', error.code || error.name)), 3600_000).unref()
  } catch (error) {
    await store.close()
    throw error
  }
}
const instructionFetch = createInstructionFetch({ proxy: process.env.BRICKLAB_INSTRUCTIONS_PROXY || '' })
const server = createBrickLabServer({ root: fileURLToPath(new URL('../', import.meta.url)), auth, projects, profile, activity, community, bureau, security, payments, hub, approvedLegal:legal,
  instructions: createInstructionsHandler({ fetcher: instructionFetch }),
  rebrickable:createRebrickableHandler({apiKey:process.env.BRICKLAB_REBRICKABLE_API_KEY || ''}), cspReport:createCspReportHandler() })
server.on('error', async error => {
  console.error('Unable to start BrickLab:', error.message)
  clearInterval(cleanup)
  await Promise.all([reconciliation?.stop(),liveReconciliation?.stop(),telegram?.stop(),receiptDelivery?.stop()])
  await store?.close()
  process.exitCode = 1
})
server.listen(port, host, () => {console.log(`BrickLab listening on ${host}:${port}`);reconciliation?.tick();liveReconciliation?.tick();telegram?.tick();receiptDelivery?.tick()})
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  clearInterval(cleanup)
  const timeout = setTimeout(() => server.closeAllConnections(), 10_000).unref()
  server.close(async error => {
    clearTimeout(timeout)
    await instructionFetch.close()
    await Promise.all([reconciliation?.stop(),liveReconciliation?.stop(),telegram?.stop(),receiptDelivery?.stop()])
    await store?.close()
    if (error) process.exitCode = 1
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
