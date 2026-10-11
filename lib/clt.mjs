// Huawei standalone "Command Line Tools" (命令行工具) discovery.
//
// The CLT is a zip distribution (codelinter, hstack, hvigorw, ohpm, emulator,
// and an EMBEDDED SDK under <root>/sdk) with no installer: users extract it
// anywhere and put <root>/bin on PATH. Mirroring the official deveco-cli
// protocol (tool-provider.ts): DEVECO_CLI_CLT_PATH env first (the issue
// reporters also set COMMAND_LINE_TOOL_PATH, so both are honored), then the
// common community roots.
//
// Two root shapes are accepted: version.txt carrying "# Version: 26.0.0.xxxx"
// (documented zip layout) and, when that marker is missing or unreadable, the
// layout signature itself — an embedded sdk/ plus one of the shipped component
// directories. The HNP-distributed CLT (HarmonyOS PC: /data/service/hnp/
// hmos-clt.org/hmos-clt_1.0.0, owned by installs and read-only to the user)
// ships no version.txt at all; its generation comes from sdk/default/
// sdk-pkg.json instead (issue #10). Studio and Command Line Tools stay two
// sibling toolchain kinds — this module never guesses a Studio install.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const env = (typeof process !== 'undefined' && process.env) || {}

export function parseCltVersion(text) {
  const m = /^#\s*Version:\s*(\S+)/m.exec(String(text || ''))
  return m ? m[1] : ''
}

export function cltSdkRoot(root) {
  return join(root, 'sdk')
}

// The embedded SDK package manifest. It exists in both layouts
// (<root>/sdk/default/sdk-pkg.json in the zip and HNP trees) and carries the
// generation the feature gates need when version.txt cannot provide it.
export function readCltSdkManifest(root) {
  const candidates = [join(root, 'sdk', 'default', 'sdk-pkg.json'), join(root, 'sdk', 'sdk-pkg.json')]
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue
      const pkg = JSON.parse(readFileSync(path, 'utf8'))
      const api = Number(pkg.apiVersion)
      return {
        path,
        version: String(pkg.version || pkg.sdkVersion || pkg.displayVersion || ''),
        apiVersion: Number.isFinite(api) ? api : 0,
      }
    } catch (e) { /* keep probing the next candidate */ }
  }
  return { path: '', version: '', apiVersion: 0 }
}

// Layout signature for a CLT root without version.txt: an embedded SDK tree
// plus at least one of the component directories every distribution ships. A
// bare sdk/ folder (or a Studio SDK root, whose manifest sits one level up) is
// not enough — this module never guesses a Studio install.
function looksLikeCltRoot(root) {
  try {
    if (!existsSync(cltSdkRoot(root))) return false
    for (const name of ['hvigor', 'ohpm', 'codelinter', 'node']) {
      if (existsSync(join(root, name))) return true
    }
    return existsSync(join(root, 'sdk', 'default', 'openharmony'))
  } catch (e) {
    return false
  }
}

function candidateRoots(extraRoots) {
  const list = []
  const push = (r) => { if (r && !list.includes(String(r))) list.push(String(r)) }
  try { push(env.DEVECO_CLI_CLT_PATH) } catch (e) { /* keep scanning */ }
  try { push(env.COMMAND_LINE_TOOL_PATH) } catch (e) { /* keep scanning */ }
  for (const r of extraRoots || []) push(r)
  try {
    if (typeof process !== 'undefined' && process.platform === 'win32') {
      push('C:\\command-line-tools')
      push('D:\\command-line-tools')
    }
    push(join(env.USERPROFILE || env.HOME || '', 'command-line-tools'))
    push('/opt/command-line-tools')
  } catch (e) { /* best effort */ }
  return list
}

export function findCltRoot(extraRoots = []) {
  for (const root of candidateRoots(extraRoots)) {
    const marker = join(root, 'version.txt')
    let version = ''
    if (existsSync(marker)) {
      try { version = parseCltVersion(readFileSync(marker, 'utf8')) } catch (e) { /* layout fallback below */ }
    }
    // version.txt stays the documented marker; when it is absent (or holds no
    // parsable version line) the layout signature identifies the root instead.
    if (!version && !looksLikeCltRoot(root)) continue
    const manifest = readCltSdkManifest(root)
    return {
      ok: true,
      root,
      // Report '' rather than inventing a number: the manifest version is a
      // fact, the apiVersion is reported as its own field for the gates.
      version: version || manifest.version,
      apiVersion: manifest.apiVersion,
      layout: version ? 'version.txt' : 'sdk-pkg.json',
    }
  }
  return {
    ok: false,
    root: '',
    version: '',
    apiVersion: 0,
    error: 'Command Line Tools not found. Set DEVECO_CLI_CLT_PATH (or COMMAND_LINE_TOOL_PATH) to the extracted folder — identified by version.txt or an embedded sdk/default tree — or download it from developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos.',
  }
}
