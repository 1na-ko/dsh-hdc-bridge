import { existsSync, readFileSync } from 'node:fs'
import { join as joinPath } from 'node:path'
import * as sdkDts from './sdk-dts.mjs'
import * as knowledge from './knowledge.mjs'
import { startPanel } from './panel.mjs'
import { createHdcCore } from './hdc-core.mjs'
import { codeHint, SIGN_HINT } from './errors.mjs'
import * as studio from './studio.mjs'
import * as devcli from './devecocli.mjs'
import * as verDetect from './version-detect.mjs'
import { SKILLS } from './skills.mjs'

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

  // hdc core (discovery / run / targets / device memory) lives in lib/hdc-core.mjs.
  const hdcCore = createHdcCore({
    runShellRaw,
    psQuote,
    detectShellFlavor,
    getShellFlavor: () => shellFlavor,
    setShellFlavor: (v) => { shellFlavor = v },
    fsService,
  })
  const { ensureHdc, runHdc, listTargets, pickTarget, currentTarget, localFileExists, hdcPathRef, hdcErrorRef, diagLogRef, getPreferred, setPreferred } = hdcCore
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
    description: 'Run a shell command on a connected HarmonyOS device/emulator (hdc shell). Use for device inspection: param get, ps, cat /proc, uitest dumpLayout, etc.',
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

  let studioCache
  function getStudio(overrides = {}) {
    if (studioCache) return studioCache
    studioCache = studio.findStudioRoot(overrides.devecoPath ? [overrides.devecoPath] : [])
    if (studioCache.ok) studioCache.version = studio.studioVersion(studioCache.root)
    return studioCache
  }

  let sdkCache
  function getSdk(overrides = {}) {
    if (sdkCache) return sdkCache
    const extra = []
    const st = getStudio(overrides)
    if (st.ok) extra.push(st.root)
    if (overrides.sdkPath) extra.push(overrides.sdkPath)
    sdkCache = sdkDts.findSdkInfo(extra)
    return sdkCache
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
          console.log('[hdc-bridge] devecocli ' + cliCache.version + ' via optionalDependency')
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
          console.log('[hdc-bridge] devecocli ' + cliCache.version + ' on PATH')
          return cliCache
        }
      }
    } catch (e) { /* fall through to hint */ }
    cliCache = { ok: false, error: devcli.CLI_HINT }
    return cliCache
  }

  // devecocli discovers DevEco Studio via registry/default paths, which fails for
  // non-default installs (and inside sandboxes). We already detect the Studio and
  // SDK roots ourselves, so inject them as environment for every CLI invocation.
  function cliEnvPrefix() {
    if (shellFlavor === 'pwsh') {
      let prefix = ''
      const st = getStudio()
      if (st.ok) prefix += '$env:DEVECO_CLI_STUDIO_PATH=' + psQuote(st.root) + '; '
      const sdk = getSdk()
      if (sdk.ok) prefix += '$env:DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + '; '
      return prefix
    }
    let prefix = ''
    const st = getStudio()
    if (st.ok) prefix += 'DEVECO_CLI_STUDIO_PATH=' + psQuote(st.root) + ' '
    const sdk = getSdk()
    if (sdk.ok) prefix += 'DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + ' '
    return prefix
  }

  async function runCli(cli, argv, opts, policy) {
    const cmd = cliEnvPrefix() + devcli.buildCliCommand(cli, argv, psQuote, shellFlavor)
    const r = await runShellRaw(cmd, opts.timeoutMs || 120000, opts.stdoutMaxBytes || 524288, policy)
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

  const OUTSIDE_EMU = { outsideSandbox: true, note: '' }
  const OUTSIDE_NOTE = 'Official docs tag build/run/sign/check-compat as [Outside sandbox] operations.'
  // devecocli/hvigor exit non-zero when warnings are present even after a
  // successful build (observed live: BUILD SUCCESSFUL + exit 1), so success is
  // judged by output markers — same philosophy as the hdc tools.
  const BUILD_OK_RE = /BUILD SUCCESSFUL|Build completed successfully/i
  const BUILD_FAIL_RE = /BUILD FAILED|FAILURE: Build failed|hvigor ERROR/i
  function buildOk(r) {
    const text = r.stdout + '\n' + r.stderr
    return !r.timedOut && !BUILD_FAIL_RE.test(text) && (r.exitCode === 0 || BUILD_OK_RE.test(text))
  }
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
        return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, backend: 'devecocli', error: cli.error, hint: '安装官方 CLI 后即可用模拟器控制（电量/GPS/传感器/摇一摇/折叠/运动场景）：npm i -g @deveco/deveco-cli（需 DevEco Studio ≥ 6.1.0）。' }
      }
      const q = (s) => (s === undefined || s === null ? '' : String(s).trim())
      const flag = (name, value) => (value ? [name, psQuote(value)] : [])
      const tflag = () => flag('--target', q(args.target))
      const action = q(args.action)
      const timeoutMs = Number(args.timeoutMs) || 120000
      const run = async (argv) => {
        const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 524288 }, policy)
        const out = (r.stdout || '') + '\n' + (r.stderr || '')
        return { ...OUTSIDE_EMU, ok: r.exitCode === 0 && !r.timedOut, exitCode: r.exitCode, timedOut: r.timedOut === true, output: tailText(out.trim(), 4000), error: r.exitCode === 0 ? '' : tailText((r.stderr || r.stdout || '').trim(), 1500) }
      }
      const argv = ['emulator']
      if (action === 'list') {
        argv.push('list', '--format', 'json')
        const r = await runCli(cli, argv, { timeoutMs: 60000, stdoutMaxBytes: 524288 }, policy)
        const json = tryParseJson((r.stdout || '').trim())
        return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: r.exitCode === 0, backend: 'devecocli', instances: json != null ? json : null, output: json != null ? '' : tailText(((r.stdout || '') + (r.stderr || '')).trim(), 4000), error: r.exitCode === 0 ? '' : tailText((r.stderr || r.stdout || '').trim(), 1500) }
      }
      if (action === 'start') {
        if (!q(args.name)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'name is required for start' }
        argv.push('start', psQuote(q(args.name)))
      } else if (action === 'stop') {
        argv.push('stop', ...tflag())
      } else if (action === 'create') {
        if (!q(args.name) || !q(args.deviceType)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'name and deviceType are required for create' }
        argv.push('create', psQuote(q(args.name)), '--device-type', psQuote(q(args.deviceType)), ...flag('--os-version', q(args.osVersion)))
      } else if (action === 'delete') {
        if (!q(args.name)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'name is required for delete' }
        argv.push('delete', psQuote(q(args.name)))
      } else if (action === 'shake' || action === 'power') {
        argv.push(action, ...tflag())
      } else if (action === 'rotate') {
        argv.push('rotate', psQuote(q(args.rotateDir) || 'left'), ...tflag())
      } else if (action === 'volume') {
        argv.push('volume', psQuote(q(args.volumeDir) || 'up'), ...tflag())
      } else if (action === 'fold') {
        if (!q(args.foldState)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'foldState is required for fold' }
        argv.push('fold', psQuote(q(args.foldState)), ...tflag())
      } else if (action === 'battery') {
        if (!q(args.target)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'target is required for battery' }
        argv.push('battery', ...tflag(), ...flag('--level', args.level), ...flag('--status', q(args.status)))
      } else if (action === 'geolocation') {
        if (!q(args.target)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'target is required for geolocation' }
        argv.push('geolocation', ...tflag(), ...flag('--longitude', q(args.longitude)), ...flag('--latitude', q(args.latitude)), ...flag('--altitude', q(args.altitude)), ...flag('--direction', q(args.direction)))
      } else if (action === 'sensor') {
        if (!q(args.target)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'target is required for sensor' }
        argv.push('sensor', ...tflag(), ...flag('--light-intensity', q(args.lightIntensity)), ...flag('--humidity', q(args.humidity)), ...flag('--temperature', q(args.temperature)), ...flag('--steps', q(args.steps)), ...flag('--heartrate', q(args.heartRate)))
      } else if (action === 'scene') {
        if (!q(args.sceneName)) return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'sceneName is required for scene' }
        argv.push('scene', psQuote(q(args.sceneName)), ...tflag())
      } else {
        return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: false, error: 'unknown action: ' + action }
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
        return {
          hdcCandidates: candidateList(),
          studioRoots: sdkDts.STUDIO_ROOTS,
          cliPkg: devcli.resolveCliPkg(),
          envDevEcoSdkHome: (typeof process !== 'undefined' && process.env && process.env.DEVECO_SDK_HOME) || '',
        }
      }
      await ensureHdc(policy)
      const st = getStudio(overrides)
      const sdk = getSdk(overrides)
      const cli = await ensureCli(policy)
      const targets = hdcPathRef() ? (await listTargets(policy)).targets : []
      const hvigor = st.ok ? studio.hvigorwPath(st.root) : { ok: false, path: '', kind: '' }
      const target = await resolveTarget({ explicit: null, projectPath: args.projectPath, policy, overrides })
      const out = {
        hdc: hdcPathRef() ? { found: true, path: hdcPathRef() } : { found: false, error: hdcErrorRef() },
        devecoStudio: st.ok ? { found: true, root: st.root, version: st.version } : { found: false, error: st.error },
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
      if (!st.ok) recs.push('DevEco Studio not detected; devecocli build/lint and the SDK .d.ts docs need it (>= 6.1.0 recommended): https://developer.huawei.com/consumer/cn/deveco-studio/')
      if (!sdk.ok) recs.push('SDK not detected; hms_api needs it. Set DEVECO_SDK_HOME or pass sdkPath.')
      if (!cli.ok) recs.push(cli.error)
      if (cli.ok && st.ok && st.version && !versionAtLeast(st.version, 6, 1)) recs.push('DevEco Studio ' + st.version + ' is below 6.1.0: devecocli --format json features are unavailable; update Studio.')
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
      const outside = { outsideSandbox: true, note: OUTSIDE_NOTE }
      if (args.action === 'status') {
        return {
          devecocli: cli.ok ? { found: true, kind: cli.kind, version: cli.version } : { found: false, error: cli.error },
          devecoStudio: st.ok ? { found: true, version: st.version } : { found: false, error: st.error },
          sdk: sdk.ok ? { apiVersion: sdk.apiVersion, root: sdk.sdkRoot } : { error: sdk.error },
          hvigorFallback: st.ok ? studio.hvigorwPath(st.root) : { ok: false, path: '', kind: '' },
          backend: cli.ok ? 'devecocli' : (st.ok && studio.hvigorwPath(st.root).ok ? 'hvigorw' : 'none'),
          note: OUTSIDE_NOTE,
        }
      }
      if (args.action === 'build' || args.action === 'clean') {
        const boundary = workspaceBoundary(q(args.projectPath) || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : ''), policy)
        if (boundary) return { ...outside, backend: cli.ok ? 'devecocli' : 'hvigorw', ...boundary }
        const argv = ['build']
        if (args.action === 'clean') argv.push('clean')
        if (q(args.modules)) argv.push('--modules', ...q(args.modules).split(/\s+/).map((m) => psQuote(m)))
        if (q(args.product)) argv.push('--product', psQuote(q(args.product)))
        if (q(args.buildMode)) argv.push('--build-mode', psQuote(q(args.buildMode)))
        if (cli.ok) {
          const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 1048576 }, policy)
          const ok = buildOk(r)
          return { ...outside, backend: 'devecocli', ok, exitCode: r.exitCode, timedOut: r.timedOut, output: tailText((r.stdout + '\n' + r.stderr).trim(), 8000), error: ok ? '' : (r.stderr || r.stdout) }
        }
        const hvigor = st.ok ? studio.hvigorwPath(st.root) : { ok: false, path: '', kind: '' }
        if (!hvigor.ok || !sdk.ok) {
          return { ...outside, backend: 'none', ok: false, error: cli.error + ' Fallback needs a DevEco Studio install: ' + (hvigor.ok ? '' : 'hvigorw not found. ') + (sdk.ok ? '' : 'SDK not found.') }
        }
        // hvigorw runs against the PROJECT directory, while the mounted shell's
        // workdir is the session workspace: enter the project dir explicitly.
        const base = q(args.projectPath) || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')
        const product = q(args.product) || 'default'
        const mode = q(args.buildMode) || 'debug'
        const cmd = shellFlavor === 'pwsh'
          ? 'Set-Location -LiteralPath ' + psQuote(base) + '; $env:DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + '; & ' + psQuote(hvigor.path) + ' assembleHap --mode module -p product=' + product + ' -p buildMode=' + mode + ' --no-daemon'
          : 'cd ' + psQuote(base) + ' && DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + ' ' + psQuote(hvigor.path) + ' assembleHap --mode module -p product=' + product + ' -p buildMode=' + mode + ' --no-daemon'
        const r = await runShellRaw(cmd, timeoutMs, 1048576, policy)
        const out = (r.stdout && r.stdout.text) || ''
        const err = (r.stderr && r.stderr.text) || ''
        return { ...outside, backend: 'hvigorw', ok: buildOk({ exitCode: r.exitCode, timedOut: r.timedOut === true, stdout: out, stderr: err }), exitCode: r.exitCode, timedOut: r.timedOut === true, output: tailText((out + '\n' + err).trim(), 8000), note2: 'hvigorw uses the signingConfigs already present in build-profile.json5; unsigned builds cannot install on a device.' }
      }
      if (args.action === 'run') {
        if (cli.ok) {
          const argv = ['run']
          if (q(args.module)) argv.push('--module', psQuote(q(args.module)))
          if (q(args.device)) argv.push('--device', psQuote(q(args.device)))
          if (args.skipBuild) argv.push('--skip-build')
          if (args.uninstall) argv.push('--uninstall')
          const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 1048576 }, policy)
          const ok = buildOk(r)
          return { ...outside, backend: 'devecocli', ok, exitCode: r.exitCode, timedOut: r.timedOut, output: tailText((r.stdout + '\n' + r.stderr).trim(), 8000), error: ok ? '' : (r.stderr || r.stdout) }
        }
        // Fallback loop: hvigorw build -> newest .hap -> hdc install -> aa start
        const base = q(args.projectPath) || policyRoot(policy) || (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '')
        if (!base) return { ...outside, backend: 'none', ok: false, error: cli.error + ' No workspace root for the fallback loop.' }
        const hvigor = st.ok ? studio.hvigorwPath(st.root) : { ok: false, path: '', kind: '' }
        if (!hvigor.ok || !sdk.ok) return { ...outside, backend: 'none', ok: false, error: cli.error + ' Fallback needs DevEco Studio with hvigor and SDK.' }
        const product = q(args.product) || 'default'
        const mode = q(args.buildMode) || 'debug'
        const buildCmd = shellFlavor === 'pwsh'
          ? 'Set-Location -LiteralPath ' + psQuote(base) + '; $env:DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + '; & ' + psQuote(hvigor.path) + ' assembleHap --mode module -p product=' + product + ' -p buildMode=' + mode + ' --no-daemon'
          : 'cd ' + psQuote(base) + ' && DEVECO_SDK_HOME=' + psQuote(sdk.sdkRoot) + ' ' + psQuote(hvigor.path) + ' assembleHap --mode module -p product=' + product + ' -p buildMode=' + mode + ' --no-daemon'
        const br = await runShellRaw(buildCmd, timeoutMs, 1048576, policy)
        const bOut = (br.stdout && br.stdout.text) || ''
        const bErr = (br.stderr && br.stderr.text) || ''
        if (!buildOk({ exitCode: br.exitCode, timedOut: br.timedOut === true, stdout: bOut, stderr: bErr })) return { ...outside, backend: 'hvigorw', ok: false, stage: 'build', output: tailText((bOut + '\n' + bErr).trim(), 6000), error: 'hvigorw build failed' }
        const findHap = shellFlavor === 'pwsh'
          ? 'Get-ChildItem -Recurse -File -Filter *.hap -Path ' + psQuote(base) + ' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName'
          : "find " + psQuote(base) + " -name '*.hap' -type f 2>/dev/null -printf '%T@ %p\\n' | sort -rn | head -n1 | cut -d' ' -f2-"
        const fr = await runShellRaw(findHap, 60000, 16384, policy)
        const hap = (((fr.stdout && fr.stdout.text) || '').trim().split(/\r?\n/)[0] || '').trim()
        if (!hap) return { ...outside, backend: 'hvigorw', ok: false, stage: 'hap', error: 'build produced no .hap under ' + base }
        const inst = await install({ hapPath: hap }, policy)
        if (!inst.ok) return { ...outside, backend: 'hvigorw', ok: false, stage: 'install', hap, error: inst.error || inst.hint }
        let bundleName = ''
        try {
          const appJson = joinPath(base, 'AppScope', 'app.json5')
          if (existsSync(appJson)) {
            const m = /["']bundleName["']\s*:\s*["']([^"']+)["']/.exec(readFileSync(appJson, 'utf8'))
            if (m) bundleName = m[1]
          }
        } catch { /* bundleName stays empty */ }
        if (bundleName) {
          const started = await appAction({ action: 'start', bundleName }, policy)
          return { ...outside, backend: 'hvigorw', ok: started.ok, stage: 'start', hap, bundleName, start: { ok: started.ok, hint: started.hint }, note: 'Fallback loop: hvigorw build -> hdc install -> aa start. For the full signed run flow install devecocli.' }
        }
        return { ...outside, backend: 'hvigorw', ok: true, stage: 'installed', hap, note: 'Installed; bundleName could not be read from AppScope/app.json5 — start it with hdc_app action=start bundleName=<from AppScope/app.json5>.' }
      }
      if (args.action === 'sign') {
        if (!cli.ok) return { ...outside, backend: 'none', ok: false, error: cli.error }
        const status = await runCli(cli, ['auth', 'status'], { timeoutMs: 30000, stdoutMaxBytes: 16384 }, policy)
        const loggedIn = status.ok && !/not logged|未登录|not log in/i.test(status.stdout + status.stderr)
        if (!loggedIn) {
          return { ...outside, backend: 'devecocli', ok: false, stage: 'auth', error: 'Not logged in. Run once in a terminal: devecocli auth login (browser OAuth), then retry. A connected device is also required for device registration.' }
        }
        const argv = ['signature', 'generate']
        if (q(args.product)) argv.push('--product', psQuote(q(args.product)))
        const r = await runCli(cli, argv, { timeoutMs, stdoutMaxBytes: 262144 }, policy)
        return { ...outside, backend: 'devecocli', ok: r.ok, exitCode: r.exitCode, output: tailText((r.stdout + '\n' + r.stderr).trim(), 6000), error: r.ok ? '' : (r.stderr || r.stdout), hint: 'On success, signingConfigs/products were written to build-profile.json5; then hms_build action=build.' }
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
        limit: { type: 'integer', description: 'For check: max records shown (devecocli default 100)' },
        timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds (default 300000)' },
      },
      required: ['action'],
    },
    output: { schema: OUT_SCHEMA, render: textOut },
    async execute(args, exec) {
      args = args || {}
      const policy = policyFor(exec)
      const st = getStudio()
      if (args.action === 'rules') {
        if (!st.ok) return { ok: false, error: st.error }
        const rules = studio.listCodelinterRules(st.root)
        if (!rules.ok) return rules
        return { ok: true, count: rules.rules.length, docsDir: rules.docsDir, rules: rules.rules.slice(0, 200), license: 'Apache-2.0 (Copyright (c) 2024 Huawei Device Co., Ltd.) — read from the local DevEco Studio install, never redistributed.' }
      }
      if (args.action === 'read-rule') {
        if (!st.ok) return { ok: false, error: st.error }
        const doc = studio.readRuleDoc(st.root, args.rule || '', args.lang === 'en' ? 'en' : 'cn')
        if (!doc.ok) return doc
        return { ok: true, rule: args.rule, lang: args.lang === 'en' ? 'en' : 'cn', content: doc.text }
      }
      if (args.action === 'check') {
        const cli = await ensureCli(policy)
        if (!cli.ok) return { ok: false, error: cli.error, fallback: 'hms_lint action=rules still works locally; review rules manually.' }
        const jsonOk = st.ok && versionAtLeast(st.version || '', 6, 1)
        const argv = ['check', 'lint']
        if (args.path && String(args.path).trim()) argv.push(psQuote(String(args.path).trim()))
        if (jsonOk) argv.push('--format', 'json')
        if (args.fix) argv.push('--fix')
        if (Number(args.limit) > 0) argv.push('--limit', String(Math.min(Number(args.limit), 500)))
        const r = await runCli(cli, argv, { timeoutMs: Number(args.timeoutMs) || 300000, stdoutMaxBytes: 1048576 }, policy)
        const json = jsonOk ? tryParseJson(r.stdout.trim()) : null
        const ok = !r.timedOut && (r.exitCode === 0 || LINT_REPORT_RE.test(r.stdout + r.stderr))
        return { outsideSandbox: false, backend: 'devecocli', ok, exitCode: r.exitCode, timedOut: r.timedOut, format: jsonOk ? 'json' : 'text', result: json != null ? json : null, output: json != null ? '' : tailText((r.stdout + '\n' + r.stderr).trim(), 8000), error: ok ? '' : (r.stderr || r.stdout) }
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
        return { ok: r.ok, output: tailText((r.stdout + '\n' + r.stderr).trim(), 6000), error: r.ok ? '' : (r.stderr || r.stdout) }
      }
      if (args.action === 'search') {
        const kws = String(args.keywords || '').split(/\s+/).map((s) => s.trim()).filter(Boolean)
        if (kws.length === 0) return { ok: false, error: 'keywords are required for action=search' }
        const argv = ['docs', 'search', ...kws.map((k) => psQuote(k)), '--format', 'json']
        if (args.catalog && String(args.catalog).trim()) argv.push('--catalog', psQuote(String(args.catalog).trim()))
        if (Number(args.limit) > 0) argv.push('--limit', String(Math.min(Number(args.limit), 50)))
        const r = await runCli(cli, argv, { timeoutMs: 60000, stdoutMaxBytes: 524288 }, policy)
        const json = tryParseJson(r.stdout.trim())
        return { ok: r.ok, backend: 'devecocli', results: json != null ? json : null, output: json != null ? '' : tailText((r.stdout + '\n' + r.stderr).trim(), 6000), error: r.ok ? '' : (r.stderr || r.stdout), hint: 'Search matches ANY keyword (tokenized); for a precise topic use a longer phrase or --catalog. Use hms_docs action=read with a documentId from the results to get full content.' }
      }
      if (args.action === 'read') {
        const id = String(args.documentId || '').trim()
        if (!id) return { ok: false, error: 'documentId is required for action=read' }
        const r = await runCli(cli, ['docs', 'read', psQuote(id)], { timeoutMs: 60000, stdoutMaxBytes: 524288 }, policy)
        return { ok: r.ok, documentId: id, content: tailText((r.stdout + '\n' + r.stderr).trim(), 12000), error: r.ok ? '' : (r.stderr || r.stdout) }
      }
      return { ok: false, error: 'unknown action: ' + args.action }
    },
  })

  registerTool({
    name: 'hms_api_change',
    description: 'Official cross-version breaking API change scan (devecocli check compat): versions lists the SDK versions the local toolchain knows; diff scans a project, module set, or file list between --source-version and --target-version (target must be newer) and returns the breaking changes as JSON. The authoritative answer for "what changed between HarmonyOS versions".',
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
      if (args.action === 'versions') {
        const r = await runCli(cli, ['check', 'compat', 'versions', '--format', 'json'], { timeoutMs: 60000, stdoutMaxBytes: 262144 }, policy)
        const json = tryParseJson(r.stdout.trim())
        const upgradeNeeded = /required component is missing|minimum required version/i.test(r.stderr + r.stdout)
        return { ok: r.ok, versions: json != null ? json : null, output: json != null ? '' : tailText((r.stdout + '\n' + r.stderr).trim(), 4000), error: r.ok ? '' : (r.stderr || r.stdout), hint: upgradeNeeded ? 'check compat requires the newer DevEco Studio version named in the error (upgrade at developer.huawei.com). Until then, hms_api @since/@deprecated tags give per-API version knowledge.' : '' }
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
        const r = await runCli(cli, argv, { timeoutMs: Number(args.timeoutMs) || 600000, stdoutMaxBytes: 1048576 }, policy)
        const json = tryParseJson(r.stdout.trim())
        const upgradeNeeded = /required component is missing|minimum required version/i.test(r.stderr + r.stdout)
        return { outsideSandbox: true, note: OUTSIDE_NOTE, ok: r.ok, exitCode: r.exitCode, timedOut: r.timedOut, sourceVersion: src, targetVersion: tgt, changes: json != null ? json : null, output: json != null ? '' : tailText((r.stdout + '\n' + r.stderr).trim(), 8000), error: r.ok ? '' : (r.stderr || r.stdout), hint: upgradeNeeded ? 'check compat requires the newer DevEco Studio version named in the error (upgrade at developer.huawei.com). Until then, hms_api @since/@deprecated tags give per-API version knowledge.' : '' }
      }
      return { ok: false, error: 'unknown action: ' + args.action }
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
