// hdc core: discovery, command running, target resolution, and the
// session-scoped device memory. Extracted from lib/host.js so the plugin
// stays testable and the panel/tools share one target funnel.
//
// createHdcCore(deps) returns a closure keeping its own state; deps:
//   runShellRaw(command, timeoutMs, stdoutMaxBytes, policy) -> shell result
//   psQuote(s) -> shell-quoted string
//   detectShellFlavor(policy) -> Promise (host owns the shellFlavor state)
//   getShellFlavor() / setShellFlavor(v)
//   fsService (optional, for localFileExists)
//   extraRoots (optional, () => string[] of additional SDK roots to probe
//     before the default install roots 鈥?e.g. the Studio dir found on this
//     machine; called lazily at discovery time)
//   log(msg) (optional, defaults to console.log)
//   probeTimeoutMs / discoveryBudgetMs (optional tuning; the suite injects
//     small values so the bounded-discovery regressions run fast)
import { existingHdcCandidates, VER_RE, HDC_NOT_FOUND } from './hdc-discover.mjs'

const DISCOVERY_BUDGET_DEFAULT_MS = 20000
const PROBE_TIMEOUT_DEFAULT_MS = 4000
const PATH_PROBE_TIMEOUT_MS = 12000
// A probe started with less time than this cannot answer usefully.
const MIN_PROBE_SLICE_MS = 50

export function createHdcCore(deps) {
  const { runShellRaw, psQuote, detectShellFlavor, getShellFlavor, setShellFlavor, fsService, extraRoots, log = console.log } = deps
  const discoveryBudgetMs = Math.max(MIN_PROBE_SLICE_MS, Number(deps.discoveryBudgetMs) || DISCOVERY_BUDGET_DEFAULT_MS)
  const probeTimeoutMs = Math.max(25, Math.min(Number(deps.probeTimeoutMs) || PROBE_TIMEOUT_DEFAULT_MS, discoveryBudgetMs))
  // Discovery answers are stable for the life of one host instance (same
  // reason the resolved hdcPath is cached): a mid-session install is picked up
  // on restart, and a missing hdc must not cost the full scan on every call.
  let candidateCache = null
  let budgetExhausted = false
  let lastDiscoveryMs = 0
  let hdcPath = null
  let hdcError = ''
  let retrying = null
  const diagLog = []
  function diagPush(entry) { diagLog.push(entry); if (diagLog.length > 12) diagLog.shift() }

  function scannedCandidates() {
    if (!candidateCache) {
      let dyn = []
      if (typeof extraRoots === 'function') { try { dyn = extraRoots() || [] } catch (e) { dyn = [] } }
      candidateCache = existingHdcCandidates({ extraRoots: dyn, max: 5 })
    }
    return candidateCache
  }

  // Only existing executables are ever probed (an 80-entry cross-product with
  // a multi-second timeout each is what made discovery look hung), so the
  // list callers see is the short, real one.
  function candidateList() { return scannedCandidates().candidates.map((entry) => entry.path) }
  function candidateDiag() {
    const scan = scannedCandidates()
    return {
      candidates: scan.candidates,
      truncated: scan.truncated === true,
      searchedRoots: scan.searchedRoots,
      searchedRootCount: scan.searchedRootCount,
      budgetMs: discoveryBudgetMs,
      budgetExhausted,
      lastDiscoveryMs,
    }
  }

  // One probe = one outcome record. `timedOut` distinguishes "the shell gave
  // the command no time" from "the binary is absent", so discovery never turns
  // a slow host into a bogus "hdc not found" (issues #8/#9 family).
  async function probeHdcAt(path, policy, timeoutMs) {
    const started = Date.now()
    try {
      const r = await runShellRaw((getShellFlavor() === 'pwsh' ? '& ' : '') + psQuote(path) + ' -v', timeoutMs, 4096, policy)
      const outText = (r.stdout && r.stdout.text) || ''
      const errText = (r.stderr && r.stderr.text) || ''
      const combined = (outText + '\n' + errText).trim()
      const timedOut = r.timedOut === true
      diagPush({ path, exitCode: r.exitCode, timedOut, stdout: outText.slice(0, 100), stderr: errText.slice(0, 100), ms: Date.now() - started })
      return { ok: r.exitCode === 0 && VER_RE.test(combined), threw: false, timedOut, stderr: errText }
    } catch (e) {
      const message = String(e && e.message ? e.message : e)
      diagPush({ path, threw: message.slice(0, 160), ms: Date.now() - started })
      return { ok: false, threw: true, timedOut: false, stderr: message, message }
    }
  }

  async function discoverHdc(policy) {
    const startedAt = Date.now()
    await detectShellFlavor(policy)
    const deadline = startedAt + discoveryBudgetMs
    const left = () => deadline - Date.now()
    // A shell seam that does not exist at all (neither execute() nor run())
    // makes every probe throw the same error; report that instead of degrading
    // into a misleading "hdc not found" (issue #8).
    let seamError = ''
    // A host that cannot run sandboxed commands at all makes every probe throw;
    // reporting that reason beats the misleading "hdc not found" (issues #8/#9).
    let envError = ''
    let sawTimeout = false
    const envLike = (text) => /no sandbox backend|sandbox mode |refusing to run|EPERM|EACCES|Access is denied/i.test(String(text || ''))

    for (const entry of scannedCandidates().candidates) {
      if (left() < MIN_PROBE_SLICE_MS) { budgetExhausted = true; sawTimeout = true; break }
      const r = await probeHdcAt(entry.path, policy, Math.min(probeTimeoutMs, left()))
      if (r.ok) {
        hdcPath = entry.path
        hdcError = ''
        lastDiscoveryMs = Date.now() - startedAt
        log('[hdc-bridge] hdc found at ' + entry.path + ' (' + entry.source + ', ' + lastDiscoveryMs + 'ms)')
        return
      }
      if (r.timedOut) sawTimeout = true
      if (r.threw) {
        if (!seamError && /shell seam|Unsupported DSH/i.test(r.message)) seamError = r.message
        if (!envError && envLike(r.message)) envError = r.message
      }
      // The same refusal can also arrive as command output (non-zero exit with
      // the backend error on stderr) instead of as a throw.
      if (!envError && envLike(r.stderr)) envError = r.stderr
    }

    const probes = getShellFlavor() === 'pwsh'
      ? ['where.exe hdc', 'Get-Command hdc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source']
      : ['which hdc', 'command -v hdc']
    for (const p of probes) {
      if (left() < MIN_PROBE_SLICE_MS) { budgetExhausted = true; sawTimeout = true; break }
      try {
        const r = await runShellRaw(p, Math.min(PATH_PROBE_TIMEOUT_MS, left()), 8192, policy)
        const first = ((r.stdout && r.stdout.text) || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && /[\\/]/.test(s))[0]
        if (r.exitCode === 0 && first && (await probeHdcAt(first, policy, Math.min(probeTimeoutMs, Math.max(left(), 250)))).ok) {
          hdcPath = first
          hdcError = ''
          lastDiscoveryMs = Date.now() - startedAt
          log('[hdc-bridge] hdc found on PATH: ' + first + ' (' + lastDiscoveryMs + 'ms)')
          return
        }
        if (r.timedOut === true) sawTimeout = true
        diagPush({ probe: p, exitCode: r.exitCode, timedOut: r.timedOut === true, stdout: ((r.stdout && r.stdout.text) || '').slice(0, 100), stderr: ((r.stderr && r.stderr.text) || '').slice(0, 100) })
      } catch (e) {
        const msg = String(e && e.message ? e.message : e)
        if (!seamError && /shell seam|Unsupported DSH/i.test(msg)) seamError = msg
        if (!envError && envLike(msg)) envError = msg
        diagPush({ probe: p, threw: msg.slice(0, 160) })
      }
    }
    lastDiscoveryMs = Date.now() - startedAt
    hdcError = seamError || (envError ? 'hdc probes could not run on this host: ' + envError
      : (sawTimeout
        ? 'hdc probes timed out on this host: no candidate and no PATH probe answered within the ' + discoveryBudgetMs + ' ms discovery budget (install hdc, or raise the budget if this machine is simply slow).'
        : HDC_NOT_FOUND))
    log('[hdc-bridge] ' + hdcError)
  }

  async function ensureHdc(policy) {
    if (hdcPath) return
    if (retrying) { await retrying; return }
    retrying = discoverHdc(policy).finally(() => { retrying = null })
    await retrying
  }

  function buildCommand(argv) {
    const head = getShellFlavor() === 'pwsh' ? '& ' + psQuote(hdcPath) : psQuote(hdcPath)
    return head + (argv.length ? ' ' + argv.join(' ') : '')
  }
  const TARGET_RE = /^[A-Za-z0-9._:\-\[\]]{1,80}$/

  async function runHdc(argv, opts, policy) {
    opts = opts || {}
    if (!hdcPath) return { ok: false, exitCode: null, stdout: '', stderr: hdcError, timedOut: false, aborted: false }
    const full = []
    if (opts.target) {
      if (!TARGET_RE.test(opts.target)) return { ok: false, exitCode: null, stdout: '', stderr: 'invalid target id', timedOut: false, aborted: false }
      full.push('-t', psQuote(opts.target))
    }
    full.push(...argv)
    let result
    try {
      result = await runShellRaw(buildCommand(full), opts.timeoutMs || 30000, opts.stdoutMaxBytes || 262144, policy)
    } catch (e) {
      return { ok: false, exitCode: null, stdout: '', stderr: String(e && e.message ? e.message : e), timedOut: false, aborted: false }
    }
    const out = (result.stdout && result.stdout.text) || ''
    const err = (result.stderr && result.stderr.text) || ''
    return {
      ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
      exitCode: result.exitCode,
      timedOut: result.timedOut === true,
      aborted: result.aborted === true,
      stdout: out,
      stderr: err,
      stdoutTruncated: (result.stdout && result.stdout.truncated) === true,
    }
  }

  async function localFileExists(path) {
    if (!fsService || typeof fsService.resolve !== 'function' || typeof fsService.stat !== 'function') return true
    try {
      const target = await fsService.resolve(path)
      const info = await fsService.stat(target)
      return info !== undefined
    } catch {
      return false
    }
  }

  async function listTargets(policy) {
    const r = await runHdc(['list', 'targets', '-v'], { timeoutMs: 20000, stdoutMaxBytes: 65536 }, policy)
    const targets = []
    if (r.ok) {
      let lines = r.stdout.split(/\r?\n/)
      if (!lines.some((l) => l.trim() && l.trim() !== '[Empty]')) lines = lines.concat(r.stderr.split(/\r?\n/))
      for (const raw of lines) {
        const parts = raw.trim().split(/\s+/).filter(Boolean)
        // Defensive: skip probe-banner rows (e.g. a stray `Ver:` line from
        // unusual hdc builds) so only device-shaped ids are admitted.
        if (parts.length >= 2 && parts[0] !== '[Empty]' && !/^[A-Za-z]+:$/.test(parts[0])) {
          targets.push({ id: parts[0], type: parts[1] || '', state: parts[2] || '', addr: parts[3] || '' })
        }
      }
    }
    return { ok: r.ok, targets, error: r.ok ? '' : (r.stderr || r.stdout || 'hdc list targets failed') }
  }

  function pickTarget(list, requested) {
    if (requested) return requested
    const connected = list.find((t) => /connected/i.test(t.state))
    return connected ? connected.id : (list[0] ? list[0].id : '')
  }

  // Session-scoped device memory: the last explicitly used or panel-
  // selected target, reused by every tool call that omits `target`.
  let preferredTarget = ''

  async function currentTarget(requested, policy) {
    const list = await listTargets(policy)
    const clean = requested ? String(requested).trim() : ''
    if (clean) {
      preferredTarget = clean
      return { target: clean, error: '' }
    }
    if (preferredTarget && list.targets.some((t) => t.id === preferredTarget && /connected/i.test(t.state))) {
      return { target: preferredTarget, error: '' }
    }
    const target = pickTarget(list.targets, '')
    if (!target) {
      return { target: '', error: 'No HarmonyOS device/emulator connected. Connect one (hdc_connect 127.0.0.1:5555 for an emulator) or start a DevEco emulator.' }
    }
    preferredTarget = target
    return { target, error: '' }
  }

  return {
    ensureHdc,
    runHdc,
    listTargets,
    pickTarget,
    currentTarget,
    localFileExists,
    candidateList,
    candidateDiag,
    hdcPathRef: () => hdcPath,
    hdcErrorRef: () => hdcError,
    diagLogRef: () => diagLog,
    getPreferred: () => preferredTarget,
    setPreferred: (t) => { if (typeof t === 'string' && t) preferredTarget = t },
  }
}
