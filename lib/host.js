export const name = 'hdc-bridge'
export const inject = ['shell', 'tools']

export function apply(ctx) {
  const shell = ctx.shell
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const sessionsService = ctx.get('sessions')
  const fsService = ctx.get('fs')

  function realmSession() {
    if (!sessionsService || typeof sessionsService.list !== 'function') return undefined
    try {
      const list = sessionsService.list()
      return list.length === 1 ? list[0] : undefined
    } catch {
      return undefined
    }
  }

  // Resolve the per-call sandbox policy like the pwsh tool does: the calling
  // session's immutable cwd is the workspace boundary. Without a session, fall
  // back to the deployment policy (the executor's own default).
  function resolvePolicyFor(exec) {
    if (!sandboxPolicy || typeof sandboxPolicy.resolve !== 'function') return undefined
    try {
      if (exec && exec.agent && exec.agent.session) return sandboxPolicy.resolve({ session: exec.agent.session })
      const session = realmSession()
      if (session) return sandboxPolicy.resolve({ session })
      return sandboxPolicy.resolve({})
    } catch {
      return undefined
    }
  }

  function policyRoot(policy) {
    return policy && typeof policy.workspaceRoot === 'string' && policy.workspaceRoot ? policy.workspaceRoot : ''
  }

  const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'"
  const tailText = (text, max) => (text.length <= max ? text : text.slice(text.length - max))

  async function runShellRaw(command, timeoutMs, stdoutMaxBytes, policy) {
    const request = { command, timeoutMs, stdoutMaxBytes }
    const root = policyRoot(policy)
    if (policy !== undefined) request.sandboxPolicy = policy
    if (root) request.workdir = root
    const spec = shell.resolve(request)
    return shell.run(spec)
  }

  // The mounted shell executor is pwsh on win32 and bash on POSIX; detect which
  // dialect to build command lines in. Probes run under the caller's policy.
  let shellFlavor = 'pwsh'
  async function detectShellFlavor(policy) {
    try {
      const r = await runShellRaw('$PSVersionTable.PSVersion.Major', 8000, 2048, policy)
      const t = ((r.stdout && r.stdout.text) || '').trim()
      shellFlavor = /^\d+(\.\d+)*$/.test(t) ? 'pwsh' : 'bash'
    } catch {
      shellFlavor = 'bash'
    }
    console.log('[hdc-bridge] shell flavor: ' + shellFlavor)
  }

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
      const r = await runShellRaw((shellFlavor === 'pwsh' ? '& ' : '') + psQuote(path) + ' -v', 12000, 4096, policy)
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

  // Discovery is lazy: it runs under a real session policy on the first tool
  // call, so hosts whose deployment-fallback root cannot confine (e.g. the
  // Windows ACL runner over a profile root) still work for session-scoped calls.
  async function discoverHdc(policy) {
    await detectShellFlavor(policy)
    for (const c of candidateList()) {
      if (await tryHdcAt(c, policy)) { hdcPath = c; hdcError = ''; console.log('[hdc-bridge] hdc found at ' + c); return }
    }
    const probes = shellFlavor === 'pwsh'
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
    const head = shellFlavor === 'pwsh' ? '& ' + psQuote(hdcPath) : psQuote(hdcPath)
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

  async function currentTarget(requested, policy) {
    const list = await listTargets(policy)
    const target = pickTarget(list.targets, requested)
    if (!target) {
      return { target: '', error: 'No HarmonyOS device/emulator connected. Connect one (hdc_connect 127.0.0.1:5555 for an emulator) or start a DevEco emulator.' }
    }
    return { target, error: '' }
  }

  let shotCounter = 0
  async function makeScreenshotDir(dir, policy) {
    const cmd = shellFlavor === 'pwsh'
      ? 'New-Item -ItemType Directory -Force -Path ' + psQuote(dir) + ' | Out-Null'
      : 'mkdir -p ' + psQuote(dir)
    await runShellRaw(cmd, 15000, 4096, policy)
  }

  async function screenshot(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    shotCounter += 1
    const remote = '/data/local/tmp/dsh_shot_' + shotCounter + '.jpeg'
    const cap = await runHdc(['shell', psQuote('snapshot_display -f ' + remote)], { target: cur.target, timeoutMs: 20000 }, policy)
    const capText = (cap.stdout + '\n' + cap.stderr)
    const capLooksFailed = /error|invalid|fail/i.test(capText) && !/success/i.test(capText)
    if (!cap.ok || capLooksFailed) return { ok: false, stage: 'capture', error: cap.stderr || cap.stdout || 'snapshot_display failed', remote }
    let dir = ''
    if (typeof args.localPath === 'string' && args.localPath) {
      dir = args.localPath.replace(/[\\/]+$/, '')
    } else {
      const root = policyRoot(policy)
      if (!root) return { ok: false, stage: 'save', error: 'No workspace root known and localPath not provided; pass an explicit localPath directory.' }
      dir = root.replace(/[\\/]+$/, '') + '\\.dsh-hdc\\screenshots'
    }
    await makeScreenshotDir(dir, policy)
    const local = dir + '\\dsh-shot-' + shotCounter + '-' + cur.target.slice(0, 12) + '.jpeg'
    const recv = await runHdc(['file', 'recv', psQuote(remote), psQuote(local)], { target: cur.target, timeoutMs: 30000 }, policy)
    if (!recv.ok) return { ok: false, stage: 'recv', error: recv.stderr || recv.stdout || 'file recv failed', remote }
    const exists = await localFileExists(local)
    if (!exists) return { ok: false, stage: 'recv-verify', error: 'file recv reported success but the local file is missing', remote, local }
    return { ok: true, path: local, target: cur.target, hint: 'Call read_image with file_path "' + local + '" to see the screen (requires an image-capable model).' }
  }

  async function install(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    if (typeof args.hapPath !== 'string' || !args.hapPath.trim()) return { ok: false, error: 'hapPath is required (path to a built .hap file)' }
    const argv = ['install']
    if (args.replace !== false) argv.push('-r')
    argv.push(psQuote(args.hapPath))
    const r = await runHdc(argv, { target: cur.target, timeoutMs: 180000, stdoutMaxBytes: 262144 }, policy)
    const text = r.stdout + '\n' + r.stderr
    const ok = r.ok && !/error|failed|fail/i.test(text)
    return { ok, exitCode: r.exitCode, stdout: tailText(r.stdout, 4000), stderr: tailText(r.stderr, 2000), timedOut: r.timedOut, hint: ok ? 'Installed. Run hdc_screenshot then read_image to verify the UI.' : '' }
  }

  async function deviceShell(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    const command = String(args.command || '').trim()
    if (!command) return { ok: false, error: 'command is required' }
    if (command.length > 1000) return { ok: false, error: 'command too long (max 1000 chars)' }
    let r = await runHdc(['shell', psQuote(command)], { target: cur.target, timeoutMs: args.timeoutMs || 30000, stdoutMaxBytes: 262144 }, policy)
    if (!r.ok && /usage|invalid/i.test((r.stderr || '') + (r.stdout || ''))) {
      r = await runHdc(['shell', ...command.split(/\s+/).filter(Boolean)], { target: cur.target, timeoutMs: args.timeoutMs || 30000, stdoutMaxBytes: 262144 }, policy)
    }
    return { ok: r.ok, exitCode: r.exitCode, stdout: tailText(r.stdout, 4000), stderr: tailText(r.stderr, 2000), timedOut: r.timedOut }
  }

  async function connect(args, policy) {
    args = args || {}
    const address = String(args.address || '').trim()
    if (!/^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9][\w.-]*):\d{1,5}$/.test(address)) return { ok: false, error: 'invalid address; expected host:port such as 127.0.0.1:5555 or [::1]:5555' }
    const r = await runHdc(['tconn', psQuote(address)], { timeoutMs: 15000 }, policy)
    const out = (r.stdout + '\n' + r.stderr).trim()
    const ok = r.ok && !/fail|error/i.test(out) && (/connect ok/i.test(out) || out === '')
    return { ok, stdout: r.stdout, stderr: r.stderr, hint: ok ? 'Connected. Call hdc_list_targets to confirm.' : 'Connection failed; check the address and that the emulator is running.' }
  }

  async function hilog(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    const lines = Math.min(Math.max(Number(args.lines) || 300, 10), 1000)
    const argv = ['shell', 'hilog', '-x']
    if (typeof args.tag === 'string' && args.tag.trim()) argv.push('-T', psQuote(String(args.tag).trim().slice(0, 64)))
    const r = await runHdc(argv, { target: cur.target, timeoutMs: 30000, stdoutMaxBytes: 524288 }, policy)
    if (!r.ok) return { ok: false, error: r.stderr || r.stdout || 'hilog failed', stdout: tailText(r.stdout, 2000) }
    const all = r.stdout.split(/\r?\n/).filter((l) => l.trim())
    const picked = all.slice(-lines)
    return { ok: true, lineCount: picked.length, totalCollected: all.length, truncated: r.stdoutTruncated, lines: picked }
  }

  // Text-mode "screenshot": dump the UI hierarchy and return the visible text
  // nodes, so text-only models can inspect a screen without an image.
  async function uiDump(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    const dump = await runHdc(['shell', psQuote('uitest dumpLayout')], { target: cur.target, timeoutMs: 30000, stdoutMaxBytes: 65536 }, policy)
    const dumpText = (dump.stdout + '\n' + dump.stderr)
    const saved = /saved to:?\s*(\S+\.json)/i.exec(dumpText)
    if (!dump.ok || !saved) return { ok: false, error: dump.stderr || dump.stdout || 'uitest dumpLayout failed' }
    const remote = String(saved[1]).trim()
    const dir = policyRoot(policy)
    if (!dir) return { ok: false, error: 'No workspace root known; cannot stage the layout file' }
    const local = dir.replace(/[\\/]+$/, '') + '\\.dsh-hdc\\layout-' + shotCounter + '.json'
    const recv = await runHdc(['file', 'recv', psQuote(remote), psQuote(local)], { target: cur.target, timeoutMs: 30000 }, policy)
    if (!recv.ok) return { ok: false, stage: 'recv', error: recv.stderr || recv.stdout || 'file recv failed', remote }
    const fsSvc = fsService
    let raw = ''
    if (fsSvc && typeof fsSvc.readText === 'function' && typeof fsSvc.resolve === 'function') {
      try {
        const target = await fsSvc.resolve(local)
        raw = await fsSvc.readText(target)
      } catch {
        raw = ''
      }
    }
    if (!raw) return { ok: true, stage: 'parsed-from-raw', layoutPath: local, note: 'layout file pulled but could not be read for text extraction' }
    let doc
    try {
      doc = JSON.parse(raw)
    } catch (e) {
      return { ok: false, error: 'layout json parse failed: ' + String(e && e.message ? e.message : e), layoutPath: local }
    }
    const texts = []
    let nodeCount = 0
    function walk(node) {
      if (!node || typeof node !== 'object') return
      nodeCount += 1
      const a = node.attributes
      if (a && typeof a === 'object') {
        if (typeof a.text === 'string' && a.text.trim()) texts.push(a.text)
        else if (typeof a.originalText === 'string' && a.originalText.trim()) texts.push(a.originalText)
        if (typeof a.hint === 'string' && a.hint.trim()) texts.push('[hint] ' + a.hint)
      }
      const kids = node.children
      if (Array.isArray(kids)) for (const k of kids) walk(k)
    }
    if (Array.isArray(doc)) for (const d of doc) walk(d)
    else walk(doc)
    return { ok: true, layoutPath: local, nodeCount, textCount: texts.length, texts: texts.slice(0, 200) }
  }

  const OUT_SCHEMA = { type: 'object', additionalProperties: true }
  const textOut = (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

  function registerTool(definition) {
    ctx.tools.register(definition)
  }

  function policyFor(exec) { return resolvePolicyFor(exec) }

  registerTool({
    name: 'hdc_list_targets',
    description: 'List connected HarmonyOS devices/emulators via hdc (HarmonyOS Device Connector). Returns an empty list when nothing is connected, with a hint on how to connect.',
    parameters: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', description: 'Include verbose output (defaults to false; parsing is identical)' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      const policy = policyFor(exec)
      await ensureHdc(policy)
      const r = await listTargets(policy)
      return { ok: r.ok, targets: r.targets, error: r.error, hint: r.targets.length === 0 ? 'No devices. Use hdc_connect 127.0.0.1:5555 for an emulator, or start one in DevEco Studio.' : '' }
    },
  })

  registerTool({
    name: 'hdc_connect',
    description: 'Connect a HarmonyOS device/emulator over TCP via hdc tconn (e.g. 127.0.0.1:5555 for a local emulator, or a LAN device address).',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'IP address and port, e.g. 127.0.0.1:5555' },
      },
      required: ['address'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return connect(args, policy) },
  })

  registerTool({
    name: 'hdc_shell',
    description: 'Run a shell command on a connected HarmonyOS device/emulator (hdc shell). Use for device inspection: param get, ps, cat /proc, uitest dumpLayout, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command line to run on the device shell' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
        timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds (default 30000)' },
      },
      required: ['command'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return deviceShell(args, policy) },
  })

  registerTool({
    name: 'hdc_screenshot',
    description: 'Capture a screenshot of the connected HarmonyOS device/emulator, pull it to the local workspace as a JPEG, and return the local path (then use read_image to view it).',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
        localPath: { type: 'string', description: 'Optional local directory override; defaults to <workspace>/.dsh-hdc/screenshots' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return screenshot(args, policy) },
  })

  registerTool({
    name: 'hdc_install',
    description: 'Install a built .hap package onto the connected HarmonyOS device/emulator via hdc install (replaces by default). Combine with hdc_screenshot + read_image to verify the UI.',
    parameters: {
      type: 'object',
      properties: {
        hapPath: { type: 'string', description: 'Absolute or workspace-relative path to the .hap file' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
        replace: { type: 'boolean', description: 'Replace the existing installation (default true)' },
      },
      required: ['hapPath'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return install(args, policy) },
  })

  registerTool({
    name: 'hdc_hilog',
    description: 'Fetch recent hilog lines from the connected HarmonyOS device/emulator (dumps the buffer, returns the tail). Optional domain-tag filter via -T (e.g. PARAM, ArkUI).',
    parameters: {
      type: 'object',
      properties: {
        lines: { type: 'integer', description: 'Number of tail lines to return (default 300, max 1000)' },
        tag: { type: 'string', description: 'Optional hilog domain tag filter (domain NAME such as PARAM, not the hex domain id)' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return hilog(args, policy) },
  })

  registerTool({
    name: 'hdc_ui_dump',
    description: 'Dump the visible UI hierarchy of the connected HarmonyOS device/emulator as text nodes (a text-mode screenshot for models without image input): runs uitest dumpLayout, pulls the json, and returns the visible text list.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return uiDump(args, policy) },
  })

  registerTool({
    name: 'hdc_diag',
    description: 'Diagnose hdc-bridge host state: shell flavor, hdc binary discovery result, sandbox policy resolution, and the last probe outcomes. Useful when hdc tools report not-found or sandbox errors.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      const policy = policyFor(exec)
      await ensureHdc(policy)
      const out = { shellFlavor, hdcPath, hdcError, diagLog }
      const sessionsList = sessionsService && typeof sessionsService.list === 'function' ? sessionsService.list() : []
      out.sessionsCount = sessionsList.length
      out.sessionCwds = sessionsList.slice(0, 4).map((s) => (s && s.header && typeof s.header.cwd === 'string' ? s.header.cwd : null))
      const pDefault = resolvePolicyFor(undefined)
      out.policyRootDefault = policyRoot(pDefault)
      out.policyRootExec = policyRoot(policy)
      out.policyModeExec = policy ? policy.mode : null
      try {
        const r = await runShellRaw('echo diag-ok', 8000, 2048, policy)
        out.echoProbe = { exitCode: r.exitCode, stdout: ((r.stdout && r.stdout.text) || '').slice(0, 120), stderr: ((r.stderr && r.stderr.text) || '').slice(0, 120) }
      } catch (e) {
        out.echoError = String(e && e.message ? e.message : e).slice(0, 300)
      }
      return out
    },
  })
}
