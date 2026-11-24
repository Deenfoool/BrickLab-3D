import { fileURLToPath } from 'node:url'
import { createBrickLabServer } from './http.js'

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535')
const server = createBrickLabServer({ root: fileURLToPath(new URL('../', import.meta.url)) })
server.on('error', error => {
  console.error('Unable to start BrickLab:', error.message)
  process.exitCode = 1
})
server.listen(port, host, () => console.log(`BrickLab listening on ${host}:${port}`))
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  const timeout = setTimeout(() => server.closeAllConnections(), 10_000).unref()
  server.close(error => {
    clearTimeout(timeout)
    if (error) process.exitCode = 1
  })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
