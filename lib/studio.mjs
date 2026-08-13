// DevEco Studio local-install discovery: install root + version, the built-in
// codelinter rule docs, and the bundled hvigorw build tool.
// Everything is read from the user's local install at runtime (see notices.json
// entries "codelinter-rules" and "sdk-dts") — nothing is redistributed.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve as pathResolve } from 'node:path'
import { STUDIO_ROOTS } from './sdk-dts.mjs'

const env = (typeof process !== 'undefined' && process.env) || {}

export function findStudioRoot(extraRoots = []) {
  const roots = []
  for (const r of extraRoots) if (r) roots.push(pathResolve(r))
  for (const r of STUDIO_ROOTS) roots.push(r)
  for (const root of roots) {
    if (existsSync(join(root, 'product-info.json'))) return { ok: true, root }
  }
  return { ok: false, root: '', error: 'DevEco Studio install not found (checked DEVECO_SDK_HOME-adjacent and default paths).' }
}

export function studioVersion(root) {
  try {
    const info = JSON.parse(readFileSync(join(root, 'product-info.json'), 'utf8'))
    return (info && info.version) || null
  } catch {
    return null
  }
}

export function hvigorwPath(root) {
  const win = join(root, 'tools', 'hvigor', 'bin', 'hvigorw.bat')
  if (existsSync(win)) return { ok: true, path: win, kind: 'batch' }
  const posix = join(root, 'tools', 'hvigor', 'bin', 'hvigorw')
  if (existsSync(posix)) return { ok: true, path: posix, kind: 'sh' }
  return { ok: false, path: '', kind: '' }
}

// Rule docs live as docs/<rule-id>-{cn,en}.md under each codelinter plugin.
export function listCodelinterRules(root) {
  const out = []
  try {
    const pluginDir = join(root, 'plugins', 'codelinter')
    if (!existsSync(pluginDir)) return { ok: false, error: 'plugins/codelinter not found in the DevEco Studio install', rules: [], docsDir: '' }
    for (const plugin of readdirSync(pluginDir)) {
      const docsDir = join(pluginDir, plugin, 'docs')
      if (!existsSync(docsDir)) continue
      for (const f of readdirSync(docsDir)) {
        const m = /^(.+)-cn\.md$/.exec(f)
        if (!m) continue
        const id = m[1]
        const en = id + '-en.md'
        const title = ruleTitle(join(docsDir, f)) || id
        out.push({ id, title, plugin, cn: f, en: existsSync(join(docsDir, en)) ? en : '' })
      }
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), rules: [], docsDir: '' }
  }
  return { ok: true, error: '', rules: out, docsDir: join(root, 'plugins', 'codelinter') }
}

function ruleTitle(file) {
  try {
    const text = readFileSync(file, 'utf8')
    const m = /^#\s+(.+)$/m.exec(text)
    return m ? m[1].trim().slice(0, 120) : ''
  } catch {
    return ''
  }
}

export function readRuleDoc(root, id, lang) {
  const safeId = /^[\w-]{1,80}$/.test(id) ? id : ''
  if (!safeId) return { ok: false, error: 'invalid rule id' }
  const langSuffix = lang === 'en' ? '-en' : '-cn'
  try {
    const pluginDir = join(root, 'plugins', 'codelinter')
    for (const plugin of readdirSync(pluginDir)) {
      const file = join(pluginDir, plugin, 'docs', safeId + langSuffix + '.md')
      if (existsSync(file)) {
        return { ok: true, file, text: readFileSync(file, 'utf8').slice(0, 20000) }
      }
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
  return { ok: false, error: 'rule doc not found: ' + safeId + langSuffix + '.md' }
}
