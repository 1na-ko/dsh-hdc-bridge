// DevEco Studio local-install discovery: install root + version, the built-in
// codelinter rule docs, and the bundled hvigorw build tool.
// Everything is read from the user's local install at runtime (see notices.json
// entries "codelinter-rules" and "sdk-dts") — nothing is redistributed.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { delimiter as pathDelimiter, dirname, extname, join, resolve as pathResolve } from 'node:path'
import { STUDIO_ROOTS } from './sdk-dts.mjs'

const env = (typeof process !== 'undefined' && process.env) || {}
const isWindows = typeof process !== 'undefined' && process.platform === 'win32'
const STUDIO_ENV_NAMES = ['DEVECO_STUDIO_HOME', 'DEVECO_HOME', 'DEVECO_SDK_HOME']
const SDK_ENV_NAMES = ['DEVECO_SDK_HOME', 'HARMONY_SDK_HOME', 'OHOS_SDK_HOME']
const HDC_ENV_NAMES = ['HDC_PATH', 'HDC_HOME']
const REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\Huawei\\DevEco Studio',
  'HKLM\\SOFTWARE\\WOW6432Node\\Huawei\\DevEco Studio',
  'HKCU\\SOFTWARE\\Huawei\\DevEco Studio',
  'HKCU\\SOFTWARE\\WOW6432Node\\Huawei\\DevEco Studio',
]
const PATH_REGISTRY_KEYS = [
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
  'HKCU\\Environment',
]
let registryPathCache
let registryPathEntriesCache

export function splitPathEntries(value, separator = pathDelimiter) {
  return String(value || '').split(separator).map((entry) => entry.trim()).filter(Boolean)
}

function registryValues(text) {
  const values = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^\s*(?:\([^)]*\)|\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i.exec(line)
    if (match) values.push(match[1].trim().replace(/^"(.*)"$/, '$1'))
  }
  return values
}

// `reg query ... /s` writes paths as values such as:
//   (Default)    REG_SZ    C:\Users\name\DevEco Studio
// Keep this parser pure for regression tests and use filesystem validation
// before accepting any result as a Studio root.
export function parseRegistryPaths(text) {
  const paths = []
  const seen = new Set()
  for (const value of registryValues(text)) {
    if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value)) continue
    const key = value.toLowerCase()
    if (!seen.has(key)) { seen.add(key); paths.push(value) }
  }
  return paths
}

export function parseRegistryPathEntries(text, separator = ';') {
  const entries = []
  const seen = new Set()
  for (const value of registryValues(text)) {
    for (const entry of splitPathEntries(value, separator)) {
      const key = entry.toLowerCase()
      if (!seen.has(key)) { seen.add(key); entries.push(entry) }
    }
  }
  return entries
}

export function isDevEcoProductInfo(info) {
  if (!info || typeof info !== 'object') return false
  const identity = [info.name, info.productName, info.productVendor, info.envVarBaseName, info.dataDirectoryName].filter(Boolean).join(' ')
  return /deveco/i.test(identity)
}

function queryRegistry(args) {
  try {
    return execFileSync('reg.exe', args, {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 1500, maxBuffer: 262144,
    })
  } catch {
    return ''
  }
}

function registryStudioPaths() {
  if (registryPathCache !== undefined) return registryPathCache
  registryPathCache = []
  if (!isWindows) return registryPathCache
  const seen = new Set()
  for (const key of REGISTRY_KEYS) {
    for (const value of parseRegistryPaths(queryRegistry(['query', key, '/s']))) {
      const normalized = value.toLowerCase()
      if (!seen.has(normalized)) { seen.add(normalized); registryPathCache.push(value) }
    }
  }
  return registryPathCache
}

function cleanPath(value) {
  let text = String(value || '').trim().replace(/^"(.*)"$/, '$1')
  text = text.replace(/%([^%]+)%/g, (all, name) => env[name] || all)
  return text
}

function registryPathEntries() {
  if (registryPathEntriesCache !== undefined) return registryPathEntriesCache
  registryPathEntriesCache = []
  if (!isWindows) return registryPathEntriesCache
  const seen = new Set()
  for (const key of PATH_REGISTRY_KEYS) {
    for (const value of parseRegistryPathEntries(queryRegistry(['query', key, '/v', 'Path']))) {
      const entry = cleanPath(value)
      if (!entry) continue
      const normalized = entry.toLowerCase()
      if (!seen.has(normalized)) { seen.add(normalized); registryPathEntriesCache.push(entry) }
    }
  }
  return registryPathEntriesCache
}

function allPathEntries() {
  const entries = []
  const seen = new Set()
  const add = (value) => {
    const entry = cleanPath(value)
    if (!entry) return
    const key = isWindows ? entry.toLowerCase() : entry
    if (!seen.has(key)) { seen.add(key); entries.push(entry) }
  }
  for (const value of splitPathEntries(env.PATH)) add(value)
  if (env.Path && env.Path !== env.PATH) for (const value of splitPathEntries(env.Path)) add(value)
  for (const value of registryPathEntries()) add(value)
  return entries
}

function isDevEcoStudioRoot(root) {
  const infoFile = join(root, 'product-info.json')
  if (!existsSync(infoFile)) return false
  try {
    const info = JSON.parse(readFileSync(infoFile, 'utf8'))
    if (isDevEcoProductInfo(info)) return true
  } catch { return false }
  // Older builds may lack complete product metadata, but retain the DevEco
  // launcher plus SDK signature rather than accepting any JetBrains product.
  return existsSync(join(root, 'bin', 'devecostudio64.exe')) && existsSync(join(root, 'sdk'))
}

function addStudioRoot(records, value, source) {
  let current = cleanPath(value)
  if (!current) return
  try { current = pathResolve(current) } catch { return }
  if (extname(current)) current = dirname(current)
  for (let depth = 0; depth < 7; depth += 1) {
    if (isDevEcoStudioRoot(current)) {
      const key = current.toLowerCase()
      const existing = records.get(key)
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source)
      } else {
        records.set(key, { root: current, sources: [source] })
      }
      return
    }
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}

// Discover only validated Studio roots. Explicit paths win, followed by
// environment variables, registry records, PATH entries, and legacy defaults.
export function discoverStudioRoots(extraRoots = []) {
  const records = new Map()
  for (const root of extraRoots) addStudioRoot(records, root, 'explicit')
  for (const name of STUDIO_ENV_NAMES) {
    if (env[name]) addStudioRoot(records, env[name], 'env:' + name)
  }
  const registryPaths = registryStudioPaths()
  for (const root of registryPaths) addStudioRoot(records, root, 'registry')
  const pathEntries = allPathEntries()
  for (const entry of pathEntries) addStudioRoot(records, entry, 'PATH')
  for (const root of STUDIO_ROOTS) addStudioRoot(records, root, 'default')
  return { roots: [...records.values()], registryPaths, pathEntries }
}

function addHdcCandidate(records, value, source) {
  let candidate = cleanPath(value)
  if (!candidate) return
  try { candidate = pathResolve(candidate) } catch { return }
  if (!existsSync(candidate)) return
  const key = isWindows ? candidate.toLowerCase() : candidate
  const existing = records.get(key)
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source)
  } else {
    records.set(key, { path: candidate, sources: [source] })
  }
}

function addHdcFromDirectory(records, directory, source) {
  const hdcName = isWindows ? 'hdc.exe' : 'hdc'
  addHdcCandidate(records, join(directory, hdcName), source)
}

function addHdcFromSdk(records, sdkRoot, source) {
  const root = cleanPath(sdkRoot)
  if (!root) return
  const versions = new Set(['default'])
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) versions.add(entry.name)
    }
  } catch { /* SDK root may be unavailable to this host */ }
  addHdcFromDirectory(records, root, source)
  addHdcCandidate(records, join(root, 'openharmony', 'toolchains', isWindows ? 'hdc.exe' : 'hdc'), source)
  addHdcCandidate(records, join(root, 'toolchains', isWindows ? 'hdc.exe' : 'hdc'), source)
  for (const version of versions) {
    const base = join(root, version)
    addHdcCandidate(records, join(base, 'openharmony', 'toolchains', isWindows ? 'hdc.exe' : 'hdc'), source)
    addHdcCandidate(records, join(base, 'toolchains', isWindows ? 'hdc.exe' : 'hdc'), source)
  }
}

function addHdcFromPathEntry(records, value, source) {
  const entry = cleanPath(value)
  if (!entry) return
  if (/hdc(?:\.exe)?$/i.test(entry)) addHdcCandidate(records, entry, source)
  addHdcFromDirectory(records, entry, source)
  if (/[\\/]sdk(?:[\\/]|$)/i.test(entry)) addHdcFromSdk(records, entry, source)
}

// hdc can be installed with DevEco Studio, the standalone command-line tools,
// or an SDK added to the machine/user PATH. Return only existing absolute
// candidates so hdc-core can validate them through the session shell.
export function discoverHdcCandidates(extraRoots = []) {
  const records = new Map()
  const studioDiscovery = discoverStudioRoots(extraRoots)
  for (const root of studioDiscovery.roots) addHdcFromSdk(records, join(root.root, 'sdk'), 'studio:' + root.sources.join(','))
  for (const name of SDK_ENV_NAMES) if (env[name]) addHdcFromSdk(records, env[name], 'env:' + name)
  for (const name of HDC_ENV_NAMES) if (env[name]) addHdcFromPathEntry(records, env[name], 'env:' + name)
  for (const value of studioDiscovery.registryPaths) addHdcFromPathEntry(records, value, 'registry:DevEco Studio')
  for (const value of studioDiscovery.pathEntries) addHdcFromPathEntry(records, value, 'PATH')
  return {
    candidates: [...records.values()],
    studioRoots: studioDiscovery.roots,
    registryPaths: studioDiscovery.registryPaths,
    pathEntries: studioDiscovery.pathEntries,
  }
}

export function findStudioRoot(extraRoots = []) {
  const discovery = discoverStudioRoots(extraRoots)
  const found = discovery.roots[0]
  if (found) return { ok: true, root: found.root, sources: found.sources, registryPaths: discovery.registryPaths }
  return {
    ok: false,
    root: '',
    sources: [],
    registryPaths: discovery.registryPaths,
    error: 'DevEco Studio install not found (checked explicit paths, DevEco environment variables, Windows registry, PATH, and default paths).',
  }
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
// pluginsDir overrides the default <root>/plugins/codelinter base so a
// standalone Command Line Tools layout (<clt>/codelinter/plugins) can be probed.
export function listCodelinterRules(root, pluginsDir = '') {
  const out = []
  const baseDir = pluginsDir || join(root, 'plugins', 'codelinter')
  try {
    if (!existsSync(baseDir)) return { ok: false, error: 'plugins/codelinter not found in the DevEco Studio install', rules: [], docsDir: '' }
    for (const plugin of readdirSync(baseDir)) {
      const docsDir = join(baseDir, plugin, 'docs')
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
  return { ok: true, error: '', rules: out, docsDir: baseDir }
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

export function readRuleDoc(root, id, lang, pluginsDir = '') {
  const safeId = /^[\w-]{1,80}$/.test(id) ? id : ''
  if (!safeId) return { ok: false, error: 'invalid rule id' }
  const langSuffix = lang === 'en' ? '-en' : '-cn'
  const baseDir = pluginsDir || join(root, 'plugins', 'codelinter')
  try {
    for (const plugin of readdirSync(baseDir)) {
      const file = join(baseDir, plugin, 'docs', safeId + langSuffix + '.md')
      if (existsSync(file)) {
        return { ok: true, file, text: readFileSync(file, 'utf8').slice(0, 20000) }
      }
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
  return { ok: false, error: 'rule doc not found: ' + safeId + langSuffix + '.md' }
}
