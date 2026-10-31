// devecocli resolution for Windows (and POSIX) shims.
//
// npm global installs are NOT a single .exe: Windows gets devecocli.cmd /
// devecocli.ps1 (plus an extension-less bash shim). A resolver that only looks
// for .exe, or that spawns "devecocli" without a shell, reports a false
// "not installed" even though `devecocli --version` works in the terminal.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SHIM_NAMES = ['devecocli.exe', 'devecocli.cmd', 'devecocli.bat', 'devecocli.ps1', 'devecocli']

function kindOf(p) {
  const s = String(p).toLowerCase()
  if (s.endsWith('.exe')) return 'exe'
  if (s.endsWith('.cmd') || s.endsWith('.bat')) return 'cmd'
  if (s.endsWith('.ps1')) return 'ps1'
  if (s.endsWith('.js') || s.endsWith('.mjs') || s.endsWith('.cjs')) return 'npm-bin'
  return 'cmd'
}

function isFile(p) {
  try { return statSync(p).isFile() } catch (e) { return false }
}

function run(file, args, timeoutMs, verbatim) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    if (!file || typeof file !== 'string') { resolve({ ok: false, code: -1, stdout: '', stderr: '', ms: 0, error: 'invalid executable path' }); return }
    try {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8', windowsVerbatimArguments: !!verbatim }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0),
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        ms: Date.now() - t0,
      })
    })
    } catch (e) {
      resolve({ ok: false, code: -1, stdout: '', stderr: '', ms: Date.now() - t0, error: 'spawn failed: ' + String((e && e.message) || e).slice(0, 160) })
    }
  })
}

function versionFrom(text) {
  const m = /(\d+\.\d+\.\d+)/.exec(String(text || ''))
  return m ? m[1] : ''
}

export async function probeShim(path, kind, timeoutMs = 3000) {
  const k = kind || kindOf(path)
  let r
  if (k === 'exe') r = await run(path, ['--version'], timeoutMs)
  else if (k === 'ps1') r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.replace(/\//g, '\\'), '--version'], timeoutMs)
  else if (k === 'npm-bin') r = await run(process.execPath, [path, '--version'], timeoutMs)
  else r = await run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'call', path, '--version'], timeoutMs)
  const text = r.stdout + ' ' + r.stderr
  return {
    ok: r.ok && /\d+\.\d+\.\d+/.test(text),
    version: versionFrom(text),
    ms: r.ms,
    code: r.code,
    error: r.ok ? '' : (r.stderr || r.stdout || 'exit ' + r.code).trim().slice(0, 200),
  }
}

function pathDirs() {
  const raw = String(process.env.PATH || process.env.Path || '')
  const sep = process.platform === 'win32' ? ';' : ':'
  return raw.split(sep).map((s) => s.trim()).filter(Boolean)
}

function whereShims() {
  // where.exe understands PATHEXT and returns .cmd/.ps1/.exe in priority order.
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      execFile('sh', ['-lc', 'command -v devecocli'], { timeout: 3000, encoding: 'utf8' }, (err, stdout) => {
        const first = String(stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
        resolve(first && isFile(first) ? [{ path: first, kind: kindOf(first), source: 'where' }] : [])
      })
      return
    }
    execFile('where.exe', ['devecocli'], { timeout: 3000, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      const list = String(stdout || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && isFile(s))
      const ordered = list.sort((a, b) => {
        const rank = (p) => (/.cmd$/i.test(p) ? 0 : /\.exe$/i.test(p) ? 1 : /\.ps1$/i.test(p) ? 2 : 3)
        return rank(a) - rank(b)
      })
      resolve(ordered.map((p) => ({ path: p, kind: kindOf(p), source: 'where' })))
    })
  })
}

function npmGlobalCandidates() {
  return new Promise((resolve) => {
    const done = (root) => {
      if (!root) return resolve([])
      const pkgPath = join(root, '@deveco', 'deveco-cli', 'package.json')
      if (!existsSync(pkgPath)) return resolve([])
      let pkg
      try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch (e) { return resolve([]) }
      const bin = pkg && pkg.bin ? (typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.devecocli) : ''
      if (!bin) return resolve([])
      const target = join(root, '@deveco', 'deveco-cli', bin)
      const out = []
      if (isFile(target)) out.push({ path: target, kind: 'npm-bin', source: 'npm-global' })
      const binDir = join(root, '..')
      for (const name of SHIM_NAMES) {
        const p = join(binDir, name)
        if (isFile(p)) out.push({ path: p, kind: kindOf(p), source: 'npm-global' })
      }
      resolve(out)
    }
    const override = process.env.DEVECO_CLI_NPM_ROOT
    if (override) return done(override)
    if (process.platform !== 'win32') {
      execFile('npm', ['root', '-g'], { timeout: 3000, encoding: 'utf8' }, (err, stdout) => done(String(stdout || '').trim()))
      return
    }
    execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', 'root', '-g'], { timeout: 3000, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      done(String(stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop())
    })
  })
}

function cltCandidates() {
  const roots = [process.env.DEVECO_CLI_CLT_PATH, process.env.COMMAND_LINE_TOOL_PATH].filter(Boolean)
  const out = []
  for (const root of roots) {
    for (const sub of ['bin', '']) {
      for (const name of SHIM_NAMES) {
        const p = join(String(root), sub, name)
        if (isFile(p)) out.push({ path: p, kind: kindOf(p), source: 'clt' })
      }
    }
  }
  return out
}

// Ordered candidates, explicit configuration first, CLT last.
export async function collectDevecocliCandidates() {
  const out = []
  const seen = new Set()
  const push = (c) => {
    if (!c || !c.path) return
    const key = String(c.path).toLowerCase().replace(/\\/g, '/')
    if (seen.has(key)) return
    seen.add(key)
    out.push(c)
  }

  const explicit = [process.env.DEVECO_CLI_PATH, process.env.DEVECO_CLI_BIN].filter(Boolean)
  for (const p of explicit) {
    if (isFile(p)) push({ path: p, kind: kindOf(p), source: 'explicit' })
    else {
      for (const name of SHIM_NAMES) {
        const q = join(String(p), name)
        if (isFile(q)) { push({ path: q, kind: kindOf(q), source: 'explicit' }); break }
      }
    }
  }

  for (const c of await whereShims()) push(c)
  for (const c of await npmGlobalCandidates()) push(c)

  for (const dir of pathDirs()) {
    for (const name of SHIM_NAMES) {
      const p = join(dir, name)
      if (isFile(p)) push({ path: p, kind: kindOf(p), source: 'path' })
    }
  }

  for (const c of cltCandidates()) push(c)
  return out
}

const cache = { at: 0, envKey: '', result: null }

export async function resolveDevecocli(timeoutMs = 3000) {
  const envKey = [process.env.DEVECO_CLI_PATH || '', process.env.DEVECO_CLI_CLT_PATH || '', process.env.COMMAND_LINE_TOOL_PATH || '', process.env.PATH || ''].join('|')
  if (cache.result && cache.envKey === envKey && Date.now() - cache.at < 60000) return cache.result

  const t0 = Date.now()
  const tried = []
  for (const c of await collectDevecocliCandidates()) {
    const r = await probeShim(c.path, c.kind, timeoutMs)
    tried.push({ path: c.path, kind: c.kind, source: c.source, ok: r.ok, ms: r.ms, error: r.error })
    if (r.ok) {
      const value = {
        found: true,
        path: c.path,
        kind: c.kind === 'npm-bin' ? 'npm-bin' : c.kind,
        version: r.version,
        source: c.source,
        probeMs: Date.now() - t0,
        tried,
      }
      cache.result = value; cache.envKey = envKey; cache.at = Date.now()
      return value
    }
  }
  const value = { found: false, path: '', kind: '', version: '', source: '', probeMs: Date.now() - t0, tried, error: tried.length ? 'no candidate answered --version' : 'no devecocli candidate found' }
  cache.result = value; cache.envKey = envKey; cache.at = Date.now()
  return value
}
