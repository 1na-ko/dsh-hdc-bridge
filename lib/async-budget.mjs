// Shared time budget for a group of independent probes.
//
// The doctor runs several unrelated lookups (hdc discovery, Studio, SDK, CLI,
// device listing, target-version resolution). Each one is bounded, and the
// group stops starting new work once its budget is spent, so one hung
// toolchain marks that single item as timed out/skipped instead of blocking
// the whole call — the failure mode measured on a slow Windows host, where an
// unbounded hdc discovery pushed the outer call past its own timeout.
//
// Pure and timer-only: the regression suite drives it with tiny budgets.

const BudgetTimeout = class extends Error {
  constructor(label) {
    super('budget timeout: ' + label)
    this.name = 'BudgetTimeout'
    this.label = label
  }
}

export function createBudget(totalMs, now) {
  const clock = typeof now === 'function' ? now : () => Date.now()
  const total = Math.max(1, Number(totalMs) || 1)
  // Below this slice a probe cannot produce a meaningful answer, so it is
  // reported as skipped instead of being started and killed immediately.
  const MIN_PROBE_MS = 50
  const startedAt = clock()
  const timedOut = []
  const skipped = []

  const elapsed = () => clock() - startedAt
  const remaining = () => Math.max(0, total - elapsed())

  // Resolve with { status: 'ok', value } | { status: 'timeout' } |
  // { status: 'error', error } | { status: 'skipped', reason }. Never throws:
  // the caller folds the outcome into its own report.
  async function probe(label, fn, perProbeMs) {
    const left = remaining()
    if (left < MIN_PROBE_MS) {
      skipped.push(label)
      return { status: 'skipped', label, reason: 'budget exhausted' }
    }
    const limit = Math.max(MIN_PROBE_MS, Math.min(Number(perProbeMs) || left, left))
    let timer = null
    try {
      const value = await Promise.race([
        Promise.resolve().then(fn),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new BudgetTimeout(label)), limit)
          if (timer && typeof timer.unref === 'function') timer.unref()
        }),
      ])
      return { status: 'ok', label, value }
    } catch (error) {
      if (error && error.name === 'BudgetTimeout') {
        timedOut.push(label)
        return { status: 'timeout', label }
      }
      return { status: 'error', label, error: String((error && error.message) || error).slice(0, 200) }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return {
    totalMs: total,
    elapsed,
    remaining,
    exhausted: () => remaining() <= 0,
    probe,
    timedOutLabels: () => timedOut.slice(),
    skippedLabels: () => skipped.slice(),
    // Every label that did not produce a value, in the order it failed.
    problems: () => [...timedOut, ...skipped],
    partial: () => timedOut.length > 0 || skipped.length > 0,
  }
}
