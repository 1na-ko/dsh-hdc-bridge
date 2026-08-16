// Host half of the floating dev panel (web hosts only; headless profiles
// never fire the webServer inject, so they stay unchanged).
//
// The panel shows the WHOLE plugin, not just hdc: device detail (model,
// brand, OS, battery), system stats (memory/storage/display), hilog tail,
// per-device screenshots, and the plugin's own toolchain + knowledge state.
// Data comes from direct hdc spawns (fixed read-only command set, hard
// timeouts, watchdog) plus a toolchain bridge from the plugin services.
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

function runHdc(args, timeoutMs, maxBuffer) {
  return new Promise((resolve) => {
    if (!hdcPath) return resolve({ ok: false, stdout: '', stderr: 'hdc not found' })
    try {
      execFile(hdcPath, args, { timeout: timeoutMs || CMD_TIMEOUT, maxBuffer: maxBuffer || 1048576, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, timedOut: !!(error && (error.killed === true || error.code === 'ETIMEDOUT')), stdout: String(stdout || ''), stderr: String(stderr || (error && error.message) || '') })
          return
        }
        resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') })
      })
    } catch (e) {
      resolve({ ok: false, timedOut: false, stdout: '', stderr: 'hdc spawn unavailable: ' + String(e && e.message ? e.message : e) })
    }
  })
}

async function discover() {
  if (hdcPath) return hdcPath
  for (const c of HDC_CANDIDATES) {
    try { accessSync(c, constants.X_OK) } catch (e) { continue }
    const probe = await new Promise((resolve) => {
      try {
        execFile(c, ['-v'], { timeout: 12000, maxBuffer: 65536, windowsHide: true }, (error, stdout, stderr) => resolve(String(stdout || '') + String(stderr || '')))
      } catch (e) {
        resolve('')
      }
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

// ---- device-side parsers (fixed formats, tolerant) ----
function parseBattery(text) {
  const num = (re) => { const m = re.exec(text); return m ? Number(m[1]) : null }
  const capacity = num(/capacity:\s*(\d+)/)
  if (capacity === null) return null
  const temp = num(/temperature:\s*(\d+)/)
  const voltage = num(/voltage:\s*(\d+)/)
  const chargingStatus = num(/chargingStatus:\s*(\d+)/)
  return {
    capacity,
    temperature: temp === null ? null : Math.round(temp / 10) / 1,
    voltage: voltage === null ? null : Math.round(voltage / 10000) / 100,
    charging: chargingStatus === 1,
  }
}
function parseMem(text) {
  const kb = (re) => { const m = re.exec(text); return m ? Math.round(Number(m[1]) / 1024) : null }
  return { totalMB: kb(/MemTotal:\s*(\d+)/), availMB: kb(/MemAvailable:\s*(\d+)/) }
}
function parseDf(text) {
  const line = (text || '').split(String.fromCharCode(10)).filter((l) => l.trim())[0] || ''
  const parts = line.trim().split(/[ ]+/).filter(Boolean)
  if (parts.length < 5) return null
  return { size: parts[1], used: parts[2], usePct: parts[4] }
}
function parseDisplay(text) {
  const m = /width:\s*(\d+),\s*height:\s*(\d+)/i.exec(text)
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null
}

export function startPanel(bridge) {
  const ctx = bridge.ctx
  const shotDir = join(tmpdir(), SHOT_DIR_NAME)
  try { mkdirSync(shotDir, { recursive: true }) } catch (e) { /* recv 会带出错误 */ }
  const cache = { state: null, at: 0, info: new Map(), shotBytes: null, shotMeta: { target: '', at: 0 }, display: null, inFlight: null, lastError: '' }

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
    const r = await runHdc(['-t', target, 'shell', 'param get ' + name], 12000, 4096)
    return r.ok ? String(r.stdout).trim().replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) : ''
  }

  async function deviceInfo(target) {
    const hit = cache.info.get(target)
    if (hit && Date.now() - hit.at < INFO_TTL) return hit.value
    const value = { model: '', name: '', brand: '', softwareVersion: '', deviceType: '', apiVersion: '', battery: null }
    for (const item of [['model', 'const.product.model'], ['name', 'const.product.name'], ['brand', 'const.product.brand'], ['softwareVersion', 'const.product.software.version'], ['deviceType', 'const.product.devicetype'], ['apiVersion', 'const.ohos.apiversion']]) {
      value[item[0]] = await paramGet(target, item[1])
    }
    const batt = await runHdc(['-t', target, 'shell', 'hidumper -s 3302 -a -i'], 15000, 262144)
    if (batt.ok) value.battery = parseBattery(batt.stdout)
    cache.info.set(target, { at: Date.now(), value })
    return value
  }

  async function systemInfo(target) {
    const sys = { mem: null, storage: null, display: cache.display }
    const mem = await runHdc(['-t', target, 'shell', 'cat /proc/meminfo | grep -E "MemTotal|MemAvailable"'], 12000, 65536)
    if (mem.ok) sys.mem = parseMem(mem.stdout)
    const df = await runHdc(['-t', target, 'shell', 'df -h /data | tail -n 1'], 12000, 65536)
    if (df.ok) sys.storage = parseDf(df.stdout)
    return sys
  }

  async function refresh(shot, shotTarget) {
    const prior = cache.inFlight
    if (prior) {
      if (!shot) return prior
      try { await prior } catch (e) { /* 前次自处理错误 */ }
    }
    cache.inFlight = (async () => {
      try {
        const list = await listTargets()
        const devices = []
        for (const t of (list.targets || []).slice(0, MAX_DEVICES)) {
          const info = /connected/i.test(t.state) ? await deviceInfo(t.id) : { model: '', name: '', brand: '', softwareVersion: '', deviceType: '', apiVersion: '', battery: null }
          devices.push({ id: t.id, type: t.type, state: t.state, ...info })
        }
        const primary = (bridge.getPreferred && bridge.getPreferred() && devices.find((d) => d.id === bridge.getPreferred())) || devices[0] || null
        const system = primary ? await systemInfo(primary.id) : { mem: null, storage: null, display: null }
        let hilogLines = []
        let hilogError = ''
        if (primary) {
          const lg = await runHdc(['-t', primary.id, 'shell', 'hilog -x | tail -n 60'], 20000, 262144)
          if (lg.ok) hilogLines = lg.stdout.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).filter((l) => l.trim()).slice(-12)
          else hilogError = (lg.stderr || 'hilog failed').slice(0, 120)
        }
        if (shot && primary) {
          const t = (shotTarget && devices.find((d) => d.id === shotTarget && /connected/i.test(d.state))) ? shotTarget : primary.id
          const remote = '/data/local/tmp/dsh_panel_shot.jpeg'
          const cap = await runHdc(['-t', t, 'shell', 'snapshot_display -f ' + remote], 20000, 65536)
          if (cap.ok) {
            const disp = parseDisplay(cap.stdout)
            if (disp) cache.display = disp
            const local = join(shotDir, 'panel-shot.jpeg')
            const recv = await runHdc(['-t', t, 'file', 'recv', remote, local], 30000, 1048576)
            if (recv.ok) {
              try { cache.shotBytes = readFileSync(local) } catch (e) { cache.shotBytes = null }
              cache.shotMeta = { target: t, at: Date.now() }
              cache.lastError = ''
            } else cache.lastError = (recv.stderr || 'file recv failed').slice(0, 120)
          } else cache.lastError = (cap.stderr || 'snapshot_display failed').slice(0, 120)
        }
        if (cache.display) system.display = cache.display // shot 块可能刚更新了分辨率
        let toolchain = { studio: '', sdk: 0, devecocli: false, knowledge: 0 }
        if (bridge.toolchain) { try { toolchain = await bridge.toolchain() } catch (e) { /* 保持默认 */ } }
        cache.state = {
          ok: list.ok,
          hdc: hdcPath ? hdcPath.split(String.fromCharCode(92)).join('/').split('/').pop() : '',
          toolchain,
          devices,
          system,
          error: !list.ok ? (list.error || 'hdc list targets failed') : (devices.length === 0 ? NO_DEVICE_HINT : ''),
          screenshot: cache.shotBytes ? { available: true, target: cache.shotMeta.target, url: '/api2/hdc-bridge/screenshot.jpeg?t=' + cache.shotMeta.at, at: cache.shotMeta.at } : { available: false, target: '', at: 0 },
          hilog: { available: hilogLines.length > 0, lines: hilogLines, error: hilogError },
          preferred: bridge.getPreferred ? bridge.getPreferred() : '',
          lastError: cache.lastError,
          updatedAt: Date.now(),
        }
        cache.at = Date.now()
      } catch (e) {
        cache.lastError = String(e && e.message ? e.message : e).slice(0, 200)
        cache.state = { ok: false, hdc: '', toolchain: { studio: '', sdk: 0, devecocli: false, knowledge: 0 }, devices: [], system: { mem: null, storage: null, display: null }, error: hdcError || cache.lastError, screenshot: { available: false, target: '', at: 0 }, hilog: { available: false, lines: [], error: '' }, preferred: '', lastError: cache.lastError, updatedAt: Date.now() }
        cache.at = Date.now()
      } finally { cache.inFlight = null }
    })()
    return cache.inFlight
  }

  async function refreshWithWatchdog(shot, shotTarget) {
    const watchdog = new Promise((resolve) => setTimeout(() => resolve(true), REFRESH_WATCHDOG))
    await Promise.race([refresh(shot, shotTarget).then(() => false), watchdog])
    return cache.state
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      const ws = webCtx.webServer
      if (!ws || typeof ws.register !== 'function') return
      const register = (kind, path, handler) => webCtx.effect(() => ws.register({ kind, path, handler }), 'hdc-bridge panel: ' + path)
      register('exact', '/api2/hdc-bridge/panel-state', async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!cache.state || Date.now() - cache.at > STATE_TTL) await refreshWithWatchdog(false, '')
        sendJson(res, 200, cache.state)
      })
      register('exact', '/api2/hdc-bridge/refresh', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        const body = await readBody(req)
        await refreshWithWatchdog(!body || body.shot !== false, body && typeof body.target === 'string' ? body.target.trim() : '')
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
        await refreshWithWatchdog(false, '')
        sendJson(res, 200, cache.state)
      })
      register('exact', '/api2/hdc-bridge/screenshot.jpeg', (req, res) => {
        if (!cache.shotBytes) return sendJson(res, 404, { ok: false, error: 'no screenshot yet; POST /api2/hdc-bridge/refresh with {shot:true} first' })
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
        res.end(cache.shotBytes)
      })
    })
  }

  return { refresh, refreshWithWatchdog }
}
