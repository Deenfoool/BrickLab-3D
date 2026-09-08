import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Vite must resolve the same local aliases as the no-build production import map.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)![1])
const alias = Object.entries(imports)
  .filter(([name, target]) => name.startsWith('./') && name !== String(target).split('?')[0])
  .map(([find, target]) => ({ find, replacement: fileURLToPath(new URL(String(target).split('?')[0], import.meta.url)) }))

export default defineConfig({
  base: '/BrickLab-3D/',
  resolve: { alias },
})
