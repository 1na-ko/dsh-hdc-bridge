// Host/origin fence for the panel's local REST routes (issue #15).
//
// The panel's four routes are mounted with `webServer.register`, which grants
// them a path but inherits none of the host API's request fence. Without one,
// any page in the user's browser could drive the panel: a cross-site form
// POST reaches `/refresh` (a "simple request": no preflight), and a DNS
// rebound name passes a same-origin read of `/panel-state` or the screenshot
// bytes. The rule shape enforced here mirrors the host's own API fence —
// Host must be ours, cross-site markers are refused, Origin must match Host —
// but is implemented independently so a plugin route never depends on host
// internals.
//
// Kept pure and dependency-free: the regression suite drives every rule with
// plain request facts, no HTTP server required.
import { isIP } from 'node:net'

// Environment allowlist for deployments where the panel is reached through a
// host that is neither loopback nor the listener's own bind address (a LAN
// reverse proxy, a tunnel). Entries are `host` or `host:port`; a port-less
// entry matches any port. Loopback and the bind address never need listing.
export const PANEL_TRUST_ENV = 'DSH_HDC_BRIDGE_TRUSTED_HOSTS'

const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' }

// Parse a Host-style authority ("127.0.0.1:3080", "[::1]:3080", "panel.example")
// into its parts. Deliberately strict: a Host header carries an authority, so
// anything with a path, userinfo, query or fragment is rejected instead of
// being silently narrowed.
export function parseAuthority(value) {
  const text = String(value == null ? '' : value).trim()
  if (!text || /[\s/?#@]/.test(text)) return null
  let url
  try {
    url = new URL('http://' + text)
  } catch {
    return null
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname) return null
  return { hostname, port: url.port, host: hostname + (url.port ? ':' + url.port : '') }
}

export function isLoopbackHostname(hostname) {
  const h = String(hostname || '').toLowerCase()
  if (h === 'localhost' || h === '::1') return true
  return LOOPBACK_V4.test(h)
}

export function isLoopbackAddress(address) {
  const a = String(address || '').trim().toLowerCase()
  if (!a) return false
  if (a === '::1') return true
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(a)
  if (mapped) return LOOPBACK_V4.test(mapped[1])
  if (isIP(a) === 4) return LOOPBACK_V4.test(a)
  return false
}

// Two authorities name the same endpoint when the hostnames match and the
// ports agree once the scheme default fills an omitted port (so an Origin of
// https://panel.example matches a Host of panel.example, and :443 is implicit).
export function sameAuthority(left, right, scheme) {
  if (!left || !right) return false
  if (left.hostname !== right.hostname) return false
  const fallback = DEFAULT_PORTS[scheme] || DEFAULT_PORTS['http:']
  return (left.port || fallback) === (right.port || fallback)
}

export function trustedAuthorities(value) {
  const raw = value == null ? process.env[PANEL_TRUST_ENV] : value
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((entry) => parseAuthority(entry))
    .filter(Boolean)
}

function matchesTrusted(authority, entries) {
  return (entries || []).some((entry) =>
    entry.port ? entry.host === authority.host : entry.hostname === authority.hostname)
}

// `opts`:
//   trustedAuthorities - parsed allowlist (defaults to the env variable)
//   bindHost           - the listener's own bind address, when the host service exposes it
//   servedOrigin       - the URL the web server reports for local clients
//   method             - request method (state-changing methods require a JSON body type)
export function checkPanelRequest(request, opts) {
  const options = opts || {}
  const headers = (request && request.headers) || {}
  const method = String((options.method || (request && request.method) || 'GET')).toUpperCase()

  const host = parseAuthority(headers.host)
  if (!host) return deny(403, 'missing-host', 'A Host header naming this web server is required.')

  if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    return deny(403, 'cross-site', 'Cross-site requests are refused on the panel routes.')
  }

  const origin = headers.origin
  if (origin !== undefined && origin !== '') {
    let originUrl = null
    try { originUrl = new URL(String(origin)) } catch { originUrl = null }
    if (!originUrl || (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:')) {
      return deny(403, 'origin-mismatch', 'The Origin header is not a usable http(s) origin.')
    }
    const originAuthority = parseAuthority(originUrl.host)
    if (!sameAuthority(originAuthority, host, originUrl.protocol)) {
      return deny(403, 'origin-mismatch', 'The Origin does not match the Host this panel is served from.')
    }
  }

  if (isLoopbackHostname(host.hostname)) {
    const peer = request && request.socket ? request.socket.remoteAddress : ''
    if (!isLoopbackAddress(peer)) {
      return deny(403, 'peer-not-local', 'A loopback Host is only accepted from a loopback peer.')
    }
  } else {
    const allowed = options.trustedAuthorities !== undefined
      ? options.trustedAuthorities
      : trustedAuthorities()
    const bind = options.bindHost ? parseAuthority(options.bindHost) : null
    const served = options.servedOrigin ? parseAuthority(String(options.servedOrigin).replace(/^[a-z]+:\/\//i, '')) : null
    if (!matchesTrusted(host, allowed) && !(bind && bind.hostname === host.hostname) && !(served && served.hostname === host.hostname)) {
      return deny(403, 'host-untrusted',
        'This host is not trusted for the panel routes. Reaching the panel through a LAN address or a tunnel requires it in ' + PANEL_TRUST_ENV + '.')
    }
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const type = String(headers['content-type'] || '').toLowerCase()
    if (!type.startsWith('application/json')) {
      return deny(415, 'content-type', 'State-changing panel routes require Content-Type: application/json.')
    }
  }

  return { ok: true, status: 200, reason: '', hint: '' }
}

function deny(status, reason, hint) {
  return { ok: false, status, reason, hint }
}
