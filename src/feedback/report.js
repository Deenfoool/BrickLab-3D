export const reportContacts = Object.freeze({ email: 'salumbek.den@gmail.com', telegram: 'DeenFoool' })
export const maxScreenshots = 3
export const maxAttachmentBytes = 10 * 1024 * 1024

export function redactDiagnostics(value) {
  return String(value ?? '').slice(0, 100000)
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]+/gi, '$1?[redacted]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|\d{7,}:[a-zA-Z0-9_-]{25,})\b/g, '[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|password|secret|authorization)["']?\s*[:=]\s*)["']?[^\s,;"']+["']?/gi, '$1[redacted]')
}

export function reportEnvironment(win, version) {
  return {
    version, capturedAt: new Date().toISOString(), page: win.location.origin + win.location.pathname,
    section: /^#(home|projects|examples|library|sets)$/.test(win.location.hash) ? win.location.hash.slice(1)
      : win.location.hash.startsWith('#project/') ? 'editor' : 'home',
    browser: win.navigator.userAgent, language: win.navigator.language,
    viewport: win.innerWidth + ' × ' + win.innerHeight, pixelRatio: win.devicePixelRatio,
  }
}

export function reportText(fields, environment, attachments, language = 'ru') {
  const ru = language !== 'en'
  const labels = ru ? ['Где возникла ошибка', 'Что произошло', 'Как повторить', 'Что ожидалось', 'Для обратной связи', 'Консоль', 'Окружение', 'Скриншоты']
    : ['Where it happened', 'What happened', 'Steps to reproduce', 'Expected result', 'Reply contact', 'Console', 'Environment', 'Screenshots']
  const values = [fields.area, fields.actual, fields.steps, fields.expected, fields.reply,
    redactDiagnostics(fields.logs), JSON.stringify(environment, null, 2), attachments.map(file => file.name).join('\n')]
  return 'BrickLab 3D — ' + (ru ? 'сообщение об ошибке' : 'bug report') + '\n\n' +
    labels.map((label, i) => label + '\n' + String(values[i] || '—').trim()).join('\n\n') + '\n'
}

// Keep application diagnostics in the attached report, outside URL query strings.
export function reportLinks(fields, language = 'ru') {
  const ru = language !== 'en'
  const subject = 'BrickLab 3D: ' + String(fields.area || (ru ? 'ошибка' : 'bug')).slice(0, 60)
  const intro = ru ? 'Сообщение об ошибке BrickLab 3D.' : 'BrickLab 3D bug report.'
  const footer = ru ? 'Полный отчёт и скриншоты — в ZIP-файле, который я прикреплю.' : 'I will attach the ZIP with the full report and screenshots.'
  const body = intro + '\n\n' + String(fields.actual || '').slice(0, 100) + '\n\n' + footer
  return {
    mail: 'mailto:' + reportContacts.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body),
    telegram: 'https://t.me/' + reportContacts.telegram + '?text=' + encodeURIComponent(body),
  }
}

export async function imageExtension(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg'
  if (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1
  return value >>> 0
})
export function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ value >>> 8
  return (value ^ 0xffffffff) >>> 0
}

// Uncompressed ZIP: images are already compressed; no dependency or upload is needed.
export function zipReport(entries) {
  const encoder = new TextEncoder(), local = [], central = []
  let offset = 0, directorySize = 0
  for (const { name, bytes } of entries) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw Error('Unsafe archive name')
    const filename = encoder.encode(name), crc = crc32(bytes)
    const header = new Uint8Array(30 + filename.length), h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true)
    h.setUint16(12, 33, true); h.setUint32(14, crc, true)
    h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, filename.length, true)
    header.set(filename, 30)
    const record = new Uint8Array(46 + filename.length), d = new DataView(record.buffer)
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true)
    d.setUint16(14, 33, true); d.setUint32(16, crc, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true)
    d.setUint16(28, filename.length, true); d.setUint32(42, offset, true); record.set(filename, 46)
    local.push(header, bytes); central.push(record); offset += header.length + bytes.length; directorySize += record.length
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true)
  e.setUint32(12, directorySize, true); e.setUint32(16, offset, true)
  return new Blob([...local, ...central, end], { type: 'application/zip' })
}
