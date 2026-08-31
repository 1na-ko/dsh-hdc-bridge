// Session-scoped HarmonyOS project root for the compile-assistance tools
// (switch_cwd stores it; build_project / start_app / arkts_check / hdc_log
// resolve it). In-process Map keyed by session id, mirroring the DevEco Code
// session-cwd helper:
//   gitcode.com/openharmony-sig/deveco-code
//   packages/opencode/src/tool/lib/session-cwd.ts
//   packages/opencode/src/tool/switch-cwd.ts
// Copyright (c) 2026 Huawei Device Co., Ltd. — Apache-2.0 (see notices.json).

import { statSync } from 'node:fs'
import { join } from 'node:path'

const sessionCwd = new Map()

export function setSessionCwd(sessionID, cwd) {
  const id = String(sessionID || '').trim()
  const dir = String(cwd || '').trim()
  if (!id || !dir) return
  sessionCwd.set(id, dir)
}

export function getSessionCwd(sessionID) {
  if (!sessionID) return undefined
  return sessionCwd.get(sessionID)
}

export function clearSessionCwd(sessionID) {
  if (!sessionID) {
    sessionCwd.clear()
    return
  }
  sessionCwd.delete(sessionID)
}

/**
 * Stage app root, or project root with hvigor OHPM metadata (not a submodule
 * folder).
 */
export function isHarmonyApplicationRoot(dir) {
  const isFile = (file) => {
    try {
      return statSync(file).isFile()
    } catch {
      return false
    }
  }
  if (isFile(join(dir, 'AppScope', 'app.json5'))) return true
  if (!isFile(join(dir, 'build-profile.json5'))) return false
  return isFile(join(dir, 'oh-package.json5')) || isFile(join(dir, 'oh-package.json'))
}
