// DevEco CLI backend resolution and command building.
// @deveco/deveco-cli (MIT, Copyright (c) 2026 Huawei Device Co., Ltd.) is NOT
// declared as a dependency of this plugin (so installing the plugin runs no
// third-party install-time code). It is resolved at runtime from wherever the
// user installed it — a local package probe plus a PATH lookup — and is never
// bundled (see notices.json entry "deveco-cli").
import { createRequire } from 'node:module'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

// Package names devecocli ships under. The umbrella package is the documented
// install; Huawei also publishes platform packages (for example
// @deveco/deveco-cli-openharmony-arm64, which npm selects through the
// umbrella's optionalDependencies on HarmonyOS PC), and a user can end up with
// only the platform package installed — so it is probed by name too (issue #10).
function candidatePkgNames() {
  const list = ['@deveco/deveco-cli', '@deveco/deveco-cli-openharmony-arm64', '@deveco/deveco-cli-openharmony-x64']
  try {
    if (typeof process !== 'undefined' && process.platform && process.arch) {
      const name = '@deveco/deveco-cli-' + process.platform + '-' + process.arch
      if (!list.includes(name)) list.push(name)
    }
  } catch (e) { /* platform facts unavailable: the static names still apply */ }
  return list
}

function pkgFromManifest(pkgPath) {
  const pkgDir = dirname(pkgPath)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const rel = pkg && pkg.bin ? (typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin.devecocli || '')) : ''
  if (!rel) return { ok: false, error: 'no devecocli bin entry in ' + (pkg && pkg.name ? pkg.name : pkgPath) }
  const cliJs = join(pkgDir, rel)
  if (!existsSync(cliJs)) return { ok: false, error: 'bin file missing: ' + cliJs }
  return { ok: true, kind: 'pkg', pkgDir, cliJs, version: pkg.version || '', pkgName: pkg.name || '' }
}

// Probe locally installed devecocli packages through the plugin's own
// resolution chain, then through the invoking directory: createRequire walks up
// through node_modules, so both an install next to the plugin and one in the
// current project resolve.
export function resolveCliPkg() {
  const names = candidatePkgNames()
  const bases = [import.meta.url]
  try {
    if (typeof process !== 'undefined' && typeof process.cwd === 'function') bases.push(pathToFileURL(join(process.cwd(), 'package.json')).href)
  } catch (e) { /* cwd unavailable: the plugin base still applies */ }
  const errors = []
  for (const base of bases) {
    let require = null
    try { require = createRequire(base) } catch (e) { continue }
    for (const name of names) {
      try {
        const found = pkgFromManifest(require.resolve(name + '/package.json'))
        if (found.ok) return found
        errors.push(found.error)
      } catch (e) { /* not installed at this base */ }
    }
  }
  return { ok: false, error: 'local devecocli package not found (tried ' + names.join(', ') + '): ' + (errors[0] || 'not resolvable from the plugin or the invoking directory') }
}

// npm's POSIX global shims are symlinks to the package's JS entry, and the
// platform packages ship a non-standard `#!/bin/env node` shebang: executing
// such a shim depends on the host having /bin/env. Resolving the link lets the
// caller run the JS with its own node instead (issue #10).
export function resolveShimTarget(shimPath) {
  try {
    const real = realpathSync(shimPath)
    if (real && real !== shimPath && /\.(c|m)?js$/i.test(real) && existsSync(real)) {
      return { ok: true, kind: 'pkg', cliJs: real, pkgDir: dirname(real), version: '', pkgName: '' }
    }
  } catch (e) { /* keep executing the shim as reported */ }
  return { ok: false }
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

export const CLI_HINT = 'devecocli is unavailable. Install it once with: npm i -g @deveco/deveco-cli (platform packages such as @deveco/deveco-cli-openharmony-arm64 also work; needs Node >= 18) — or use the standalone Huawei Command Line Tools (>= 26.0.0, the only option on Linux): download from developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos and set DEVECO_CLI_CLT_PATH (or COMMAND_LINE_TOOL_PATH) to the extracted folder.'
