#!/usr/bin/env node
/**
 * arkts-check.cjs — ArkTS strict-mode standalone checker, bundled by
 * dsh-hdc-bridge for the `arkts_check` tool (see THIRD_PARTY_NOTICES.md).
 * Source: https://gitcode.com/openharmony-sig/deveco-code
 *         (packages/opencode/src/tool/arkts-check.cjs)
 * Copyright (c) 2026 Huawei Device Co., Ltd. — Apache-2.0.
 * Copied unmodified except for this provenance header. Executed at runtime
 * with the local DevEco Studio bundled node (tools/node/node.exe).
 */
'use strict';

const path = require('path');
const fs = require('fs');

// --- Argument parsing ---

function parseArgs(argv) {
  const args = { project: '', devecoHome: '', files: [] };
  let i = 2;
  while (i < argv.length) {
    if (argv[i] === '--project' && argv[i + 1]) {
      args.project = path.resolve(argv[++i]);
    } else if (argv[i] === '--deveco-home' && argv[i + 1]) {
      args.devecoHome = path.resolve(argv[++i]);
    } else if (argv[i] === '--files') {
      i++;
      while (i < argv.length && !argv[i].startsWith('--')) {
        args.files.push(argv[i++]);
      }
      continue;
    } else if (!argv[i].startsWith('--')) {
      args.files.push(argv[i]);
    }
    i++;
  }
  return args;
}

// --- DevEco SDK detection ---

function findEtsLoader(devecoHome) {
  const candidates = [
    path.join(devecoHome, 'sdk', 'default', 'openharmony', 'ets', 'build-tools', 'ets-loader'),
    path.join(devecoHome, 'sdk', 'openharmony', 'ets', 'build-tools', 'ets-loader'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'lib', 'ets_checker.js'))) return c;
  }
  return null;
}

// --- Collect .ets files from project ---

function collectEtsFiles(projectPath) {
  const results = [];
  const srcDir = path.join(projectPath, 'entry', 'src', 'main', 'ets');
  if (!fs.existsSync(srcDir)) return results;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'oh_modules' || entry.name === 'build') continue;
        walk(full);
      } else if (entry.name.endsWith('.ets') && !entry.name.endsWith('.d.ets')) {
        results.push(full);
      }
    }
  }
  walk(srcDir);
  return results;
}

// --- Diagnostic output capture ---

function parseDiagnosticLine(line) {
  const errorMatch = line.match(/ArkTS:(ERROR|WARN)\s+File:\s+(.+?):(\d+):(\d+)/);
  if (errorMatch) {
    return { severity: errorMatch[1].toLowerCase(), file: errorMatch[2], line: parseInt(errorMatch[3]), column: parseInt(errorMatch[4]) };
  }
  return null;
}

function parseMessageLine(line) {
  const trimmed = line.trim();
  const ruleMatch = trimmed.match(/^(.+?)\s*\(([a-z][\w-]+)\)\s*$/);
  if (ruleMatch) {
    return { message: ruleMatch[1].trim(), rule: ruleMatch[2] };
  }
  return { message: trimmed, rule: '' };
}

// --- Project-level validation (A-class checks) ---

function loadSystemResourceNames(devecoHome) {
  const candidates = [
    path.join(devecoHome, 'sdk', 'default', 'openharmony', 'previewer', 'common', 'resources', 'entry', 'resources.txt'),
    path.join(devecoHome, 'sdk', 'openharmony', 'previewer', 'common', 'resources', 'entry', 'resources.txt'),
  ];
  let resFile = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) { resFile = c; break; }
  }
  if (!resFile) return null;

  const names = new Set();
  const content = fs.readFileSync(resFile, 'utf-8');
  const linePattern = /^id:\d+,\s*'[^']*'\s+'([^']+)'/;
  for (const line of content.split('\n')) {
    const m = line.match(linePattern);
    if (m) names.add(m[1]);
  }
  return names;
}

function validateSystemResources(files, devecoHome, projectPath) {
  const validNames = loadSystemResourceNames(devecoHome);
  if (!validNames) return [];

  const diagnostics = [];
  const refPattern = /\$r\(\s*['"]sys\.(media|symbol)\.([^'"]+)['"]\s*\)/g;

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileLines = content.split('\n');
    for (let i = 0; i < fileLines.length; i++) {
      let match;
      refPattern.lastIndex = 0;
      while ((match = refPattern.exec(fileLines[i])) !== null) {
        const resName = match[2];
        if (!validNames.has(resName)) {
          diagnostics.push({
            file: path.relative(projectPath, filePath),
            line: i + 1,
            column: match.index + 1,
            severity: 'error',
            message: `Unknown resource name '${resName}'. No matching sys.${match[1]} resource found in SDK.`,
            rule: 'resource-name-check',
          });
        }
      }
    }
  }
  return diagnostics;
}

function validateRouterPages(projectPath) {
  const candidates = [
    path.join(projectPath, 'entry', 'src', 'main', 'resources', 'base', 'profile', 'main_pages.json'),
    path.join(projectPath, 'src', 'main', 'resources', 'base', 'profile', 'main_pages.json'),
  ];
  let mainPagesPath = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) { mainPagesPath = c; break; }
  }
  if (!mainPagesPath) return [];

  let config;
  try {
    config = JSON.parse(fs.readFileSync(mainPagesPath, 'utf-8'));
  } catch { return []; }

  const pages = config.src || [];
  const diagnostics = [];
  const etsBase = path.join(projectPath, 'entry', 'src', 'main', 'ets');

  for (let i = 0; i < pages.length; i++) {
    const pagePath = pages[i];
    const etsFile = path.join(etsBase, pagePath + '.ets');
    if (!fs.existsSync(etsFile)) {
      diagnostics.push({
        file: path.relative(projectPath, mainPagesPath),
        line: i + 2,
        column: 1,
        severity: 'error',
        message: `Page '${pagePath}.ets' does not exist. Registered in main_pages.json but file not found at entry/src/main/ets/${pagePath}.ets`,
        rule: 'page-file-exists',
      });
    }
  }
  return diagnostics;
}

function validateModelVersion(projectPath) {
  const hvigorPath = path.join(projectPath, 'hvigor', 'hvigor-config.json5');
  const ohPkgPath = path.join(projectPath, 'oh-package.json5');
  if (!fs.existsSync(hvigorPath) || !fs.existsSync(ohPkgPath)) return [];

  const extractVersion = (file) => {
    const content = fs.readFileSync(file, 'utf-8');
    const m = content.match(/["']?modelVersion["']?\s*:\s*["']([^"']+)["']/);
    return m ? m[1] : null;
  };

  const hvigorVer = extractVersion(hvigorPath);
  const ohPkgVer = extractVersion(ohPkgPath);

  if (hvigorVer && ohPkgVer && hvigorVer !== ohPkgVer) {
    return [{
      file: 'hvigor/hvigor-config.json5',
      line: 1,
      column: 1,
      severity: 'error',
      message: `modelVersion mismatch: hvigor-config.json5 has '${hvigorVer}' but oh-package.json5 has '${ohPkgVer}'. They must be consistent.`,
      rule: 'model-version-consistency',
    }];
  }
  return [];
}

// --- ArkUI binding-syntax false-positive whitelist ---
//
// The standalone type checker (etsStandaloneChecker) does not expand ArkUI
// syntax sugar, so it treats binding-syntax tokens as ordinary identifiers and
// wrongly reports `Cannot find name '$...'`. Two legal forms trigger this:
//   A) `$$this.x` two-way binding (e.g. bindSheet($$this.foo), Refresh({ refreshing: $$this.bar }))
//   B) `$varName` @Link / @Builder argument passing (e.g. Child({ items: $items }))
// build_project (the real compiler) accepts both. We silently drop these
// false positives here. Rule B only fires when `varName` is actually declared
// as a state-decorated field in the same source file, so genuinely-undefined
// `$foo` references are still reported.

const STATE_DECORATORS = [
  'State', 'Link', 'Prop', 'ObjectLink', 'Local', 'Param', 'Provide', 'Consume',
  'StorageLink', 'StorageProp', 'LocalStorageLink', 'LocalStorageProp',
];

// Cache: absolute source path -> Set of state-decorated field names declared in it.
const stateFieldCache = new Map();

function getStateFields(absPath) {
  if (stateFieldCache.has(absPath)) return stateFieldCache.get(absPath);
  const fields = new Set();
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const decoRe = new RegExp(
      '@(?:' + STATE_DECORATORS.join('|') + ')(?:\\([^)]*\\))?\\s+([A-Za-z_$][\\w$]*)',
      'g',
    );
    let m;
    while ((m = decoRe.exec(content)) !== null) {
      fields.add(m[1]);
    }
  } catch {
    // unreadable file -> empty set (conservative: rule B won't match)
  }
  stateFieldCache.set(absPath, fields);
  return fields;
}

// Returns true if the diagnostic is a binding-syntax false positive that should
// be dropped. Any parse/IO issue returns false (keep the diagnostic).
function isBindingSyntaxFalsePositive(diag, projectPath) {
  try {
    const m = /^Cannot find name '(\$[^']+)'/.exec(diag.message || '');
    if (!m) return false;
    const name = m[1];

    // Rule A: `$$...` is always ArkUI two-way binding sugar, never a plain identifier.
    if (name.startsWith('$$')) return true;

    // Rule B: `$word` -> confirm `word` is a state-decorated field in the same file.
    const bare = /^\$([A-Za-z_][\w$]*)$/.exec(name);
    if (!bare) return false;
    const fieldName = bare[1];

    const absPath = path.isAbsolute(diag.file)
      ? diag.file
      : path.resolve(projectPath, diag.file);
    return getStateFields(absPath).has(fieldName);
  } catch {
    return false;
  }
}

// --- Main ---

function main() {
  const args = parseArgs(process.argv);

  if (!args.project) {
    process.stdout.write(JSON.stringify({ success: false, error: 'Missing --project argument', errors: [], summary: { errorCount: 0, warnCount: 0 } }));
    process.exit(1);
  }

  if (!fs.existsSync(args.project)) {
    process.stdout.write(JSON.stringify({ success: false, error: `Project path not found: ${args.project}`, errors: [], summary: { errorCount: 0, warnCount: 0 } }));
    process.exit(1);
  }

  if (!args.devecoHome) {
    process.stdout.write(JSON.stringify({ success: false, error: 'Missing --deveco-home argument', errors: [], summary: { errorCount: 0, warnCount: 0 } }));
    process.exit(1);
  }
  const devecoHome = args.devecoHome;

  const etsLoaderPath = findEtsLoader(devecoHome);
  if (!etsLoaderPath) {
    process.stdout.write(JSON.stringify({ success: false, error: `Cannot find ets-loader in DevEco SDK at: ${devecoHome}`, errors: [], summary: { errorCount: 0, warnCount: 0 } }));
    process.exit(1);
  }
  let files = args.files.map(f => path.isAbsolute(f) ? f : path.resolve(args.project, f));
  if (files.length === 0) {
    files = collectEtsFiles(args.project);
  }

  if (files.length === 0) {
    process.stdout.write(JSON.stringify({ success: true, errors: [], summary: { errorCount: 0, warnCount: 0 } }));
    process.exit(0);
  }

  const fileMap = {};
  files.forEach((f, i) => { fileMap[`file_${i}`] = f; });

  const moduleJsonCandidates = [
    path.join(args.project, 'entry', 'src', 'main', 'module.json5'),
    path.join(args.project, 'src', 'main', 'module.json5'),
    path.join(args.project, 'entry', 'module.json5'),
  ];
  let aceModuleJsonPath = '';
  for (const candidate of moduleJsonCandidates) {
    if (fs.existsSync(candidate)) {
      aceModuleJsonPath = candidate;
      break;
    }
  }

  const captured = [];
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const capture = (...args) => { captured.push(args.map(String).join(' ')); };
  console.log = capture;
  console.error = capture;
  console.warn = capture;

  // Set externalApiPaths so main.js discovers HMS SDK modules (@hms.*, @kit.*)
  const hmsSdkEts = path.join(devecoHome, 'sdk', 'default', 'hms', 'ets');
  if (fs.existsSync(hmsSdkEts)) {
    const existing = process.env.externalApiPaths || '';
    process.env.externalApiPaths = existing
      ? existing + path.delimiter + hmsSdkEts
      : hmsSdkEts;
  }

  try {
    const etsChecker = require(path.join(etsLoaderPath, 'lib', 'ets_checker.js'));
    const mainModule = require(path.join(etsLoaderPath, 'main.js'));

    Object.assign(mainModule.partialUpdateConfig, {
      executeArkTSLinter: true,
      standardArkTSLinter: true,
    });

    process.env.compileMode = 'moduleJson';

    const projectConfig = {
      projectPath: args.project,
      projectRootPath: args.project,
      modulePath: args.project,
      cachePath: path.join(args.project, '.cache', 'arkts-check'),
      aceModuleJsonPath: aceModuleJsonPath,
      compileMode: 'esmodule',
      etsLoaderPath: etsLoaderPath,
      packageManagerType: 'ohpm',
      packageDir: 'oh_modules',
      runtimeOS: 'OpenHarmony',
      sdkInfo: '5.0.0',
      compatibleSdkVersion: 12,
      bundleType: '',
      compilerTypes: [],
      resolveModulePaths: [],
    };

    const cacheDir = projectConfig.cachePath;
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const logger = {
      debug: capture,
      info: capture,
      warn: capture,
      error: capture,
    };

    etsChecker.etsStandaloneChecker(fileMap, logger, projectConfig);
  } catch (e) {
    captured.push(`Internal error: ${e.message}`);
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  }

  const diagnostics = [];
  let current = null;

  const lines = captured.flatMap(entry => entry.split('\n'));

  for (const line of lines) {
    const clean = line.replace(/\x1b\[\d+m/g, '').replace(/\[(\d+)m/g, '');
    const loc = parseDiagnosticLine(clean);
    if (loc) {
      current = loc;
      continue;
    }
    if (current && clean.trim() && !clean.includes('ArkTS:') && !clean.includes('For details about')) {
      const { message, rule } = parseMessageLine(clean);
      diagnostics.push({
        file: path.relative(args.project, current.file),
        line: current.line,
        column: current.column,
        severity: current.severity === 'error' ? 'error' : 'warning',
        message,
        rule,
      });
      current = null;
    }
  }

  // A-class project-level checks
  const extraDiags = [
    ...validateSystemResources(files, devecoHome, args.project),
    ...validateRouterPages(args.project),
    ...validateModelVersion(args.project),
  ];
  diagnostics.push(...extraDiags);

  const isStageProject = aceModuleJsonPath !== '';
  const filtered = diagnostics.filter(d => {
    if (isStageProject && d.message.includes('the current Mode is FA')) return false;
    if (isBindingSyntaxFalsePositive(d, args.project)) return false;
    return true;
  });

  const errorCount = filtered.filter(d => d.severity === 'error').length;
  const warnCount = filtered.filter(d => d.severity === 'warning').length;

  const result = {
    success: errorCount === 0,
    errors: filtered,
    summary: { errorCount, warnCount },
  };

  process.stdout.write(JSON.stringify(result, null, 2));
  process.exit(errorCount > 0 ? 1 : 0);
}

// Exported for unit testing the whitelist logic without a DevEco SDK.
module.exports = { isBindingSyntaxFalsePositive, getStateFields, stateFieldCache };

// Run as a CLI only when invoked directly (node arkts-check.cjs ...), not when required by tests.
if (require.main === module) {
  main();
}
