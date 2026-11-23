import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { locales } from '../src/menu/locale.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path => readFileSync(new URL(path, `file://${root}/`), 'utf8')
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const absolute = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(absolute) : [absolute]
})

test('local source imports resolve to existing files', () => {
  for (const file of walk(path.join(root, 'src')).filter(name => /\.m?js$/.test(name))) {
    const text = readFileSync(file, 'utf8')
    const imports = [
      ...text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g),
    ]
    for (const match of imports) {
      const specifier = match[1]
      if (!specifier.startsWith('.')) continue // import maps or packages
      const target = path.resolve(path.dirname(file), specifier.split(/[?#]/)[0])
      assert.ok(existsSync(target), `${path.relative(root, file)} imports missing ${specifier}`)
    }
  }
})

test('menu IDs referenced by JavaScript exist in HTML', () => {
  const html = source('index.html')
  const script = source('src/menu/menu.js')
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
  for (const match of script.matchAll(/\bbyId\(['"]([^'"]+)['"]\)/g)) {
    assert.ok(ids.has(match[1]), `Missing #${match[1]} in index.html`)
  }
})

test('editor controls referenced by JavaScript are declared', () => {
  const editor = source('src/editor/editor.js')
  const elements = new Set([...editor.matchAll(/\bdata-el=["']([^"']+)["']/g)].map(match => match[1]))
  for (const match of editor.matchAll(/\bel\(['"]([^'"]+)['"]\)/g)) {
    assert.ok(elements.has(match[1]), `Missing editor control data-el="${match[1]}"`)
  }
})

test('localized menu elements exist in both supported languages', () => {
  const html = source('index.html')
  const keys = [...new Set([...html.matchAll(/\bdata-text="([^"]+)"/g)].map(match => match[1]))]
  for (const language of ['ru', 'en']) {
    for (const key of keys) {
      assert.notEqual(locales[language][key], undefined, `${language} missing ${key}`)
    }
  }
})
