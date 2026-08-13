// Target API version resolution: project build-profile.json5 > connected device
// > local SDK — the three sources the knowledge layer classifies against.
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve as pathResolve } from 'node:path'

export function extractApiNumber(value) {
  const s = String(value == null ? '' : value).trim()
  const paren = /\((\d+)\)/.exec(s)
  if (paren) return parseInt(paren[1], 10)
  const bare = /^(\d+)$/.exec(s)
  if (bare) return parseInt(bare[1], 10)
  const dot = /^(\d+)(\.\d+)*$/.exec(s)
  if (dot) return parseInt(dot[1], 10)
  return null
}

export function parseCompatibleSdk(text) {
  const out = {}
  const re = /(compileSdkVersion|compatibleSdkVersion)["']?\s*:\s*["']?([^"',\s]+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const v = extractApiNumber(m[2])
    if (v !== null) out[m[1]] = v
  }
  return out
}

// Walk up from startDir looking for build-profile.json5 (project marker).
export function findProjectProfile(startDir) {
  let dir = pathResolve(startDir || '.')
  for (let i = 0; i < 12; i++) {
    const file = join(dir, 'build-profile.json5')
    if (existsSync(file)) {
      try { return { ok: true, path: file, text: readFileSync(file, 'utf8'), dir } } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) }
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { ok: false, error: 'no build-profile.json5 found up the tree (not a HarmonyOS project directory)' }
}

// deviceApi is an object from the caller: { ok, api, model, error }.
export function resolveApi({ explicit, project, device, sdk }) {
  const sources = { explicit: explicit ?? null, project: project ?? null, device: device ?? null, sdk: sdk ?? null }
  const order = [['project', project], ['device', device], ['sdk', sdk]]
  let api = explicit ?? null
  let source = explicit != null ? 'explicit' : null
  if (api == null) {
    for (const [name, v] of order) {
      if (v != null) { api = v; source = name; break }
    }
  }
  const mismatches = []
  const pairs = [['project', 'device'], ['project', 'sdk'], ['device', 'sdk']]
  for (const [a, b] of pairs) {
    const va = sources[a]; const vb = sources[b]
    if (va != null && vb != null && va !== vb) {
      mismatches.push(`${a}=API ${va} vs ${b}=API ${vb}`)
    }
  }
  return { api, source, sources, mismatches }
}
