// Maintainer tool: builds the Tier-1 bundled official knowledge layer.
// Downloads VERBATIM excerpts (zh-CN) from the OpenHarmony documentation
// project (gitee.com/openharmony/docs, licensed CC-BY-4.0) and writes them
// under knowledge/ together with an auditable index.
//
// Requires outbound network access. The DSH sandboxed pwsh shell blocks
// outbound HTTPS, so run this from an environment that has network — e.g. the
// DSH host via run_code:
//   await import('file:///F:/Code_FrontEnd/dsh-hdc-bridge/scripts/build-knowledge.mjs')
//
// Output layout (committed to the repo, shipped in the npm package):
//   knowledge/<file>.md   verbatim upstream markdown
//   knowledge/index.json  provenance: per-file source URL, source commit,
//                         sha256, module-level "since" note, tags
//   knowledge/meta.json   license sidecar consumed by scripts/license-check.mjs
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'openharmony/docs'
const API = 'https://gitee.com/api/v5/repos/' + REPO
const RAW = 'https://gitee.com/' + REPO + '/raw'
const BRANCH = 'master'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'knowledge')
const UA = { 'User-Agent': 'dsh-hdc-bridge-build-knowledge/0.5' }

// Tier-1 manifest: the most-used core APIs + app-model/ArkTS guides.
// Keep this list small and stable; each entry stays verbatim (CC-BY-4.0).
const MANIFEST = [
  { id: 'promptAction', kind: 'module', module: '@ohos.promptAction', path: 'reference/apis-arkui/js-apis-promptAction.md', tags: ['toast', 'dialog', '提示框', 'ui交互'] },
  { id: 'router', kind: 'module', module: '@ohos.router', path: 'reference/apis-arkui/js-apis-router.md', tags: ['页面跳转', '路由', 'navigation'] },
  { id: 'notificationManager', kind: 'module', module: '@ohos.notificationManager', path: 'reference/apis-notification-kit/js-apis-notificationManager.md', tags: ['通知', 'notification'] },
  { id: 'vibrator', kind: 'module', module: '@ohos.vibrator', path: 'reference/apis-sensor-service-kit/js-apis-vibrator.md', tags: ['振动', '马达'] },
  { id: 'batteryInfo', kind: 'module', module: '@ohos.batteryInfo', path: 'reference/apis-basic-services-kit/js-apis-battery-info.md', tags: ['电量', '电池'] },
  { id: 'deviceInfo', kind: 'module', module: '@ohos.deviceInfo', path: 'reference/apis-basic-services-kit/js-apis-device-info.md', tags: ['设备信息'] },
  { id: 'http', kind: 'module', module: '@ohos.net.http', path: 'reference/apis-network-kit/js-apis-http.md', tags: ['网络请求', 'http'] },
  { id: 'webSocket', kind: 'module', module: '@ohos.net.webSocket', path: 'reference/apis-network-kit/js-apis-webSocket.md', tags: ['websocket', '网络'] },
  { id: 'preferences', kind: 'module', module: '@ohos.data.preferences', path: 'reference/apis-arkdata/js-apis-data-preferences.md', tags: ['键值存储', '持久化'] },
  { id: 'emitter', kind: 'module', module: '@ohos.events.emitter', path: 'reference/apis-basic-services-kit/js-apis-emitter.md', tags: ['事件', 'event'] },
  { id: 'process', kind: 'module', module: '@ohos.process', path: 'reference/apis-arkts/js-apis-process.md', tags: ['进程'] },
  { id: 'url', kind: 'module', module: '@ohos.url', path: 'reference/apis-arkts/js-apis-url.md', tags: ['url解析'] },
  { id: 'util', kind: 'module', module: '@ohos.util', path: 'reference/apis-arkts/js-apis-util.md', tags: ['工具', 'textencoder', 'base64'] },
  { id: 'uiAbility', kind: 'module', module: '@ohos.app.ability.UIAbility', path: 'reference/apis-ability-kit/js-apis-app-ability-uiAbility.md', tags: ['应用模型', 'ability', '生命周期'] },
  { id: 'abilityAccessCtrl', kind: 'module', module: '@ohos.abilityAccessCtrl', path: 'reference/apis-ability-kit/js-apis-abilityAccessCtrl.md', tags: ['权限', 'permission'] },
  { id: 'commonContext', kind: 'module', module: '@ohos.app.context', path: 'reference/apis-ability-kit/js-apis-inner-application-context.md', tags: ['context', '上下文'] },
  { id: 'uiability-lifecycle', kind: 'guide', module: '', path: 'application-models/uiability-lifecycle.md', tags: ['应用模型', '生命周期', '指南'] },
  { id: 'uiability-usage', kind: 'guide', module: '', path: 'application-models/uiability-usage.md', tags: ['应用模型', '入口', '指南'] },
  { id: 'state-management-overview', kind: 'guide', module: '', path: 'ui/state-management/arkts-state-management-overview.md', tags: ['arkts', '状态管理', '指南'] },
  { id: 'custom-components', kind: 'guide', module: '', path: 'ui/state-management/arkts-create-custom-components.md', tags: ['arkts', '自定义组件', '指南'] },
]

async function getJson(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url)
  return res.json()
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

// Module-level first-API note, e.g. "本模块首批接口从API version 9开始支持。"
function firstSince(text) {
  const m = /首批接口从\s*API\s*version\s*(\d+)/i.exec(text) || /API\s*version\s*(\d+)/i.exec(text.slice(0, 4000))
  return m ? Number(m[1]) : null
}

function firstTitle(text) {
  const m = /^#\s+(.+)$/m.exec(text)
  return m ? m[1].replace(/\\n/g, ' ').trim() : ''
}

function countHeadings(text) {
  const m = text.match(/^#{2,3}\s+/gm)
  return m ? m.length : 0
}

export async function main() {
  console.log('[build-knowledge] fetching branch head of ' + REPO + '@' + BRANCH)
  const head = await getJson(API + '/commits?sha=' + BRANCH + '&per_page=1')
  const sourceSha = head[0] && head[0].sha
  if (!sourceSha) throw new Error('could not resolve branch head sha')
  console.log('[build-knowledge] head commit: ' + sourceSha)

  mkdirSync(OUT_DIR, { recursive: true })
  const keep = new Set(MANIFEST.map((m) => m.path.split('/').pop()))
  for (const stale of readdirSync(OUT_DIR)) {
    if (stale.endsWith('.md') && !keep.has(stale)) rmSync(join(OUT_DIR, stale))
  }
  const entries = []
  let totalBytes = 0
  for (const item of MANIFEST) {
    const rawUrl = RAW + '/' + BRANCH + '/zh-cn/application-dev/' + item.path
    const res = await fetch(rawUrl, { headers: UA })
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + rawUrl)
    const buf = Buffer.from(await res.arrayBuffer())
    const text = buf.toString('utf8')
    if (!text.trim()) throw new Error('empty body for ' + rawUrl)
    const entry = {
      id: item.id,
      kind: item.kind,
      module: item.module,
      title: firstTitle(text) || item.id,
      file: item.path.split('/').pop(),
      bytes: buf.length,
      sha256: sha256(buf),
      since: item.kind === 'module' ? firstSince(text) : null,
      headingCount: countHeadings(text),
      tags: item.tags,
      sourceUrl: RAW + '/' + sourceSha + '/zh-cn/application-dev/' + item.path,
    }
    entries.push(entry)
    totalBytes += buf.length
    console.log('[build-knowledge] ' + entry.file + ' ' + entry.bytes + 'B since=API ' + entry.since + ' headings=' + entry.headingCount)
    writeFileSync(join(OUT_DIR, entry.file), buf)
  }

  const index = {
    format: 1,
    name: 'dsh-hdc-bridge Tier-1 bundled official knowledge excerpts',
    source: 'https://gitee.com/openharmony/docs',
    branch: BRANCH,
    sourceSha,
    language: 'zh-CN',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Content excerpted VERBATIM (no modifications) from the OpenHarmony documentation project (openharmony/docs, © OpenHarmony Project Contributors), licensed under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).',
    generatedAt: new Date().toISOString(),
    totalBytes,
    entries,
  }
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify({
    name: 'openharmony/docs verbatim excerpts (Tier-1 bundled knowledge)',
    license: 'CC-BY-4.0',
    source: 'https://gitee.com/openharmony/docs',
  }, null, 2) + '\n')
  console.log('[build-knowledge] wrote ' + entries.length + ' files, ' + totalBytes + ' bytes -> ' + OUT_DIR)
  return index
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[build-knowledge] FAIL: ' + (e && e.message ? e.message : e)); process.exit(1) })
}
