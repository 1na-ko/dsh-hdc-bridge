// Host half of the floating device panel (web hosts only; headless profiles
// never fire the webServer inject, so they stay unchanged). Registers three
// guarded read-only routes under /api2/hdc-bridge/* (the /api channel is
// Typert-owned; third-party REST uses its own prefix, same as
// dsh-web-plugin-manager) and keeps a small TTL cache so a poll cycle never
// hammers hdc. All device work reuses the plugin's own hdc helpers.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STATE_TTL = 8000
const INFO_TTL = 30000
const SHOT_DIR_NAME = 'dsh-hdc-panel'
const MAX_DEVICES = 4
const NO_DEVICE_HINT = 'No HarmonyOS device/emulator connected. Connect one (hdc_connect 127.0.0.1:5555 for an emulator) or start a DevEco emulator.'

function sendJson(res, code, value) {
  const body = JSON.stringify(value)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => { let v = null; try { v = data ? JSON.parse(data) : {} } catch (e) { v = null } resolve(v) })
    req.on('error', () => resolve(null))
  })
}

// Attach the panel service. When the host provides webServer (web profiles),
// ctx.inject waits for it — webServer is a sibling include-group row, not
// visible through a plain ctx.get at apply time — and registers the routes.
// On headless hosts the inject never fires and nothing happens.
export function startPanel(bridge) {
  const ctx = bridge.ctx
  const policy = bridge.policy
  const shotDir = join(tmpdir(), SHOT_DIR_NAME)
  const cache = { state: null, at: 0, info: new Map(), shot: null, shotAt: 0, inFlight: null, lastError: '' }

  async function deviceInfo(target) {
    const hit = cache.info.get(target)
    if (hit && Date.now() - hit.at < INFO_TTL) return hit.value
    const value = { model: '', apiVersion: '' }
    for (const item of [['model', 'const.product.model'], ['apiVersion', 'const.ohos.apiversion']]) {
      const r = await bridge.runHdc(['shell', 'param get ' + item[1]], { target, timeoutMs: 12000, stdoutMaxBytes: 2048 }, policy)
      if (r.ok) value[item[0]] = String(r.stdout).trim().replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 40)
    }
    cache.info.set(target, { at: Date.now(), value })
    return value
  }

  async function refresh(shot) {
    if (cache.inFlight) return cache.inFlight
    cache.inFlight = (async () => {
      try {
        await bridge.ensureHdc(policy)
        const list = await bridge.listTargets(policy)
        const devices = []
        for (const t of (list.targets || []).slice(0, MAX_DEVICES)) {
          const info = /connected/i.test(t.state) ? await deviceInfo(t.id) : { model: '', apiVersion: '' }
          devices.push({ id: t.id, type: t.type, state: t.state, model: info.model, apiVersion: info.apiVersion })
        }
        const ht = await bridge.hilogTail(policy)
        const hilogLines = ht && ht.ok ? (ht.lines || []).slice(-12) : []
        if (shot) {
          const s = await bridge.takeShot(shotDir, policy)
          if (s && s.ok) {
            try { cache.shot = readFileSync(s.path) } catch (e) { cache.shot = null }
            cache.shotAt = Date.now()
            cache.lastError = ''
          } else {
            cache.lastError = (s && s.error) || 'screenshot failed'
          }
        }
        const hdcPath = bridge.hdcPath ? String(bridge.hdcPath()) : ''
        cache.state = {
          ok: list.ok,
          hdc: hdcPath ? hdcPath.split(String.fromCharCode(92)).join('/').split('/').pop() : '',
          devices,
          error: !list.ok ? (list.error || 'hdc list targets failed') : (devices.length === 0 ? NO_DEVICE_HINT : ''),
          screenshot: cache.shot ? { available: true, url: '/api2/hdc-bridge/screenshot.jpeg?t=' + cache.shotAt, at: cache.shotAt } : { available: false, at: 0 },
          hilog: { available: hilogLines.length > 0, lines: hilogLines, error: ht && !ht.ok ? (ht.error || 'hilog unavailable') : '' },
          lastError: cache.lastError,
          updatedAt: Date.now(),
        }
        cache.at = Date.now()
      } finally {
        cache.inFlight = null
      }
    })()
    return cache.inFlight
  }

  async function stateJson(force) {
    if (force || !cache.state || Date.now() - cache.at > STATE_TTL) await refresh(false)
    return cache.state
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      const ws = webCtx.webServer
      if (!ws || typeof ws.register !== 'function') return
      const register = (kind, path, handler) => webCtx.effect(() => ws.register({ kind, path, handler }), 'hdc-bridge panel: ' + path)
      register('exact', '/api2/hdc-bridge/panel-state', async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        sendJson(res, 200, await stateJson(false))
      })
      register('exact', '/api2/hdc-bridge/refresh', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        const body = await readBody(req)
        await refresh(!body || body.shot !== false)
        sendJson(res, 200, cache.state)
      })
      register('exact', '/api2/hdc-bridge/screenshot.jpeg', (req, res) => {
        if (!cache.shot) return sendJson(res, 404, { ok: false, error: 'no screenshot yet; POST /api2/hdc-bridge/refresh with {shot:true} first' })
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
        res.end(cache.shot)
      })
    })
  }

  return { refresh, stateJson }
}
