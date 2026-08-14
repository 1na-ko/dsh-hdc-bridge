// Host half of the floating device panel (web hosts only; headless profiles
// never fire the webServer inject, so they stay unchanged).
//
// Design notes (v0.6.1):
// - Routes live under /api2/hdc-bridge/* - the /api channel is Typert-owned;
//   third-party REST uses its own prefix, same as dsh-web-plugin-manager.
// - The panel talks to hdc DIRECTLY via node child_process (fixed read-only
//   command set, no user/agent input), like the plugin-manager shells pnpm.
//   Going through ctx.shell would need a session-bound sandbox policy, which
//   hangs indefinitely for sessionless host requests in the web server.
// - Every command has a hard timeout and every route answers with JSON, so
//   the panel can never hang the browser fetch.
import { execFile } from 'node:child_process'
import { readFileSync, accessSync, constants, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STATE_TTL = 8000
const INFO_TTL = 30000
const CMD_TIMEOUT = 20000
const REFRESH_WATCHDOG = 45000
const SHOT_DIR_NAME = 'dsh-hdc-panel'
const MAX_DEVICES = 4
const NO_DEVICE_HINT = 'No HarmonyOS device/emulator connected. Connect one (hdc_connect 127.0.0.1:5555 for an emulator) or start a DevEco emulator.'

const HDC_CANDIDATES = [
  'F:\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
  'C:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
  'D:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
  '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc'
]

let hdcPath = ''
let hdcError = ''

function runHdc(args, timeoutMs) {
  return new Promise((resolve) => {
    if (!hdcPath) return resolve({ ok: false, stdout: '', stderr: 'hdc not found' })
    execFile(hdcPath, args, { timeout: timeoutMs || CMD_TIMEOUT, maxBuffer: 1048576, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, timedOut: !!(error && (error.killed === true || error.code === 'ETIMEDOUT')), stdout: String(stdout || ''), stderr: String(stderr || (error && error.message) || '') })
        return
      }
      resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

async function discover() {
  if (hdcPath) return hdcPath
  for (const c of HDC_CANDIDATES) {
    try { accessSync(c, constants.X_OK) } catch (e) { continue }
    const probe = await new Promise((resolve) => {
      execFile(c, ['-v'], { timeout: 12000, maxBuffer: 65536, windowsHide: true }, (error, stdout, stderr) => resolve(String(stdout || '') + String(stderr || '')))
    })
    if (/Ver:/i.test(probe)) { hdcPath = c; hdcError = ''; return hdcPath }
  }
  hdcError = 'hdc not found. Install DevEco Studio or put hdc on PATH.'
  return ''
}

function sendJson(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => { let v = null; try { v = data ? JSON.parse(data) : {} } catch (e) { v = null } resolve(v) })
    req.on('error', () => resolve(null))
  })
}

export function startPanel(bridge) {
  const ctx = bridge.ctx
  const shotDir = join(tmpdir(), SHOT_DIR_NAME)
  try { mkdirSync(shotDir, { recursive: true }) } catch (e) { /* read-only tmp fallback; recv will surface the error */ }
  const cache = { state: null, at: 0, info: new Map(), shot: null, shotAt: 0, inFlight: null, lastError: '' }

  async function listTargets() {
    const h = await discover()
    if (!h) return { ok: false, targets: [], error: hdcError }
    const r = await runHdc(['list', 'targets', '-v'], 20000)
    const targets = []
    if (r.ok) {
      for (const raw of r.stdout.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10))) {
        const parts = raw.trim().split(new RegExp('[' + String.fromCharCode(9) + String.fromCharCode(32) + ']+')).filter(Boolean)
        if (parts.length >= 2 && parts[0] !== '[Empty]') targets.push({ id: parts[0], type: parts[1] || '', state: parts[2] || '', addr: parts[3] || '' })
      }
    }
    return { ok: r.ok, targets, error: r.ok ? '' : (r.stderr || r.stdout || 'hdc list targets failed') }
  }

  async function paramGet(target, name) {
    const r = await runHdc(['-t', target, 'shell', 'param', 'get', name], 12000)
    return r.ok ? String(r.stdout).trim().replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 40) : ''
  }

  async function refresh(shot) {
    const prior = cache.inFlight
    if (prior) {
      if (!shot) return prior
      // A shot request never coalesces into an in-flight non-shot refresh:
      // wait for it, then run a fresh pass that actually captures the screen.
      try { await prior } catch (e) { /* prior settles its own error state */ }
    }
    cache.inFlight = (async () => {
      try {
        const list = await listTargets()
        const devices = []
        for (const t of (list.targets || []).slice(0, MAX_DEVICES)) {
          const hit = cache.info.get(t.id)
          let info
          if (hit && Date.now() - hit.at < INFO_TTL) info = hit.value
          else {
            info = /connected/i.test(t.state) ? { model: await paramGet(t.id, 'const.product.model'), apiVersion: await paramGet(t.id, 'const.ohos.apiversion') } : { model: '', apiVersion: '' }
            cache.info.set(t.id, { at: Date.now(), value: info })
          }
          devices.push({ id: t.id, type: t.type, state: t.state, model: info.model, apiVersion: info.apiVersion })
        }
        let hilogLines = []
        let hilogError = ''
        if (devices.length) {
          // Real devices can carry megabytes of logs; tail on the device side
          // so the dump stays small and never overflows the exec buffer.
          const lg = await runHdc(['-t', devices[0].id, 'shell', 'hilog -x | tail -n 60'], 20000)
          if (lg.ok) hilogLines = lg.stdout.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).filter((l) => l.trim()).slice(-12)
          else hilogError = (lg.stderr || 'hilog failed').slice(0, 120)
        }
        if (shot && devices.length) {
          const t = devices[0].id
          const remote = '/data/local/tmp/dsh_panel_shot.jpeg'
          const cap = await runHdc(['-t', t, 'shell', 'snapshot_display', '-f', remote], 20000)
          if (cap.ok) {
            const local = join(shotDir, 'panel-shot.jpeg')
            const recv = await runHdc(['-t', t, 'file', 'recv', remote, local], 30000)
            if (recv.ok) { try { cache.shot = readFileSync(local) } catch (e) { cache.shot = null } cache.shotAt = Date.now(); cache.lastError = '' }
            else cache.lastError = (recv.stderr || 'file recv failed').slice(0, 120)
          } else cache.lastError = (cap.stderr || 'snapshot_display failed').slice(0, 120)
        }
        cache.state = {
          ok: list.ok,
          hdc: hdcPath ? hdcPath.split(String.fromCharCode(92)).join('/').split('/').pop() : '',
          devices,
          error: !list.ok ? (list.error || 'hdc list targets failed') : (devices.length === 0 ? NO_DEVICE_HINT : ''),
          screenshot: cache.shot ? { available: true, url: '/api2/hdc-bridge/screenshot.jpeg?t=' + cache.shotAt, at: cache.shotAt } : { available: false, at: 0 },
          hilog: { available: hilogLines.length > 0, lines: hilogLines, error: hilogError },
          preferred: bridge.getPreferred ? bridge.getPreferred() : '',
          lastError: cache.lastError,
          updatedAt: Date.now(),
        }
        cache.at = Date.now()
      } catch (e) {
        cache.lastError = String(e && e.message ? e.message : e).slice(0, 200)
        cache.state = { ok: false, hdc: hdcPath ? hdcPath.split(String.fromCharCode(92)).join('/').split('/').pop() : '', devices: [], error: hdcError || cache.lastError, screenshot: { available: false, at: 0 }, hilog: { available: false, lines: [], error: '' }, lastError: cache.lastError, updatedAt: Date.now() }
        cache.at = Date.now()
      } finally { cache.inFlight = null }
    })()
    return cache.inFlight
  }

  async function refreshWithWatchdog(shot) {
    const watchdog = new Promise((resolve) => setTimeout(() => resolve(true), REFRESH_WATCHDOG))
    await Promise.race([refresh(shot).then(() => false), watchdog])
    return cache.state
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      const ws = webCtx.webServer
      if (!ws || typeof ws.register !== 'function') return
      const register = (kind, path, handler) => webCtx.effect(() => ws.register({ kind, path, handler }), 'hdc-bridge panel: ' + path)
      register('exact', '/api2/hdc-bridge/panel-state', async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!cache.state || Date.now() - cache.at > STATE_TTL) await refreshWithWatchdog(false)
        sendJson(res, 200, cache.state)
      })
      register('exact', '/api2/hdc-bridge/refresh', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        const body = await readBody(req)
        await refreshWithWatchdog(!body || body.shot !== false)
        sendJson(res, 200, cache.state)
      })
      register('exact', '/api2/hdc-bridge/select', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        const body = await readBody(req)
        const target = body && typeof body.target === 'string' ? body.target.trim() : ''
        if (!target) return sendJson(res, 400, { ok: false, error: 'target is required' })
        const list = await listTargets()
        const hit = (list.targets || []).find((d) => d.id === target && /connected/i.test(d.state))
        if (!hit) return sendJson(res, 400, { ok: false, error: 'target is not connected: ' + target })
        if (bridge.setPreferred) bridge.setPreferred(target)
        await refreshWithWatchdog(false)
        sendJson(res, 200, cache.state)
      })
      register('exact', '/api2/hdc-bridge/screenshot.jpeg', (req, res) => {
        if (!cache.shot) return sendJson(res, 404, { ok: false, error: 'no screenshot yet; POST /api2/hdc-bridge/refresh with {shot:true} first' })
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
        res.end(cache.shot)
      })
    })
  }

  return { refresh, refreshWithWatchdog }
}
