import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { zipReport, crc32, reportText, reportLinks, reportEnvironment, imageExtension, redactDiagnostics } from '../src/feedback/report.js'
import { installDiagnostics } from '../src/feedback/diagnostics.js'

test('the ZIP opens in a standard reader and preserves UTF-8 text and screenshot bytes', async () => {
  const text = new TextEncoder().encode('Что произошло: не работает шестерня ⚙\n')
  const screenshot = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 50])
  const blob = zipReport([{ name: 'report.txt', bytes: text }, { name: 'screenshot-1.png', bytes: screenshot }])
  const script = 'import sys,io,zipfile,json\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.testzip() is None\nprint(json.dumps({"text":z.read("report.txt").decode("utf-8"),"image":list(z.read("screenshot-1.png"))}))'
  const check = spawnSync('python3', ['-c', script], { input: Buffer.from(await blob.arrayBuffer()), encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
  const result = JSON.parse(check.stdout)
  assert.equal(result.text, new TextDecoder().decode(text)); assert.deepEqual(result.image, [...screenshot])
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.throws(() => zipReport([{ name: '../escape.txt', bytes: text }]), /Unsafe/)
})

test('diagnostics are bounded, redact credentials, retain console behavior and do not serialize objects', () => {
  const target = new EventTarget(); let calls = 0
  const original = () => { calls++ }
  target.console = { error: original, warn: original }
  const logs = installDiagnostics(target, 3)
  target.console.warn('old entry')
  const secret = { get accessToken() { throw Error('must not be accessed') } }
  target.console.error('Bearer super-secret', secret)
  target.console.warn('token=private-key https://example.test/p?key=private#id')
  const rejection = new Event('unhandledrejection'); rejection.reason = new Error('rejected'); target.dispatchEvent(rejection)
  const text = logs.snapshot()
  assert.equal(calls, 3)
  assert.ok(!text.includes('old entry')); assert.ok(!text.includes('super-secret')); assert.ok(!text.includes('private-key')); assert.ok(!text.includes('key=private'))
  assert.match(text, /unhandledrejection/); assert.match(text, /\[object\]/)
  logs.dispose(); assert.equal(target.console.error, original)
})

test('reports keep diagnostics in the ZIP and exclude them and private page identifiers from links', () => {
  const fields = { area: 'Библиотека', actual: 'Не открывается деталь', steps: 'Открыть библиотеку', expected: 'Появится деталь', reply: '@tester', logs: 'token=private-log' }
  const environment = reportEnvironment({ location: { origin: 'https://example.test', pathname: '/BrickLab-3D/', hash: '#project/private-project' }, navigator: { userAgent: 'test browser', language: 'ru' }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1 }, 'test-build')
  assert.equal(environment.section, 'editor'); assert.ok(!JSON.stringify(environment).includes('private-project'))
  const text = reportText(fields, environment, [{ name: 'screenshot-1.png' }])
  assert.match(text, /Как повторить/); assert.match(text, /screenshot-1.png/); assert.ok(!text.includes('private-log'))
  const links = reportLinks(fields)
  assert.ok(links.mail.startsWith('mailto:salumbek.den@gmail.com?'))
  const telegram = new URL(links.telegram); assert.equal(telegram.pathname, '/DeenFoool')
  assert.ok(!decodeURIComponent(links.mail).includes('private-log')); assert.ok(!telegram.searchParams.get('text').includes('private-log'))
  assert.ok(links.mail.length < 1800)
  assert.equal(redactDiagnostics('Bearer aaa token=bbb'), 'Bearer [redacted] token=[redacted]')
})

test('screenshots are identified by bytes rather than filename or declared MIME', async () => {
  const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'text/plain' })
  assert.equal(await imageExtension(png), 'png')
  assert.equal(await imageExtension(new Blob(['<svg onload="bad()">'])), null)
})
