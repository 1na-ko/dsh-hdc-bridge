// License gate for dsh-hdc-bridge. Zero-dependency; run from the repo root:
//   node scripts/license-check.mjs
// Exit 0 when everything is consistent; exit 1 with a report otherwise.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
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
    if (!pkg.optionalDependencies || !Object.keys(pkg.optionalDependencies).includes(item.package)) {
      fail(`notices.json incorporatedDependencies "${item.id}" (${item.package}) is not declared in package.json optionalDependencies`)
    }
  }
}

// --- 3. vendored/ directory: every file needs a meta.json sibling -------------
const vendoredDir = join(root, 'vendored')
if (existsSync(vendoredDir)) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      const rel = full.slice(root.length + 1).replace(/\\/g, '/')
      if (basename(entry) === 'meta.json') {
        const meta = loadJson(rel)
        if (meta) {
          if (!WHITELIST.has(meta.license)) fail(`vendored/${rel}: license "${meta.license}" not whitelisted`)
          for (const field of ['name', 'license', 'source']) {
            if (typeof meta[field] !== 'string' || !meta[field]) fail(`vendored/${rel}: missing "${field}"`)
          }
        }
        continue
      }
      const metaPath = join(dir, 'meta.json')
      if (!existsSync(metaPath)) fail(`vendored/${rel}: no meta.json sidecar`)
    }
  }
  walk(vendoredDir)
}

// --- 4. derived content keeps its copyright notice in lib/skills.mjs ----------
const skillsPath = join(root, 'lib', 'skills.mjs')
const skillsText = existsSync(skillsPath) ? readFileSync(skillsPath, 'utf8') : ''
for (const item of notices?.derivedContent || []) {
  const line = item.copyright
  if (!line) continue
  if (!skillsText.includes(line)) fail(`lib/skills.mjs: derived content "${item.id}" must reproduce the copyright line "${line}"`)
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

// --- report ---------------------------------------------------------------------
if (problems.length === 0) {
  console.log(`license-check: PASS (${noticeIds.length} notices, whitelist ${[...WHITELIST].join('/')})`)
  process.exit(0)
}
console.error('license-check: FAIL')
for (const p of problems) console.error('  - ' + p)
process.exit(1)
