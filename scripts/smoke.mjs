// dsh-hdc-bridge regression suite (no real hdc required — fake shell drives
// everything except panel.mjs, whose direct hdc spawn is exercised only for
// its graceful-degradation paths). Run: node scripts/smoke.mjs
const MOD_URL = new URL('../lib/host.js', import.meta.url).href
import { readFile } from 'node:fs/promises'
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
function fakeShell() {
  return {
    resolve: (q) => q,
    run: async (spec) => {
      const cmd = spec.command || ''
      seen.push(cmd)
      let text = ''
      if (cmd.includes('list targets')) text = connected.map((id) => id + '\t\ttcp\tConnected\tlocalhost\thdc').join('\n')
      else if (cmd.includes('hilog')) text = 'I 00000/HiLog: smoke line'
      else if (cmd.includes('PSVersionTable')) text = '7'
      else if (cmd.includes('hdc') && cmd.includes('-v')) text = 'Ver: 3.2.0c'
      else text = ''
      return { stdout: { text }, stderr: { text: '' }, exitCode: 0, timedOut: false }
    },
  }
}
function makeCtx() {
  return {
    get(n) { if (n === 'skills') return { register: (s) => { skills.push(s); return () => {} } }; return undefined },
    inject(names, cb) { if (names.includes('webServer')) cb({ webServer: { register: (r) => routes.push(r) }, effect: (fn) => fn() }) },
    shell: fakeShell(),
    tools: { register: (d) => registered.push(d) },
    effect: (fn) => fn(),
  }
}
const mod = await import(MOD_URL + '?t=' + Date.now())
mod.apply(makeCtx())
const exec = { agent: { session: undefined } }
const lastTarget = () => { const m = [...seen].reverse().find((c) => c.includes('-t')); return m ? (m.match(/-t '([^']+)'/) || [])[1] : '' }

// ---------- 1. registration ----------
check('tools=20', registered.length === 20, 'got ' + registered.length)
check('skills=3', skills.length === 3, 'got ' + skills.length)
check('skills-source-runtime', skills.every((s) => s.source === 'runtime'), JSON.stringify(skills.map((s) => s.name + ':' + s.source)))
check('routes=4', routes.length === 4, routes.map((r) => r.path).join(','))

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
// The browser half must follow the platform client-plugin shape: React from the
// seed table, a surface registered into the declared 'shell.overlay' slot, and
// the official data-plugin-css style injection. Regression note: v0.7.0's
// poll() dropped its 'return' and broke the loader entry — the replay below
// executes the real bundle, and these guards pin the official wiring.
const clientSrc = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
check('client-loader-factory', /window\.__ModuleLoader__\.load\(/.test(clientSrc) && /exports\.apply/.test(clientSrc))
check('client-react-module', /require\('react'\)/.test(clientSrc))
check('client-slot-registration', /ctx\.slots\.inject\('shell\.overlay'/.test(clientSrc) && /ctx\.slots\.register\(/.test(clientSrc))
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
  shell: fakeShell(),
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
      if (typeof type === 'function') {
        return type(Object.assign({}, props || {}, { children: children.length ? children : undefined }))
      }
      return { type, props: props || {}, children }
    },
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
const cmod = loaderCapture && loaderCapture.factory((spec) => { if (spec === 'react') return fakeReact; throw new Error('unexpected require: ' + spec) })
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
check('client-slots-shell-overlay', slotCalls.inject.length === 1 && slotCalls.inject[0] === 'shell.overlay', JSON.stringify(slotCalls.inject))
const regEntry = slotCalls.register[0]
check('client-register-shape', !!regEntry && regEntry.name === 'shell.overlay' && regEntry.opts && regEntry.opts.id === 'hdc-bridge' && typeof regEntry.opts.order === 'number' && typeof regEntry.comp === 'function', JSON.stringify(regEntry && { name: regEntry.name, opts: regEntry.opts }))
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
  const tree1 = regEntry.comp()
  const fab1 = findNode(tree1, (n) => n.type === 'button' && (n.props.className || '').indexOf('hdcp-fab') >= 0)
  const root1 = findNode(tree1, (n) => n.type === 'div' && (n.props.className || '').indexOf('hdcp-root') >= 0)
  check('client-fab-rendered-hidden', fab1.length === 1 && (fab1[0].props.className || '').indexOf('hdcp-fab-on') < 0 && root1.length === 0, JSON.stringify({ fabs: fab1.length, roots: root1.length }))
  fab1[0].props.onClick()
  fakeReact.__reset()
  const tree2 = regEntry.comp()
  const root2 = findNode(tree2, (n) => n.type === 'div' && (n.props.className || '').indexOf('hdcp-root') >= 0)
  check('client-fab-toggle-shows', root2.length === 1, JSON.stringify({ roots: root2.length }))
}
g0.document = savedG.document
g0.localStorage = savedG.localStorage
g0.window = savedG.window

// ---------- summary ----------
console.log('')
console.log(failures === 0 ? 'SMOKE ALL PASS' : 'SMOKE FAILURES: ' + failures)
process.exit(failures === 0 ? 0 : 1)
