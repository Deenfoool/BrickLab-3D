import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const historyPath = 'src/menu/home-hub.js'

export function parseHistory(source, { allowMissing = false } = {}) {
  const match = source.match(/\bconst releaseHistory\s*=\s*(\[\s*\n[\s\S]*?\n\s*\])/)
  if (!match && allowMissing && !source.includes('const releaseHistory')) return []
  if (!match) throw new Error('Release history array not found')
  return JSON.parse(match[1])
}

export function validateHistory(entries) {
  if (!Array.isArray(entries) || entries.length < 30) throw new Error('Keep at least 30 historical entries')
  const titles = [new Set(), new Set()]
  for (const [i, entry] of entries.entries()) {
    if (!Array.isArray(entry) || entry.length !== 6) throw new Error('Invalid entry shape at '+i)
    const [date, source, ru, ruText, en, enText] = entry
    if (entry.some(v => typeof v !== 'string' || v.trim() !== v || !v)) throw new Error('Missing or invalid field at '+i)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Invalid date at '+i)
    if (i && date > entries[i-1][0]) throw new Error('History must be newest first')
    if (!/^(pull\/[1-9]\d*|commit\/[a-f0-9]{7,40})$/.test(source)) throw new Error('Use a GitHub pull request or commit reference at '+i)
    if (ruText.length < 25 || enText.length < 25) throw new Error('Add meaningful descriptions in both languages at '+i)
    if (ru === en && ruText === enText) throw new Error('Translate descriptions at '+i)
    for (const [j, title] of [ru,en].entries()) {
      const key = title.toLowerCase()
      if (titles[j].has(key)) throw new Error('Duplicate release title: '+title)
      titles[j].add(key)
    }
  }
  return entries
}

// Deliberately conservative heuristic: large application changes need an entry.
export function isMajorChange(files) {
  const app = files.filter(f => f.path !== historyPath && /^(src\/|server\/|catalog\/|assets\/|public\/|index\.html$)/.test(f.path))
  return app.length >= 5 ||
    app.reduce((total, f) => total + f.lines, 0) >= 200 ||
    app.some(f => f.added && /^(src\/|server\/).+\.(?:js|mjs|ts)$/.test(f.path)) ||
    app.some(f => /^server\/db\/migrations\//.test(f.path))
}

export function checkChange(before, after, files) {
  validateHistory(after)
  const ru = new Set(before.map(e => e[2].toLowerCase()))
  const en = new Set(before.map(e => e[4].toLowerCase()))
  const added = after.filter(e => !ru.has(e[2].toLowerCase()) && !en.has(e[4].toLowerCase()))
  if (isMajorChange(files) && (!added.length || after.length <= before.length)) {
    throw new Error('Major application update: add a new bilingual release entry to '+historyPath+' without removing the previous entries')
  }
  return added.length
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16*1024*1024 })
function sourceAt(ref) {
  try { return git('show', ref+':'+historyPath) }
  catch (error) {
    // Older branches may predate the history component.
    try { git('cat-file','-e',ref+'^{commit}') } catch { throw error }
    try { git('cat-file','-e',ref+':'+historyPath) } catch { return '' }
    throw error
  }
}

export function parseChangedFiles(numstat, nameStatus) {
  const status = nameStatus.split('\0').filter(Boolean)
  const added = new Set()
  for (let i=0;i<status.length;i+=2) if (status[i] === 'A') added.add(status[i+1])
  return numstat.split('\0').filter(Boolean).map(row => {
    const [a,d,...parts] = row.split('\t')
    const path = parts.join('\t')
    return {path, lines:(Number(a)||0)+(Number(d)||0), added:added.has(path)}
  })
}

export function changedFiles(base, head) {
  return parseChangedFiles(git('diff','--no-renames','--numstat','-z',base,head),git('diff','--no-renames','--name-status','-z',base,head))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [base, head] = process.argv.slice(2)
    if (base === '--snapshot') {
      const [, previous, numstat, status] = process.argv.slice(2)
      if (!previous || !numstat || !status) throw new Error('Usage: --snapshot BEFORE NUMSTAT STATUS')
      const before = parseHistory(readFileSync(previous,'utf8'),{allowMissing:true})
      const after = parseHistory(readFileSync(new URL('../'+historyPath,import.meta.url),'utf8'))
      const count = checkChange(before,after,parseChangedFiles(readFileSync(numstat,'utf8'),readFileSync(status,'utf8')))
      console.log('Release history check passed: '+count+' new entries')
    } else if (base && head) {
      const before = parseHistory(sourceAt(base),{allowMissing:true})
      const after = parseHistory(sourceAt(head))
      const count = checkChange(before, after, changedFiles(base,head))
      console.log('Release history check passed: '+count+' new entries')
    } else if (!base && !head) {
      console.log('Release history valid: '+validateHistory(parseHistory(readFileSync(new URL('../'+historyPath,import.meta.url),'utf8'))).length+' entries')
    } else throw new Error('Usage: node scripts/check-release-history.mjs [BASE HEAD]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
