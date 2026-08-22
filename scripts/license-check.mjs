// License gate for dsh-hdc-bridge. Zero-dependency; run from the repo root:
//   node scripts/license-check.mjs
// Exit 0 when everything is consistent; exit 1 with a report otherwise.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WHITELIST = new Set(['MIT', 'Apache-2.0', 'CC-BY-4.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD'])
const FORBIDDEN = /(^|[^A-Za-z])(GPL|AGPL|LGPL)([^A-Za-z]|$)/
const problems = []

function fail(msg) { problems.push(msg) }

function loadJson(rel) {
  const p = join(root, rel)
  if (!existsSync(p)) { fail(`missing file: ${rel}`); return null }
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { fail(`unparseable JSON in ${rel}: ${e.message}`); return null }
}

// --- 1. notices.json structure and whitelist ---------------------------------
const notices = loadJson('notices.json')
const noticeIds = []
if (notices) {
  for (const section of ['incorporatedDependencies', 'derivedContent', 'referenceOnly']) {
    const items = notices[section]
    if (!Array.isArray(items)) { fail(`notices.json: "${section}" must be an array`); continue }
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id) { fail(`notices.json: entry in "${section}" missing id`); continue }
      noticeIds.push(item.id)
      if (FORBIDDEN.test(item.license || '') || FORBIDDEN.test(item.reason || '')) fail(`notices.json: entry "${item.id}" mentions a copyleft license`)
    }
    for (const item of items.filter((i) => i && (i.license !== undefined))) {
      if (!WHITELIST.has(item.license)) fail(`notices.json: entry "${item.id}" has non-whitelisted license "${item.license}"`)
      for (const field of ['copyright', 'source', 'usage']) {
        if (typeof item[field] !== 'string' || !item[field]) fail(`notices.json: entry "${item.id}" missing "${field}"`)
      }
    }
  }
  for (const item of notices.referenceOnly || []) {
    if (typeof item.reason !== 'string' || !item.reason) fail(`notices.json: reference-only entry "${item.id}" missing reason`)
  }
}

// --- 2. package.json dependency surface matches the notices ------------------
const pkg = loadJson('package.json')
if (pkg) {
  const declared = new Set([...(Object.keys(pkg.dependencies || {})), ...(Object.keys(pkg.optionalDependencies || {})), ...(Object.keys(pkg.peerDependencies || {}))])
  if (declared.size > 0) {
    const incorporated = new Set((notices?.incorporatedDependencies || []).map((i) => i.package))
    for (const name of declared) {
      if (!incorporated.has(name)) fail(`package.json declares dependency "${name}" that has no entry in notices.json incorporatedDependencies`)
      if (FORBIDDEN.test(name)) fail(`package.json dependency name "${name}" suggests a copyleft license`)
    }
  }
  for (const item of notices?.incorporatedDependencies || []) {
    if (!declared.has(item.package)) {
      fail(`notices.json incorporatedDependencies "${item.id}" (${item.package}) is not declared in package.json dependencies`)
    }
  }
}

// --- 3. vendored/ and knowledge/ directories: every file needs a meta.json sibling -
const vendoredDirs = ['vendored', 'knowledge']
for (const dirName of vendoredDirs) {
  const vendoredDir = join(root, dirName)
  if (!existsSync(vendoredDir)) continue
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      const rel = full.slice(root.length + 1).replace(/\\/g, '/')
      if (basename(entry) === 'meta.json') {
        const meta = loadJson(rel)
        if (meta) {
          if (!WHITELIST.has(meta.license)) fail(`${dirName}/${rel}: license "${meta.license}" not whitelisted`)
          for (const field of ['name', 'license', 'source']) {
            if (typeof meta[field] !== 'string' || !meta[field]) fail(`${dirName}/${rel}: missing "${field}"`)
          }
        }
        continue
      }
      const metaPath = join(dir, 'meta.json')
      if (!existsSync(metaPath)) fail(`${dirName}/${rel}: no meta.json sidecar`)
    }
  }
  walk(vendoredDir)
}

// --- 4. derived content keeps its copyright notice somewhere under lib/ --------
const libDir = join(root, 'lib')
const libTexts = []
if (existsSync(libDir)) {
  for (const f of readdirSync(libDir)) {
    if (/\.(m?js)$/.test(f)) libTexts.push(readFileSync(join(libDir, f), 'utf8'))
  }
}
for (const item of notices?.derivedContent || []) {
  const line = item.copyright
  if (!line) continue
  if (!libTexts.some((t) => t.includes(line))) fail(`lib/: derived content "${item.id}" must reproduce the copyright line "${line}" in a lib/*.js or lib/*.mjs file`)
}

// --- 5. THIRD_PARTY_NOTICES.md mirrors notices.json ----------------------------
const mdPath = join(root, 'THIRD_PARTY_NOTICES.md')
const mdText = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : ''
if (!mdText) {
  fail('missing THIRD_PARTY_NOTICES.md')
} else {
  for (const id of noticeIds) {
    if (!mdText.includes(id)) fail(`THIRD_PARTY_NOTICES.md: missing mention of "${id}"`)
  }
}

// --- 6. knowledge/index.json integrity: every listed file exists and matches its sha256
const knowledgeIndex = loadJson('knowledge/index.json')
if (knowledgeIndex) {
  for (const entry of knowledgeIndex.entries || []) {
    const filePath = join(root, 'knowledge', entry.file)
    if (!existsSync(filePath)) { fail(`knowledge/index.json: entry "${entry.id}" file missing: ${entry.file}`); continue }
    const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex')
    if (hash !== entry.sha256) fail(`knowledge/index.json: entry "${entry.id}" sha256 mismatch (index ${entry.sha256}, file ${hash})`)
  }
}

// --- report ---------------------------------------------------------------------
if (problems.length === 0) {
  console.log(`license-check: PASS (${noticeIds.length} notices, whitelist ${[...WHITELIST].join('/')})`)
  process.exit(0)
}
console.error('license-check: FAIL')
for (const p of problems) console.error('  - ' + p)
process.exit(1)
