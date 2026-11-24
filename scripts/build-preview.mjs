import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'dist-preview')
const branch = process.env.VERCEL_GIT_COMMIT_REF
if (branch && branch !== 'feature/mechanics-core') throw new Error('Preview builds are limited to feature/mechanics-core')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const dir of ['assets', 'catalog', 'examples', 'src', 'vendor']) {
  await cp(join(root, dir), join(output, dir), { recursive: true })
}
let html = await readFile(join(root, 'index.html'), 'utf8')
if (!html.includes('</head>') || !html.includes('</body>')) throw new Error('Expected HTML entry point')
html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow">\n</head>')
html = html.replace('</body>', '<aside style="position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#33291c;color:#ffd28a;border:1px solid #8f6b32;padding:5px 9px;border-radius:6px;font:600 11px system-ui;pointer-events:none" aria-label="Test environment">BRICKLAB PREVIEW</aside>\n</body>')
await writeFile(join(output, 'index.html'), html)
await writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
const sha = process.env.VERCEL_GIT_COMMIT_SHA || 'local'
await writeFile(join(output, 'preview-version.json'), JSON.stringify({ branch: 'feature/mechanics-core', commit: sha }, null, 2))
console.log('BrickLab static preview ready:', sha)
