// HarmonyOS SDK .d.ts knowledge resolver (hms_api backend).
// Reads ONLY from the user's local DevEco Studio / SDK install at runtime and
// never redistributes SDK content (see notices.json entry "sdk-dts").
// The SDK .d.ts files are Apache-2.0 (Copyright (c) Huawei Device Co., Ltd.),
// but runtime-local reads keep this plugin free of any redistribution duty.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve as pathResolve } from 'node:path'

export const STUDIO_ROOTS = [
  'C:\\Program Files\\Huawei\\DevEco Studio',
  'D:\\Program Files\\Huawei\\DevEco Studio',
  'F:\\Huawei\\DevEco Studio',
  '/Applications/DevEco-Studio.app/Contents',
]

const env = (typeof process !== 'undefined' && process.env) || {}
const NUMERIC_RE = /^\d+$/

function isApiDir(dir) {
  if (!existsSync(dir)) return false
  try {
    return readdirSync(dir).some((f) => f.startsWith('@ohos.') && f.endsWith('.d.ts'))
  } catch {
    return false
  }
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

// Locate the SDK: DEVECO_SDK_HOME > explicit roots > known Studio install dirs.
// Accepts either an SDK root (…/sdk) or a DevEco Studio root (sdk/ lives under it).
export function findSdkInfo(extraRoots = []) {
  const roots = []
  if (env.DEVECO_SDK_HOME) roots.push(pathResolve(env.DEVECO_SDK_HOME))
  for (const r of extraRoots) if (r) roots.push(pathResolve(r))
  for (const r of STUDIO_ROOTS) roots.push(join(r, 'sdk'))

  for (const root of roots) {
    let apiDir = ''
    let sdkRoot = ''
    let flavor = ''
    const def = join(root, 'default', 'openharmony', 'ets', 'api')
    if (isApiDir(def)) {
      apiDir = def; sdkRoot = root; flavor = 'default'
    } else {
      try {
        const vers = readdirSync(root).filter((d) => NUMERIC_RE.test(d)).sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
        for (const v of vers) {
          const cand = join(root, v, 'openharmony', 'ets', 'api')
          if (isApiDir(cand)) { apiDir = cand; sdkRoot = join(root, v); flavor = v; break }
        }
      } catch { /* keep scanning roots */ }
    }
    if (!apiDir) continue
    const uni = readJson(join(join(apiDir, '..'), 'oh-uni-package.json'))
    const av = uni && uni.apiVersion != null ? (typeof uni.apiVersion === 'number' ? uni.apiVersion : parseInt(String(uni.apiVersion), 10)) : NaN
    return {
      ok: true,
      sdkRoot,
      flavor,
      apiDir,
      apiVersion: Number.isInteger(av) ? av : null,
      sdkVersion: (uni && uni.version) || null,
      license: 'Apache-2.0 (local SDK read, never redistributed)',
    }
  }
  return {
    ok: false,
    error: 'DevEco Studio / HarmonyOS SDK not found. Install DevEco Studio (developer.huawei.com) or set DEVECO_SDK_HOME, then re-run hms_setup.',
    apiDir: '', sdkRoot: '', flavor: '', apiVersion: null, sdkVersion: null,
  }
}

export function listModules(apiDir) {
  try {
    return readdirSync(apiDir)
      .filter((f) => /^@(ohos|system)\.[\w.-]+\.d\.ts$/.test(f))
      .map((f) => f.replace(/\.d\.ts$/, ''))
      .sort()
  } catch {
    return []
  }
}

export const MODULE_RE = /^@(ohos|system)\.[\w.-]+$/

// Read one module declaration file with strict name validation (no traversal).
export function readModule(apiDir, module) {
  if (!MODULE_RE.test(module)) return { ok: false, error: 'invalid module name (expected @ohos.* or @system.*)' }
  const file = join(apiDir, module + '.d.ts')
  if (!file.startsWith(apiDir) || !existsSync(file)) return { ok: false, error: 'module not found in the local SDK: ' + module }
  try { return { ok: true, file, text: readFileSync(file, 'utf8') } } catch (e) {
    return { ok: false, error: 'read failed: ' + (e && e.message ? e.message : String(e)) }
  }
}

const DECL_RE = /^\s*(?:(?:export|declare)\s+)*(?:(?:default|abstract|async)\s+)*(function|class|interface|enum|const|let|var|type|namespace)\s+([A-Za-z_$][\w$]*)/
const CONST_ENUM_RE = /^\s*(?:(?:export|declare)\s+)*const\s+enum\s+([A-Za-z_$][\w$]*)/

// Parse a HarmonyOS .d.ts into declared entries with version tags.
// The official SDK stacks one JSDoc block per API version above a single
// declaration (e.g. three blocks with @since 9/10/11 above one function), and
// most APIs live inside `declare namespace` without an `export` prefix, so this
// parser accumulates consecutive JSDoc blocks and matches indented declarations.
export function parseDts(text) {
  const lines = text.split(/\r?\n/)
  const entries = []
  let kit = ''
  let pending = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*\/\*\*/.test(line)) {
      const block = { since: null, deprecatedSince: null, syscap: null, permission: null, descParts: [] }
      i++
      let closed = false
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t === '*/' || t.endsWith('*/')) { i++; closed = true; break }
        if (t.startsWith('*')) {
          const body = t.slice(1).trim()
          if (body.startsWith('@')) {
            const sm = /@since\s+(\d+)/.exec(body)
            if (sm) block.since = parseInt(sm[1], 10)
            const dm = /@deprecated(?:\s+since\s+(\d+))?/.exec(body)
            if (dm) block.deprecatedSince = dm[1] ? parseInt(dm[1], 10) : 0
            const cm = /@syscap\s+(\S+)/.exec(body)
            if (cm) block.syscap = cm[1]
            const pm = /@permission\s+(\S+)/.exec(body)
            if (pm) block.permission = pm[1]
            const km = /@kit\s+(\S+)/.exec(body)
            if (km && !kit) kit = km[1]
          } else if (body) {
            block.descParts.push(body)
          }
        }
        i++
      }
      if (closed) pending.push(block)
      continue
    }
    if (pending.length > 0) {
      if (line.trim() === '') { i++; continue }
      const constEnum = CONST_ENUM_RE.exec(line)
      const m = constEnum || DECL_RE.exec(line)
      if (m) {
        const sins = pending.map((b) => b.since).filter((s) => s != null)
        const dps = pending.map((b) => b.deprecatedSince).filter((s) => s != null)
        const desc = pending.map((b) => b.descParts.join(' ')).find((d) => d.trim()) || ''
        const head = pending.find((b) => b.syscap || b.permission) || pending[0]
        entries.push({
          kind: constEnum ? 'const enum' : m[1],
          name: constEnum ? constEnum[1] : m[2],
          since: sins.length ? Math.min(...sins) : null,
          deprecatedSince: dps.length ? Math.max(...dps) : null,
          syscap: head.syscap,
          permission: head.permission,
          description: desc.replace(/\s+/g, ' ').trim().slice(0, 260),
          snippet: lines.slice(i, i + 24).join('\n'),
        })
        pending = []
        i++
        continue
      }
      // non-blank, non-declaration line follows the docs: drop the pending group
      pending = []
    }
    i++
  }
  return { entries, kit }
}

export function classifyEntry(entry, targetApi) {
  const notes = []
  let status = 'unknown'
  let deprecated = false
  if (entry.since == null) {
    status = 'available'
    notes.push('no @since tag (baseline API, assumed available)')
  } else if (targetApi == null) {
    status = 'unknown-target'
    notes.push('pass targetApi to classify against a target API version')
  } else if (entry.since <= targetApi) {
    status = 'available'
    if (entry.deprecatedSince != null && entry.deprecatedSince <= targetApi) {
      deprecated = true
      notes.push('deprecated since API ' + entry.deprecatedSince + ' — prefer the replacement API')
    }
  } else {
    status = 'unavailable'
    notes.push('requires API >= ' + entry.since + '; the target is API ' + targetApi)
  }
  return { status, deprecated, notes }
}

// Query: find entries by optional name; classify against the target API version.
export function queryModule(text, name, targetApi, sdkApiVersion) {
  const parsed = parseDts(text)
  const all = name ? parsed.entries.filter((e) => e.name === name) : parsed.entries
  const results = all.slice(0, 40).map((e) => {
    const c = classifyEntry(e, targetApi)
    return {
      kind: e.kind,
      name: e.name,
      since: e.since,
      deprecatedSince: e.deprecatedSince,
      syscap: e.syscap,
      permission: e.permission,
      description: e.description,
      status: c.status,
      deprecated: c.deprecated,
      notes: c.notes,
    }
  })
  const warnings = []
  if (sdkApiVersion != null && targetApi != null && sdkApiVersion < targetApi) {
    warnings.push('local SDK is API ' + sdkApiVersion + ', older than the target API ' + targetApi + ' — results may miss newer APIs; update DevEco Studio/SDK or lower the target.')
  }
  if (name && all.length === 0) warnings.push('no exported entry named "' + name + '" in this module (overloads and members are listed under their exported names).')
  if (name && all.length > 40) warnings.push('more than 40 overloads matched; only the first 40 are returned — narrow with hms_api snippet.')
  return {
    ok: true,
    kit: parsed.kit,
    total: results.length,
    results,
    warnings,
    note: 'Source: local HarmonyOS SDK .d.ts (' + (sdkApiVersion != null ? 'SDK API ' + sdkApiVersion : 'SDK') + ', Apache-2.0, read locally — never redistributed).',
  }
}

// Raw snippet window around a named entry (for signature details).
export function snippetFor(text, name, radius = 30) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (DECL_RE.test(lines[i]) && lines[i].includes(name)) {
      const from = Math.max(0, i - 6)
      const to = Math.min(lines.length, i + radius)
      out.push({ start: from + 1, text: lines.slice(from, to).join('\n') })
      if (out.length >= 3) break
    }
  }
  return out
}
