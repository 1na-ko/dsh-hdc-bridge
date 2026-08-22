// DevEco CLI backend resolution and command building.
// @deveco/deveco-cli (MIT, Copyright (c) 2026 Huawei Device Co., Ltd.) is NOT
// declared as a dependency of this plugin (so installing the plugin runs no
// third-party install-time code). It is resolved at runtime from wherever the
// user installed it — a local package probe plus a PATH lookup — and is never
// bundled (see notices.json entry "deveco-cli").
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

// Probe a locally installed @deveco/deveco-cli package (createRequire walks up
// through our package's own node_modules — works when the user installed the
// CLI next to the plugin or globally via npm).
export function resolveCliPkg() {
  try {
    const require = createRequire(import.meta.url)
    const pkgPath = require.resolve('@deveco/deveco-cli/package.json')
    const pkgDir = dirname(pkgPath)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const rel = pkg && pkg.bin ? (typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin.devecocli || '')) : ''
    if (!rel) return { ok: false, error: 'no devecocli bin entry in @deveco/deveco-cli' }
    const cliJs = join(pkgDir, rel)
    if (!existsSync(cliJs)) return { ok: false, error: 'bin file missing: ' + cliJs }
    return { ok: true, kind: 'pkg', pkgDir, cliJs, version: pkg.version || '' }
  } catch (e) {
    return { ok: false, error: 'local @deveco/deveco-cli package not found: ' + (e && e.message ? e.message : String(e)) }
  }
}

export function parseCliVersion(stdout) {
  const m = /(\d+\.\d+\.\d+)/.exec(String(stdout || ''))
  return m ? m[1] : ''
}

// Build a shell command line. argv entries must already be quoted by the caller
// (the host plugin owns the shell dialect and its quote helper).
// shellFlavor: 'pwsh' prepends the call operator `& ` — without it PowerShell
// parses a command line that starts with a quoted path in EXPRESSION mode and
// mangles bare --flags (ParserError: The '--' operator ...).
export function buildCliCommand(cli, argv, quote, shellFlavor = '') {
  const nodeBin = (typeof process !== 'undefined' && process.execPath) ? process.execPath : 'node'
  const call = shellFlavor === 'pwsh' ? '& ' : ''
  let head
  if (cli && cli.kind === 'pkg' && cli.cliJs) head = call + quote(nodeBin) + ' ' + quote(cli.cliJs)
  else if (cli && cli.kind === 'path' && cli.cmd) head = call + quote(cli.cmd)
  else head = call + 'devecocli'
  return head + (argv.length ? ' ' + argv.join(' ') : '')
}

export const CLI_HINT = 'devecocli is unavailable. Install it once with: npm i -g @deveco/deveco-cli (needs DevEco Studio >= 6.1.0, macOS/Windows, Node >= 18).'
