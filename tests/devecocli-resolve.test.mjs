import { mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDevecocli, collectDevecocliCandidates, probeShim } from 'file:///C:/Users/Administrator/.dsh/profiles/desktop/node_modules/dsh-hdc-bridge/lib/devecocli-resolve.mjs'

let pass = 0, fail = 0
const ok = (c, n, x) => { if (c) { pass++; console.log('PASS', n) } else { fail++; console.log('FAIL', n, x || '') } }
const base = 'D:/dsh_plugin/repos/dsh-hdc-bridge/.tmp/devcli'
rmSync(base, { recursive: true, force: true })
mkdirSync(base, { recursive: true })

const cmdDir = join(base, '临时 目录 (x)')
mkdirSync(cmdDir, { recursive: true })
writeFileSync(join(cmdDir, 'devecocli.cmd'), '@echo off\r\necho 9.9.9\r\n')

const ps1Dir = join(base, 'ps1 only')
mkdirSync(ps1Dir, { recursive: true })
writeFileSync(join(ps1Dir, 'devecocli.ps1'), 'Write-Output "9.9.9"\n')

const npmRoot = join(base, 'npm')
const pkgDir = join(npmRoot, 'node_modules', '@deveco', 'deveco-cli')
mkdirSync(pkgDir, { recursive: true })
writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@deveco/deveco-cli', version: '9.9.9', bin: { devecocli: 'cli.js' } }))
writeFileSync(join(pkgDir, 'cli.js'), 'console.log("9.9.9")\n')

process.env.DEVECO_CLI_CLT_PATH = ''
process.env.COMMAND_LINE_TOOL_PATH = ''

// 1) .cmd in a dir with a space
process.env.DEVECO_CLI_PATH = cmdDir
process.env.DEVECO_CLI_NPM_ROOT = join(base, 'empty')
let r = await resolveDevecocli(3000)
ok(r.found && r.kind === 'cmd' && r.version === '9.9.9' && r.source === 'explicit', 'cmd shim found (spaces + Chinese dir)', JSON.stringify(r).slice(0, 200))

// 2) .ps1 in a Chinese + spaced dir

process.env.DEVECO_CLI_PATH = ps1Dir
console.log('DEBUG ps1 exists:', (await import('node:fs')).existsSync(join(ps1Dir, 'devecocli.ps1')))
r = await resolveDevecocli(3000)
ok(r.found && r.kind === 'ps1' && r.version === '9.9.9', 'ps1 shim found', JSON.stringify(r).slice(0, 200))

// 3) exe kind mapping (execution of a fake .exe is not expected to work)
writeFileSync(join(cmdDir, 'devecocli.exe'), 'not a real exe')
const exeKind = (await probeShim(join(cmdDir, 'devecocli.exe'), 'exe', 1500)).ok
ok(exeKind === false, 'fake exe does not falsely succeed')

// 4) npm global package bin (isolate from a real devecocli on PATH)
const savedPath = process.env.PATH
process.env.PATH = ''
process.env.DEVECO_CLI_PATH = ''
process.env.DEVECO_CLI_NPM_ROOT = join(npmRoot, 'node_modules')
r = await resolveDevecocli(3000)
ok(r.found && r.kind === 'npm-bin' && r.version === '9.9.9' && r.source === 'npm-global', 'npm global bin resolved', JSON.stringify(r).slice(0, 200))
process.env.PATH = savedPath

// 5) slow fake: 10s sleep must be cut by the probe timeout
const slowDir = join(base, 'slow')
mkdirSync(slowDir, { recursive: true })
writeFileSync(join(slowDir, 'devecocli.cmd'), '@echo off\r\nping -n 11 127.0.0.1 >nul\r\necho 1.0.0\r\n')
const t0 = Date.now()
const slow = await probeShim(join(slowDir, 'devecocli.cmd'), 'cmd', 3000)
const ms = Date.now() - t0
ok(!slow.ok && ms < 6000, 'slow shim bounded by timeout', ms + 'ms')

// 6) candidates are deduped and ordered: explicit first
process.env.DEVECO_CLI_PATH = cmdDir
process.env.DEVECO_CLI_NPM_ROOT = npmRoot
const cands = await collectDevecocliCandidates()
ok(cands.length > 0 && cands[0].source === 'explicit', 'explicit candidate first', cands.slice(0, 3).map((c) => c.source).join(','))
const keys = cands.map((c) => c.path.toLowerCase().replace(/\\/g, '/'))
ok(new Set(keys).size === keys.length, 'candidates deduped')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
