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
export function createHdcCore(deps) {
  const { runShellRaw, psQuote, detectShellFlavor, getShellFlavor, setShellFlavor, fsService } = deps
  let hdcPath = null
  let hdcError = ''
  let retrying = null
  const diagLog = []
  function diagPush(entry) { diagLog.push(entry); if (diagLog.length > 12) diagLog.shift() }

  const HDC_ROOTS = [
    'F:\\Huawei\\DevEco Studio\\sdk',
    'C:\\Program Files\\Huawei\\DevEco Studio\\sdk',
    'D:\\Program Files\\Huawei\\DevEco Studio\\sdk',
    '/Applications/DevEco-Studio.app/Contents/sdk',
  ]
  const HDC_VERS = ['default', '10', '11', '12', '13', '14', '15', '16', '17', '18']

  function candidateList() {
    const list = []
    for (const root of HDC_ROOTS) {
      for (const v of HDC_VERS) {
        list.push(root + '\\' + v + '\\openharmony\\toolchains\\hdc.exe')
        list.push(root + '/' + v + '/openharmony/toolchains/hdc')
      }
    }
    return list
  }

  async function tryHdcAt(path, policy) {
    try {
      const r = await runShellRaw((getShellFlavor() === 'pwsh' ? '& ' : '') + psQuote(path) + ' -v', 12000, 4096, policy)
      const outText = (r.stdout && r.stdout.text) || ''
      const errText = (r.stderr && r.stderr.text) || ''
      const combined = (outText + '\n' + errText).trim()
      diagPush({ path, exitCode: r.exitCode, stdout: outText.slice(0, 100), stderr: errText.slice(0, 100) })
      return r.exitCode === 0 && /Ver:/i.test(combined)
    } catch (e) {
      diagPush({ path, threw: String(e && e.message ? e.message : e).slice(0, 160) })
      return false
    }
  }

  async function discoverHdc(policy) {
    await detectShellFlavor(policy)
    for (const c of candidateList()) {
      if (await tryHdcAt(c, policy)) { hdcPath = c; hdcError = ''; console.log('[hdc-bridge] hdc found at ' + c); return }
    }
    const probes = getShellFlavor() === 'pwsh'
      ? ['where.exe hdc', 'Get-Command hdc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source']
      : ['which hdc', 'command -v hdc']
    for (const p of probes) {
      try {
        const r = await runShellRaw(p, 12000, 8192, policy)
        const first = ((r.stdout && r.stdout.text) || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && /[\\/]/.test(s))[0]
        if (r.exitCode === 0 && first && await tryHdcAt(first, policy)) { hdcPath = first; hdcError = ''; console.log('[hdc-bridge] hdc found on PATH: ' + first); return }
        diagPush({ probe: p, exitCode: r.exitCode, stdout: ((r.stdout && r.stdout.text) || '').slice(0, 100), stderr: ((r.stderr && r.stderr.text) || '').slice(0, 100) })
      } catch (e) {
        diagPush({ probe: p, threw: String(e && e.message ? e.message : e).slice(0, 160) })
      }
    }
    hdcError = 'hdc not found. Install DevEco Studio or HarmonyOS command-line tools, or put hdc on PATH.'
    console.log('[hdc-bridge] ' + hdcError)
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
        if (parts.length >= 2 && parts[0] !== '[Empty]') {
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
    hdcPathRef: () => hdcPath,
    hdcErrorRef: () => hdcError,
    diagLogRef: () => diagLog,
    getPreferred: () => preferredTarget,
    setPreferred: (t) => { if (typeof t === 'string' && t) preferredTarget = t },
  }
}
