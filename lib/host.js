import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join as joinPath, normalize, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sdkDts from './sdk-dts.mjs'
import * as knowledge from './knowledge.mjs'
import { startPanel } from './panel.mjs'
import { createHdcCore } from './hdc-core.mjs'
import { codeHint, SIGN_HINT } from './errors.mjs'
import * as studio from './studio.mjs'
import * as devcli from './devecocli.mjs'
import * as cltModule from './clt.mjs'
import * as verDetect from './version-detect.mjs'
import * as compileCli from './compile-cli.mjs'
import * as compileOut from './compile-output.mjs'
import { setSessionCwd as setCompileCwd, getSessionCwd as getCompileCwd, isHarmonyApplicationRoot } from './compile-session-cwd.mjs'
import { SKILLS } from './skills.mjs'

export const name = 'hdc-bridge'
export const inject = ['shell', 'tools']

// Cross-layer quoting fidelity (three parsers stand between the user's
// command text and the device shell: host shell -> hdc arg-join -> on-device
// sh). Escaping is done per layer with each layer's own rules.
const BACKSLASH = String.fromCharCode(92)
const APOS = "'"
const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'"
// PowerShell's '' escape and POSIX quote-splicing are NOT interchangeable:
// in POSIX shells two adjacent quotes close and reopen with an EMPTY middle
// ('it''s' parses as its), so passing psQuote output through a bash host or
// relying on it at the device layer silently drops characters. Each quoting
// layer gets its own helper; see dcFidelityCommand below.
const posixQuote = (s) => "'" + String(s).replace(/'/g, "'" + BACKSLASH + "''") + "'"
const dcFidelityCommand = (command, flavor) => {
  // Leave device-shell syntax untouched. A backslash before an apostrophe is
  // literal inside HarmonyOS sh double quotes and can cause `no closing quote`.
  return flavor === 'pwsh' ? psQuote(command) : posixQuote(command)
}

// Test-only seam: pure quoting helpers, so smoke can round-trip them against
// real shells without booting a profile (see scripts/smoke.mjs section 10).
export const _quoting = { psQuote, posixQuote, dcFidelityCommand }

export function apply(ctx) {
  const shell = ctx.shell
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const sessionsService = ctx.get('sessions')
  const fsService = ctx.get('fs')
  // Official logging convention is ctx.logger; fall back to console when the
  // logger service is absent (e.g. bare smoke harnesses).
  const logInfo = (msg) => {
    if (ctx.logger && typeof ctx.logger.info === 'function') ctx.logger.info(msg)
    else console.log(msg)
  }

  function realmSession() {
    if (!sessionsService || typeof sessionsService.list !== 'function') return undefined
    try {
      const list = sessionsService.list()
      return list.length === 1 ? list[0] : undefined
    } catch {
      return undefined
    }
  }

  // Resolve the per-call sandbox policy like the official pwsh tool does:
  // the calling session's immutable cwd is the workspace boundary. Without a
  // session, fall back to the deployment policy (the executor's own default).
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

  const tailText = (text, max) => (text.length <= max ? text : text.slice(text.length - max))

  async function runShellRaw(command, timeoutMs, stdoutMaxBytes, policy, workdir) {
    const request = { command, timeoutMs, stdoutMaxBytes }
    const root = policyRoot(policy)
    if (policy !== undefined) request.sandboxPolicy = policy
    if (workdir) request.workdir = workdir
    else if (root) request.workdir = root
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
    logInfo('[hdc-bridge] shell flavor: ' + shellFlavor)
  }

  // hdc core (discovery / run / targets / device memory) lives in lib/hdc-core.mjs.
  // extraRoots feeds every SDK root found on this machine into the shared
  // candidate list — the Studio install and a standalone Command Line Tools
  // distribution both qualify, so non-default layouts resolve without env vars.
  const extraSdkRoots = () => {
    const roots = []
    const st = getStudio()
    if (st.ok) roots.push(joinPath(st.root, 'sdk'))
    const clt = getClt()
    if (clt.ok) roots.push(cltModule.cltSdkRoot(clt.root))
    return roots
  }
  const hdcCore = createHdcCore({
    runShellRaw,
    psQuote,
    detectShellFlavor,
    getShellFlavor: () => shellFlavor,
    setShellFlavor: (v) => { shellFlavor = v },
    fsService,
    extraRoots: extraSdkRoots,
    log: logInfo,
  })
  const { ensureHdc, runHdc, listTargets, pickTarget, currentTarget, localFileExists, hdcPathRef, hdcErrorRef, diagLogRef, candidateList: hdcCandidateList, getPreferred, setPreferred } = hdcCore
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
    if (/9568332|sign info inconsistent/i.test(t)) return '签名信息不一致：调试证书未登记当前设备 UDID。三步走：AGC 证书管理（https://developer.huawei.com/consumer/cn/doc/app/agc-help-add-device）登记设备 UDID → 重新签名构建 → 重新安装。Sign info inconsistent: register the device UDID in AGC, rebuild with signing, reinstall.'
    if (/9568344|unsigned|signature/i.test(t)) return '签名缺失或损坏：应用未签名/签名已失效。重新执行签名后再安装（' + SIGN_HINT + '）。'
    if (/9568289|parse/i.test(t)) return '安装包解析失败：HAP 损坏、格式不被支持，或与已装版本的旧签名冲突——先卸载旧版本再重装。Parse failed: corrupt HAP or old-signature conflict; uninstall the old version first.'
    if (/140112|Consume/i.test(t)) return 'ArkTS 状态管理：@Consume 找不到对应的 @Provide（如 navPathStack 未在祖先组件提供）。检查页面组件的状态注入。@Consume cannot find its @Provide; check the ancestor component state injection.'
    if (/failed to install|install failed/i.test(t)) return '装包失败：检查签名、设备剩余存储与 bundle 名称（常见码：9568332 签名/9568289 解析/9568305 空间）。Install failed: check signing, free storage on the device, and the bundle name.'
    if (/failed to uninstall|uninstall failed/i.test(t)) return '卸载失败：确认应用已安装且 bundle 名称正确。Uninstall failed: confirm the app is installed and the bundle name is correct.'
    if (/permission denied|not permitted/i.test(t)) return '权限不足：部分操作需要设备授权或更高权限。Permission denied: some operations need device authorization or elevated privileges.'
    if (/error opening file|no such file|not exist/i.test(t)) return '本地 .hap 文件不存在或路径不可读：先 hms_build 构建（默认输出在 <project>\\entry\\build\\default\\outputs\\default\\），或核对 hapPath（Windows 下用反斜杠绝对路径）。The local .hap does not exist or is unreadable; build it first or check the path.'
    return ''
  }

  // devecocli spawns piped child processes (signing, hvigor fork, emulator
  // control); a restricted sandbox denies that with EPERM. Point the model
  // at the documented workaround instead of a bare error.
  const epermHint = (err) => /EPERM/i.test(String(err || '')) ? '受限沙箱环境无法派生管道子进程（devecocli 需要）：请在本机终端直接运行 devecocli，或在更宽权限的会话中重试。Sandbox blocks piped child spawn; run devecocli in a local terminal or a wider-permission session.' : ''

  async function install(args, policy) {
    args = args || {}
    const cur = await currentTarget(args.target, policy)
    if (cur.error) return { ok: false, error: cur.error }
    if (typeof args.hapPath !== 'string' || !args.hapPath.trim()) return { ok: false, error: 'hapPath is required (path to a built .hap file)' }
    const argv = ['install']
    if (args.replace !== false) argv.push('-r')
    // Windows hdc resolves forward-slash absolute paths against the cwd and
    // double-joins them; normalize to backslashes on the pwsh host dialect.
    const hapRaw = args.hapPath.trim()
    const hap = (typeof process !== 'undefined' && process.platform === 'win32') ? hapRaw.replace(/\//g, '\\') : hapRaw
    argv.push(psQuote(hap))
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
    // HDC 3.2.x performs another device-side parse of the shell argument. In
    // a DSH host this can re-interpret an apostrophe after the host shell has
    // already unwrapped it, producing `/bin/sh: no closing quote`. Encode only
    // apostrophe-bearing commands so their bytes cross the host/HDC boundary
    // without another quoting layer; HarmonyOS images ship `/bin/base64`.
    // P0: keep encoded UNQUOTED here — the caller below applies exactly one
    // host-dialect layer (the old double-wrap emitted three-level quotes that
    // real-device hdcd took as a literal executable name, breaking every
    // command on real devices).
    // P1: escape apostrophes BEFORE base64 so the decoded script the device
    // sh re-parses is itself valid shell text (otherwise echo don't hits
    // no closing quote again).
    const encoded = command.includes(APOS)
      ? 'echo ' + Buffer.from(command.replace(/'/g, BACKSLASH + APOS), 'utf8').toString('base64') + ' | base64 -d | sh'
      : command
    let r = await runHdc(['shell', dcFidelityCommand(encoded, shellFlavor)], { target: cur.target, timeoutMs: args.timeoutMs || 30000, stdoutMaxBytes: 262144 }, policy)
    if (!r.ok && encoded !== command && /base64[^\r\n]*(?:not found|inaccessible)|not found[^\r\n]*base64/i.test((r.stderr || '') + (r.stdout || ''))) {
      r = await runHdc(['shell', dcFidelityCommand(command, shellFlavor)], { target: cur.target, timeoutMs: args.timeoutMs || 30000, stdoutMaxBytes: 262144 }, policy)
    }
    // Bare-argument fallback for legacy hdc builds whose `shell` rejects single
    // quoted strings — only safe when the command contains no apostrophe
    // (otherwise the arg-split path would itself be subject to device-side
    // parsing; with fidelity escaping, quoting errors are reported as-is).
    if (!r.ok && !command.includes(APOS) && /usage|invalid/i.test((r.stderr || '') + (r.stdout || ''))) {
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
    const repeat = /repeat operation|already connected|is connected/i.test(out)
    const ok = repeat
      ? !/failed to connect|cannot connect|not connected/i.test(out)
      : (r.ok && !/fail|error/i.test(out) && (/connect ok/i.test(out) || out === ''))
    return { ok, stdout: r.stdout, stderr: r.stderr, hint: ok ? (repeat ? 'Target was already connected; call hdc_list_targets to confirm.' : 'Connected. Call hdc_list_targets to confirm.') : 'Connection failed; check the address and that the emulator is running.' }
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
      if (codeHint(codeMatch[1])) summary.codeHint = codeHint(codeMatch[1])
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

  const textOrJsonOut = (args, value) => [{ type: 'text', text: (value && typeof value.text === 'string' && value.text) ? value.text : JSON.stringify(value, null, 2) }]
  const hdcLogOut = (args, value) => {
    if (value && value.action === 'list_devices') return textOut(args, value)
    return textOrJsonOut(args, value)
  }

  // Compile tools retain their project root per conversation. This is kept in
  // process memory, consistent with the DevEco Code session-cwd helper.
  function sessionIdOf(exec) {
    try {
      const session = exec && exec.agent && exec.agent.session
      return (session && session.header && session.header.id) || (session && session.id) || undefined
    } catch {
      return undefined
    }
  }

  function realmSessionId() {
    try {
      const session = realmSession()
      return (session && session.header && session.header.id) || (session && session.id) || undefined
    } catch {
      return undefined
    }
  }

  function compileCwd(exec) {
    const sessionId = sessionIdOf(exec) || realmSessionId()
    const sessionDir = sessionId ? getCompileCwd(sessionId) : undefined
    if (sessionDir) return sessionDir
    return policyRoot(resolvePolicyFor(exec)) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.')
  }

  function studioNodeBin(root) {
    const win = joinPath(root, 'tools', 'node', 'node.exe')
    if (existsSync(win)) return win
    const posix = joinPath(root, 'tools', 'node', 'bin', 'node')
    return existsSync(posix) ? posix : ''
  }

  function studioJavaHome(root) {
    const candidates = [joinPath(root, 'jbr'), joinPath(root, 'jre'), joinPath(root, 'tools', 'jbr')]
    for (const home of candidates) {
      if (existsSync(joinPath(home, 'bin', 'java.exe')) || existsSync(joinPath(home, 'bin', 'java'))) return home
    }
    return ''
  }

  function compileArktsScriptPath() {
    const override = (typeof process !== 'undefined' && process.env && process.env.DEVECO_ARKTS_CHECK_SCRIPT) || ''
    if (String(override).trim()) return String(override).trim()
    return fileURLToPath(new URL('../assets/arkts-check.cjs', import.meta.url))
  }

  async function resolveBundlePid(bundle, target, policy) {
    if (!bundle) return 0
    const first = await runHdc(['shell', psQuote('pidof ' + bundle)], { target, timeoutMs: 20000, stdoutMaxBytes: 8192 }, policy)
    const direct = /(\d+)/.exec(first.stdout || '')
    if (first.ok && direct) return parseInt(direct[1], 10)
    const second = await runHdc(['shell', psQuote('ps -A | grep ' + bundle)], { target, timeoutMs: 20000, stdoutMaxBytes: 16384 }, policy)
    const line = (second.stdout || '').split(/\r?\n/).map((value) => value.trim()).find((value) => value.includes(bundle)) || ''
    const pid = parseInt(line.split(/\s+/)[1], 10)
    return Number.isInteger(pid) ? pid : 0
  }

  async function verifyAbilityStarted(bundle, target, policy) {
    if (!bundle) return { ok: false, output: '', error: 'bundle name is unavailable' }
    const dump = await runHdc(['shell', 'aa', 'dump', '-l'], { target, timeoutMs: 20000, stdoutMaxBytes: 65536 }, policy)
    const output = (dump.stdout || '') + '\n' + (dump.stderr || '')
    return { ok: dump.ok && bundlePattern(bundle).test(output), output, error: dump.ok ? '' : (dump.stderr || dump.stdout || 'aa dump failed') }
  }

  async function hdcFallbackDeploy(args, cwd, policy) {
    await ensureHdc(policy)
    if (!hdcPathRef()) {
      const error = hdcErrorRef()
      return { ok: false, error, text: error }
    }
    const list = await listTargets(policy)
    const requested = String((args && args.hvd) || '').trim()
    const match = requested
      ? (list.targets.find((target) => target.id === requested || String(target.addr || '').includes(requested) || requested.includes(target.id)) || null)
      : null
    const targetId = match ? match.id : pickTarget(list.targets)
    if (!targetId) {
      return {
        ok: false,
        error: 'No hdc target found. Start an emulator or connect a device, then retry.',
        text: 'No hdc target found.',
      }
    }
    const hap = await findNewestHap(cwd, policy)
    if (!hap) {
      return {
        ok: false,
        error: 'No built .hap was found under ' + cwd + '. Run build_project first and check switch_cwd.',
        text: 'No .hap artifact found under the project root.',
      }
    }
    const installPath = (typeof process !== 'undefined' && process.platform === 'win32') ? hap.replace(/\//g, '\\') : hap
    const installResult = await runHdc(['install', '-r', psQuote(installPath)], { target: targetId, timeoutMs: 180000, stdoutMaxBytes: 65536 }, policy)
    const { bundle, ability } = await readBundleAndAbility(cwd)
    let startResult = null
    let verification = null
    if (installResult.ok && bundle) {
      startResult = await runHdc(['shell', 'aa', 'start', '-a', psQuote(ability), '-b', psQuote(bundle)], { target: targetId, timeoutMs: 60000, stdoutMaxBytes: 32768 }, policy)
      verification = await verifyAbilityStarted(bundle, targetId, policy)
    }
    const startOutput = startResult ? (startResult.stdout || '') + '\n' + (startResult.stderr || '') : ''
    const startRemoteFailure = remoteStartFailure(startOutput)
    const startOk = Boolean(startResult && startResult.ok && !startRemoteFailure && verification && verification.ok)
    const ok = installResult.ok && (!bundle || startOk)
    const unsignedNote = /unsigned/i.test(hap)
      ? (installResult.ok
        ? '\n  (unsigned artifact: accepted by many emulators; physical devices need signing)'
        : '\n  (unsigned artifact rejected: configure signing in build-profile.json5)')
      : ''
    const text = [
      `hdc fallback deploy -> ${targetId}:`,
      `  hdc install -r ${hap} -> ${installResult.ok ? 'ok' : 'FAILED: ' + (installResult.stderr || installResult.stdout)}`,
      bundle
        ? `  aa start -a ${ability} -b ${bundle} -> ${startOk ? 'ok (mission verified)' : 'FAILED: ' + (startRemoteFailure ? startOutput.trim() : ((startResult && (startResult.stderr || startResult.stdout)) || (verification && verification.error) || 'mission not found after aa start'))}`
        : '  bundleName was not readable from AppScope/app.json5; start it with hdc_app.',
    ].join('\n') + unsignedNote
    return { ok, targetId, hap, bundle, ability, installOk: installResult.ok, startOk, startRemoteFailure, missionVerified: Boolean(verification && verification.ok), text }
  }

  // Build/run precheck: confined sandbox modes cannot write build outputs
  // outside the session workspace — fail fast with guidance instead of
  // letting hvigor grind into an EPERM on its first log write.
  function workspaceBoundary(base, policy) {
    if (!policy || policy.mode === 'danger-full-access') return null
    const root = policyRoot(policy)
    if (!root || !base) return null
    const nb = String(base).replace(/\//g, '\\').replace(/\\+$/, '')
    const nr = String(root).replace(/\//g, '\\').replace(/\\+$/, '')
    if (nb.toLowerCase() === nr.toLowerCase() || nb.toLowerCase().startsWith(nr.toLowerCase() + '\\')) return null
    return {
      ok: false,
      outsideWorkspace: true,
      error: '项目目录在会话工作区之外：构建产物与日志要写入项目目录，而当前沙箱策略（' + policy.mode + '）只允许写入工作区 ' + root + '。',
      guidance: [
        '1. 把会话工作区设为项目目录（在该目录里开 DSH 会话）再构建——这是最省事的方式',
        '2. 或把会话权限切换为 danger-full-access 后重试',
        '3. 或在 DevEco Studio 里直接点击构建（不经 DSH 沙箱）',
      ],
    }
  }

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
      return { ok: r.ok, targets: r.targets, preferred: getPreferred(), preferredActive: !!(getPreferred() && r.targets.some((t) => t.id === getPreferred() && /connected/i.test(t.state))), error: r.error, hint: r.targets.length === 0 ? 'No devices. Use hdc_connect 127.0.0.1:5555 for an emulator, or start one in DevEco Studio.' : '' }
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
    description: 'Run a shell command on a connected HarmonyOS device/emulator (hdc shell). Use for device inspection: param get, ps, cat /proc, uitest dumpLayout, etc. The command is quoted for lossless delivery across the host shell and the device shell (apostrophes are escaped automatically); other sh metacharacters keep their normal meaning.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command line to run on the device shell' },
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
        target: { type: 'string', description: 'Optional target device id; defaults to the device last used in this session (falls back to the first connected device)' },
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
      const out = { shellFlavor, hdcPath: hdcPathRef(), hdcError: hdcErrorRef(), diagLog: diagLogRef() }
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

  // ---------------------------------------------------------------------------
  // v0.4: official toolchain backend (devecocli) + official-first knowledge layer
  // ---------------------------------------------------------------------------

  function versionAtLeast(v, major, minor) {
    const m = /^(\d+)\.(\d+)/.exec(String(v || ''))
    if (!m) return false
    return Number(m[1]) > major || (Number(m[1]) === major && Number(m[2]) >= minor)
  }
  function versionGte(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0)
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0
      const y = pb[i] || 0
      if (x !== y) return x > y
    }
    return true
  }

  let studioCache
  let studioCacheKey = ''
  function getStudio(overrides = {}) {
    const key = String(overrides.devecoPath || '')
    if (studioCache && studioCacheKey === key) return studioCache
    const found = studio.findStudioRoot(key ? [key] : [])
    if (found.ok) found.version = studio.studioVersion(found.root)
    if (!key) { studioCache = found; studioCacheKey = key }
    return found
  }

  // Standalone Command Line Tools: the second toolchain kind (Studio sibling).
  // kind:'clt' on success so callers can branch without re-sniffing layouts.
  let cltCache
  function getClt() {
    if (cltCache) return cltCache
    cltCache = cltModule.findCltRoot([])
    if (cltCache.ok) {
      cltCache.kind = 'clt'
      logInfo('[hdc-bridge] command-line-tools ' + (cltCache.version || '(version.txt unparsable)') + ' at ' + cltCache.root)
    }
    return cltCache
  }

  function cltIsExplicit() {
    return !!(typeof process !== 'undefined' && process.env && process.env.DEVECO_CLI_CLT_PATH)
  }

  let sdkCache
  let sdkCacheKey = ''
  function getSdk(overrides = {}) {
    const key = [String(overrides.devecoPath || ''), String(overrides.sdkPath || '')].join('|')
    if (sdkCache && sdkCacheKey === key) return sdkCache
    const extra = []
    if (overrides.sdkPath) extra.push(overrides.sdkPath)
    const clt = getClt()
    if (!overrides.sdkPath && clt.ok && cltIsExplicit()) extra.push(cltModule.cltSdkRoot(clt.root))
    const st = getStudio(overrides)
    if (st.ok) extra.push(st.root)
    if (clt.ok && !cltIsExplicit()) extra.push(cltModule.cltSdkRoot(clt.root))
    const found = sdkDts.findSdkInfo(extra)
    if (!key) { sdkCache = found; sdkCacheKey = key }
    return found
  }

  // Feature gates that historically keyed off "Studio >= x.y" now accept the
  // Command Line Tools generation too (CLT minimum is 26.0.0 per deveco-cli).
  function featureGate(minMajor, minMinor) {
    const st = getStudio()
    if (st.ok && versionAtLeast(st.version, minMajor, minMinor)) return true
    const clt = getClt()
    return clt.ok && versionAtLeast(clt.version, 26, 0)
  }

  // hvigor launcher across both toolchain kinds: Studio bundles it under
  // tools/hvigor/bin, a Command Line Tools distribution under bin/ (launchers)
  // with hvigor/bin/hvigorw.js as the raw entry — best-effort for the CLT
  // layout, which Huawei does not document as stable.
  function cltHvigorLauncher(root) {
    for (const name of ['hvigorw.bat', 'hvigorw.cmd', 'hvigorw']) {
      const p = joinPath(root, 'bin', name)
      if (existsSync(p)) return { ok: true, path: p, kind: 'launcher' }
    }
    return { ok: false, path: '', kind: '' }
  }
  function toolchainHvigor() {
    const st = getStudio()
    const clt = getClt()
    if (clt.ok && cltIsExplicit()) {
      const launcher = cltHvigorLauncher(clt.root)
      if (launcher.ok) return launcher
      const js = joinPath(clt.root, 'hvigor', 'bin', 'hvigorw.js')
      if (existsSync(js)) return { ok: true, path: js, kind: 'js' }
    }
    if (st.ok) {
      const h = studio.hvigorwPath(st.root)
      if (h.ok) return h
    }
    if (clt.ok) {
      const launcher = cltHvigorLauncher(clt.root)
      if (launcher.ok) return launcher
      const js = joinPath(clt.root, 'hvigor', 'bin', 'hvigorw.js')
      if (existsSync(js)) return { ok: true, path: js, kind: 'js' }
    }
    return { ok: false, path: '', kind: '' }
  }

  let cliCache
  async function ensureCli(policy) {
    if (cliCache) return cliCache
    const pkg = devcli.resolveCliPkg()
    if (pkg.ok) {
      try {
        const r = await runShellRaw(devcli.buildCliCommand(pkg, ['--version'], psQuote, shellFlavor), 30000, 8192, policy)
        if (r.exitCode === 0) {
          cliCache = { ...pkg, version: devcli.parseCliVersion((r.stdout && r.stdout.text) || '') || pkg.version }
          logInfo('[hdc-bridge] devecocli ' + cliCache.version + ' via local package')
        } else {
          cliCache = { ok: false, error: 'devecocli --version failed: ' + tailText((r.stderr && r.stderr.text) || (r.stdout && r.stdout.text) || '', 220) + ' (needs Node >= 18, macOS/Windows)' }
        }
        return cliCache
      } catch (e) {
        cliCache = { ok: false, error: 'devecocli probe failed: ' + String(e && e.message ? e.message : e) }
        return cliCache
      }
    }
    try {
      const probe = shellFlavor === 'pwsh'
        ? 'Get-Command devecocli -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source'
        : 'command -v devecocli'
      const r = await runShellRaw(probe, 15000, 8192, policy)
      const first = (((r.stdout && r.stdout.text) || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && /[\\/]/.test(s))[0] || '').trim()
      if (r.exitCode === 0 && first) {
        const v = await runShellRaw((shellFlavor === 'pwsh' ? '& ' : '') + psQuote(first) + ' --version', 30000, 8192, policy)
        if (v.exitCode === 0) {
          cliCache = { ok: true, kind: 'path', cmd: first, version: devcli.parseCliVersion((v.stdout && v.stdout.text) || '') }
          logInfo('[hdc-bridge] devecocli ' + cliCache.version + ' on PATH')
          return cliCache
        }
      }
    } catch (e) { /* fall through to hint */ }
    cliCache = { ok: false, error: devcli.CLI_HINT }
    return cliCache
  }

  // devecocli discovers DevEco Studio via registry/default paths, which fails for
  // non-default installs (and inside sandboxes). We already detect both toolchain
  // kinds ourselves, so inject the matching root as environment for every CLI
  // invocation (deveco-cli precedence: DEVECO_CLI_STUDIO_PATH > DEVECO_CLI_CLT_PATH).
  function cliEnvPrefix() {
    const st = getStudio()
    const clt = getClt()
    const sdk = getSdk()
    const toolchainVar = (clt.ok && cltIsExplicit())
      ? 'DEVECO_CLI_CLT_PATH=' + psQuote(clt.root)
      : (st.ok ? 'DEVECO_CLI_STUDIO_PATH=' + psQuote(st.root) : (clt.ok ? 'DEVECO_CLI_CLT_PATH=' + psQuote(clt.root) : ''))
    if (!toolchainVar && !sdk.ok) return ''
    if (shellFlavor === 'pwsh') {
      let prefix = ''
      if (toolchainVar) prefix += '$env:' + toolchainVar + '; '
      if (sdk.ok) prefix += '$env:DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + '; '
      return prefix
    }
    let prefix = ''
    if (toolchainVar) prefix += toolchainVar + ' '
    if (sdk.ok) prefix += 'DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + ' '
    return prefix
  }

  async function runCli(cli, argv, opts, policy) {
    const cmd = cliEnvPrefix() + devcli.buildCliCommand(cli, argv, psQuote, shellFlavor) + (opts.mergeStderr ? ' 2>&1' : '')
    const r = await runShellRaw(cmd, opts.timeoutMs || 120000, opts.stdoutMaxBytes || 524288, policy, opts.workdir)
    const out = (r.stdout && r.stdout.text) || ''
    const err = (r.stderr && r.stderr.text) || ''
    return { ok: r.exitCode === 0 && !r.timedOut && !r.aborted, exitCode: r.exitCode, timedOut: r.timedOut === true, aborted: r.aborted === true, stdout: out, stderr: err, cli }
  }

  function tryParseJson(text) {
    try { return JSON.parse(text) } catch { return null }
  }

  // Resolve the target API version across project / device / SDK.
  async function resolveTarget({ explicit, projectPath, policy, overrides }) {
    const sdkInfo = getSdk(overrides || {})
    let project = null
    let projectDir = ''
    const base = projectPath || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')
    if (base) {
      const prof = verDetect.findProjectProfile(base)
      if (prof.ok) {
        const v = verDetect.parseCompatibleSdk(prof.text)
        project = v.compatibleSdkVersion != null ? v.compatibleSdkVersion : (v.compileSdkVersion != null ? v.compileSdkVersion : null)
        projectDir = prof.dir
      }
    }
    let device = null
    let deviceError = ''
    if (hdcPathRef()) {
      try {
        const r = await runHdc(['shell', psQuote('param get const.ohos.apiversion')], { timeoutMs: 20000, stdoutMaxBytes: 4096 }, policy)
        const m = /(\d+)/.exec(r.stdout || '')
        if (r.ok && m) device = parseInt(m[1], 10)
        else if (!r.ok) deviceError = r.stderr || 'device param read failed'
      } catch (e) {
        deviceError = String(e && e.message ? e.message : e)
      }
    } else {
      deviceError = 'hdc unavailable'
    }
    const resolved = verDetect.resolveApi({ explicit: explicit ?? null, project, device, sdk: sdkInfo.ok ? sdkInfo.apiVersion : null })
    return { resolved, sdkInfo, projectDir, deviceError }
  }

  // devecocli/hvigor exit non-zero when warnings are present even after a
  // successful build (observed live: BUILD SUCCESSFUL + exit 1), so success is
  // judged by output markers — same philosophy as the hdc tools.
  const BUILD_OK_RE = /BUILD SUCCESSFUL|Build completed successfully/i
  const BUILD_FAIL_RE = /BUILD FAILED|FAILURE: Build failed|hvigor ERROR/i
  function buildOk(r) {
    const text = r.stdout + '\n' + r.stderr
    return !r.timedOut && !BUILD_FAIL_RE.test(text) && (r.exitCode === 0 || BUILD_OK_RE.test(text))
  }
  function buildResultOk(r) {
    const text = ((r && r.stdout) || '') + '\n' + ((r && r.stderr) || '')
    return text.trim().length > 0 && buildOk(r)
  }
  // devecocli's native mojo platform channel is blocked in restricted
  // sandboxes (named-pipe denial). The CLI prints a FATAL like
  //   [FATAL:mojo\public\cpp\platform\platform_channel.cc:108]
  //   Check failed: . : 拒绝访问。 (0x5)
  // but the spawned hvigor build may still complete — detect the marker so
  // callers can distinguish "build ok but channel dead" from a clean build.
  const MOJO_FATAL_RE = /FATAL:[^\r\n]*platform_channel|platform_channel[^\r\n]*(?:拒绝访问|denied)/i
  function mojoFatal(r) {
    const t = ((r && r.stdout) || '') + '\n' + ((r && r.stderr) || '')
    return MOJO_FATAL_RE.test(t)
  }
  const MOJO_NOTE = 'devecocli mojo platform channel is blocked in this sandbox (FATAL platform_channel 拒绝访问 0x5); its discovery/docs/emulator subcommands need [Outside sandbox] execution. Device-side work can continue via hdc_* tools.'
  const MOJO_ARTIFACT_NOTE = 'devecocli mojo platform channel crashed (0x5) but the build process itself completed — verify the .hap artifact exists before installing (hdc_install rejects a missing artifact).'

  function remoteStartFailure(text) {
    return /(?:failed to start ability|error code:\s*\d+|error:\s*failed|unlock screen failed|screen is locked|unable to start ability)/i.test(String(text || ''))
  }

  function bundlePattern(bundle) {
    return new RegExp(String(bundle || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }

  // Run a listing command with one retry under the host default policy (the
  // mounted shell channel can silently return empty in a restricted sandbox).
  async function shellListRetry(cmd, cwd, policy) {
    let r = await runShellRaw(cmd, 60000, 262144, policy, cwd)
    let t = ((r.stdout && r.stdout.text) || '').trim()
    if (!t && policy !== undefined) {
      r = await runShellRaw(cmd, 60000, 262144, undefined, cwd)
      t = ((r.stdout && r.stdout.text) || '').trim()
    }
    return t
  }

  const WALK_SKIP_DIRS = new Set(['oh_modules', 'node_modules', '.hvigor', '.idea', '.git', '.cxx'])

  function walkDir(dir, fileTest, out, depth) {
    if (depth > 12) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = joinPath(dir, e.name)
      if (e.isDirectory()) {
        if (WALK_SKIP_DIRS.has(e.name)) continue
        walkDir(p, fileTest, out, depth + 1)
      } else if (e.isFile() && fileTest(p)) {
        out.push(p)
      }
    }
  }

  // Recursively collect .ets files under entry/src/main/ets (host-side, for
  // arkts_check auto-collect mode). Returns [] when the dir is missing.
  async function collectEtsFiles(cwd, policy) {
    const etsRoot = joinPath(cwd, 'entry', 'src', 'main', 'ets')
    const cmd = shellFlavor === 'pwsh'
      ? 'Get-ChildItem ' + psQuote(etsRoot) + ' -Recurse -Filter *.ets -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName'
      : 'find ' + psQuote(etsRoot) + ' -name \'*.ets\' 2>/dev/null'
    const t = await shellListRetry(cmd, cwd, policy)
    if (t) return t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 1000)
    if (!existsSync(etsRoot)) return []
    const out = []
    walkDir(etsRoot, (p) => p.endsWith('.ets'), out, 0)
    return out.slice(0, 1000)
  }

  // Find the newest built .hap under the project root (used by the start_app
  // hdc fallback when devecocli discovery is unavailable). Unsigned artifacts
  // are NOT excluded anymore: in practice the newest artifact is often the
  // unsigned one (no signing config), and picking an older signed package
  // silently rolls the device back to stale code. hdc install accepts the
  // unsigned .hap on emulators; on a physical device it fails with a signing
  // error, which the caller surfaces instead of silently deploying stale code.
  async function findNewestHap(cwd, policy) {
    const cmd = shellFlavor === 'pwsh'
      ? 'Get-ChildItem ' + psQuote(cwd) + ' -Recurse -Filter *.hap -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "oh_modules|node_modules" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName'
      : 'find ' + psQuote(cwd) + ' -name \'*.hap\' -not -path \'*/oh_modules/*\' -printf \'%T@ %p\\n\' 2>/dev/null | sort -rn | head -n1 | cut -d\' \' -f2-'
    const t = await shellListRetry(cmd, cwd, policy)
    if (t) return t
    if (!existsSync(cwd)) return ''
    const out = []
    walkDir(cwd, (p) => /\.hap$/i.test(p), out, 0)
    let best = ''
    let bestM = -1
    for (const p of out) {
      try {
        const m = statSync(p).mtimeMs
        if (m > bestM) { bestM = m; best = p }
      } catch { /* skip */ }
    }
    return best
  }

  function statMtimeMs(p) {
    try { return statSync(p).mtimeMs } catch { return -1 }
  }

  // Best-effort bundleName + EntryAbility read from the project manifest files.
  async function readBundleAndAbility(cwd) {
    let bundle = ''
    let ability = 'EntryAbility'
    if (fsService && typeof fsService.readText === 'function' && typeof fsService.resolve === 'function') {
      try {
        const appJson = await fsService.resolve(joinPath(cwd, 'AppScope', 'app.json5'))
        const t = await fsService.readText(appJson)
        const m = /["']bundleName["']\s*:\s*["']([A-Za-z0-9._-]+)["']/.exec(t)
        if (m) bundle = m[1]
      } catch { /* keep '' */ }
      try {
        const modJson = await fsService.resolve(joinPath(cwd, 'entry', 'src', 'main', 'module.json5'))
        const t = await fsService.readText(modJson)
        const m = /["']name["']\s*:\s*["']([A-Za-z0-9._-]*Ability)["']/.exec(t)
        if (m) ability = m[1]
      } catch { /* keep EntryAbility */ }
    }
    // The fs service is optional in bare/plugin test hosts. Keep the hdc
    // deployment fallback usable there by reading the two small manifests
    // through Node when the service did not resolve them.
    if (!bundle) {
      try {
        const text = readFileSync(joinPath(cwd, 'AppScope', 'app.json5'), 'utf8')
        const match = /["']bundleName["']\s*:\s*["']([A-Za-z0-9._-]+)["']/.exec(text)
        if (match) bundle = match[1]
      } catch { /* keep empty */ }
    }
    if (ability === 'EntryAbility') {
      try {
        const text = readFileSync(joinPath(cwd, 'entry', 'src', 'main', 'module.json5'), 'utf8')
        const match = /["']name["']\s*:\s*["']([A-Za-z0-9._-]*Ability)["']/.exec(text)
        if (match) ability = match[1]
      } catch { /* EntryAbility is the documented default */ }
    }
    return { bundle, ability }
  }

  // Direct hvigorw build, used when devecocli is unavailable OR its channel is
  // blocked by the sandbox (mojo 0x5 / EPERM — the CLI's host IPC dies while
  // the plain hvigorw process runs fine). hvigorw needs the project dir as its
  // workdir and DEVECO_SDK_HOME in its environment.
  async function hvigorDirectBuild({ base, product, mode, timeoutMs, policy, task = 'assembleHap' }) {
    const st = getStudio()
    const sdk = getSdk()
    const hvigor = toolchainHvigor()
    if (!hvigor.ok || !sdk.ok) {
      return { available: false, error: 'Fallback needs DevEco Studio or standalone Command Line Tools with a runnable hvigorw launcher: ' + (hvigor.ok ? '' : 'hvigorw not found. ') + (sdk.ok ? '' : 'SDK not found.') }
    }
    const args = task === 'clean'
      ? 'clean --no-daemon'
      : (String(task || '').trim() && task !== 'assembleHap'
        ? String(task).trim() + ' --no-daemon'
        : 'assembleHap --mode module -p product=' + product + ' -p buildMode=' + mode + ' --no-daemon')
    // Keep the isolated hvigor cache inside the project boundary. The Agent
    // sandbox may reject writes to the system Temp directory even when the
    // host shell itself can create it.
    const isolatedHome = joinPath(base, '.dsh-hvigor-tmp')
    const buildCacheDir = joinPath(isolatedHome, 'cache-env')
    const javaHome = st.ok ? studioJavaHome(st.root) : ''
    const javaPrefix = shellFlavor === 'pwsh'
      ? (javaHome ? '$env:JAVA_HOME=' + psQuote(javaHome) + '; $env:Path=' + psQuote(joinPath(javaHome, 'bin') + ';') + ' + $env:Path; ' : '')
      : (javaHome ? 'JAVA_HOME=' + psQuote(javaHome) + ' PATH=' + psQuote(joinPath(javaHome, 'bin') + ':') + '$PATH ' : '')
    const envPrefix = (cacheRoot) => shellFlavor === 'pwsh'
      ? '$env:DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + '; ' + (st.ok ? '$env:DEVECO_CLI_STUDIO_PATH=' + psQuote(st.root) + '; ' : '') + (cacheRoot ? '$env:HVIGOR_USER_HOME=' + psQuote(cacheRoot) + '; $env:BUILD_CACHE_DIR=' + psQuote(joinPath(cacheRoot, 'cache-env')) + '; ' : '') + javaPrefix
      : 'DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + ' ' + (st.ok ? 'DEVECO_CLI_STUDIO_PATH=' + psQuote(st.root) + ' ' : '') + (cacheRoot ? 'HVIGOR_USER_HOME=' + psQuote(cacheRoot) + ' BUILD_CACHE_DIR=' + psQuote(joinPath(cacheRoot, 'cache-env')) + ' ' : '') + javaPrefix
    // Stop any daemon that may have captured a stale PATH/JAVA_HOME before the
    // plugin injected DevEco Studio's JBR. The task itself is always --no-daemon
    // so app_packing_tool.jar and onDeviceTest cannot fall back to bare `java`.
    const stopDaemon = shellFlavor === 'pwsh'
      ? 'try { & ' + psQuote(hvigor.path) + ' --stop-daemon *> $null } catch { }'
      : psQuote(hvigor.path) + ' --stop-daemon >/dev/null 2>&1 || true'
    // First run on a clean machine should not depend on the network to
    // bootstrap pnpm inside the isolated home; reuse the cached wrapper tools
    // from the default hvigor home when they already exist.
    const defaultHvigorHome = joinPath(process.env.HVIGOR_USER_HOME || joinPath(process.env.USERPROFILE || process.env.HOME || '', '.hvigor'))
    const preWarmPnpm = (cacheRoot) => shellFlavor === 'pwsh'
      ? 'if (-not (Test-Path ' + psQuote(joinPath(cacheRoot, 'wrapper', 'tools', 'node_modules', '.bin', 'pnpm.cmd')) + ') -and (Test-Path ' + psQuote(joinPath(defaultHvigorHome, 'wrapper', 'tools')) + ')) { try { Copy-Item -LiteralPath ' + psQuote(joinPath(defaultHvigorHome, 'wrapper', 'tools')) + ' -Destination ' + psQuote(joinPath(cacheRoot, 'wrapper', 'tools')) + ' -Recurse -Force -ErrorAction Stop } catch { } }'
      : 'if [ ! -f ' + psQuote(joinPath(cacheRoot, 'wrapper', 'tools', 'node_modules', '.bin', 'pnpm')) + ' ] && [ -d ' + psQuote(joinPath(defaultHvigorHome, 'wrapper', 'tools')) + ' ]; then cp -a ' + psQuote(joinPath(defaultHvigorHome, 'wrapper', 'tools') + '/.') + ' ' + psQuote(joinPath(cacheRoot, 'wrapper', 'tools')) + '/ 2>/dev/null || true; fi'
    const commandFor = (cacheRoot) => {
      const taskCommand = shellFlavor === 'pwsh'
        ? '& ' + psQuote(hvigor.path) + ' ' + args
        : psQuote(hvigor.path) + ' ' + args
      return shellFlavor === 'pwsh'
        ? 'Set-Location -LiteralPath ' + psQuote(base) + '; ' + (cacheRoot ? 'New-Item -ItemType Directory -Force -Path ' + psQuote(cacheRoot) + ' | Out-Null; New-Item -ItemType Directory -Force -Path ' + psQuote(joinPath(cacheRoot, 'cache-env')) + ' | Out-Null; ' : '') + (cacheRoot ? preWarmPnpm(cacheRoot) + '; ' : '') + envPrefix(cacheRoot) + stopDaemon + '; ' + envPrefix(cacheRoot) + taskCommand
        : (cacheRoot ? 'mkdir -p ' + psQuote(cacheRoot) + ' ' + psQuote(joinPath(cacheRoot, 'cache-env')) + ' && ' : '') + 'cd ' + psQuote(base) + ' && ' + (cacheRoot ? preWarmPnpm(cacheRoot) + '; ' : '') + envPrefix(cacheRoot) + stopDaemon + '; ' + envPrefix(cacheRoot) + taskCommand
    }
    const run = async (runPolicy, home = isolatedHome) => runShellRaw(commandFor(home), timeoutMs, 1048576, runPolicy, base)
    let r = await run(policy)
    let out = (r.stdout && r.stdout.text) || ''
    let err = (r.stderr && r.stderr.text) || ''
    let retriedHostPolicy = false
    let retriedIsolatedHome = false
    const cacheFailure = /(?:ENOENT[^\r\n]*(?:hvigor\.js|project_caches)|(?:hvigor\.js|project_caches)[^\r\n]*ENOENT|EPERM[^\r\n]*(?:\.hvigor|\.dsh-hvigor-tmp|project_caches|node_modules|build-logs|build\.log)|(?:\.hvigor|\.dsh-hvigor-tmp|build-logs)[^\r\n]*(?:EPERM|operation not permitted|access denied))/i.test(out + '\n' + err)
    if (cacheFailure && policy !== undefined) {
      const retry = await run(undefined)
      const retryOut = (retry.stdout && retry.stdout.text) || ''
      const retryErr = (retry.stderr && retry.stderr.text) || ''
      if (retryOut || retryErr || retry.exitCode !== r.exitCode) {
        r = retry
        out = retryOut
        err = retryErr
        retriedHostPolicy = true
      }
    }
    if (cacheFailure && !buildOk({ exitCode: r.exitCode, timedOut: r.timedOut === true, stdout: out, stderr: err })) {
      const isolated = await run(undefined, isolatedHome)
      const isolatedOut = (isolated.stdout && isolated.stdout.text) || ''
      const isolatedErr = (isolated.stderr && isolated.stderr.text) || ''
      if (isolatedOut || isolatedErr || isolated.exitCode !== r.exitCode) {
        r = isolated
        out = isolatedOut
        err = isolatedErr
        retriedIsolatedHome = true
      }
    }
    return { available: true, ok: buildOk({ exitCode: r.exitCode, timedOut: r.timedOut === true, stdout: out, stderr: err }), exitCode: r.exitCode, timedOut: r.timedOut === true, retriedHostPolicy, retriedIsolatedHome, daemonStopped: true, javaHome, hvigorUserHome: isolatedHome, buildCacheDir, hvigorCacheDir: isolatedHome, output: tailText((out + '\n' + err).trim(), 8000) }
  }
  const hvigorDiag = (fb) => ({
    daemonStopped: !!(fb && fb.daemonStopped),
    javaHome: (fb && fb.javaHome) || '',
    hvigorUserHome: (fb && fb.hvigorUserHome) || '',
    buildCacheDir: (fb && fb.buildCacheDir) || '',
  })
  const LINT_REPORT_RE = /CodeLinter report|Summary:/i

  registerTool({
    name: 'hms_emulator',
    description: 'Control HarmonyOS emulators through the official DevEco CLI (devecocli emulator): list/start/stop/create/delete instances, and inject device states — battery level/status, GPS (geolocation), sensors (light/humidity/temperature/steps/heart-rate), motion scenes, shake, power, rotate, volume, fold. Requires @deveco/deveco-cli; degrades with install guidance when missing.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: list, start, stop, create, delete, shake, power, rotate, volume, fold, battery, geolocation, sensor, scene' },
        name: { type: 'string', description: 'Emulator instance name for start/create/delete' },
        target: { type: 'string', description: '--target <nameOrSerial> for state injections (battery/geolocation/sensor/scene/shake/power/rotate/volume/fold)' },
        level: { type: 'integer', description: 'Battery level 0-100 (action=battery)' },
        status: { type: 'string', description: 'Battery charging status: charging or discharging (action=battery)' },
        longitude: { type: 'string', description: 'GPS longitude (action=geolocation)' },
        latitude: { type: 'string', description: 'GPS latitude (action=geolocation)' },
        altitude: { type: 'string', description: 'GPS altitude (action=geolocation)' },
        direction: { type: 'string', description: 'GPS direction (action=geolocation)' },
        lightIntensity: { type: 'string', description: 'Ambient light intensity (action=sensor)' },
        humidity: { type: 'string', description: 'Ambient humidity (action=sensor)' },
        temperature: { type: 'string', description: 'Ambient temperature (action=sensor)' },
        steps: { type: 'string', description: 'Pedometer steps (action=sensor)' },
        heartRate: { type: 'string', description: 'Heart rate (action=sensor)' },
        rotateDir: { type: 'string', description: 'left or right (action=rotate)' },
        volumeDir: { type: 'string', description: 'up or down (action=volume)' },
        foldState: { type: 'string', description: 'Foldable display state (action=fold)' },
        sceneName: { type: 'string', description: 'outdoorRunning, outdoorCycling or drivingNavigation (action=scene)' },
        deviceType: { type: 'string', description: 'phone/tablet/foldable/... (action=create)' },
        osVersion: { type: 'string', description: 'System image API version (action=create)' },
        timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds (default 120000)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const cli = await ensureCli(policy)
      if (!cli.ok) {
        return { ok: false, backend: 'devecocli', error: cli.error, hint: (epermHint(cli.error) || '安装官方 CLI 后即可用模拟器控制（电量/GPS/传感器/摇一摇/折叠/运动场景）：npm i -g @deveco/deveco-cli（需 DevEco Studio ≥ 6.1.0 或独立 Command Line Tools ≥ 26，Linux 仅支持后者，并设 DEVECO_CLI_CLT_PATH）。') }
      }
      const q = (s) => (s === undefined || s === null ? '' : String(s).trim())
      const flag = (name, value) => (value ? [name, psQuote(value)] : [])
      const tflag = () => flag('--target', q(args.target))
      const action = q(args.action)
      const timeoutMs = Number(args.timeoutMs) || 120000
      const run = async (argv) => {
        const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 524288 }, policy)
        const out = (r.stdout || '') + '\n' + (r.stderr || '')
        return { ok: r.exitCode === 0 && !r.timedOut, exitCode: r.exitCode, timedOut: r.timedOut === true, output: tailText(out.trim(), 4000), error: r.exitCode === 0 ? '' : tailText((r.stderr || r.stdout || '').trim(), 1500), hint: epermHint(out) }
      }
      const isEmulatorTarget = (id) => /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/i.test(String(id || '')) || /emulator/i.test(String(id || ''))
      const pollEmulatorRunning = async (name, waitMs) => {
        const deadline = Date.now() + Math.max(Number(waitMs) || 0, 5000)
        while (Date.now() < deadline) {
          try {
            await ensureHdc(policy)
            const list = await listTargets(policy)
            // start is idempotent: any connected emulator target confirms the
            // running state, even when the id was already present before.
            const hit = list.targets.find((t) => /connected/i.test(t.state) && isEmulatorTarget(t.id))
            if (hit) return { running: true, target: hit.id, method: 'hdc' }
          } catch { /* keep polling */ }
          try {
            const r = await runCli(cli, ['emulator', 'list', '--format', 'json'], { timeoutMs: 30000, stdoutMaxBytes: 524288, mergeStderr: true }, policy)
            const instances = tryParseJson((r.stdout || '').trim())
            if (Array.isArray(instances)) {
              const hit = instances.find((i) =>
                String(i.name || '').trim() === name &&
                (/connected|running|started/i.test(String(i.status || i.state || '')) || /true/i.test(String(i.isRunning || ''))))
              if (hit) return { running: true, target: hit.name || '', method: 'devecocli' }
            }
          } catch { /* keep polling */ }
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
        return { running: false, target: '' }
      }
      const argv = ['emulator']
      if (action === 'list') {
        // devecocli 1.3.0 emits JSON on stdout when asked, but restricted
        // sandboxes can leave the channel empty. Try JSON first, retry under
        // the host policy when it is empty, then fall back to the plain table
        // that `devecocli emulator list` prints when invoked directly.
        let r = await runCli(cli, ['emulator', 'list', '--format', 'json'], { timeoutMs: 60000, stdoutMaxBytes: 524288 }, policy)
        let json = tryParseJson((r.stdout || '').trim())
        let text = ((r.stdout || '') + '\n' + (r.stderr || '')).trim()
        const emptyFirst = !text
        if (r.exitCode === 0 && !r.timedOut && !mojoFatal(r) && emptyFirst) {
          r = await runCli(cli, ['emulator', 'list', '--format', 'json'], { timeoutMs: 60000, stdoutMaxBytes: 524288 }, undefined)
          json = tryParseJson((r.stdout || '').trim())
          text = ((r.stdout || '') + '\n' + (r.stderr || '')).trim()
        }
        if (json == null) {
          const plain = await runCli(cli, ['emulator', 'list'], { timeoutMs: 60000, stdoutMaxBytes: 524288, mergeStderr: true }, policy)
          const plainText = ((plain.stdout || '') + '\n' + (plain.stderr || '')).trim()
          if (plainText) {
            r = { ...plain, stdout: plainText, stderr: '' }
            text = plainText
          }
        }
        // hdc cross-check: the devecocli channel is often mojo-blocked in a
        // sandbox; hdc is the authority on live links — surface it on every
        // list so callers can tell "no emulators" from "channel blocked".
        let hdcConnected = []
        try {
          await ensureHdc(policy)
          const list = await listTargets(policy)
          hdcConnected = list.targets.filter((t) => /connected/i.test(t.state)).map((t) => t.id)
        } catch { /* best effort */ }
        const hdcNote = hdcConnected.length ? ' hdc sees connected target(s): ' + hdcConnected.join(', ') + ' — trust hdc_list_targets for the live link.' : ''
        const likely = hdcConnected.filter(isEmulatorTarget)
        const hdcBackfilled = (json == null || (Array.isArray(json) && json.length === 0)) && likely.length > 0
        const instances = hdcBackfilled ? likely.map((id) => ({ name: id, isRunning: true, source: 'hdc' })) : json
        const output = hdcBackfilled
          ? ((text && !/No emulator instances found/i.test(text) ? text : JSON.stringify(instances, null, 2)) + hdcNote)
          : (text || (Array.isArray(json) && json.length ? JSON.stringify(json, null, 2) : 'No emulator instances found.'))
        const ok = (r.exitCode === 0 && !r.timedOut && !mojoFatal(r) && (json != null || !!text)) || hdcBackfilled
        const error = !ok ? (mojoFatal(r) ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — emulator list needs [Outside sandbox] execution' + hdcNote : (text ? text + hdcNote : 'devecocli emulator list returned empty output — CLI may need auth (devecocli auth login) or a newer version.' + hdcNote)) : ''
         return { ok, backend: 'devecocli', instances, hdcConnected, hdcBackfilled, output: tailText(output, 8000), error }
      }
      if (action === 'start') {
        if (!q(args.name)) return { ok: false, error: 'name is required for start' }
        argv.push('start', psQuote(q(args.name)))
        const res = await run(argv)
        if (!res.ok) return res
        const poll = await pollEmulatorRunning(q(args.name), Math.min(timeoutMs, 180000))
        if (poll.running) {
          return { ...res, running: true, target: poll.target, verifiedBy: poll.method, output: tailText((res.output + '\nEmulator is running (verified by ' + poll.method + ').').trim(), 4000) }
        }
        return { ...res, ok: res.ok && poll.running, running: false, target: poll.target, verifiedBy: poll.method || '', error: 'devecocli start returned success but no running emulator appeared in hdc list targets within ' + Math.round((Math.min(timeoutMs, 180000)) / 1000) + 's' }
      } else if (action === 'stop') {
        argv.push('stop', ...tflag())
      } else if (action === 'create') {
        if (!q(args.name) || !q(args.deviceType)) return { ok: false, error: 'name and deviceType are required for create' }
        argv.push('create', psQuote(q(args.name)), '--device-type', psQuote(q(args.deviceType)), ...flag('--os-version', q(args.osVersion)))
      } else if (action === 'delete') {
        if (!q(args.name)) return { ok: false, error: 'name is required for delete' }
        argv.push('delete', psQuote(q(args.name)))
      } else if (action === 'shake' || action === 'power') {
        argv.push(action, ...tflag())
      } else if (action === 'rotate') {
        argv.push('rotate', psQuote(q(args.rotateDir) || 'left'), ...tflag())
      } else if (action === 'volume') {
        argv.push('volume', psQuote(q(args.volumeDir) || 'up'), ...tflag())
      } else if (action === 'fold') {
        if (!q(args.foldState)) return { ok: false, error: 'foldState is required for fold' }
        argv.push('fold', psQuote(q(args.foldState)), ...tflag())
      } else if (action === 'battery') {
        if (!q(args.target)) return { ok: false, error: 'target is required for battery' }
        argv.push('battery', ...tflag(), ...flag('--level', args.level), ...flag('--status', q(args.status)))
      } else if (action === 'geolocation') {
        if (!q(args.target)) return { ok: false, error: 'target is required for geolocation' }
        argv.push('geolocation', ...tflag(), ...flag('--longitude', q(args.longitude)), ...flag('--latitude', q(args.latitude)), ...flag('--altitude', q(args.altitude)), ...flag('--direction', q(args.direction)))
      } else if (action === 'sensor') {
        if (!q(args.target)) return { ok: false, error: 'target is required for sensor' }
        argv.push('sensor', ...tflag(), ...flag('--light-intensity', q(args.lightIntensity)), ...flag('--humidity', q(args.humidity)), ...flag('--temperature', q(args.temperature)), ...flag('--steps', q(args.steps)), ...flag('--heartrate', q(args.heartRate)))
      } else if (action === 'scene') {
        if (!q(args.sceneName)) return { ok: false, error: 'sceneName is required for scene' }
        argv.push('scene', psQuote(q(args.sceneName)), ...tflag())
      } else {
        return { ok: false, error: 'unknown action: ' + action }
      }
      return run(argv)
    },
  })

  registerTool({
    name: 'hms_setup',
    description: 'HarmonyOS toolchain doctor: hdc, DevEco Studio (version), SDK (API version), the optional devecocli backend, connected devices, and the resolved target API version across project/device/SDK. Run this first when any tool reports not-found, a version mismatch, or missing signing.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: doctor (default), paths' },
        devecoPath: { type: 'string', description: 'Optional explicit DevEco Studio install root (overrides auto-detection)' },
        sdkPath: { type: 'string', description: 'Optional explicit SDK root, e.g. C:\\Huawei\\DevEco Studio\\sdk (overrides auto-detection and DEVECO_SDK_HOME)' },
        projectPath: { type: 'string', description: 'Optional HarmonyOS project root (defaults to the session workspace)' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const overrides = { devecoPath: args.devecoPath, sdkPath: args.sdkPath }
      if (args.action === 'paths') {
        const discovery = studio.discoverStudioRoots(overrides.devecoPath ? [overrides.devecoPath] : [])
        return {
          hdcCandidates: hdcCandidateList(),
          studioRoots: discovery.roots,
          studioRegistryPaths: discovery.registryPaths,
          cliPkg: devcli.resolveCliPkg(),
          envDevEcoSdkHome: (typeof process !== 'undefined' && process.env && process.env.DEVECO_SDK_HOME) || '',
          envCliCltPath: (typeof process !== 'undefined' && process.env && process.env.DEVECO_CLI_CLT_PATH) || '',
        }
      }
      await ensureHdc(policy)
      const st = getStudio(overrides)
      const clt = getClt()
      const sdk = getSdk(overrides)
      const cli = await ensureCli(policy)
      const targets = hdcPathRef() ? (await listTargets(policy)).targets : []
      const hvigor = toolchainHvigor()
      const target = await resolveTarget({ explicit: null, projectPath: args.projectPath, policy, overrides })
      const out = {
        hdc: hdcPathRef() ? { found: true, path: hdcPathRef() } : { found: false, error: hdcErrorRef() },
        devecoStudio: st.ok ? { found: true, root: st.root, version: st.version, sources: st.sources || [] } : { found: false, error: st.error },
        commandLineTools: clt.ok ? { found: true, root: clt.root, version: clt.version } : { found: false, error: clt.error },
        toolchainKind: (clt.ok && cltIsExplicit()) ? 'clt' : (st.ok ? 'studio' : (clt.ok ? 'clt' : 'none')),
        sdk: sdk.ok ? { found: true, root: sdk.sdkRoot, flavor: sdk.flavor, apiVersion: sdk.apiVersion, sdkVersion: sdk.sdkVersion } : { found: false, error: sdk.error },
        devecocli: cli.ok ? { found: true, kind: cli.kind, version: cli.version } : { found: false, error: cli.error },
        hvigorFallback: hvigor.ok ? { found: true, path: hvigor.path } : { found: false },
        devices: targets,
        targetApi: {
          value: target.resolved.api,
          source: target.resolved.source,
          sources: target.resolved.sources,
          mismatches: target.resolved.mismatches,
          projectDir: target.projectDir,
          deviceError: target.deviceError,
        },
      }
      const recs = []
      if (!hdcPathRef()) recs.push('hdc missing: install DevEco Studio or put hdc on PATH (all hdc_* tools need it).')
      if (!st.ok && !clt.ok) recs.push('No Huawei toolchain detected. Either DevEco Studio (>= 6.1.0 recommended): https://developer.huawei.com/consumer/cn/deveco-studio/ — or the standalone Command Line Tools (>= 26.0.0, also the only option on Linux): https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos and set DEVECO_CLI_CLT_PATH.')
      if (!sdk.ok) recs.push('SDK not detected; hms_api needs it. Set DEVECO_SDK_HOME or pass sdkPath.')
      if (!cli.ok) recs.push(cli.error)
      if (cli.ok && !featureGate(6, 1)) recs.push('The detected toolchain is below the --format json feature level (Studio >= 6.1.0 / Command Line Tools >= 26.0.0); update it to enable JSON outputs.')
      if (hdcPathRef() && targets.length === 0) recs.push('No device connected. Emulator: hdc_connect 127.0.0.1:5555; physical device: enable USB debugging.')
      if (target.resolved.mismatches.length) recs.push('Version mismatch: ' + target.resolved.mismatches.join('; ') + '. Use hms_api_change action=diff to list breaking changes.')
      out.recommendations = recs
      return out
    },
  })

  registerTool({
    name: 'hms_build',
    description: 'Build/sign/run a HarmonyOS project through the official DevEco CLI (devecocli) when available, with automatic fallback to the local hvigorw build and the hdc_install/hdc_app loop. Actions: status, build, run, sign, clean. Signing requires a one-time browser OAuth (devecocli auth login) plus a connected device. Build/run/sign are [Outside sandbox] operations per the official docs.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: status, build, run, sign, clean' },
        projectPath: { type: 'string', description: 'Optional project root (defaults to the session workspace)' },
        modules: { type: 'string', description: 'Optional space-separated module names for build (devecocli build --modules m1 m2@target)' },
        product: { type: 'string', description: 'Optional product name (default "default")' },
        buildMode: { type: 'string', description: 'Optional build mode (default "debug"; e.g. "release")' },
        module: { type: 'string', description: 'Optional single module for run (defaults to the auto-selected runnable one)' },
        device: { type: 'string', description: 'Optional device name/serial for run (required when several devices are connected)' },
        skipBuild: { type: 'boolean', description: 'For run: deploy existing artifacts without rebuilding' },
        uninstall: { type: 'boolean', description: 'For run: uninstall the app first (fixes signing-key changes)' },
        timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds (default 600000)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const timeoutMs = Number(args.timeoutMs) || 600000
      const st = getStudio()
      const sdk = getSdk()
      const cli = await ensureCli(policy)
      const q = (s) => (s === undefined || s === null ? '' : String(s).trim())
      const outside = {}
      if (args.action === 'status') {
        const hvigor = toolchainHvigor()
        const clt = getClt()
        return {
          devecocli: cli.ok ? { found: true, kind: cli.kind, version: cli.version } : { found: false, error: cli.error },
          devecoStudio: st.ok ? { found: true, version: st.version } : { found: false, error: st.error },
          commandLineTools: clt.ok ? { found: true, root: clt.root, version: clt.version } : { found: false },
          sdk: sdk.ok ? { apiVersion: sdk.apiVersion, root: sdk.sdkRoot } : { error: sdk.error },
          hvigorFallback: hvigor,
          backend: cli.ok ? 'devecocli' : (hvigor.ok && sdk.ok ? 'hvigorw' : 'none'),
        }
      }
      if (args.action === 'build' || args.action === 'clean') {
        const base = q(args.projectPath) || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')
        const boundary = workspaceBoundary(base, policy)
        if (boundary) return { ...outside, backend: cli.ok ? 'devecocli' : 'hvigorw', ...boundary }
        const hapBefore = await findNewestHap(base, policy)
        const argv = ['build']
        if (args.action === 'clean') argv.push('clean')
        if (q(args.modules)) argv.push('--modules', ...q(args.modules).split(/\s+/).map((m) => psQuote(m)))
        if (q(args.product)) argv.push('--product', psQuote(q(args.product)))
        if (q(args.buildMode)) argv.push('--build-mode', psQuote(q(args.buildMode)))
        let deOutput = ''
        let deMojo = false
        let deExit = 0
        if (cli.ok) {
          const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 1048576, workdir: base }, policy)
          deMojo = mojoFatal(r)
          deExit = r.exitCode
          deOutput = tailText(compileOut.stripAnsi((r.stdout + '\n' + r.stderr).trim()), 8000)
          if (buildResultOk(r) && !deMojo) {
            const hapAfter = await findNewestHap(base, policy)
            const artifactVerified = args.action === 'clean' ? !hapAfter : Boolean(hapAfter)
            if (artifactVerified) {
              return { ...outside, backend: 'devecocli', ok: true, exitCode: deExit, timedOut: r.timedOut, output: compileOut.stripAnsi(deOutput), artifactVerified, hapBefore: hapBefore || '', hapAfter: hapAfter || '', ...hvigorDiag(null) }
            }
            deOutput += '\n\ndevecocli returned success but artifact state was not verified; using hvigor fallback.'
          }
          // devecocli failed or its channel was mojo-blocked — fall through to
          // the direct hvigorw build instead of only reporting the block.
        }
        const fb = await hvigorDirectBuild({ base, product: q(args.product) || 'default', mode: q(args.buildMode) || 'debug', timeoutMs, policy, task: args.action === 'clean' ? 'clean' : 'assembleHap' })
        if (fb.available && fb.ok) {
          const hapAfter = await findNewestHap(base, policy)
          const artifactVerified = args.action === 'clean' ? !hapAfter : Boolean(hapAfter)
          if (artifactVerified) {
            return { ...outside, backend: 'hvigorw', ok: true, exitCode: fb.exitCode, timedOut: fb.timedOut, output: compileOut.stripAnsi(fb.output), artifactVerified, hapBefore: hapBefore || '', hapAfter: hapAfter || '', ...hvigorDiag(fb), note2: (deMojo ? 'devecocli channel was mojo-blocked in this sandbox (0x5) — fell back to the direct hvigorw build. ' : 'devecocli failed — used the direct hvigorw build. ') + 'hvigorw uses the signingConfigs already present in build-profile.json5; unsigned builds cannot install on a device.' }
          }
          return { ...outside, backend: 'hvigorw', ok: false, exitCode: fb.exitCode, timedOut: fb.timedOut, output: compileOut.stripAnsi(fb.output), error: args.action === 'clean' ? 'hvigorw reported success but build outputs were not cleaned' : 'hvigorw reported success but no .hap artifact was produced', hapBefore: hapBefore || '', hapAfter: hapAfter || '', ...hvigorDiag(fb) }
        }
        return { ...outside, backend: 'hvigorw', ok: false, exitCode: fb.available ? fb.exitCode : deExit, timedOut: fb.timedOut === true, output: compileOut.stripAnsi((deOutput ? deOutput + '\n\n' : '') + (fb.available ? 'hvigorw fallback also failed:\n' + fb.output : 'hvigorw fallback unavailable: ' + fb.error)), error: fb.available ? 'hvigorw build failed' : fb.error, ...hvigorDiag(fb) }
      }
      if (args.action === 'run') {
        const base = q(args.projectPath) || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')
        let deRunNote = ''
        if (cli.ok) {
          const argv = ['run']
          if (q(args.module)) argv.push('--module', psQuote(q(args.module)))
          if (q(args.device)) argv.push('--device', psQuote(q(args.device)))
          if (args.skipBuild) argv.push('--skip-build')
          if (args.uninstall) argv.push('--uninstall')
          const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 1048576, workdir: base }, policy)
          const mojo = mojoFatal(r)
          if (buildResultOk(r) && !mojo) {
            const app = await readBundleAndAbility(base)
            await ensureHdc(policy)
            const current = app.bundle ? await currentTarget(args.device, policy) : { target: '', error: 'bundle name unavailable' }
            const mission = !current.error && app.bundle ? await verifyAbilityStarted(app.bundle, current.target, policy) : { ok: false, error: current.error || 'bundle name unavailable' }
            if (mission.ok) {
              return { ...outside, backend: 'devecocli', ok: true, exitCode: r.exitCode, timedOut: r.timedOut, missionVerified: true, target: current.target, bundleName: app.bundle, output: tailText((r.stdout + '\n' + r.stderr).trim(), 8000) }
            }
            deRunNote = 'devecocli run returned success but mission verification failed; using the fallback loop. '
          } else {
            deRunNote = mojo ? 'devecocli run channel was mojo-blocked in this sandbox (0x5) — using the fallback loop. ' : 'devecocli run failed or returned no output — using the fallback loop. '
          }
        }
        // Fallback loop: hvigorw build -> newest .hap -> hdc install -> aa start
        if (!base) return { ...outside, backend: 'none', ok: false, error: cli.error + ' No workspace root for the fallback loop.' }
        const fb = await hvigorDirectBuild({ base, product: q(args.product) || 'default', mode: q(args.buildMode) || 'debug', timeoutMs, policy })
        if (!fb.available || !fb.ok) return { ...outside, backend: 'hvigorw', ok: false, stage: 'build', output: fb.available ? compileOut.stripAnsi(fb.output) : '', error: fb.available ? 'hvigorw build failed' : fb.error, ...hvigorDiag(fb) }
        const hap = await findNewestHap(base, policy)
        if (!hap) return { ...outside, backend: 'hvigorw', ok: false, stage: 'hap', error: 'build produced no .hap under ' + base, ...hvigorDiag(fb) }
        await ensureHdc(policy)
        if (!hdcPathRef()) return { ...outside, backend: 'hvigorw', ok: false, stage: 'install', hap, error: hdcErrorRef(), ...hvigorDiag(fb) }
        const inst = await install({ hapPath: hap, target: q(args.device) || undefined }, policy)
        if (!inst.ok) return { ...outside, backend: 'hvigorw', ok: false, stage: 'install', hap, error: inst.error || inst.hint, ...hvigorDiag(fb) }
        let bundleName = ''
        try {
          const appJson = joinPath(base, 'AppScope', 'app.json5')
          if (existsSync(appJson)) {
            const m = /["']bundleName["']\s*:\s*["']([^"']+)["']/.exec(readFileSync(appJson, 'utf8'))
            if (m) bundleName = m[1]
          }
        } catch { /* bundleName stays empty */ }
        if (bundleName) {
          const started = await appAction({ action: 'start', bundleName, target: q(args.device) || undefined }, policy)
          const current = await currentTarget(args.device, policy)
          const mission = started.ok && !current.error ? await verifyAbilityStarted(bundleName, current.target, policy) : { ok: false, error: current.error || 'aa start failed' }
          return { ...outside, backend: 'hvigorw', ok: started.ok && mission.ok, stage: 'start', hap, bundleName, target: current.target, start: { ok: started.ok, hint: started.hint }, missionVerified: Boolean(mission.ok), ...hvigorDiag(fb), note: deRunNote + 'Fallback loop: hvigorw build -> hdc install -> aa start.' }
        }
        return { ...outside, backend: 'hvigorw', ok: false, stage: 'installed', hap, missionVerified: false, ...hvigorDiag(fb), error: 'Installed, but bundleName could not be read from AppScope/app.json5; app was not started.', note: deRunNote + 'Installed; bundleName could not be read from AppScope/app.json5 — start it with hdc_app action=start bundleName=<from AppScope/app.json5>.' }
      }
      if (args.action === 'sign') {
        if (!cli.ok) return { ...outside, backend: 'none', ok: false, error: cli.error }
        // Sign must WRITE build-profile.json5 (signingConfigs/products). A
        // channel that silently dies (mojo 0x5, exit 0, no output) leaves the
        // file untouched — snapshot it and require a real change, the same
        // artifact-verification pattern as build_project. A silent auth status
        // would also make the logged-in check pass vacuously.
        const base = q(args.projectPath) || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')
        const profilePath = base ? joinPath(base, 'build-profile.json5') : ''
        const beforeM = statMtimeMs(profilePath)
        let beforeText = ''
        if (profilePath) {
          try { beforeText = readFileSync(profilePath, 'utf8') } catch { /* absent — signing should create it */ }
        }
        const status = await runCli(cli, ['auth', 'status'], { timeoutMs: 30000, stdoutMaxBytes: 16384, workdir: base }, policy)
        if (mojoFatal(status)) {
          return { ...outside, backend: 'devecocli', ok: false, stage: 'auth', error: 'devecocli mojo platform channel blocked in this sandbox (0x5) — sign needs [Outside sandbox] execution' }
        }
        const authOut = (status.stdout + status.stderr).trim()
        if (!authOut) {
          return { ...outside, backend: 'devecocli', ok: false, stage: 'auth', emptyOutput: true, error: 'devecocli auth status returned no output — the mojo channel is blocked in this sandbox, so the login state cannot be verified and signature generation would silently do nothing. Run devecocli auth login in a host terminal, or sign in DevEco Studio (Project Structure > Signing Configs).' }
        }
        const loggedIn = status.ok && !/not logged|未登录|not log in/i.test(authOut)
        if (!loggedIn) {
          return { ...outside, backend: 'devecocli', ok: false, stage: 'auth', error: 'Not logged in. Run once in a terminal: devecocli auth login (browser OAuth), then retry. A connected device is also required for device registration.' }
        }
        const argv = ['signature', 'generate']
        if (q(args.product)) argv.push('--product', psQuote(q(args.product)))
        const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 262144, workdir: base }, policy)
        const mojo = mojoFatal(r)
        const out = (r.stdout + '\n' + r.stderr).trim()
        const empty = !out
        const afterM = statMtimeMs(profilePath)
        let afterText = ''
        if (profilePath) {
          try { afterText = readFileSync(profilePath, 'utf8') } catch { /* still absent */ }
        }
        const profileChanged = afterM !== beforeM || afterText !== beforeText
        const ok = r.ok && !mojo && !empty && profileChanged
        const error = ok ? ''
          : (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — sign needs [Outside sandbox] execution'
          : (empty ? 'devecocli signature generate returned no output — the mojo channel likely died before signing ran (same family as build). Sign in DevEco Studio (Project Structure > Signing Configs) or run devecocli auth login + signature generate in a host terminal.'
          : (!profileChanged ? 'devecocli reported success but build-profile.json5 was NOT updated — no signing materials were written (missing local signing materials or a silent mojo failure). Check ~/.ohos/config for auto-sign materials, run devecocli auth login in a host terminal, or sign in DevEco Studio.'
          : (r.stderr || r.stdout))))
        return { ...outside, backend: 'devecocli', ok, exitCode: r.exitCode, emptyOutput: empty, profileChanged, output: tailText(out, 6000), error, hint: ok ? 'signingConfigs/products were written to build-profile.json5; then hms_build action=build.' : '' }
      }
      return { ok: false, error: 'unknown action: ' + args.action }
    },
  })

  registerTool({
    name: 'hms_lint',
    description: 'Official ArkTS lint: rules lists the 57+ built-in DevEco codelinter rule docs from the local install (Apache-2.0, read locally); read-rule returns one rule doc; check runs devecocli check lint (official ArkTS checks, --format json needs DevEco Studio >= 6.1.0).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: rules, read-rule, check' },
        rule: { type: 'string', description: 'Rule id for read-rule (from action=rules)' },
        lang: { type: 'string', description: 'Rule doc language: cn (default) or en' },
        path: { type: 'string', description: 'File or directory to lint for action=check (defaults to the project root)' },
        fix: { type: 'boolean', description: 'For check: apply auto-fixes' },
        limit: { type: 'integer', description: 'For rules/check: max records shown (default all rules / devecocli default 100)' },
        timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds (default 300000)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      // codelinter rule docs: the DevEco Studio bundle layout first; when only
      // a standalone Command Line Tools exists, probe both plausible CLT
      // layouts (Huawei does not document the inner tree as stable).
      function codelinterBase() {
        const st2 = getStudio()
        if (st2.ok) return { ok: true, root: st2.root, pluginsDir: '' }
        const clt2 = getClt()
        if (!clt2.ok) return { ok: false, error: st2.error || clt2.error }
        try {
          if (existsSync(joinPath(clt2.root, 'plugins', 'codelinter'))) return { ok: true, root: clt2.root, pluginsDir: '' }
          if (existsSync(joinPath(clt2.root, 'codelinter', 'plugins'))) return { ok: true, root: clt2.root, pluginsDir: joinPath(clt2.root, 'codelinter', 'plugins') }
        } catch (e) { /* fall through */ }
        return { ok: false, error: 'codelinter rule docs not found in this Command Line Tools layout; action=rules currently maps the DevEco Studio bundle layout only.' }
      }
      if (args.action === 'rules') {
        const base = codelinterBase()
        if (!base.ok) return { ok: false, error: base.error }
        const rules = studio.listCodelinterRules(base.root, base.pluginsDir)
        if (!rules.ok) return rules
        const limit = Number(args.limit) > 0 ? Math.min(Number(args.limit), 200) : 200
        return { ok: true, count: rules.rules.length, shown: Math.min(rules.rules.length, limit), docsDir: rules.docsDir, rules: rules.rules.slice(0, limit), license: 'Apache-2.0 (Copyright (c) 2024 Huawei Device Co., Ltd.) — read from the local DevEco Studio install, never redistributed.' }
      }
      if (args.action === 'read-rule') {
        const base = codelinterBase()
        if (!base.ok) return { ok: false, error: base.error }
        const doc = studio.readRuleDoc(base.root, args.rule || '', args.lang === 'en' ? 'en' : 'cn', base.pluginsDir)
        if (!doc.ok) return doc
        return { ok: true, rule: args.rule, lang: args.lang === 'en' ? 'en' : 'cn', content: doc.text }
      }
      if (args.action === 'check') {
        const cli = await ensureCli(policy)
        if (!cli.ok) return { ok: false, error: cli.error, fallback: 'hms_lint action=rules still works locally; review rules manually.' }
        const jsonOk = featureGate(6, 1)
        const argv = ['check', 'lint']
        if (args.path && String(args.path).trim()) argv.push(psQuote(String(args.path).trim()))
        if (jsonOk) argv.push('--format', 'json')
        if (args.fix) argv.push('--fix')
        if (Number(args.limit) > 0) argv.push('--limit', String(Math.min(Number(args.limit), 500)))
        const r = await runCli(cli, argv, { timeoutMs: Number(args.timeoutMs) || 300000, stdoutMaxBytes: 1048576 }, policy)
        const json = jsonOk ? tryParseJson(r.stdout.trim()) : null
        const mojo = mojoFatal(r)
        const missingJson = jsonOk && json == null
        const hasOutput = (r.stdout + '\n' + r.stderr).trim().length > 0
        const ok = hasOutput && !r.timedOut && !mojo && !missingJson && (r.exitCode === 0 || LINT_REPORT_RE.test(r.stdout + r.stderr))
        return { backend: 'devecocli', ok, exitCode: r.exitCode, timedOut: r.timedOut, mojoFatal: mojo, emptyResult: missingJson, format: jsonOk ? 'json' : 'text', result: json != null ? json : null, output: json != null ? '' : tailText((r.stdout + '\n' + r.stderr).trim(), 8000), error: ok ? '' : (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — lint check needs [Outside sandbox] execution' : (missingJson ? 'devecocli lint returned no JSON result.' : (r.stderr || r.stdout))) }
      }
      return { ok: false, error: 'unknown action: ' + args.action }
    },
  })

  registerTool({
    name: 'hms_api',
    description: 'Official-first, version-classified API knowledge from the local HarmonyOS SDK .d.ts: every entry carries @since/@deprecated/@syscap tags. Actions: modules (list SDK modules), lookup (declarations of a module/member classified against the target API version), snippet (raw declaration text).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: modules, lookup, snippet' },
        module: { type: 'string', description: 'Module name for lookup/snippet, e.g. @ohos.promptAction (use action=modules to list)' },
        name: { type: 'string', description: 'Optional exported member name to filter for lookup/snippet' },
        filter: { type: 'string', description: 'Optional substring filter for action=modules' },
        targetApi: { type: 'integer', description: 'Optional explicit target API version; defaults to project compatibleSdkVersion > device > SDK' },
        projectPath: { type: 'string', description: 'Optional project root for target resolution (defaults to the session workspace)' },
        devecoPath: { type: 'string', description: 'Optional explicit DevEco Studio install root' },
        sdkPath: { type: 'string', description: 'Optional explicit SDK root' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const overrides = { devecoPath: args.devecoPath, sdkPath: args.sdkPath }
      const sdk = getSdk(overrides)
      if (!sdk.ok) return { ok: false, error: sdk.error }
      if (args.action === 'modules') {
        const all = sdkDts.listModules(sdk.apiDir)
        const filter = String(args.filter || '').toLowerCase()
        const hit = filter ? all.filter((m) => m.toLowerCase().includes(filter)) : all
        return { ok: true, total: hit.length, shown: hit.slice(0, 80), truncated: hit.length > 80, filter: filter || '', sdkApiVersion: sdk.apiVersion, note: 'Local SDK read (Apache-2.0, never redistributed).' }
      }
      const moduleName = String(args.module || '').trim()
      if (!moduleName) return { ok: false, error: 'module is required for action=lookup/snippet (e.g. @ohos.promptAction)' }
      const read = sdkDts.readModule(sdk.apiDir, moduleName)
      if (!read.ok) return read
      if (args.action === 'snippet') {
        const windows = sdkDts.snippetFor(read.text, args.name ? String(args.name) : 'export', args.name ? 40 : 25)
        const total = windows.map((w) => w.text).join('\n----\n')
        return { ok: true, module: moduleName, name: args.name || '', windows: windows.map((w) => ({ start: w.start, text: w.text.slice(0, 2400) })), source: read.file, sdkApiVersion: sdk.apiVersion }
      }
      let targetApi = null
      if (Number.isInteger(args.targetApi)) {
        targetApi = args.targetApi
      } else {
        const target = await resolveTarget({ explicit: null, projectPath: args.projectPath, policy, overrides })
        targetApi = target.resolved.api
      }
      const result = sdkDts.queryModule(read.text, args.name ? String(args.name) : '', targetApi, sdk.apiVersion)
      return { ...result, module: moduleName, targetApi, file: read.file, sdkApiVersion: sdk.apiVersion }
    },
  })

  registerTool({
    name: 'hms_knowledge',
    description: 'Offline bundled official knowledge (Tier-1): verbatim CC-BY-4.0 excerpts (zh-CN) from the OpenHarmony docs for the most-used APIs and app-model/ArkTS guides. Works with no SDK, CLI, or network. Actions: catalog (list topics), read (topic TOC, then a section by name/index), search (keywords over topics and section headings).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: catalog, read, search' },
        id: { type: 'string', description: 'Topic id for read (from catalog/search)' },
        section: { type: 'string', description: 'Optional section for read: a heading name substring or its 1-based TOC index; omit to get the TOC plus the intro' },
        keywords: { type: 'string', description: 'Space-separated keywords for search (matches topic titles/modules/tags and section headings)' },
        limit: { type: 'integer', description: 'Max results for search (default 6, max 20)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      if (!knowledge.available()) {
        return { ok: false, error: 'bundled knowledge layer not found in this installation', fallback: 'Use hms_api for local SDK .d.ts lookups, or hms_docs via devecocli for the full official docs.' }
      }
      if (args.action === 'catalog') return knowledge.catalog(args.filter, args.kind)
      if (args.action === 'read') {
        const id = String(args.id || '').trim()
        if (!id) return { ok: false, error: 'id is required for read (list ids with action=catalog)' }
        return knowledge.read(id, args.section == null ? '' : String(args.section))
      }
      if (args.action === 'search') {
        const kws = String(args.keywords || '').split(/\s+/).map((s) => s.trim()).filter(Boolean)
        if (kws.length === 0) return { ok: false, error: 'keywords are required for search' }
        return knowledge.search(kws, Number(args.limit) > 0 ? Math.min(Number(args.limit), 20) : 6)
      }
      return { ok: false, error: 'unknown action: ' + args.action }
    },
  })

  registerTool({
    name: 'hms_docs',
    description: 'Search and read the official local HarmonyOS docs through devecocli docs (search/read/catalog). Official-first documentation knowledge; falls back with web-docs guidance when devecocli is unavailable.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: search, read, catalog' },
        keywords: { type: 'string', description: 'Space-separated keywords for search (matches any keyword)' },
        documentId: { type: 'string', description: 'Document id for read (copy it from a search result, e.g. 开发指南/.../ide-insight-session-launch)' },
        catalog: { type: 'string', description: 'Optional catalog name for search' },
        limit: { type: 'integer', description: 'Max search results (default 10)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const cli = await ensureCli(policy)
      if (!cli.ok) {
        return { ok: false, error: cli.error, fallback: 'Online official docs: developer.huawei.com (use web search tools with the target API version in the query).' }
      }
      if (args.action === 'catalog') {
        const r = await runCli(cli, ['docs', 'catalog'], { timeoutMs: 60000, stdoutMaxBytes: 262144 }, policy)
        const mojo = mojoFatal(r)
        return { ok: r.ok && !mojo, mojoFatal: mojo, output: tailText((r.stdout + '\n' + r.stderr).trim(), 6000), error: r.ok ? (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — docs needs [Outside sandbox] execution' : '') : (r.stderr || r.stdout) }
      }
      if (args.action === 'search') {
        const kws = String(args.keywords || '').split(/\s+/).map((s) => s.trim()).filter(Boolean)
        if (kws.length === 0) return { ok: false, error: 'keywords are required for action=search' }
        const argv = ['docs', 'search', ...kws.map((k) => psQuote(k)), '--format', 'json']
        if (args.catalog && String(args.catalog).trim()) argv.push('--catalog', psQuote(String(args.catalog).trim()))
        if (Number(args.limit) > 0) argv.push('--limit', String(Math.min(Number(args.limit), 50)))
        // The docs index lives under the user profile, outside the workspace:
        // a restricted sandbox can get empty output with exit 0 — retry once
        // under the host default policy, mirroring the emulator listing retry.
        let r = await runCli(cli, argv, { timeoutMs: 60000, stdoutMaxBytes: 524288 }, policy)
        const emptyFirst = !(r.stdout + r.stderr).trim()
        if (r.exitCode === 0 && !r.timedOut && !mojoFatal(r) && emptyFirst) {
          r = await runCli(cli, argv, { timeoutMs: 60000, stdoutMaxBytes: 524288 }, undefined)
        }
        const mojo = mojoFatal(r)
        const empty = !(r.stdout + r.stderr).trim()
        const json = tryParseJson(r.stdout.trim())
        const ok = r.ok && !mojo && !empty
        return { ok, backend: 'devecocli', results: json != null ? json : null, output: json != null ? '' : tailText((r.stdout + '\n' + r.stderr).trim(), 6000), error: ok ? '' : (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — docs needs [Outside sandbox] execution' : (empty ? 'devecocli docs returned no output — the docs index (user profile) is unreadable in this sandbox even after retrying under the host default policy.' : (r.stderr || r.stdout))), mojoFatal: mojo, emptyOutput: empty, hint: 'Search matches ANY keyword (tokenized); for a precise topic use a longer phrase or --catalog. Use hms_docs action=read with a documentId from the results to get full content.' }
      }
      if (args.action === 'read') {
        const id = String(args.documentId || '').trim()
        if (!id) return { ok: false, error: 'documentId is required for action=read' }
        const r = await runCli(cli, ['docs', 'read', psQuote(id)], { timeoutMs: 60000, stdoutMaxBytes: 524288 }, policy)
        const mojo = mojoFatal(r)
        return { ok: r.ok && !mojo, documentId: id, mojoFatal: mojo, content: tailText((r.stdout + '\n' + r.stderr).trim(), 12000), error: r.ok ? (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — docs needs [Outside sandbox] execution' : '') : (r.stderr || r.stdout) }
      }
      return { ok: false, error: 'unknown action: ' + args.action }
    },
  })

  registerTool({
    name: 'hms_api_change',
    description: 'Official cross-version breaking API change scan (devecocli check compat): versions lists the SDK versions the local toolchain knows; diff scans a project, module set, or file list between --source-version and --target-version (target must be newer) and returns the breaking changes as JSON. The authoritative answer for "what changed between HarmonyOS versions". Per the official docs, check compat is an [Outside sandbox] operation.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of: versions, diff' },
        sourceVersion: { type: 'string', description: 'Source SDK version for diff (required; from action=versions)' },
        targetVersion: { type: 'string', description: 'Target SDK version for diff (required; must be newer than source)' },
        modules: { type: 'string', description: 'Optional space-separated modules to scan (diff; mutually exclusive with files)' },
        files: { type: 'string', description: 'Optional space-separated .ets/.c/.cpp files to scan (diff; mutually exclusive with modules)' },
        outputPath: { type: 'string', description: 'Optional directory/file to write apiChange-*.json/csv (diff)' },
        limit: { type: 'integer', description: 'Max console records (diff; default 100)' },
        timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds (default 600000)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const cli = await ensureCli(policy)
      if (!cli.ok) return { ok: false, error: cli.error }
      // devecocli's compat channel needs DevEco Studio >= 26.0.0.810. In a
      // restricted sandbox the CLI can die silently before printing anything,
      // so fail fast from the local Studio version when it is provably below
      // the requirement, then let the real CLI output pass through otherwise.
      const st = getStudio()
      const COMPAT_MIN = '26.0.0.810'
      const COMPAT_UPGRADE_URL = 'https://developer.huawei.com/consumer/cn/download/'
      const compatBlocked = st.ok && !versionGte(st.version, COMPAT_MIN)
      if (compatBlocked) {
        const compatErrorText = 'Error: A required component is missing. The detected DevEco Studio version is ' + st.version + '. The minimum required version is ' + COMPAT_MIN + ". Upgrade before using 'check compat' at " + COMPAT_UPGRADE_URL
        return {
          ok: false,
          action: args.action,
          studioVersion: st.version,
          requiredVersion: COMPAT_MIN,
          localVersionGuard: true,
          output: compatErrorText,
          error: compatErrorText,
          hint: 'check compat requires the newer DevEco Studio version named in the error (upgrade at ' + COMPAT_UPGRADE_URL + '). Until then, hms_api @since/@deprecated tags give per-API version knowledge.',
        }
      }
      if (args.action === 'versions') {
        // JSON is the preferred channel, but devecocli 1.3.0 can leave stdout
        // empty when the Studio is below the compat requirement. Fall back to
        // the plain text form so the real error/version list is never hidden.
        let r = await runCli(cli, ['check', 'compat', 'versions', '--format', 'json'], { timeoutMs: 60000, stdoutMaxBytes: 262144 }, policy)
        let json = tryParseJson(r.stdout.trim())
        let text = (r.stdout + '\n' + r.stderr).trim()
        const emptyFirst = !text
        if (r.exitCode === 0 && !r.timedOut && !mojoFatal(r) && emptyFirst) {
          r = await runCli(cli, ['check', 'compat', 'versions', '--format', 'json'], { timeoutMs: 60000, stdoutMaxBytes: 262144 }, undefined)
          json = tryParseJson(r.stdout.trim())
          text = (r.stdout + '\n' + r.stderr).trim()
        }
        if (json == null) {
          const plain = await runCli(cli, ['check', 'compat', 'versions'], { timeoutMs: 60000, stdoutMaxBytes: 262144, mergeStderr: true }, policy)
          const plainText = (plain.stdout + '\n' + plain.stderr).trim()
          if (plainText) {
            r = { ...plain, stdout: plainText, stderr: '' }
            text = plainText
          }
        }
        const mojo = mojoFatal(r)
        const emptyResult = json == null && !text
        const upgradeNeeded = /required component is missing|minimum required version/i.test(text)
        const ok = r.ok && !mojo && (json != null || (text && r.exitCode === 0 && !upgradeNeeded))
        const output = text || (json != null ? JSON.stringify(json, null, 2) : '')
        return { ok, versions: json != null ? json : null, mojoFatal: mojo, emptyResult, format: json != null ? 'json' : 'text', output: tailText(output, 8000), error: ok ? '' : (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — compat versions needs [Outside sandbox] execution' : (emptyResult ? 'devecocli compat versions returned no output.' : (text || 'devecocli compat versions failed.'))), hint: (upgradeNeeded ? 'check compat requires the newer DevEco Studio version named in the error (upgrade at developer.huawei.com). Until then, hms_api @since/@deprecated tags give per-API version knowledge. ' : '') + epermHint(text) }
      }
      if (args.action === 'diff') {
        const src = String(args.sourceVersion || '').trim()
        const tgt = String(args.targetVersion || '').trim()
        if (!src || !tgt) return { ok: false, error: 'sourceVersion and targetVersion are required for diff; list them with action=versions.' }
        const argv = ['check', 'compat', '--source-version', psQuote(src), '--target-version', psQuote(tgt), '--format', 'json']
        if (args.modules && String(args.modules).trim()) argv.push('--modules', ...String(args.modules).split(/\s+/).map((m) => psQuote(m)))
        if (args.files && String(args.files).trim()) argv.push(...String(args.files).split(/\s+/).map((f) => psQuote(f)))
        if (args.outputPath && String(args.outputPath).trim()) argv.push('--output-path', psQuote(String(args.outputPath).trim()))
        if (Number(args.limit) > 0) argv.push('--limit', String(Math.min(Number(args.limit), 500)))
        let r = await runCli(cli, argv, { timeoutMs: Number(args.timeoutMs) || 600000, stdoutMaxBytes: 1048576 }, policy)
        let json = tryParseJson(r.stdout.trim())
        let text = (r.stdout + '\n' + r.stderr).trim()
        if (json == null) {
          const plainArgv = argv.filter((item, idx) => !(item === '--format' && argv[idx + 1] === 'json'))
          const plain = await runCli(cli, plainArgv, { timeoutMs: Number(args.timeoutMs) || 600000, stdoutMaxBytes: 1048576, mergeStderr: true }, policy)
          const plainText = (plain.stdout + '\n' + plain.stderr).trim()
          if (plainText) {
            r = { ...plain, stdout: plainText, stderr: '' }
            text = plainText
          }
        }
        const mojo = mojoFatal(r)
        const emptyResult = json == null && !text
        const upgradeNeeded = /required component is missing|minimum required version/i.test(text)
        const ok = r.ok && !mojo && (json != null || (text && r.exitCode === 0 && !upgradeNeeded))
        const output = text || (json != null ? JSON.stringify(json, null, 2) : '')
        return { ok, exitCode: r.exitCode, timedOut: r.timedOut, sourceVersion: src, targetVersion: tgt, changes: json != null ? json : null, format: json != null ? 'json' : 'text', mojoFatal: mojo, emptyResult, output: tailText(output, 8000), error: ok ? '' : (mojo ? 'devecocli mojo platform channel blocked in this sandbox (0x5) — compat diff needs [Outside sandbox] execution' : (emptyResult ? 'devecocli compat diff returned no output.' : (text || 'devecocli compat diff failed.'))), hint: (upgradeNeeded ? 'check compat requires the newer DevEco Studio version named in the error (upgrade at developer.huawei.com). Until then, hms_api @since/@deprecated tags give per-API version knowledge. ' : '') + epermHint(text) }
      }
      return { ok: false, error: 'unknown action: ' + args.action }
    },
  })

  // Compile-assistance tools are adapted from the DevEco Code open-source
  // workflow and complement the device-oriented hdc_* tools above.
  registerTool({
    name: 'switch_cwd',
    description: 'Switch the session HarmonyOS project root used by build_project, start_app, arkts_check, and hdc_log. Accepts an absolute path or a path relative to the current workspace.',
    parameters: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Target HarmonyOS project directory path, absolute or relative to the current workspace.' },
      },
      required: ['project_path'],
    },
    output: { schema: OUT_SCHEMA, render: textOrJsonOut },
    async execute(args, exec) {
      const trimmed = String((args && args.project_path) || '').trim()
      if (!trimmed) return { ok: false, error: 'project_path must not be empty' }
      const root = policyRoot(policyFor(exec)) || process.cwd()
      const target = isAbsolute(trimmed) ? normalize(trimmed) : pathResolve(root, trimmed)
      let real
      try {
        real = realpathSync(target)
      } catch {
        return { ok: false, error: 'Not a directory or not found: ' + target }
      }
      if (!statSync(real).isDirectory()) return { ok: false, error: 'Not a directory or not found: ' + target }
      const sessionId = sessionIdOf(exec) || realmSessionId()
      if (sessionId) setCompileCwd(sessionId, real)
      const isHarmony = isHarmonyApplicationRoot(real)
      const workspace = policyRoot(policyFor(exec))
      const normalized = real.replace(/\\/g, '/').toLowerCase()
      const normalizedWorkspace = workspace.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
      const outsideWorkspace = Boolean(normalizedWorkspace) && !(normalized === normalizedWorkspace || normalized.startsWith(normalizedWorkspace + '/'))
      const text = outsideWorkspace
        ? `Session HarmonyOS project root set to ${real}. This directory is outside the current workspace boundary.`
        : (isHarmony
          ? `Session HarmonyOS project root set to ${real}.`
          : `Session directory set to ${real}, but it is not a HarmonyOS application project root.`)
      return { ok: true, directory: real, isHarmonyProject: isHarmony, storedForSession: Boolean(sessionId), outsideWorkspace, text }
    },
  })

  registerTool({
    name: 'build_project',
    description: 'Compile and package a HarmonyOS project with devecocli. When its channel fails, the normal build path falls back to direct hvigorw and verifies that a .hap artifact changed.',
    parameters: {
      type: 'object',
      properties: {
        clean: { type: 'boolean', description: 'Remove existing build outputs before compiling.' },
        product: { type: 'string', description: 'Product name from build-profile.json5.' },
        modules: { type: 'array', items: { type: 'string' }, description: 'Module names or module@target values.' },
        build_mode: { type: 'string', description: 'Build mode such as debug or release.' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOrJsonOut },
    async execute(args, exec) {
      args = args || {}
      const cwd = compileCwd(exec)
      if (!existsSync(joinPath(cwd, 'build-profile.json5'))) {
        return { ok: false, error: `HarmonyOS project not found at ${cwd}. Run switch_cwd to the project root or scaffold a project first.` }
      }
      const policy = policyFor(exec)
      const cli = await ensureCli(policy)
      const argv = compileCli.buildDevecoCliBuildArgs({ ...args, clean: false })
      const cleanArgv = ['build', 'clean']
      const hapBefore = await findNewestHap(cwd, policy)
      const beforeM = statMtimeMs(hapBefore)
      let result = { stdout: '', stderr: cli.ok ? '' : cli.error, exitCode: null, timedOut: false }
      let mojo = false
      let ok = false
      if (cli.ok) {
        if (args.clean === true) {
          const cleanResult = await runCli(cli, cleanArgv.map((arg) => psQuote(arg)), { timeoutMs: 30 * 60 * 1000, stdoutMaxBytes: 1048576, workdir: cwd }, policy)
          const cleanMojo = mojoFatal(cleanResult)
          if (buildResultOk(cleanResult) && !cleanMojo) {
            result = await runCli(cli, argv.map((arg) => psQuote(arg)), { timeoutMs: 30 * 60 * 1000, stdoutMaxBytes: 1048576, workdir: cwd }, policy)
            result = { ...result, stdout: cleanResult.stdout + '\n' + result.stdout, stderr: cleanResult.stderr + '\n' + result.stderr }
            mojo = mojoFatal(result)
            ok = buildResultOk(result) && !mojo
          } else {
            result = cleanResult
            mojo = cleanMojo
          }
        } else {
          result = await runCli(cli, argv.map((arg) => psQuote(arg)), { timeoutMs: 30 * 60 * 1000, stdoutMaxBytes: 1048576, workdir: cwd }, policy)
          mojo = mojoFatal(result)
          ok = buildResultOk(result) && !mojo
        }
      }
      let hapAfter = await findNewestHap(cwd, policy)
      const afterM = statMtimeMs(hapAfter)
      const artifactStale = ok && (!hapAfter || (args.clean !== true && afterM <= beforeM))
      if (artifactStale) ok = false

      let backend = cli.ok ? 'devecocli' : 'none'
      let fallback = false
      let fallbackText = ''
      let hvigorLast = null
      if (!ok) {
        fallback = true
        const product = String(args.product || 'default')
        const mode = String(args.build_mode || 'debug')
        const direct = args.clean === true
          ? await hvigorDirectBuild({ base: cwd, product, mode, timeoutMs: 30 * 60 * 1000, policy, task: 'clean' })
          : null
        hvigorLast = direct
        let buildDirect = direct
        let fallbackOutput = direct ? direct.output : ''
        if (args.clean === true && direct && direct.available && direct.ok) {
          buildDirect = await hvigorDirectBuild({ base: cwd, product, mode, timeoutMs: 30 * 60 * 1000, policy, task: 'assembleHap' })
          hvigorLast = buildDirect
          fallbackOutput += '\n' + (buildDirect.output || '')
        } else if (args.clean !== true) {
          buildDirect = await hvigorDirectBuild({ base: cwd, product, mode, timeoutMs: 30 * 60 * 1000, policy, task: 'assembleHap' })
          hvigorLast = buildDirect
          fallbackOutput = buildDirect.output
        }
        if (buildDirect && buildDirect.available && buildDirect.ok) {
          const fallbackHap = await findNewestHap(cwd, policy)
          const fallbackVerified = Boolean(fallbackHap) && (args.clean === true || statMtimeMs(fallbackHap) > beforeM)
          hapAfter = fallbackHap
          if (fallbackVerified) {
            ok = true
            backend = 'hvigorw'
            fallbackText = '\n\nDirect hvigorw fallback completed. New artifact: ' + (fallbackHap || '') + '\n' + compileOut.stripAnsi(fallbackOutput)
          } else {
            fallbackText = '\n\nhvigorw reported success but no .hap artifact was produced.\n' + compileOut.stripAnsi(fallbackOutput)
          }
        } else {
          const failure = buildDirect || direct
          fallbackText = failure && failure.available ? '\n\nhvigorw fallback failed:\n' + compileOut.stripAnsi(fallbackOutput) : '\n\nhvigorw fallback unavailable: ' + (failure ? failure.error : 'unknown error')
        }
      }
      const formatted = compileOut.formatBuildProjectOutput({ stdout: result.stdout, stderr: result.stderr, exitCode: ok ? result.exitCode : (result.exitCode === 0 ? 1 : result.exitCode) })
      let text = formatted.text
      if (ok && backend === 'devecocli' && result.exitCode !== 0) {
        text = text.replace(/BUILD FAILED \(exitCode=\d+\)/, `Build completed successfully (exitCode=${result.exitCode}, judged by output markers)`)
      }
      if (artifactStale) text += '\n\nBuild reported success but no .hap artifact was updated. Last artifact: ' + (hapAfter || 'none') + '.'
      if (mojo) text += '\n\n' + MOJO_NOTE
      if (fallbackText) text += fallbackText
      if (ok && backend === 'hvigorw') text += '\n\nBuild completed successfully (backend=hvigorw).'
      return {
        ok,
        backend,
        fallback,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        command: args.clean === true ? compileCli.commandText(cleanArgv) + ' && ' + compileCli.commandText(argv) : compileCli.commandText(argv),
        truncated: formatted.truncated,
        mojoFatal: mojo,
        artifactStale,
        hapBefore: hapBefore || '',
        hapAfter: hapAfter || '',
        warning: artifactStale ? 'Build output indicated success but the artifact did not change.' : '',
        ...hvigorDiag(hvigorLast),
        text,
        error: ok ? '' : (fallbackText || (cli.ok ? 'build failed' : cli.error)),
      }
    },
  })

  registerTool({
    name: 'arkts_check',
    description: 'Run the ArkTS strict-mode static checker through the DevEco Studio SDK ets-loader. With no files supplied, collects .ets files from entry/src/main/ets.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Optional .ets file paths, relative to the project root or absolute.' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOrJsonOut },
    async execute(args, exec) {
      args = args || {}
      const cwd = compileCwd(exec)
      const policy = policyFor(exec)
      const studioInfo = getStudio()
      if (!studioInfo.ok) return { ok: false, error: 'DevEco Studio install not found; arkts_check needs the SDK ets-loader.' }
      const nodeBin = studioNodeBin(studioInfo.root)
      if (!nodeBin) return { ok: false, error: 'Node binary not found in DevEco Studio: ' + joinPath(studioInfo.root, 'tools', 'node') }
      const scriptPath = compileArktsScriptPath()
      if (!existsSync(scriptPath)) return { ok: false, error: 'arkts-check script not found: ' + scriptPath }
      let files = (Array.isArray(args.files) ? args.files : []).map((file) => String(file).trim()).filter(Boolean)
      let autoCollected = false
      if (files.length === 0) {
        files = await collectEtsFiles(cwd, policy)
        autoCollected = true
      }
      if (files.length === 0) {
        return { ok: false, error: 'Auto-collect found no .ets files under entry/src/main/ets.', fileCount: 0, title: 'ArkTS Check Skipped' }
      }
      files = files.slice(0, 1000)
      const argv = [psQuote(scriptPath), '--project', psQuote(cwd), '--deveco-home', psQuote(studioInfo.root), '--files', ...files.map((file) => psQuote(file))]
      const command = shellFlavor === 'pwsh'
        ? '$env:DEVECO_HOME=' + psQuote(studioInfo.root) + '; & ' + psQuote(nodeBin) + ' ' + argv.join(' ')
        : 'DEVECO_HOME=' + psQuote(studioInfo.root) + ' ' + psQuote(nodeBin) + ' ' + argv.join(' ')
      const result = await runShellRaw(command, 10 * 60 * 1000, 524288, policy, cwd)
      const stdout = ((result.stdout && result.stdout.text) || '').trim()
      const stderr = ((result.stderr && result.stderr.text) || '').trim()
      if (!stdout) return { ok: false, error: stderr || `arkts-check exited with code ${result.exitCode} but produced no output` }
      let parsed
      try {
        parsed = JSON.parse(stdout)
      } catch {
        return { ok: false, error: 'Failed to parse arkts-check output: ' + stdout.slice(0, 500) }
      }
      if (parsed && parsed.error && (!Array.isArray(parsed.errors) || parsed.errors.length === 0)) return { ok: false, error: parsed.error }
      const diagnostics = Array.isArray(parsed && parsed.errors) ? parsed.errors : []
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      const errorCount = errors.length
      const warnCount = diagnostics.length - errors.length
      if (errors.length === 0) {
        return { ok: true, errorCount: 0, warnCount, fileCount: files.length, autoCollected, title: 'ArkTS Check Passed', text: `ArkTS Check Passed: no errors found in ${files.length} file(s).` }
      }
      const lines = errors.map((diagnostic) => `${diagnostic.file || ''}:${diagnostic.line ?? ''}:${diagnostic.column ?? ''} - ${diagnostic.severity || 'error'}: ${diagnostic.message || ''}${diagnostic.rule ? ' (' + diagnostic.rule + ')' : ''}`)
      return { ok: false, errorCount, warnCount, fileCount: files.length, title: 'ArkTS Check Failed', text: ['ArkTS check found ' + errorCount + ' error(s):', ...lines].join('\n') }
    },
  })

  registerTool({
    name: 'start_app',
    description: 'Start a built HarmonyOS app through devecocli without rebuilding. If CLI discovery or launch fails, install the newest .hap through hdc and start its entry ability.',
    parameters: {
      type: 'object',
      properties: {
        hvd: { type: 'string', description: 'Target device name or serial. Omit to list available devices.' },
        ability: { type: 'string', description: 'Ability name, for example EntryAbility.' },
        module: { type: 'string', description: 'Module name, for example entry.' },
        target: { type: 'string', description: 'Build target paired with module.' },
      },
      required: [],
    },
    output: { schema: OUT_SCHEMA, render: textOrJsonOut },
    async execute(args, exec) {
      args = args || {}
      const cwd = compileCwd(exec)
      const policy = policyFor(exec)
      const cli = await ensureCli(policy)
      const results = []
      const invoke = async (cliArgs) => {
        const result = await runCli(cli, cliArgs.map((arg) => psQuote(arg)), { timeoutMs: 15 * 60 * 1000, stdoutMaxBytes: 524288, workdir: cwd }, policy)
        results.push({ command: compileCli.commandText(cliArgs), result })
        return result
      }
      if (cli.ok) {
        for (const cliArgs of compileCli.buildDevecoCliStartAppCommands(args)) await invoke(cliArgs)
        const device = String(args.hvd || '').trim()
        if (device) {
          const runArgs = compileCli.buildDevecoCliRunArgs({ device, ability: args.ability, module: args.module, target: args.target })
          const first = results[0] && results[0].result
          const firstText = first ? first.stdout + '\n' + first.stderr : ''
          if (first && compileCli.devecoCliListContainsTarget(firstText, device)) {
            await invoke(runArgs)
          } else {
            const emulators = await invoke(['emulator', 'list'])
            if (compileCli.devecoCliListContainsTarget(emulators.stdout + '\n' + emulators.stderr, device)) {
              const started = await invoke(['emulator', 'start', device])
              if (started.exitCode === 0 && !mojoFatal(started)) await invoke(runArgs)
            }
          }
        }
      }
      const discoveryResults = results.filter(({ command }) => /device list|emulator list/.test(String(command)))
      const discoveryMojo = discoveryResults.length > 0 && discoveryResults.every(({ result }) => result && (mojoFatal(result) || result.exitCode !== 0))
      const cliText = results.length ? compileCli.formatStartAppResults(results) : ''
      let ok = results.some(({ command, result }) => String(command).startsWith('devecocli run ') && result && result.exitCode === 0 && !mojoFatal(result))
      let mode = cli.ok ? 'devecocli' : 'none'
      let fallback = null
      let hdcAvailable = []
      if (!String(args.hvd || '').trim()) {
        // The official discovery prompt is devecocli-first, but a mojo-blocked
        // discovery must not hide an already connected hdc target. Listing is
        // read-only here: start_app never deploys or launches without hvd.
        await ensureHdc(policy)
        if (hdcPathRef()) {
          const discovered = await listTargets(policy)
          hdcAvailable = discovered.targets.filter((target) => /connected/i.test(target.state) && !/^COM\d+$/i.test(target.id))
        }
      }
      if (!ok && String(args.hvd || '').trim()) {
        fallback = await hdcFallbackDeploy(args, cwd, policy)
        if (fallback.ok) {
          ok = true
          mode = 'hdc-fallback'
        }
      }
      const text = fallback
        ? (fallback.ok
          ? fallback.text + (cliText ? '\n\n[devecocli background]\n' + cliText : '')
          : (cliText ? cliText + '\n\n' : '') + 'hdc fallback failed: ' + (fallback.text || fallback.error))
        : (hdcAvailable.length > 0
          ? ['请指定要使用的设备。', '当前 hdc 在线设备：', '', ...hdcAvailable.map((target) => `  - ${target.id} (${target.type || 'device'})`), '', '请使用 hvd 参数指定设备名称，例如：', `- hvd="${hdcAvailable[0].id}"`].join('\n')
          : cliText)
      return {
        ok,
        mode,
        hdcFallback: fallback,
        availableDevices: hdcAvailable,
        discoveryMojo,
        commands: results.map((entry) => entry.command),
        exitCodes: results.map((entry) => entry.result ? entry.result.exitCode : null),
        text,
        error: ok ? '' : (cli.ok ? 'App launch failed.' : cli.error),
      }
    },
  })

  registerTool({
    name: 'hdc_log',
    description: 'Collect, clear, or list HarmonyOS device logs. Collection uses devecocli when available and falls back to hdc shell hilog for sandboxed or PID-filtered requests.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'One of collect, clear, or list_devices.' },
        device_id: { type: 'string', description: 'Optional device name or serial.' },
        log_prefix: { type: 'string', description: 'Optional log keyword.' },
        bundle: { type: 'string', description: 'Optional bundle name used to resolve and filter by PID.' },
        pid: { type: 'integer', description: 'Optional explicit PID, which takes precedence over bundle.' },
        lines: { type: 'integer', description: 'Maximum log lines, 1 through 5000.' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: hdcLogOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const cwd = compileCwd(exec)
      const action = String(args.action || '')

      if (action === 'list_devices') {
        const cli = await ensureCli(policy)
        if (cli.ok) {
          const result = await runCli(cli, ['device', 'list'].map((arg) => psQuote(arg)), { timeoutMs: 60000, stdoutMaxBytes: 262144, workdir: cwd }, policy)
          const output = compileOut.stripAnsi((result.stdout + result.stderr).trim())
          const rows = compileCli.parseCliTable(result.stdout)
          if (result.exitCode === 0 && !mojoFatal(result) && rows.length > 0) {
            await ensureHdc(policy)
            let discovered = hdcPathRef() ? await listTargets(policy) : { ok: false, targets: [], error: '' }
            // The CLI and hdc can receive different sandbox policies. Retry
            // the authoritative hdc listing without the session policy before
            // falling back to the CLI rows, otherwise a connected TCP target
            // can be reported as absent.
            if (!discovered.ok || !discovered.targets.some((target) => /connected/i.test(target.state) && !/^COM\d+$/i.test(target.id))) {
              const retry = await listTargets(undefined)
              if (retry.ok || retry.targets.length > discovered.targets.length) discovered = retry
            }
            const devices = discovered.targets.filter((target) => /connected/i.test(target.state) && !/^COM\d+$/i.test(target.id))
            const preferred = getPreferred() || (devices[0] && devices[0].id) || (rows[0] && (rows[0].serial || rows[0].name)) || ''
            if (preferred && !getPreferred()) setPreferred(preferred)
            return {
              ok: true,
              action,
              deviceCount: devices.length || rows.length,
              lineCount: null,
              devices: devices.length ? devices : rows,
              targets: discovered.targets,
              preferred,
              preferredActive: Boolean(preferred && discovered.targets.some((target) => target.id === preferred && /connected/i.test(target.state))),
              text: output,
              error: discovered.error || '',
            }
          }
        }
        await ensureHdc(policy)
        if (!hdcPathRef()) {
          const error = hdcErrorRef()
          return { ok: false, action, deviceCount: 0, lineCount: null, devices: [], targets: [], preferred: getPreferred(), preferredActive: false, text: error, error }
        }
        const targets = await listTargets(policy)
        const devices = targets.targets.filter((target) => /connected/i.test(target.state) && !/^COM\d+$/i.test(target.id))
        const preferred = getPreferred() || (devices[0] && devices[0].id) || ''
        if (preferred && !getPreferred()) setPreferred(preferred)
        const preferredActive = Boolean(preferred && targets.targets.some((target) => target.id === preferred && /connected/i.test(target.state)))
        const text = devices.length
          ? devices.map((target) => `${target.id} ${target.type} ${target.state}`.trim()).join('\n')
          : 'No connected devices detected.'
        return { ok: targets.ok, action, deviceCount: devices.length, lineCount: null, devices, targets: targets.targets, preferred, preferredActive, text, error: targets.error || '' }
      }

      if (action === 'clear') {
        await ensureHdc(policy)
        if (!hdcPathRef()) {
          const error = hdcErrorRef()
          return { ok: false, error, text: error }
        }
        const target = String(args.device_id || '').trim() || undefined
        const result = await runHdc(['shell', psQuote('hilog -r')], { timeoutMs: 30000, stdoutMaxBytes: 16384, target }, policy)
        if (!result.ok) return { ok: false, error: result.stderr || 'hilog -r failed', text: result.stderr || result.stdout }
        return { ok: true, action, device: target || 'default', text: 'Device log buffer cleared.' }
      }

      if (action === 'collect') {
        const lines = Math.max(1, Math.min(5000, Number(args.lines) || 2000))
        const keyword = String(args.log_prefix || '').trim()
        const bundle = String(args.bundle || '').trim()
        const pidArg = Number(args.pid) || 0
        let backend = 'devecocli'
        let raw = ''
        let cliNote = ''
        const needsFullBuffer = Boolean(bundle || pidArg)
        if (!needsFullBuffer) {
          const cli = await ensureCli(policy)
          if (cli.ok) {
            const argv = compileCli.buildDevecoCliLogArgs({ device: args.device_id, keyword, tail: lines })
            const result = await runCli(cli, argv.map((arg) => psQuote(arg)), { timeoutMs: 120000, stdoutMaxBytes: 1048576, workdir: cwd }, policy)
            if (result.exitCode === 0 && !mojoFatal(result)) raw = compileOut.stripAnsi(result.stdout)
            else cliNote = 'devecocli log was unavailable; used hdc shell hilog.'
          } else {
            cliNote = 'devecocli is unavailable; used hdc shell hilog.'
          }
        } else {
          cliNote = 'PID or bundle filtering requires the full hdc hilog buffer.'
        }
        if (!raw) {
          backend = 'hdc'
          await ensureHdc(policy)
          if (!hdcPathRef()) {
            const error = hdcErrorRef()
            return { ok: false, error, text: error }
          }
          const current = await currentTarget(args.device_id, policy)
          if (current.error) return { ok: false, error: current.error, text: current.error }
          const result = await runHdc(['shell', 'hilog', '-x'], { target: current.target, timeoutMs: 60000, stdoutMaxBytes: 2097152 }, policy)
          if (!result.ok) return { ok: false, error: result.stderr || result.stdout || 'hilog failed', text: result.stderr || result.stdout }
          raw = result.stdout
        }
        let pid = pidArg
        let pidNote = ''
        if (!pid && bundle && hdcPathRef()) {
          const current = await currentTarget(args.device_id, policy)
          if (!current.error) {
            pid = await resolveBundlePid(bundle, current.target, policy)
            pidNote = pid ? `resolved pid ${pid} for ${bundle}` : `bundle ${bundle} is not running (no PID resolved)`
          }
        }
        let all = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        if (keyword) all = all.filter((line) => line.toLowerCase().includes(keyword.toLowerCase()))
        if (pid) all = all.filter((line) => new RegExp('(^|\\s)' + pid + '\\s').test(line))
        else if (bundle) all = all.filter((line) => line.toLowerCase().includes(bundle.toLowerCase()))
        const logLines = all.slice(-lines)
        const meta = { backend, bundle, pid, cliNote, pidNote }
        const head = [`backend: ${backend}`, `device: ${args.device_id || 'default'}`, `prefix: ${keyword || '(none)'}`, `bundle: ${bundle || '(none)'}`, `pid: ${pid || '(none)'}`]
        if (cliNote) head.push(cliNote)
        if (pidNote) head.push(pidNote)
        if (logLines.length === 0) return { ok: true, action, device: String(args.device_id || 'default'), prefix: keyword, ...meta, lineCount: 0, text: ['No matching logs found.', ...head].join('\n') }
        return { ok: true, action, device: String(args.device_id || 'default'), prefix: keyword, ...meta, lineCount: logLines.length, text: ['Log collection successful.', ...head, `count: ${logLines.length}`, '', '--- Log Content ---', ...logLines].join('\n') }
      }

      return { ok: false, error: 'unknown action: ' + action, text: 'unknown action: ' + action }
    },
  })

  // v0.6: floating device panel for web hosts (headless/CLI profiles skip
  // it — they have no webServer service, so startPanel returns undefined).
  // The panel is self-contained: it spawns hdc directly for its fixed
  // read-only command set instead of going through the session-bound shell.
  const panel = startPanel({
    ctx,
    getPreferred,
    setPreferred,
    // issue #4: the panel reuses whatever hdc the tool layer already resolved
    // (falls back to its own shared discovery + PATH probe when empty).
    getResolvedHdcPath: hdcPathRef,
    getExtraRoots: extraSdkRoots,
    // The panel shows the whole plugin, not just hdc: toolchain + knowledge
    // state come straight from the plugin's own services.
    toolchain: async () => {
      const st = getStudio()
      const sdk = getSdk()
      let devecocli = false
      try { const cli = await ensureCli(resolvePolicyFor(undefined)); devecocli = cli.ok === true } catch (e) { devecocli = false }
      let knowledgeCount = 0
      try { if (knowledge.available()) knowledgeCount = (knowledge.loadIndex().entries || []).length } catch (e) { knowledgeCount = 0 }
      return { studio: st.ok ? st.version : '', sdk: sdk.ok ? sdk.apiVersion : 0, devecocli, knowledge: knowledgeCount }
    },
  })

  const disposers = []
  const skillsService = ctx.get('skills')
  if (skillsService && typeof skillsService.register === 'function') {
    for (const skill of SKILLS) disposers.push(skillsService.register(skill))
  }

  ctx.effect(() => () => {
    for (const d of disposers) { try { d() } catch (e) { /* already disposed */ } }
  })
}
