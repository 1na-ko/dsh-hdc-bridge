// Shared hdc discovery primitives — the single source for both the tool layer
// (lib/hdc-core.mjs, probing through the session shell) and the browser panel
// (lib/panel.mjs, probing with direct execFile). Only default install roots
// live here; non-default installs are covered by DEVECO_SDK_HOME, the Studio
// root the host finds dynamically, caller-provided extraRoots, and the PATH
// fallback each layer runs after the candidate list is exhausted.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const VER_RE = /Ver:/i

const IS_WIN = typeof process !== 'undefined' && process.platform === 'win32'
const HDC_BIN = IS_WIN ? 'hdc.exe' : 'hdc'

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
  try { push(process.env && process.env.DEVECO_SDK_HOME) } catch (e) { /* env 読取不可環境でも継続 */ }
  for (const r of extraRoots || []) push(r)
  return roots
}

// Candidate hdc paths: dynamic roots first (env + caller extras), then the
// default install roots; each SDK root crossed with every known API layout in
// both path spellings. Kept for callers that want the full cross-product
// (the panel filters it with its own access check); prefer
// existingHdcCandidates() for anything that is going to RUN a probe.
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

function normKey(value) {
  return String(value).replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

// A candidate is only worth probing when the file is really there. The
// platform check keeps POSIX hosts honest: `hdc` carries no extension there,
// and a Windows-shaped path (backslashes) is a literal filename on POSIX.
function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false
  } catch (e) {
    return false
  }
  return IS_WIN ? /\.exe$/i.test(path) : true
}

// Ordered SDK roots with the provenance each one came from, deduped by
// normalized path. Pure: no probing, no shell.
export function hdcRootCandidates(extraRoots) {
  const out = []
  const seen = new Set()
  const push = (root, source) => {
    const text = String(root == null ? '' : root).trim()
    if (!text) return
    const key = normKey(text)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ root: text.replace(/[\\/]+$/, ''), source })
  }
  let envRoot = ''
  try { envRoot = (process.env && process.env.DEVECO_SDK_HOME) || '' } catch (e) { envRoot = '' }
  push(envRoot, 'env:DEVECO_SDK_HOME')
  for (const r of extraRoots || []) push(r, 'discovered')
  for (const r of HDC_ROOTS) push(r, 'default-root')
  return out
}

// Existing executables only, deduped, capped: probing 80 paths at several
// seconds each is what made a session without a cached hdc path look hung.
// Separators and the binary name are built with node:path, so the same code
// resolves `...\default\openharmony\toolchains\hdc.exe` on Windows and
// `.../default/openharmony/toolchains/hdc` on macOS/Linux.
export function existingHdcCandidates(opts) {
  const options = opts || {}
  const max = Math.max(1, Math.min(Number(options.max) || 5, 20))
  const roots = hdcRootCandidates(options.extraRoots)
  const versions = ['default', ...HDC_VERS.filter((v) => v !== 'default')]
  const candidates = []
  const seen = new Set()
  let truncated = false
  outer:
  for (const { root, source } of roots) {
    // One existence check per root: an absent root (or an unreachable network
    // share) costs a single stat instead of one per API-version layout.
    if (!existsSync(root)) continue
    for (const version of versions) {
      const path = join(root, version, 'openharmony', 'toolchains', HDC_BIN)
      const key = normKey(path)
      if (seen.has(key)) continue
      seen.add(key)
      if (!isExecutableFile(path)) continue
      candidates.push({ path, source })
      if (candidates.length >= max) { truncated = true; break outer }
    }
  }
  return {
    candidates,
    truncated,
    searchedRoots: roots.slice(0, 12).map((entry) => entry.root),
    searchedRootCount: roots.length,
  }
}
