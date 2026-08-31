// DevEco CLI argument builders and output-table parsing for the
// compile-assistance tools (build_project / start_app / hdc_log).
// Plain-JS port of the DevEco Code tool helpers:
//   gitcode.com/openharmony-sig/deveco-code
//   packages/opencode/src/tool/lib/deveco-cli.ts
//   packages/opencode/src/tool/start_app.ts
// Copyright (c) 2026 Huawei Device Co., Ltd. — Apache-2.0 (see notices.json).

import { stripAnsi } from './compile-output.mjs'

export function buildDevecoCliBuildArgs(input = {}) {
  if (input.clean) return ['build', 'clean']
  const args = ['build']
  const product = String(input.product || '').trim()
  const buildMode = String(input.build_mode || '').trim()
  const modules = (Array.isArray(input.modules) ? input.modules : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
  if (product) args.push('--product', product)
  if (modules.length > 0) args.push('--modules', ...modules)
  if (buildMode) args.push('--build-mode', buildMode)
  return args
}

export function buildDevecoCliRunArgs(input = {}) {
  const args = ['run', '--skip-build', '--device', String(input.device || '').trim()]
  const module = String(input.module || '').trim()
  const target = String(input.target || '').trim()
  const ability = String(input.ability || '').trim()
  if (module || target) {
    args.push('--module', target ? `${module || 'entry'}@${target}` : module)
  }
  if (ability) args.push('--ability', ability)
  return args
}

export function buildDevecoCliStartAppCommands(input = {}) {
  const device = String(input.hvd || '').trim()
  if (!device) {
    return [
      ['device', 'list'],
      ['emulator', 'list'],
    ]
  }
  return [['device', 'list']]
}

export function buildDevecoCliLogArgs(input = {}) {
  const args = ['log']
  const device = String(input.device || '').trim()
  const keyword = String(input.keyword || '').trim()
  if (device) args.push('--device', device)
  if (keyword) args.push('--keyword', keyword)
  if (input.tail !== undefined && input.tail !== null) args.push('--tail', String(input.tail))
  return args
}

export function devecoCliListContainsTarget(output, target) {
  const normalizedTarget = String(target || '').trim()
  if (!normalizedTarget) return false
  return String(output || '')
    .split(/\r?\n/)
    .some((line) => line.includes(normalizedTarget))
}

export function commandText(args) {
  return 'devecocli ' + args.map((arg) => (/\s/.test(String(arg)) ? JSON.stringify(String(arg)) : String(arg))).join(' ')
}

/** Parse an aligned CLI table by header names (Name / Kind / Status / ...). */
export function parseCliTable(text) {
  const lines = stripAnsi(String(text || ''))
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  // Require Name plus Kind/Status/Serial so progress lines are less likely to match.
  const headerIdx = lines.findIndex(
    (line) => /^\s*Name\b/i.test(line) && /\b(Kind|Status|Serial)\b/i.test(line),
  )
  if (headerIdx < 0) return []

  const headers = lines[headerIdx]
    .trim()
    .split(/\s{2,}/)
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  if (!headers.includes('name')) return []

  const rows = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^-+(\s+-+)*$/.test(line)) continue
    const cells = line.split(/\s{2,}/).map((cell) => cell.trim())
    if (cells.length < 2) continue

    const row = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cells[c] ?? ''
    }
    if (row.name) rows.push(row)
  }
  return rows
}

function cell(row, key) {
  return String((row && row[key]) || '').trim()
}

export function formatRawDiscovery(deviceListOutput, emulatorListOutput) {
  const blocks = []
  const device = stripAnsi(String(deviceListOutput || '')).trim()
  const emulator = stripAnsi(String(emulatorListOutput || '')).trim()
  if (device) blocks.push(`$ devecocli device list\n${device}`)
  if (emulator) blocks.push(`$ devecocli emulator list\n${emulator}`)
  return blocks.join('\n\n')
}

export function formatDeviceSelectionPrompt(deviceListOutput, emulatorListOutput) {
  const physical = []
  const running = new Set()
  const stopped = []

  for (const row of parseCliTable(deviceListOutput)) {
    const name = cell(row, 'name')
    const kind = cell(row, 'kind').toLowerCase()
    if (!name) continue
    if (kind === 'emulator') running.add(name)
    else physical.push(name)
  }

  for (const row of parseCliTable(emulatorListOutput)) {
    const name = cell(row, 'name')
    const status = cell(row, 'status').toLowerCase()
    if (!name) continue
    if (status === 'running' || status === 'started') running.add(name)
    else if (status === 'stopped' || status === 'offline') stopped.push(name)
  }

  const stoppedOnly = stopped.filter((name) => !running.has(name))
  if (physical.length === 0 && running.size === 0 && stoppedOnly.length === 0) {
    const raw = formatRawDiscovery(deviceListOutput, emulatorListOutput)
    return [
      '未检测到可用设备。',
      '',
      '请先连接真机，或创建/启动模拟器后再重试 start_app。',
      ...(raw ? ['', '原始输出：', raw] : []),
    ].join('\n')
  }

  const lines = ['请指定要使用的设备。', '当前可用设备列表：', '']

  if (physical.length > 0) {
    lines.push('📱 已连接的真机：')
    for (const name of physical) lines.push(`  - ${name}`)
    lines.push('')
  }
  if (running.size > 0) {
    lines.push('🖥️ 运行中的模拟器：')
    for (const name of running) lines.push(`  - ${name}`)
    lines.push('')
  }
  if (stoppedOnly.length > 0) {
    lines.push('💤 已安装但未运行的模拟器（选择后将自动启动）：')
    for (const name of stoppedOnly) lines.push(`  - ${name}`)
    lines.push('')
  }

  const example = physical[0] ?? [...running][0] ?? stoppedOnly[0]
  lines.push('请使用 hvd 参数指定设备名称，例如：')
  lines.push(`- hvd="${example || ''}"`)
  return lines.join('\n')
}

export function formatCommandResult(command, result) {
  const stdout = stripAnsi(String((result && result.stdout) || ''))
  const stderr = stripAnsi(String((result && result.stderr) || ''))
  const output = stdout && stderr ? `${stderr}${stdout}` : (stdout || stderr)
  return `$ ${command}\n${output}`.trimEnd()
}

const DISCOVERY_COMMANDS = new Set(['devecocli device list', 'devecocli emulator list'])

export function formatStartAppResults(results) {
  const appStarted = results.some(
    ({ command, result }) => String(command || '').startsWith('devecocli run ') && result && result.exitCode === 0,
  )
  if (appStarted) {
    return results
      .filter(({ command }) => !DISCOVERY_COMMANDS.has(command))
      .map(({ command, result }) => formatCommandResult(command, result))
      .join('\n\n')
  }

  const deviceList = results.find(({ command }) => command === 'devecocli device list')
  const emulatorList = results.find(({ command }) => command === 'devecocli emulator list')
  const others = results.filter(({ command }) => !DISCOVERY_COMMANDS.has(command))

  if (deviceList || emulatorList) {
    const prompt = formatDeviceSelectionPrompt(
      deviceList ? stripAnsi(deviceList.result.stdout + '\n' + deviceList.result.stderr) : '',
      emulatorList ? stripAnsi(emulatorList.result.stdout + '\n' + emulatorList.result.stderr) : '',
    )
    if (others.length === 0) return prompt
    return [prompt, ...others.map(({ command, result }) => formatCommandResult(command, result))].join('\n\n')
  }

  return results.map(({ command, result }) => formatCommandResult(command, result)).join('\n\n')
}
