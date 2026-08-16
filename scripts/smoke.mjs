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

// ---------- 4b. client bundle guards (browser half) ----------
// Regression for v0.7.0: poll() dropped its 'return', so the loader entry
// failed with `Cannot read properties of undefined (reading 'then')` and the
// web UI showed the 'Failed to load plugins' banner. Pin both ends of the chain.
const clientSrc = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const pollBody = /function poll\(\)\s*\{([\s\S]*?)\n        \}/.exec(clientSrc)
check('client-poll-returns', !!pollBody && pollBody[1].includes('return fetch'), pollBody ? 'poll body has no return fetch' : 'poll not found')
check('client-poll-then-schedule', /\.then\(schedule\)/.test(clientSrc))
check('client-loader-factory', /window\.__ModuleLoader__\.load\(/.test(clientSrc) && /exports\.apply/.test(clientSrc))

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

// ---------- 7. client bundle replay (stubbed DOM, real mount + poll) ----------
// Executes the actual browser bundle in Node with a permissive DOM stub so the
// whole apply/mount/poll/render path runs — the class of bug that broke the
// loader entry in v0.7.0 (undefined.then) is caught here, not by a static grep.
function makeEl(id) {
  const listeners = {}
  const el = {
    id: id || '', children: [], listeners,
    style: {}, classList: { add() {}, remove() {} }, dataset: {},
    textContent: '', innerHTML: '', type: '', title: '', src: '', disabled: false,
    offsetLeft: 0, offsetTop: 0, offsetWidth: 330, offsetHeight: 400,
    parentNode: null,
  }
  let cls = ''
  Object.defineProperty(el, 'className', { get: () => cls, set: (v) => { cls = v } })
  el.addEventListener = (n, f) => { (listeners[n] = listeners[n] || []).push(f) }
  el.appendChild = (c) => { el.children.push(c); c.parentNode = el; return c }
  el.removeChild = (c) => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c }
  el.querySelector = (sel) => makeEl(sel)
  el.querySelectorAll = () => [makeEl('x'), makeEl('x')]
  el.setAttribute = () => {}
  el.getAttribute = (n) => (n === 'data-dir' ? 'se' : null)
  el.setPointerCapture = () => {}
  el.closest = () => null
  return el
}
const g0 = globalThis
const savedG = { setInterval: g0.setInterval, clearInterval: g0.clearInterval, setTimeout: g0.setTimeout, clearTimeout: g0.clearTimeout, fetch: g0.fetch, window: g0.window, document: g0.document, localStorage: g0.localStorage, requestAnimationFrame: g0.requestAnimationFrame }
let loaderCapture = null
g0.setInterval = () => 0
g0.clearInterval = () => {}
g0.setTimeout = () => 0
g0.clearTimeout = () => {}
g0.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ({ ok: true, hdc: 'hdc.exe', version: '0.7.0', toolchain: { studio: '6.1.1.290', sdk: 24, devecocli: false, knowledge: 28 }, devices: [{ id: '127.0.0.1:5555', type: 'TCP', state: 'Connected', model: 'emulator', name: 'emulator', apiVersion: 23, battery: { capacity: 100, temperature: 25, charging: false } }], system: { mem: { totalMB: 3931, availMB: 2654 }, storage: { size: '5.7G', used: '1.3G', usePct: '25%' }, display: { w: 1256, h: 2760 } }, screenshot: { available: false }, hilog: { available: true, lines: ['I 00000/HiLog: smoke line'] }, preferred: '127.0.0.1:5555', error: '', lastError: '', updatedAt: Date.now() }),
})
g0.window = {
  __ModuleLoader__: { load: (spec) => { loaderCapture = spec } },
  innerWidth: 1280, innerHeight: 800,
}
g0.document = { body: makeEl('body'), head: makeEl('head'), getElementById: (id) => (id === 'hdc-panel-style' ? null : makeEl(id)), createElement: (tag) => makeEl(tag) }
g0.localStorage = { m: {}, getItem(k) { return k in this.m ? this.m[k] : null }, setItem(k, v) { this.m[k] = String(v) }, removeItem(k) { delete this.m[k] } }
g0.requestAnimationFrame = (f) => { f(); return 0 }
const clientMod = await import(new URL('../lib/client.js', import.meta.url).href + '?t=' + Date.now())
check('client-loader-captured', !!loaderCapture && loaderCapture.id === 'dsh-hdc-bridge')
const cmod = loaderCapture && loaderCapture.factory(() => {})
check('client-exports-apply', !!cmod && typeof cmod.apply === 'function')
let applyThrew = null
if (cmod) cmod.apply({ effect: (fn) => { try { fn() } catch (e) { applyThrew = e } } })
await new Promise((r) => setImmediate(r))
check('client-apply-no-throw', !applyThrew, String(applyThrew && applyThrew.message))
const bodyKids = g0.document.body.children
const fabEl = bodyKids.find((x) => x.id === 'hdcp-fab')
const rootEl = bodyKids.find((x) => x.id === 'hdc-panel-root')
check('client-fab-mounted', !!fabEl, JSON.stringify(bodyKids.map((x) => x.id)))
check('client-panel-default-hidden', !!rootEl && rootEl.style.display === 'none', rootEl && rootEl.style.display)
if (fabEl && fabEl.listeners.click && fabEl.listeners.click[0]) fabEl.listeners.click[0]()
check('client-fab-toggle-shows', !!rootEl && rootEl.style.display === '', rootEl && rootEl.style.display)
for (const k of Object.keys(savedG)) { if (savedG[k] !== undefined) g0[k] = savedG[k] }

// ---------- summary ----------
console.log('')
console.log(failures === 0 ? 'SMOKE ALL PASS' : 'SMOKE FAILURES: ' + failures)
process.exit(failures === 0 ? 0 : 1)
