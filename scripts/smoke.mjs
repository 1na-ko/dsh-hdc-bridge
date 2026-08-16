// dsh-hdc-bridge regression suite (no real hdc required — fake shell drives
// everything except panel.mjs, whose direct hdc spawn is exercised only for
// its graceful-degradation paths). Run: node scripts/smoke.mjs
const MOD_URL = new URL('../lib/host.js', import.meta.url).href
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
check('tools=19', registered.length === 19, 'got ' + registered.length)
check('skills=3', skills.length === 3, 'got ' + skills.length)
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
check('catalog>=23', cat.total >= 23, 'got ' + cat.total)
const rd = await kn.execute({ action: 'read', id: 'sensor', section: 'getSingleSensor' }, exec)
check('sensor-section', rd.ok === true && typeof rd.content === 'string' && rd.content.length > 0)
const sf = await kn.execute({ action: 'search', keywords: '文件' }, exec)
check('search-fileFs', sf.results[0] && sf.results[0].id === 'fileFs', JSON.stringify(sf.results[0] && sf.results[0].id))

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

// ---------- summary ----------
console.log('')
console.log(failures === 0 ? 'SMOKE ALL PASS' : 'SMOKE FAILURES: ' + failures)
process.exit(failures === 0 ? 0 : 1)
