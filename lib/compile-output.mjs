// Build-log formatting for build_project: ANSI stripping, per-stream
// truncation to the last N lines, and an exitCode-derived status line that is
// always appended after truncation so evaluators scanning the tail are not
// fooled by stderr warning floods.
// Plain-JS port of the DevEco Code tool helper:
//   gitcode.com/openharmony-sig/deveco-code
//   packages/opencode/src/tool/lib/build-project-output.ts
// Copyright (c) 2026 Huawei Device Co., Ltd. — Apache-2.0 (see notices.json).

export const MAX_OUTPUT_LINES = 50
export const TRUNCATE_NOTICE = '--- The log is too long, only the last 50 lines are kept ---'

// Zero-dependency ANSI escape stripper (covers CSI/OSC sequences).
const ANSI_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_RE, '')
}

function splitLines(text) {
  if (!text) return []
  return String(text).split(/\r?\n/)
}

function takeLastLines(lines, max) {
  if (max <= 0 || lines.length === 0) return { lines: [], truncated: false }
  if (lines.length <= max) return { lines, truncated: false }
  return { lines: lines.slice(-max), truncated: true }
}

export function truncateOutput(text) {
  const lines = splitLines(text)
  if (lines.length <= MAX_OUTPUT_LINES) return { text, truncated: false, preview: text }
  const preview = lines.slice(-MAX_OUTPUT_LINES).join('\n')
  return { text: `${TRUNCATE_NOTICE}\n${preview}`, truncated: true, preview }
}

/** Concatenate streams as stdout then stderr (no section labels). */
export function formatStdoutStderr(stdout, stderr) {
  const out = stripAnsi(stdout)
  const err = stripAnsi(stderr)
  if (out && err) return `${out}${err}`
  return out || err
}

/**
 * Status line derived from exitCode. Always appended after truncation so
 * evaluators that scan the last N lines for "Build completed successfully"
 * are not fooled by stderr warning floods.
 */
export function formatBuildStatusLine(exitCode) {
  return exitCode === 0
    ? `Build completed successfully (exitCode=${exitCode})`
    : `BUILD FAILED (exitCode=${exitCode})`
}

/**
 * Format build logs for the model. Truncates stdout and stderr separately so a
 * long stderr warning tail cannot push "Build completed successfully" out of
 * the last-N-lines window, then always appends an exitCode-based status line.
 */
export function formatBuildProjectOutput(opts) {
  const maxLines = opts.maxLines ?? MAX_OUTPUT_LINES
  const out = stripAnsi(opts.stdout)
  const err = stripAnsi(opts.stderr)
  const fullBody = formatStdoutStderr(opts.stdout, opts.stderr)
  const status = formatBuildStatusLine(opts.exitCode)
  const full = fullBody ? `${fullBody}\n${status}` : status

  const outLines = splitLines(out)
  const errLines = splitLines(err)
  const total = outLines.length + errLines.length

  let outBudget
  let errBudget
  if (outLines.length === 0) {
    outBudget = 0
    errBudget = maxLines
  } else if (errLines.length === 0) {
    outBudget = maxLines
    errBudget = 0
  } else if (total <= maxLines) {
    outBudget = outLines.length
    errBudget = errLines.length
  } else {
    outBudget = Math.ceil(maxLines / 2)
    errBudget = Math.floor(maxLines / 2)
    if (outLines.length < outBudget) {
      errBudget = maxLines - outLines.length
      outBudget = outLines.length
    } else if (errLines.length < errBudget) {
      outBudget = maxLines - errLines.length
      errBudget = errLines.length
    }
  }

  const outCut = takeLastLines(outLines, outBudget)
  const errCut = takeLastLines(errLines, errBudget)
  const truncated = total > maxLines || outCut.truncated || errCut.truncated

  const previewBody = `${outCut.lines.join('\n')}${errCut.lines.join('\n')}`
  const preview = previewBody ? `${previewBody}\n${status}` : status
  const text = truncated ? `${TRUNCATE_NOTICE}\n${preview}` : preview

  return { text, truncated, preview, full }
}
