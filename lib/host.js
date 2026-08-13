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

  async function cleanupShots(dir, policy) {
    try {
      const cmd = shellFlavor === 'pwsh'
        ? 'Get-ChildItem -File ' + psQuote(dir) + ' -Filter dsh-shot-* | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | Remove-Item -Force'
        : 'ls -t ' + psQuote(dir) + '/dsh-shot-* 2>/dev/null | tail -n +11 | xargs -r rm -f'
      await runShellRaw(cmd, 15000, 4096, policy)
    } catch (e) {
      // best effort
    }
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
    const safeTarget = String(cur.target).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 24)
    const local = dir + '\\dsh-shot-' + shotCounter + '-' + safeTarget + '.jpeg'
    const recv = await runHdc(['file', 'recv', psQuote(remote), psQuote(local)], { target: cur.target, timeoutMs: 30000 }, policy)
    if (!recv.ok) return { ok: false, stage: 'recv', error: recv.stderr || recv.stdout || 'file recv failed', remote }
    const exists = await localFileExists(local)
    if (!exists) return { ok: false, stage: 'recv-verify', error: 'file recv reported success but the local file is missing', remote, local }
    await cleanupShots(dir, policy)
    return { ok: true, path: local, target: cur.target, hint: 'Call read_image with file_path "' + local + '" to see the screen (requires an image-capable model).' }
  }

  function errorHint(text) {
    const t = String(text || '')
    if (/9568332|sign info inconsistent/i.test(t)) return '签名信息不一致：将设备/模拟器 UDID 登记进调试证书（AGC → 证书管理 → 添加设备）后重新签名构建。Sign info inconsistent: register the device/emulator UDID in the debug certificate (AGC → Certificates → Add device) and rebuild with signing.'
    if (/140112|Consume/i.test(t)) return 'ArkTS 状态管理：@Consume 找不到对应的 @Provide（如 navPathStack 未在祖先组件提供）。检查页面组件的状态注入。@Consume cannot find its @Provide; check the ancestor component state injection.'
    if (/failed to install|install failed/i.test(t)) return '装包失败：检查签名、设备剩余存储与 bundle 名称。Install failed: check signing, free storage on the device, and the bundle name.'
    if (/failed to uninstall|uninstall failed/i.test(t)) return '卸载失败：确认应用已安装且 bundle 名称正确。Uninstall failed: confirm the app is installed and the bundle name is correct.'
    if (/permission denied|not permitted/i.test(t)) return '权限不足：部分操作需要设备授权或更高权限。Permission denied: some operations need device authorization or elevated privileges.'
    return ''
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
    const hint = ok ? 'Installed. Run hdc_screenshot or hdc_ui_dump to verify the UI.' : errorHint(text)
    return { ok, exitCode: r.exitCode, stdout: tailText(r.stdout, 4000), stderr: tailText(r.stderr, 2000), timedOut: r.timedOut, hint }
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
  async function dumpLayoutDoc(args, policy) {
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { error: cur.error }
    const dump = await runHdc(['shell', psQuote('uitest dumpLayout')], { target: cur.target, timeoutMs: 30000, stdoutMaxBytes: 65536 }, policy)
    const dumpText = (dump.stdout + '\n' + dump.stderr)
    const saved = /saved to:?\s*(\S+\.json)/i.exec(dumpText)
    if (!dump.ok || !saved) return { error: dump.stderr || dump.stdout || 'uitest dumpLayout failed' }
    const remote = String(saved[1]).trim()
    const dir = policyRoot(policy)
    if (!dir) return { error: 'No workspace root known; cannot stage the layout file' }
    const local = dir.replace(/[\\/]+$/, '') + '\\.dsh-hdc\\layout-' + shotCounter + '.json'
    const recv = await runHdc(['file', 'recv', psQuote(remote), psQuote(local)], { target: cur.target, timeoutMs: 30000 }, policy)
    if (!recv.ok) return { error: recv.stderr || recv.stdout || 'file recv failed' }
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
    if (!raw) return { ok: true, layoutPath: local, note: 'layout file pulled but could not be read for text extraction' }
    let doc
    try {
      doc = JSON.parse(raw)
    } catch (e) {
      return { error: 'layout json parse failed: ' + String(e && e.message ? e.message : e), layoutPath: local }
    }
    return { ok: true, doc, layoutPath: local }
  }

  async function uiDump(args, policy) {
    args = args || {}
    const res = await dumpLayoutDoc(args, policy)
    if (!res.ok) return { ok: false, error: res.error }
    const doc = res.doc
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
    return { ok: true, layoutPath: res.layoutPath, nodeCount, textCount: texts.length, texts: texts.slice(0, 200) }
  }

  async function uiFind(args, policy) {
    args = args || {}
    const query = String(args.text || '').trim()
    if (!query) return { ok: false, error: 'text is required (the text or hint to search for)' }
    const res = await dumpLayoutDoc(args, policy)
    if (!res.ok) return { ok: false, error: res.error }
    const exact = args.exact === true
    const matches = []
    function walk(node) {
      if (!node || typeof node !== 'object') return
      const a = node.attributes
      if (a && typeof a === 'object') {
        const text = typeof a.text === 'string' ? a.text : ''
        const hint = typeof a.hint === 'string' ? a.hint : ''
        const orig = typeof a.originalText === 'string' ? a.originalText : ''
        const hay = [text, orig, hint].filter(Boolean).join('\n')
        const hit = exact ? (text === query || hint === query) : hay.toLowerCase().includes(query.toLowerCase())
        if (hit) {
          const bm = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a.bounds || '')
          matches.push({
            text: orig || text || hint,
            hint,
            bounds: a.bounds || '',
            center: bm ? { x: Math.round((+bm[1] + +bm[3]) / 2), y: Math.round((+bm[2] + +bm[4]) / 2) } : null,
          })
        }
      }
      const kids = node.children
      if (Array.isArray(kids)) for (const k of kids) walk(k)
    }
    if (Array.isArray(res.doc)) for (const d of res.doc) walk(d)
    else walk(res.doc)
    return { ok: true, query, exact, matched: matches.length, matches: matches.slice(0, 20), layoutPath: res.layoutPath, hint: matches.length ? 'Use the first match center with hdc_ui action=tap.' : 'No matching control; try a shorter or different text.' }
  }

  function coordOk(v) {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100000
  }

  async function uiAction(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    const action = String(args.action || '')
    let argv = ['shell', 'uitest', 'uiInput']
    switch (action) {
      case 'tap':
        if (!coordOk(args.x) || !coordOk(args.y)) return { ok: false, error: 'tap requires integer x and y coordinates' }
        argv.push('click', String(args.x), String(args.y))
        break
      case 'doubleTap':
        if (!coordOk(args.x) || !coordOk(args.y)) return { ok: false, error: 'doubleTap requires integer x and y coordinates' }
        argv.push('doubleClick', String(args.x), String(args.y))
        break
      case 'longPress':
        if (!coordOk(args.x) || !coordOk(args.y)) return { ok: false, error: 'longPress requires integer x and y coordinates' }
        argv.push('longClick', String(args.x), String(args.y))
        break
      case 'swipe':
        if (!coordOk(args.fromX) || !coordOk(args.fromY) || !coordOk(args.toX) || !coordOk(args.toY)) return { ok: false, error: 'swipe requires integer fromX/fromY/toX/toY coordinates' }
        argv.push('swipe', String(args.fromX), String(args.fromY), String(args.toX), String(args.toY))
        if (typeof args.velocity === 'number' && Number.isInteger(args.velocity) && args.velocity >= 200 && args.velocity <= 40000) argv.push(String(args.velocity))
        break
      case 'input':
        if (typeof args.text !== 'string' || !args.text) return { ok: false, error: 'input requires a text value' }
        { const text = args.text.replace(/[\r\n\t]/g, ' ').slice(0, 200)
        if (coordOk(args.x) && coordOk(args.y)) { argv.push('inputText', String(args.x), String(args.y), psQuote(text)) }
        else { argv.push('text', psQuote(text)) } }
        break
      case 'key':
        if (typeof args.key !== 'string' || !/^(Back|Home|Power|\d{1,6})$/.test(args.key)) return { ok: false, error: 'key must be Back, Home, Power, or a numeric keyID' }
        argv.push('keyEvent', args.key)
        break
      default:
        return { ok: false, error: 'action must be one of: tap, doubleTap, longPress, swipe, input, key' }
    }
    const r = await runHdc(argv, { target: cur.target, timeoutMs: 30000, stdoutMaxBytes: 65536 }, policy)
    const text = (r.stdout + '\n' + r.stderr).trim()
    // uitest prints "No Error" on success; only colon-style errors, usage text, and Fail markers count as failures
    const looksFailed = /error:|incorrect|invalid|\[fail\]/i.test(text) && !/^no error/i.test(text)
    const ok = r.ok && !looksFailed
    return { ok, action, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, hint: ok ? 'Action applied. Run hdc_ui_dump or hdc_screenshot to verify the new UI state.' : '' }
  }

  const BUNDLE_RE = /^[A-Za-z0-9._-]{3,200}$/
  const ABILITY_RE = /^[A-Za-z0-9._-]{1,100}$/

  async function appAction(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    const action = String(args.action || '')
    const bundle = String(args.bundleName || '').trim()
    if (!BUNDLE_RE.test(bundle)) return { ok: false, error: 'bundleName must be a valid bundle identifier (e.g. com.example.app)' }
    let argv = []
    switch (action) {
      case 'query':
        argv = ['shell', 'bm', 'dump', '-n', psQuote(bundle)]
        break
      case 'start': {
        const ability = String(args.abilityName || 'EntryAbility').trim()
        if (!ABILITY_RE.test(ability)) return { ok: false, error: 'invalid abilityName' }
        argv = ['shell', 'aa', 'start', '-a', psQuote(ability), '-b', psQuote(bundle)]
        break
      }
      case 'stop':
        argv = ['shell', 'aa', 'force-stop', psQuote(bundle)]
        break
      case 'clear-data':
        argv = ['shell', 'bm', 'clean', '-n', psQuote(bundle), '-d']
        break
      case 'uninstall':
        argv = ['shell', 'bm', 'uninstall', '-n', psQuote(bundle)]
        break
      default:
        return { ok: false, error: 'action must be one of: query, start, stop, clear-data, uninstall' }
    }
    const r = await runHdc(argv, { target: cur.target, timeoutMs: 120000, stdoutMaxBytes: 262144 }, policy)
    const text = (r.stdout + '\n' + r.stderr)
    const ok = r.ok && !/error|invalid|fail/i.test(text) && !/not found/i.test(text)
    const hint = ok ? '' : errorHint(text)
    return { ok, action, bundleName: bundle, exitCode: r.exitCode, stdout: tailText(r.stdout, 4000), stderr: tailText(r.stderr, 2000), timedOut: r.timedOut, hint }
  }

  const CODE_KNOWLEDGE = {
    '140112': 'ArkTS 状态管理：@Consume 找不到对应的 @Provide（如 navPathStack 未在祖先组件提供）。检查页面组件的状态注入。',
    '9568332': '应用签名：调试证书未绑定当前设备 UDID。在 AGC 证书管理中添加设备后重新签名构建。',
    '10002': '网络：URL 不可达或未声明 ohos.permission.INTERNET。检查权限与后端可用性。',
    '401': 'ArkTS 组件：参数数量不匹配或参数类型错误。',
  }

  async function crashFetch(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    const kind = String(args.kind || 'all')
    if (!/^(all|jscrash|cppcrash|appfreeze)$/.test(kind)) return { ok: false, error: 'kind must be all, jscrash, cppcrash, or appfreeze' }
    const lines = Math.min(Math.max(Number(args.lines) || 60, 10), 200)
    const bundleFilter = typeof args.bundleName === 'string' ? args.bundleName.trim().toLowerCase() : ''
    const dir = '/data/log/faultlog/faultlogger/'
    const list = await runHdc(['shell', psQuote('ls -t ' + dir + ' 2>/dev/null | head -n 60')], { target: cur.target, timeoutMs: 30000, stdoutMaxBytes: 32768 }, policy)
    if (!list.ok) return { ok: false, error: list.stderr || list.stdout || 'failed to list faultlog directory' }
    let names = list.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    if (kind !== 'all') names = names.filter((n) => n.toLowerCase().startsWith(kind + '-'))
    if (bundleFilter) names = names.filter((n) => n.toLowerCase().includes(bundleFilter))
    if (names.length === 0) return { ok: true, files: [], note: 'No crash logs found (a clean state is a valid result).', kind, bundleFilter }
    const latest = names[0]
    const read = await runHdc(['shell', psQuote('tail -n ' + lines + ' ' + dir + latest)], { target: cur.target, timeoutMs: 30000, stdoutMaxBytes: 262144 }, policy)
    if (!read.ok) return { ok: false, error: read.stderr || read.stdout || 'failed to read ' + latest }
    const content = tailText(read.stdout, 12000)
    const summary = {}
    const nameMatch = /Error (?:name|type)\s*:\s*(\S+)/i.exec(content)
    const msgMatch = /Error message\s*:\s*([^\r\n]+)/i.exec(content)
    const codeMatch = /Error code\s*:\s*(\d+)/i.exec(content) || /code[:=]\s*(\d{4,})/i.exec(content)
    if (nameMatch) summary.errorName = nameMatch[1].replace(/[,.;]+$/, '')
    if (msgMatch) summary.errorMessage = msgMatch[1].trim()
    if (codeMatch) {
      summary.errorCode = codeMatch[1]
      if (CODE_KNOWLEDGE[codeMatch[1]]) summary.codeHint = CODE_KNOWLEDGE[codeMatch[1]]
    }
    const frameMatches = content.match(/entry\/src[^\s]*\.ets:\d+:\d+/g) || []
    const frames = []
    for (const f of frameMatches) { if (!frames.includes(f)) frames.push(f) }
    if (frames.length) summary.frames = frames.slice(0, 8)
    return { ok: true, kind, bundleFilter, totalMatched: names.length, latest, summary, content }
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
    name: 'hdc_ui_find',
    description: 'Find a UI control by its text or hint on the connected device and return its bounds and center coordinates (dump the layout, match text/hint, compute centers). Combine with hdc_ui action=tap to drive the UI without manual coordinate math.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text or hint to search for (substring match, case-insensitive)' },
        exact: { type: 'boolean', description: 'Exact match on the node text/hint instead of substring (default false)' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
      },
      required: ['text'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return uiFind(args, policy) },
  })

  registerTool({
    name: 'hdc_ui',
    description: 'Drive the device UI (uitest uiInput): tap/doubleTap/longPress at coordinates, swipe between points, input text (at a focused field, or at x/y), or send a key event (Back/Home/Power or keyID). Combine with hdc_ui_dump to locate elements first, then act, then dump again to verify.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: tap, doubleTap, longPress, swipe, input, key' },
        x: { type: 'integer', description: 'X coordinate for tap/doubleTap/longPress, or input-at-coordinate' },
        y: { type: 'integer', description: 'Y coordinate for tap/doubleTap/longPress, or input-at-coordinate' },
        fromX: { type: 'integer', description: 'Swipe start X' },
        fromY: { type: 'integer', description: 'Swipe start Y' },
        toX: { type: 'integer', description: 'Swipe end X' },
        toY: { type: 'integer', description: 'Swipe end Y' },
        velocity: { type: 'integer', description: 'Swipe velocity 200-40000 (default 600)' },
        text: { type: 'string', description: 'Text to input (max 200 chars)' },
        key: { type: 'string', description: 'Key for the key action: Back, Home, Power, or a numeric keyID' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return uiAction(args, policy) },
  })

  registerTool({
    name: 'hdc_app',
    description: 'Manage an installed HarmonyOS app: query bundle info (bm dump), start (aa start, default ability EntryAbility), force-stop, clear data (bm clean -d), or uninstall. Destructive actions are marked in their descriptions; verify with hdc_app query afterwards.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: query, start, stop, clear-data, uninstall' },
        bundleName: { type: 'string', description: 'Bundle name, e.g. com.example.app' },
        abilityName: { type: 'string', description: 'Ability name for start (default EntryAbility)' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
      },
      required: ['action', 'bundleName'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return appAction(args, policy) },
  })

  registerTool({
    name: 'hdc_crash',
    description: 'Fetch recent crash logs from the device faultlogger directory (/data/log/faultlog/faultlogger/): jscrash, cppcrash, or appfreeze, optionally filtered by bundle name. Returns the latest matching log tail.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Crash kind filter: all (default), jscrash, cppcrash, or appfreeze' },
        bundleName: { type: 'string', description: 'Optional bundle-name substring filter' },
        lines: { type: 'integer', description: 'Tail lines to return from the latest log (default 60, max 200)' },
        target: { type: 'string', description: 'Optional target device id; defaults to the first connected device' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) { const policy = policyFor(exec); await ensureHdc(policy); return crashFetch(args, policy) },
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

  const disposers = []
  const skillsService = ctx.get('skills')
  if (skillsService && typeof skillsService.register === 'function') {
    disposers.push(skillsService.register({
      name: 'hdc-bridge',
      description: 'dsh-hdc-bridge 插件的设备调试闭环用法（观察-定位-操作-验证）。The hdc-bridge device-debug loop usage.',
      whenToUse: '在已装载 hdc_* 工具的会话里操作 HarmonyOS 真机/模拟器：查看界面、定位控件、点击输入、截图验证、装包与崩溃排查。',
      content: '# dsh-hdc-bridge 设备调试闭环\n\n本技能只讲本插件的工具用法。ArkTS / ArkUI / NDK / API 12-23 等开发知识请使用社区维护的 [harmony-next.skills](https://github.com/linhay/harmony-next.skills) 技能包（离线 3,700+ 官方文档）：`npx skills add linhay/harmony-next.skills`。\n\n## 闭环流程\n1. hdc_list_targets 确认设备（默认取第一个 Connected 目标，可用 target 覆盖）\n2. hdc_ui_dump 查看当前界面文本（文本版截图）\n3. hdc_ui_find 按文本定位控件（返回 bounds 与中心坐标）\n4. hdc_ui tap / input / swipe / key 操作（每步后用最新 dump 坐标）\n5. hdc_ui_dump 验证状态变化\n\n- 视觉模型：hdc_screenshot → read_image\n- 排查：hdc_crash（结构化崩溃摘要）/ hdc_hilog（日志）/ hdc_diag（插件状态）\n- 生命周期：hdc_install（装包）/ hdc_app（query/start/stop/clear-data/uninstall）\n\n## 实测经验（本插件团队验证）\n- 混合字符串输入（数字→字母→数字）：IME 模式切换会稳定吞掉紧跟字母后的字符 → 分段输入 + dump 校验 + 缺失字符补发\n- 软键盘弹出会改变页面布局：每次点击前使用最新 dump 的坐标；按钮被键盘遮挡时先 hdc_ui key Back 收起键盘\n- snapshot_display 仅接受 .jpeg（API 10+）\n- 装包报 9568332 = 签名 profile 未绑定设备 UDID，需在 AGC 添加设备后重新签名\n- hdc 客户端对远端失败可能仍返回退出码 0：以工具返回的 ok/error 字段为准\n',
    }))
  }

  ctx.effect(() => () => {
    for (const d of disposers) { try { d() } catch (e) { /* already disposed */ } }
  })
}
