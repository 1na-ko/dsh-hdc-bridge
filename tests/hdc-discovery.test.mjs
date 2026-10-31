import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { discoverHdcCandidates } from '../lib/hdc-discover.mjs'
import { createHdcCore } from '../lib/hdc-core.mjs'

let pass = 0
let fail = 0
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name, extra || '') }
}

// 1) a temp SDK tree with 10 versions: capped at 5, deduped, every entry exists
mkdirSync('.tmp', { recursive: true })
const root = mkdtempSync(join('.tmp', 'hdc-discover-'))
for (const v of ['default', '10', '11', '12', '13', '14', '15', '16', '17', '18']) {
  const dir = join(root, v, 'openharmony', 'toolchains')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'hdc.exe'), 'fake')
}
const t0 = Date.now()
const r1 = discoverHdcCandidates({ extraRoots: [root, root.toUpperCase(), root + '/'], max: 5 })
const ms1 = Date.now() - t0
ok(r1.candidates.length <= 5, 'max 5 candidates', r1.candidates.length)
ok(r1.candidates.every((c) => c.exists), 'all candidates exist')
ok(new Set(r1.candidates.map((c) => c.path.toLowerCase().replace(/\\/g, '/'))).size === r1.candidates.length, 'deduped')
ok(r1.truncated === true, 'truncated flag')
ok(ms1 < 2000, 'discovery < 2s', ms1 + 'ms')

// 2) 100 nonexistent roots: still fast, no candidates, bounded searchedRoots
const bogus = Array.from({ length: 100 }, (_, i) => join(root, 'nope' + i))
const t1 = Date.now()
const r2 = discoverHdcCandidates({ extraRoots: bogus, max: 5 })
const ms2 = Date.now() - t1
ok(ms2 < 2000, 'bogus roots < 2s', ms2 + 'ms')
ok(r2.searchedRoots.length <= 12, 'searchedRoots bounded', r2.searchedRoots.length)

// 3) a fake hdc that sleeps 10s: the per-probe timeout keeps discovery bounded
let calls = 0
const core = createHdcCore({
  runShellRaw: async () => {
    calls++
    await new Promise((r) => setTimeout(r, 10000))
    return { exitCode: 0, stdout: { text: 'Ver: 1.0' }, stderr: { text: '' } }
  },
  psQuote: (s) => "'" + s + "'",
  detectShellFlavor: async () => 'bash',
  getShellFlavor: () => 'bash',
  setShellFlavor: () => {},
  extraRoots: () => [root],
  log: () => {},
})
const t2 = Date.now()
await core.ensureHdc({ mode: 'danger-full-access' })
const ms3 = Date.now() - t2
ok(ms3 < 30000, 'slow fake hdc does not hang forever', ms3 + 'ms')
ok(calls >= 1, 'probe attempted', calls)

rmSync(root, { recursive: true, force: true })
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
