// dsh-hdc-bridge regression suite (no real hdc required — fake shell drives
// everything except panel.mjs, whose direct hdc spawn is exercised only for
// its graceful-degradation paths). Run: node scripts/smoke.mjs
const MOD_URL = new URL('../lib/host.js', import.meta.url).href
import { readFile, readdir } from 'node:fs/promises'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { isDevEcoProductInfo, discoverHdcCandidates, parseRegistryPathEntries, parseRegistryPaths, splitPathEntries } from '../lib/studio.mjs'
import { snippetFor } from '../lib/sdk-dts.mjs'
import * as compileOut from '../lib/compile-output.mjs'
import { formatCommandResult, formatDeviceSelectionPrompt } from '../lib/compile-cli.mjs'
import { panelHdcCandidates, parsePanelTargets } from '../lib/panel.mjs'
let failures = 0
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' [' + name + ']' + (cond || extra === undefined ? '' : ' ' + extra))
  if (!cond) failures += 1
}
// ---------- fake harness ----------
const registered = []
const skills = []
const routes = []
const seen = []
let connected = ['DEV_A', 'DEV_B']
function deviceRows(list) { return list.map((id) => id + '\t\ttcp\tConnected\tlocalhost\thdc').join('\n') }
// First matching rule answers the command; default stays empty-success so
// unmatched probes degrade exactly like a silent failure would.
const DEFAULT_RULES = [
  [(c) => c.includes('list targets'), () => deviceRows(connected)],
  [(c) => c.includes('hilog'), () => 'I 00000/HiLog: smoke line'],
  [(c) => c.includes('PSVersionTable'), () => '7'],
  [(c) => c.includes('hdc') && c.includes('-v'), () => 'Ver: 3.2.0c'],
]
function makeFakeShell(rules, sink) {
  return {
    resolve: (q) => q,
    run: async (spec) => {
      const cmd = spec.command || ''
      if (sink) sink.push(cmd)
      for (const [pred, reply] of rules) {
        if (pred(cmd)) { const text = typeof reply === 'function' ? reply() : reply; return { stdout: { text }, stderr: { text: '' }, exitCode: 0, timedOut: false } }
      }
      return { stdout: { text: '' }, stderr: { text: '' }, exitCode: 0, timedOut: false }
    },
  }
}
const fakeShell = () => makeFakeShell(DEFAULT_RULES, null)
function makeCtx() {
  return {
    get(n) { if (n === 'skills') return { register: (s) => { skills.push(s); return () => {} } }; return undefined },
    inject(names, cb) { if (names.includes('webServer')) cb({ webServer: { register: (r) => routes.push(r) }, effect: (fn) => fn() }) },
    shell: makeFakeShell(DEFAULT_RULES, seen),
    tools: { register: (d) => registered.push(d) },
    effect: (fn) => fn(),
  }
}
const mod = await import(MOD_URL + '?t=' + Date.now())
mod.apply(makeCtx())
const exec = { agent: { session: undefined } }
const lastTarget = () => { const m = [...seen].reverse().find((c) => c.includes('-t')); return m ? (m.match(/-t '([^']+)'/) || [])[1] : '' }

// ---------- 1. registration ----------
check('tools=25', registered.length === 25, 'got ' + registered.length)
check('skills=5', skills.length === 5, 'got ' + skills.length)
check('skills-source-runtime', skills.every((s) => s.source === 'runtime'), JSON.stringify(skills.map((s) => s.name + ':' + s.source)))
check('compile-tools-registered', ['switch_cwd', 'build_project', 'arkts_check', 'start_app', 'hdc_log'].every((name) => registered.some((tool) => tool.name === name)))
check('routes=4', routes.length === 4, routes.map((r) => r.path).join(','))
const registryFixture = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Huawei\\DevEco Studio\\243\r\n    (Default)    REG_SZ    C:\\Users\\tester\\DevEco Studio\r\n    Build    REG_SZ    243.1\r\n'
check('studio-registry-path-parser', parseRegistryPaths(registryFixture)[0] === 'C:\\Users\\tester\\DevEco Studio')
check('studio-path-entry-parser', JSON.stringify(splitPathEntries('C:\\DevEco Studio\\bin;D:\\tools', ';')) === JSON.stringify(['C:\\DevEco Studio\\bin', 'D:\\tools']))
const pathRegistryFixture = 'Path    REG_EXPAND_SZ    C:\\DevEco Studio\\sdk\\default\\openharmony\\toolchains;D:\\tools\\bin\r\n'
check('studio-registry-path-entry-parser', JSON.stringify(parseRegistryPathEntries(pathRegistryFixture)) === JSON.stringify(['C:\\DevEco Studio\\sdk\\default\\openharmony\\toolchains', 'D:\\tools\\bin']))
check('studio-product-identity', isDevEcoProductInfo({ name: 'DevEco Studio', productVendor: 'Huawei' }) && !isDevEcoProductInfo({ name: 'PyCharm', productVendor: 'JetBrains' }))
const discoveredHdc = discoverHdcCandidates().candidates[0]
if (discoveredHdc) {
  check('panel-uses-discovered-hdc', panelHdcCandidates().includes(discoveredHdc.path), JSON.stringify({ discoveredHdc, panelCandidates: panelHdcCandidates().slice(0, 4) }))
} else {
  console.log('SKIP [panel-uses-discovered-hdc] no discoverable hdc candidates on this host')
}
const targetFixture = 'HUAWEI_MATEPAD\ttcp\tConnected\t192.168.1.11:12345\nCOM3\tCOM3\nCOM4\tCOM4\tDisconnected\n'
check('panel-filters-serial-targets', JSON.stringify(parsePanelTargets(targetFixture).map((target) => target.id)) === JSON.stringify(['HUAWEI_MATEPAD']))
const snippetFixture = 'export function update(asset: Asset, query: Query): void\nexport function query(asset: Asset): Result\nexport function remove(asset: Asset): void'
const queryWindows = snippetFor(snippetFixture, 'query', 40)
check('sdk-snippet-exact-name', queryWindows.length === 1 && queryWindows[0].text.includes('function query'))
check('build-output-failure-status', compileOut.formatBuildProjectOutput({ stdout: 'Build completed successfully (exitCode=0)', stderr: 'hvigor ERROR: ENOENT', exitCode: 1 }).text.includes('BUILD FAILED (exitCode=1)'))
check('build-output-truncate-export', compileOut.truncateOutput(Array.from({ length: 55 }, (_, i) => 'line-' + i).join('\n')).truncated === true)
check('compile-cli-source-formatting', formatDeviceSelectionPrompt('\u001b[32mName  Kind\nPhone  device\u001b[0m', '').includes('请指定要使用的设备。') && !/\u001b\[/.test(formatCommandResult('devecocli device list', { stdout: '\u001b[32mout\u001b[0m', stderr: '' })))

// ---------- 2. device memory ----------
const hilog = registered.find((t) => t.name === 'hdc_hilog')
const listTool = registered.find((t) => t.name === 'hdc_list_targets')
seen.length = 0; await hilog.execute({ lines: 10 }, exec); const t1 = lastTarget()
seen.length = 0; await hilog.execute({ lines: 10, target: 'DEV_B' }, exec); const t2 = lastTarget()
seen.length = 0; await hilog.execute({ lines: 10 }, exec); const t3 = lastTarget()
connected = ['DEV_A']; seen.length = 0; await hilog.execute({ lines: 10 }, exec); const t4 = lastTarget()
check('memory-flow', t1 === 'DEV_A' && t2 === 'DEV_B' && t3 === 'DEV_B' && t4 === 'DEV_A', JSON.stringify([t1, t2, t3, t4]))
connected = ['DEV_A', 'DEV_B']
const lr = await listTool.execute({}, exec)
check('list-preferred', lr.preferred === 'DEV_A' && lr.preferredActive === true, JSON.stringify({ preferred: lr.preferred, active: lr.preferredActive }))
const startTool = registered.find((tool) => tool.name === 'start_app')
const noDeviceStart = await startTool.execute({}, exec)
check('start-app-no-hvd-does-not-auto-deploy', noDeviceStart.ok === false && !noDeviceStart.hdcFallback && noDeviceStart.availableDevices.some((target) => target.id === 'DEV_A') && /请指定要使用的设备/.test(noDeviceStart.text || '') && !/devecocli background|未检测到可用设备/.test(noDeviceStart.text || ''), JSON.stringify(noDeviceStart))

// Upstream regression cases: an already connected tconn is success, and
// Windows absolute paths are normalized even when the mounted host shell is
// not PowerShell (for example Git Bash).
const connectTool = registered.find((tool) => tool.name === 'hdc_connect')
DEFAULT_RULES.unshift([(c) => c.includes('tconn'), () => 'Target is connected, repeat operation'])
const repeatConnect = await connectTool.execute({ address: '192.168.1.11:34569' }, exec)
check('connect-repeat-idempotent', repeatConnect.ok === true, JSON.stringify(repeatConnect))
DEFAULT_RULES.shift()
const installTool = registered.find((tool) => tool.name === 'hdc_install')
seen.length = 0
await installTool.execute({ hapPath: 'E:/ScribePad/entry/build/default/outputs/default/app.hap' }, exec)
const installLine = [...seen].reverse().find((line) => line.includes('install')) || ''
check('install-absolute-path-normalized', process.platform === 'win32' ? (!installLine.includes('E:/') && installLine.includes('E:\\ScribePad\\entry\\build')) : installLine.includes('E:/ScribePad'), installLine)

// A fresh host instance must initialize hdc itself before the first
// list_devices call; this guards the regression where the result depended on
// an earlier hdc_* tool having already discovered the executable.
const freshRegistered = []
mod.apply({
  get() { return undefined },
  inject() {},
  shell: fakeShell(),
  tools: { register: (d) => freshRegistered.push(d) },
  effect: (fn) => fn(),
})
const freshList = freshRegistered.find((tool) => tool.name === 'hdc_log')
const firstList = await freshList.execute({ action: 'list_devices' }, exec)
check('list-devices-first-call', firstList.ok === true && firstList.deviceCount === 2 && firstList.preferred === 'DEV_A' && firstList.preferredActive === true && Array.isArray(firstList.targets), JSON.stringify(firstList))
let renderedList = ''
try { renderedList = freshList.output.render({}, firstList)[0].text } catch (error) { renderedList = String(error && error.message ? error.message : error) }
let renderedJson = null
try { renderedJson = JSON.parse(renderedList) } catch { /* assertion below reports the raw text */ }
check('list-devices-render-json', !!renderedJson && Array.isArray(renderedJson.devices) && Array.isArray(renderedJson.targets) && 'preferredActive' in renderedJson, renderedList)

const hostSrc = await readFile(new URL('../lib/host.js', import.meta.url), 'utf8')
check('hvigor-build-log-isolation', /HVIGOR_USER_HOME/.test(hostSrc) && /build-logs/.test(hostSrc) && /dsh-hvigor-tmp/.test(hostSrc) && /retriedIsolatedHome/.test(hostSrc) && hostSrc.includes("joinPath(base, '.dsh-hvigor-tmp')") && /--stop-daemon/.test(hostSrc) && /--no-daemon/.test(hostSrc) && /JAVA_HOME/.test(hostSrc))
check('hvigor-jbr-daemon-reset', /daemonStopped: true/.test(hostSrc) && /HVIGOR_USER_HOME/.test(hostSrc) && /app_packing_tool\.jar/.test(hostSrc) && /onDeviceTest/.test(hostSrc))
check('hms-build-no-empty-success', hostSrc.includes('function buildResultOk') && hostSrc.includes('buildResultOk(r) && !deMojo') && hostSrc.includes('buildResultOk(r) && !mojo') && hostSrc.includes('artifactVerified'))
check('hms-build-run-ensures-hdc', hostSrc.includes('await ensureHdc(policy)') && hostSrc.includes('install({ hapPath: hap, target: q(args.device) || undefined }, policy)'))
check('hms-build-run-verifies-mission', hostSrc.includes('missionVerified: Boolean(mission.ok)') && hostSrc.includes("appAction({ action: 'start', bundleName, target: q(args.device) || undefined }, policy)"))
check('build-project-clean-rebuilds', hostSrc.includes("const cleanArgv = ['build', 'clean']") && hostSrc.includes("compileCli.commandText(cleanArgv) + ' && ' + compileCli.commandText(argv)") && hostSrc.includes("task: 'assembleHap'"))
check('hms-build-output-strips-ansi', hostSrc.includes('output: compileOut.stripAnsi(fb.output)') && hostSrc.includes('output: compileOut.stripAnsi(deOutput)'))
check('hms-emulator-list-text-fallback', hostSrc.includes("['emulator', 'list', '--format', 'json']") && hostSrc.includes("['emulator', 'list']") && hostSrc.includes('No emulator instances found.'))
check('hms-api-change-text-fallback', hostSrc.includes("['check', 'compat', 'versions', '--format', 'json']") && hostSrc.includes("['check', 'compat', 'versions']") && hostSrc.includes('compat versions returned no output.'))
check('hms-api-change-diff-json-output', hostSrc.includes('changes: json != null ? json : null') && hostSrc.includes('JSON.stringify(json, null, 2)'))
check('hvigor-build-cache-dir-env', /BUILD_CACHE_DIR/.test(hostSrc) && /cache-env/.test(hostSrc) && /hvigorUserHome/.test(hostSrc) && /buildCacheDir/.test(hostSrc))
check('hvigor-pnpm-prewarm', /preWarmPnpm/.test(hostSrc) && /wrapper.*tools/.test(hostSrc) && /pnpm\.cmd/.test(hostSrc))
check('hms-api-change-stderr-merge', /mergeStderr/.test(hostSrc) && /2>&1/.test(hostSrc))
check('hms-emulator-hdc-backfill', /hdcBackfilled/.test(hostSrc) && /isEmulatorTarget/.test(hostSrc))
check('hms-emulator-start-poll', /pollEmulatorRunning/.test(hostSrc) && /verifiedBy/.test(hostSrc))
check('hms-emulator-hdc-ensure', hostSrc.includes('await ensureHdc(policy)') && /hdcBackfilled/.test(hostSrc) && /pollEmulatorRunning/.test(hostSrc))
check('hms-emulator-start-ok-fix', hostSrc.includes('ok: res.ok && poll.running'))
check('hms-emulator-start-idempotent', hostSrc.includes('start is idempotent') && hostSrc.includes('i.status || i.state'))
check('hms-api-change-local-version-guard', hostSrc.includes("const COMPAT_MIN = '26.0.0.810'") && /localVersionGuard/.test(hostSrc) && /compatErrorText/.test(hostSrc))
check('hms-build-hvigor-diagnostics', /hvigorDiag\(/.test(hostSrc) && /daemonStopped:/.test(hostSrc) && /hvigorUserHome:/.test(hostSrc) && /buildCacheDir:/.test(hostSrc))

// ---------- 3. panel routes (env-agnostic paths) ----------
const mkRes = () => ({ statusCode: 0, headers: {}, body: '', writeHead(c, h) { this.statusCode = c; this.headers = h }, end(b) { this.body = b } })
const mkReq = (body) => { const q = { method: 'POST' }; q.on = (ev, cb) => { if (ev === 'data') cb(JSON.stringify(body)); else if (ev === 'end') cb() }; return q }
const ps = routes.find((r) => r.path === '/api2/hdc-bridge/panel-state')
const sel = routes.find((r) => r.path === '/api2/hdc-bridge/select')
const shot = routes.find((r) => r.path === '/api2/hdc-bridge/screenshot.jpeg')
const r1 = mkRes(); await ps.handler({ method: 'GET', on() {} }, r1)
let s1 = null; try { s1 = JSON.parse(r1.body) } catch (e) {}
check('panel-state-json', r1.statusCode === 200 && s1 && typeof s1 === 'object' && 'devices' in s1 && 'preferred' in s1 && 'toolchain' in s1, JSON.stringify(Object.keys(s1 || {})))
const r2 = mkRes(); await sel.handler(mkReq({ target: 'NOT_A_DEVICE' }), r2)
check('select-rejects-unknown', r2.statusCode === 400, 'got ' + r2.statusCode)
const r3 = mkRes(); await shot.handler({ method: 'GET', on() {} }, r3)
check('shot-404-empty', r3.statusCode === 404, 'got ' + r3.statusCode)

// ---------- 4. knowledge layer ----------
const kn = registered.find((t) => t.name === 'hms_knowledge')
const cat = await kn.execute({ action: 'catalog' }, exec)
check('catalog>=28', cat.total >= 28, 'got ' + cat.total)
const rd = await kn.execute({ action: 'read', id: 'sensor', section: 'getSingleSensor' }, exec)
check('sensor-section', rd.ok === true && typeof rd.content === 'string' && rd.content.length > 0)
const sf = await kn.execute({ action: 'search', keywords: '文件' }, exec)
check('search-fileFs', sf.results[0] && sf.results[0].id === 'fileFs', JSON.stringify(sf.results[0] && sf.results[0].id))
const wh = await kn.execute({ action: 'read', id: 'hilog', section: 'info' }, exec)
check('read-hilog', wh.ok === true && /hilog/i.test(wh.content || ''))
const wn = await kn.execute({ action: 'read', id: 'window-Window', section: 'setUIContent' }, exec)
check('read-window-setUIContent', wn.ok === true && /setUIContent/.test(wn.content || ''))
const nv = await kn.execute({ action: 'read', id: 'Navigation', section: '接口' }, exec)
check('read-navigation-api', nv.ok === true && /Navigation/.test(nv.content || ''))
const sw = await kn.execute({ action: 'search', keywords: '日志' }, exec)
check('search-hilog', sw.results.some((x) => x.id === 'hilog'), JSON.stringify(sw.results.slice(0, 3).map((x) => x.id)))

// ---------- 4b. client bundle guards (official client-plugin contract) ----------
// The browser half uses the input-row capsule as its only entry and anchors the
// panel above it. The replay below checks the real loader wiring and confirms
// that no portal or persisted floating-window machinery regresses back in.
const clientSrc = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
check('client-loader-factory', /window\.__ModuleLoader__\.load\(/.test(clientSrc) && /exports\.apply/.test(clientSrc))
check('client-react-module', /require\('react'\)/.test(clientSrc) && /require\('react-dom'\)/.test(clientSrc))
check('client-slot-registration', /ctx\.slots\.inject\('sidebar\.footer\.action'/.test(clientSrc) && /ctx\.slots\.register\(/.test(clientSrc))
check('client-official-css-injection', /data-plugin-css/.test(clientSrc) && /--dsw-alias-/.test(clientSrc))

// ---------- 5. hms_emulator degradation (no devecocli in fake ctx) ----------
const emu = registered.find((t) => t.name === 'hms_emulator')
if (emu) {
  const er = await emu.execute({ action: 'list' }, exec)
  check('emulator-degraded', er.ok === false && /devecocli|install/i.test((er.error || '') + (er.hint || '')), JSON.stringify(er))
} else {
  console.log('SKIP [emulator-tool-registered] 未实现')
}

// ---------- 6. hms_build workspace boundary precheck ----------
const reg2 = []
mod.apply({
  get(n) { if (n === 'sandboxPolicy') return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: 'F:/session-ws' }) }; return undefined },
  inject() {},
  shell: makeFakeShell(DEFAULT_RULES, seen),
  tools: { register: (d) => reg2.push(d) },
  effect: (fn) => fn(),
})
const build2 = reg2.find((t) => t.name === 'hms_build')
const br = await build2.execute({ action: 'build', projectPath: 'F:/other/proj' }, exec)
check('build-boundary', br.ok === false && br.outsideWorkspace === true && /工作区之外/.test(br.error || ''), JSON.stringify({ ok: br.ok, outside: br.outsideWorkspace }))

// ---------- 7. client bundle replay (official slots contract) ----------
// Executes the real browser bundle in Node: apply() runs against a fake slots
// service (capturing the shell.overlay registration), then the registered
// React component is shallow-rendered with a minimal hook runtime — FAB
// present, panel hidden by default, toggle reveals it. This catches the class
// of bug that broke the loader entry in v0.7.0 (undefined.then), end to end.
function makeFakeReact() {
  const hooks = []
  let hIdx = 0
  return {
    __reset() { hIdx = 0 },
    useState(init) {
      const i = hIdx++
      if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
      return [hooks[i], (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v }]
    },
    useEffect() { hIdx++ },
    useRef(init) {
      const i = hIdx++
      if (!(i in hooks)) hooks[i] = { current: init }
      return hooks[i]
    },
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      if (type === '@frag') return { type: '@frag', props: props || {}, children }
      if (typeof type === 'function') {
        return type(Object.assign({}, props || {}, { children: children.length ? children : undefined }))
      }
      return { type, props: props || {}, children }
    },
    Fragment: '@frag',
  }
}
const g0 = globalThis
const savedG = { document: g0.document, localStorage: g0.localStorage, window: g0.window }
let loaderCapture = null
g0.window = {
  __ModuleLoader__: { load: (spec) => { loaderCapture = spec } },
  innerWidth: 1280, innerHeight: 800,
  addEventListener() {}, removeEventListener() {},
}
g0.document = {
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, textContent: '' }),
  head: { appendChild() {} },
}
g0.localStorage = { m: {}, getItem(k) { return k in this.m ? this.m[k] : null }, setItem(k, v) { this.m[k] = String(v) }, removeItem(k) { delete this.m[k] } }
const clientMod = await import(new URL('../lib/client.js', import.meta.url).href + '?t=' + Date.now())
check('client-loader-captured', !!loaderCapture && loaderCapture.id === 'dsh-hdc-bridge')
const fakeReact = makeFakeReact()
const fakeReactDom = { createPortal: (el) => el }
const cmod = loaderCapture && loaderCapture.factory((spec) => { if (spec === 'react') return fakeReact; if (spec === 'react-dom') return fakeReactDom; throw new Error('unexpected require: ' + spec) })
check('client-exports-apply', !!cmod && typeof cmod.apply === 'function' && Array.isArray(cmod.inject) && cmod.inject.includes('slots'), cmod && JSON.stringify(cmod.inject))
const slotCalls = { inject: [], register: [] }
let applyThrew = null
if (cmod) {
  try {
    cmod.apply({
      slots: {
        inject: (name, cb) => { slotCalls.inject.push(name); const d = cb(); slotCalls.register.push(d); return () => {} },
        register: (opts, comp) => ({ name: opts && opts.name, opts, comp, dispose: () => {} }),
      },
    })
  } catch (e) { applyThrew = e }
}
check('client-apply-no-throw', !applyThrew, String(applyThrew && applyThrew.message))
check('client-slots-footer-action', slotCalls.inject.length === 1 && slotCalls.inject[0] === 'sidebar.footer.action', JSON.stringify(slotCalls.inject))
const regEntry = slotCalls.register[0]
check('client-register-shape', !!regEntry && regEntry.name === 'sidebar.footer.action' && regEntry.opts && regEntry.opts.id === 'hdc-bridge' && typeof regEntry.opts.order === 'number' && typeof regEntry.comp === 'function', JSON.stringify(regEntry && { name: regEntry.name, opts: regEntry.opts }))
function findNode(node, pred, out) {
  out = out || []
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  const kids = node.children || (node.props && node.props.children)
  if (Array.isArray(kids)) for (const k of kids) findNode(k, pred, out)
  else if (kids && typeof kids === 'object') findNode(kids, pred, out)
  return out
}
if (regEntry && regEntry.comp) {
  fakeReact.__reset()
  const tree1 = regEntry.comp({ wide: true })
  const btn1 = findNode(tree1, (n) => n.type === 'button' && (n.props.className || '').indexOf('hdcp-entry') >= 0)
  const overlay1 = findNode(tree1, (n) => n.type === 'div' && (n.props.className || '').indexOf('hdcp-overlay') >= 0)
  check('client-entry-hidden-by-default', btn1.length === 1 && overlay1.length === 0, JSON.stringify({ btns: btn1.length, overlays: overlay1.length }))
  btn1[0].props.onClick()
  fakeReact.__reset()
  const tree2 = regEntry.comp({ wide: true })
  const overlay2 = findNode(tree2, (n) => n.type === 'div' && (n.props.className || '').indexOf('hdcp-overlay') >= 0)
  const root2 = findNode(tree2, (n) => n.type === 'div' && (n.props.className || '').indexOf('hdcp-root') >= 0)
  check('client-entry-toggle-shows-panel', overlay2.length === 0 && root2.length === 1, JSON.stringify({ overlays: overlay2.length, roots: root2.length }))
}
g0.document = savedG.document
g0.localStorage = savedG.localStorage
g0.window = savedG.window

// ---------- 8. issue #4 regression: one shared hdc discovery ----------
// hms_setup paths used to ReferenceError on an undeclared candidateList();
// it must now expose the shared candidate list without maintainer paths.
const setupTool = registered.find((t) => t.name === 'hms_setup')
let pathsOut = null
let setupThrew = null
try { pathsOut = await setupTool.execute({ action: 'paths' }, exec) } catch (e) { setupThrew = e }
check('hms-setup-paths-no-throw', !setupThrew && Array.isArray(pathsOut && pathsOut.hdcCandidates) && pathsOut.hdcCandidates.length > 0, String(setupThrew && setupThrew.message))
const libFiles = (await readdir(new URL('../lib/', import.meta.url))).filter((f) => /\.(mjs|js)$/.test(f))
const offenders = []
for (const f of libFiles) {
  const src = await readFile(new URL('../lib/' + f, import.meta.url), 'utf8')
  if (/F:[\\/]+Huawei/i.test(src)) offenders.push(f)
}
check('no-maintainer-paths', offenders.length === 0, offenders.join(',') || 'none')

// Tool layer must still reach hdc via the PATH fallback when every candidate
// root is absent from the machine (pwsh flavor per PSVersionTable rule).
const reg3 = []
const FALLBACK_RULES = [
  [(c) => c.includes('list targets'), () => deviceRows(['DEV_A'])],
  [(c) => c.includes('PSVersionTable'), () => '7'],
  [(c) => c.includes('toolchains') && c.includes('-v'), () => ''],
  [(c) => c.includes('where.exe'), () => 'C:\\smoke-fake\\tools\\hdc.exe\n'],
  [(c) => c.includes('smoke-fake') && c.includes('-v'), () => 'Ver: 3.2.0d'],
]
mod.apply({
  get() { return undefined },
  inject() {},
  shell: makeFakeShell(FALLBACK_RULES, null),
  tools: { register: (d) => reg3.push(d) },
  effect: (fn) => fn(),
})
const lt3 = reg3.find((t) => t.name === 'hdc_list_targets')
const lr3 = await lt3.execute({}, exec)
check('fallback-targets-ok', lr3.ok === true && lr3.targets.length === 1, JSON.stringify(lr3).slice(0, 180))
const diag3 = reg3.find((t) => t.name === 'hdc_diag')
let diagStr = ''
try { diagStr = JSON.stringify(await diag3.execute({}, exec)) } catch (e) { diagStr = String(e) }
check('diag-shows-path-source', diagStr.includes('smoke-fake'), diagStr.slice(0, 220))

// Panel half (the issue #4 symptom): import panel.mjs standalone with an
// injected probe seam, so no real hdc is needed to prove both resolution
// orders — a path already resolved by the tool layer wins first…
{
  const pm = await import(new URL('../lib/panel.mjs', import.meta.url).href + '?t=' + Date.now() + '-bridge')
  let refreshHandler = null
  pm.startPanel({
    ctx: { inject(names, cb) { cb({ webServer: { register(r) { if (r.path.endsWith('/refresh')) refreshHandler = r.handler } }, effect: (fn) => fn() }) } },
    getPreferred: () => '',
    setPreferred() {},
    getResolvedHdcPath: () => 'Z:\\resolved-by-tools\\hdc.exe',
    probe: {
      accessOk: (p) => p.indexOf('resolved-by-tools') >= 0,
      run: async () => ({ ok: true, stdout: 'Ver: 4.0.0a', stderr: '' }),
    },
  })
  const res = mkRes()
  await refreshHandler(mkReq({ shot: false }), res)
  const stA = JSON.parse(res.body)
  check('panel-bridge-resolution', !!stA && stA.hdc === 'hdc.exe', JSON.stringify(stA && { hdc: stA.hdc, error: stA.error }))
}
// …and when nothing is pre-resolved, its own discovery falls through to PATH.
{
  const pm = await import(new URL('../lib/panel.mjs', import.meta.url).href + '?t=' + Date.now() + '-path')
  let refreshHandler = null
  pm.startPanel({
    ctx: { inject(names, cb) { cb({ webServer: { register(r) { if (r.path.endsWith('/refresh')) refreshHandler = r.handler } }, effect: (fn) => fn() }) } },
    getPreferred: () => '',
    setPreferred() {},
    probe: {
      accessOk: () => false,
      run: async (file) => {
        if (file === 'where.exe' || file === 'which') return { ok: true, stdout: 'Z:\\from-PATH\\bin\\hdc.exe\n', stderr: '' }
        return { ok: true, stdout: 'Ver: 4.0.0b', stderr: '' }
      },
    },
  })
  const res = mkRes()
  await refreshHandler(mkReq({ shot: false }), res)
  const stB = JSON.parse(res.body)
  check('panel-path-fallback', !!stB && stB.hdc === 'hdc.exe', JSON.stringify(stB && { hdc: stB.hdc, error: stB.error }))
}

// ---------- 9. standalone Command Line Tools (CLT) toolchain ----------
// A minimal fake CLT tree + DEVECO_CLI_CLT_PATH must light up the toolchain
// kind, the embedded SDK, and env echo — no real Huawei install needed. The
// machine's own DEVECO_SDK_HOME is neutralized for this block so results are
// deterministic on dev boxes too.
{
  const fx = mkdtempSync(joinPath(tmpdir(), 'dsh-clt-fx-'))
  const w = (rel, content) => {
    const p = joinPath(fx, rel)
    mkdirSync(joinPath(p, '..'), { recursive: true })
    writeFileSync(p, content)
  }
  w('version.txt', '# Version: 26.0.0.900\n')
  w('bin/hvigorw.cmd', '@echo off\r\n')
  w('sdk/default/openharmony/ets/oh-uni-package.json', JSON.stringify({ apiVersion: 26, version: '26.0.0.900' }))
  w('sdk/default/openharmony/ets/api/@ohos.smoke.d.ts', 'export const smoke: number;\n')
  w('codelinter/plugins/demo/docs/demo-rule-cn.md', '# demo rule\n')
  const savedSdkHome = process.env.DEVECO_SDK_HOME
  delete process.env.DEVECO_SDK_HOME
  process.env.DEVECO_CLI_CLT_PATH = fx
  try {
    const reg4 = []
    mod.apply({
      get() { return undefined },
      inject() {},
      shell: makeFakeShell(DEFAULT_RULES, null),
      tools: { register: (d) => reg4.push(d) },
      effect: (fn) => fn(),
    })
    const setup4 = reg4.find((t) => t.name === 'hms_setup')
    const stR = await setup4.execute({ action: 'status' }, exec)
    check('clt-status-detected', !!stR.commandLineTools && stR.commandLineTools.found === true && /^26\./.test(stR.commandLineTools.version || ''), JSON.stringify(stR.commandLineTools))
    check('clt-hvigor-launcher-found', !!stR.hvigorFallback && stR.hvigorFallback.found === true && /bin.hvigorw/.test(stR.hvigorFallback.path || ''), JSON.stringify(stR.hvigorFallback))
    const build4 = reg4.find((t) => t.name === 'hms_build')
    const bs = await build4.execute({ action: 'status' }, exec)
    // Backend priority mirrors the toolchain truth on ANY machine: devecocli
    // wins when its package is resolvable, otherwise the CLT hvigorw fallback.
    const cliFound = !!(bs.devecocli && bs.devecocli.found)
    check('clt-backend-priority', bs.backend === (cliFound ? 'devecocli' : 'hvigorw') && !!bs.hvigorFallback && bs.hvigorFallback.ok === true, JSON.stringify({ backend: bs.backend, hvigor: bs.hvigorFallback }))
    const full = await setup4.execute({}, exec)
    check('clt-full-kind', full.toolchainKind === 'clt', JSON.stringify(full.toolchainKind))
    check('clt-full-sdk-api26', !!full.sdk && full.sdk.found === true && full.sdk.apiVersion === 26, JSON.stringify(full.sdk && { root: full.sdk.root, apiVersion: full.sdk.apiVersion }))
    const pr4 = await setup4.execute({ action: 'paths' }, exec)
    check('clt-paths-env-echo', pr4.envCliCltPath === fx, String(pr4.envCliCltPath))
    const lint4 = reg4.find((t) => t.name === 'hms_lint')
    const lr4 = await lint4.execute({ action: 'rules' }, exec)
    check('clt-lint-rules-alt-layout', lr4.ok === true && lr4.count >= 1 && /codelinter/.test(lr4.docsDir || ''), JSON.stringify({ ok: lr4.ok, count: lr4.count, dir: String(lr4.docsDir || '').slice(-36) }))
  } finally {
    delete process.env.DEVECO_CLI_CLT_PATH
    if (savedSdkHome !== undefined) process.env.DEVECO_SDK_HOME = savedSdkHome
    try { rmSync(fx, { recursive: true, force: true }) } catch (e) { /* temp cleanup best effort */ }
  }
}
const cliHintSrc = await readFile(new URL('../lib/devecocli.mjs', import.meta.url), 'utf8')
check('cli-hint-mentions-clt', /Command Line Tools/.test(cliHintSrc))
check('skill-mentions-clt-path', skills.some((s) => s.name === 'deveco-cli' && /DEVECO_CLI_CLT_PATH/.test(s.content)))

// ---------- 10. v0.8.1 hdc_shell cross-layer quoting fidelity ----------
// Pure-helper round-trips against the real host shells (where available) plus
// a fake-shell structural marker: with an apostrophe-bearing command, hdc must
// receive the device-escaped inner text wrapped by the host dialect.
{
  const BS = String.fromCharCode(92)
  const Q = String.fromCharCode(39)
  const quoting = mod._quoting
  check('quoting-helpers-exported', !!quoting && typeof quoting.dcFidelityCommand === 'function' && typeof quoting.posixQuote === 'function')
  if (quoting && typeof quoting.dcFidelityCommand === 'function') {
    // L1 round-trips through real shells when present: pwsh on Windows, bash elsewhere.
    const samples = ["it's ok", "a'b'c", "echo don't"]
    let psOk = null
    if (process.platform === 'win32') {
      try {
        const { execFileSync } = await import('node:child_process')
        psOk = true
        for (const s of samples) {
          const wrapped = quoting.psQuote(s)
          const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', '[Console]::Out.Write(' + wrapped + ')'], { encoding: 'utf8', timeout: 20000, windowsHide: true })
          if (out !== s) { psOk = false; break }
        }
      } catch (e) {
        const msg = String(e && e.message ? e.message : e)
        if (/EPERM|EACCES|spawn|ENOENT/i.test(msg)) console.log('SKIP [psquote-roundtrip-pwsh] host sandbox restricts child spawn: ' + msg.slice(0, 60))
        else psOk = false
      }
      check('psquote-roundtrip-pwsh', psOk === true)
    }
    let shOk = null
    try {
      const { execFileSync } = await import('node:child_process')
      shOk = true
      for (const s of samples) {
        const out = execFileSync('bash', ['-c', 'printf %s ' + quoting.posixQuote(s)], { encoding: 'utf8', timeout: 20000 })
        if (out !== s) { shOk = false; break }
      }
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      if (/EPERM|EACCES|spawn|ENOENT/i.test(msg)) console.log('SKIP [posixquote-roundtrip-bash] host sandbox restricts child spawn: ' + msg.slice(0, 60))
      else shOk = false
    }
    if (shOk !== null) check('posixquote-roundtrip-bash', shOk === true)
    else console.log('SKIP [posixquote-roundtrip-bash] no bash on PATH')
    // dcFidelityCommand shape: both dialects preserve the original command
    // text while using host-specific wrapping.
    const pwForm = quoting.dcFidelityCommand("ab'c", 'pwsh')
    const nixForm = quoting.dcFidelityCommand("ab'c", 'bash')
    const q3 = String.fromCharCode(39)
    check('dcfidelity-inner-preserved', pwForm.includes('ab') && nixForm.includes('ab') && !pwForm.includes('ab' + BS + Q) && !nixForm.includes('ab' + BS + Q), JSON.stringify({ pw: pwForm, nix: nixForm }))
    check('dcfidelity-host-split', pwForm !== nixForm && pwForm.startsWith(q3) && nixForm.startsWith(q3))
  }
}
const shTool = registered.find((t) => t.name === 'hdc_shell')
seen.length = 0
await shTool.execute({ command: "param get ab'c" }, exec)
const sentLine = seen.find((c) => c.includes('shell'))
check('dclayer-host-marker', !!sentLine && sentLine.includes('base64 -d | sh'), JSON.stringify(sentLine))
const hostSrcQuoting = await readFile(new URL('../lib/host.js', import.meta.url), 'utf8')
check('fallback-guard-apostrophe', /!r\.ok && !command\.includes\(APOS\)/.test(hostSrcQuoting))

// ---------- summary ----------
console.log('')
console.log(failures === 0 ? 'SMOKE ALL PASS' : 'SMOKE FAILURES: ' + failures)
process.exit(failures === 0 ? 0 : 1)
