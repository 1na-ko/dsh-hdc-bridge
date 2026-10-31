// Shared hdc discovery primitives — the single source for both the tool layer
// (lib/hdc-core.mjs, probing through the session shell) and the browser panel
// (lib/panel.mjs, probing with direct execFile). Only default install roots
// live here; non-default installs are covered by DEVECO_SDK_HOME, the Studio
// root the host finds dynamically, caller-provided extraRoots, and the PATH
// fallback each layer runs after the candidate list is exhausted.

import { existsSync, statSync } from 'node:fs'

export const VER_RE = /Ver:/i

export const HDC_ROOTS = [
  'C:\\Program Files\\Huawei\\DevEco Studio\\sdk',
  'D:\\Program Files\\Huawei\\DevEco Studio\\sdk',
  '/Applications/DevEco-Studio.app/Contents/sdk',
]
export const HDC_VERS = ['default', '10', '11', '12', '13', '14', '15', '16', '17', '18']

export const HDC_NOT_FOUND = 'hdc not found. Install DevEco Studio or HarmonyOS command-line tools, or put hdc on PATH.'

function dynamicSdkRoots(extraRoots) {
  const roots = []
  const push = (r) => { if (r && !roots.includes(String(r))) roots.push(String(r)) }
  try { push(process.env && process.env.DEVECO_SDK_HOME) } catch (e) { /* env read guarded */ }
  for (const r of extraRoots || []) push(r)
  return roots
}

// Legacy: the full cross-product. Kept for compatibility with older callers;
// prefer discoverHdcCandidates(), which filters, dedupes and caps.
export function hdcCandidates(extraRoots) {
  const list = []
  for (const root of [...dynamicSdkRoots(extraRoots), ...HDC_ROOTS]) {
    for (const v of HDC_VERS) {
      list.push(root + '\\' + v + '\\openharmony\\toolchains\\hdc.exe')
      list.push(root + '/' + v + '/openharmony/toolchains/hdc')
    }
  }
  return list
}

function normKey(p) {
  return String(p).replace(/[\\/]+/g, '/').toLowerCase()
}

function isExecutableFile(p) {
  try {
    const st = statSync(p)
    if (!st.isFile()) return false
  } catch (e) {
    return false
  }
  if (process.platform === 'win32') return /\.exe$/i.test(p)
  return true
}

// Ordered, filtered, deduped, capped candidate list.
// Sources are labelled so callers can report where a path came from.
export function discoverHdcCandidates(opts) {
  const o = opts || {}
  const max = Math.max(1, Math.min(Number(o.max) || 5, 20))
  const roots = []
  const seenRoot = new Set()
  const pushRoot = (root, source) => {
    if (!root) return
    const key = normKey(root)
    if (seenRoot.has(key)) return
    seenRoot.add(key)
    roots.push({ root: String(root).replace(/[\\/]+$/, ''), source })
  }

  let envRoot = ''
  try { envRoot = (process.env && process.env.DEVECO_SDK_HOME) || '' } catch (e) { envRoot = '' }
  pushRoot(envRoot, 'env:DEVECO_SDK_HOME')
  for (const r of o.extraRoots || []) pushRoot(r, 'discovered')
  if (envRoot) pushRoot(envRoot.replace(/[\\/]+sdk$/i, '') + '\\sdk', 'env:DEVECO_STUDIO_HOME')
  pushRoot('D:\\Huawei\\DevEco Studio\\sdk', 'default-root')
  for (const r of HDC_ROOTS) pushRoot(r, 'default-root')

  const seen = new Set()
  const candidates = []
  let truncated = false
  const versions = ['default', ...HDC_VERS.filter((v) => v !== 'default')]

  outer:
  for (const { root, source } of roots) {
    for (const v of versions) {
      const p = root + '\\' + v + '\\openharmony\\toolchains\\hdc.exe'
      const key = normKey(p)
      if (seen.has(key)) continue
      seen.add(key)
      if (!isExecutableFile(p)) continue
      candidates.push({ path: p, source, exists: true })
      if (candidates.length >= max) { truncated = true; break outer }
    }
  }

  return {
    candidates,
    truncated,
    searchedRoots: roots.slice(0, 12).map((r) => r.root),
    searchedRootCount: roots.length,
  }
}
