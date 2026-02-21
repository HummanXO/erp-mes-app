/**
 * Critical refresh helper.
 *
 * Invariants:
 * 1) every critical refresh call must provide a non-empty reason;
 * 2) refresh function must return a Promise-like object.
 */
export async function awaitCriticalRefresh(
  refreshData: () => Promise<void>,
  reason: string
): Promise<void> {
  const normalizedReason = reason.trim()
  if (!normalizedReason) {
    throw new Error("Invariant violation: critical refresh reason is required")
  }

  const maybePromise = refreshData()
  if (!maybePromise || typeof (maybePromise as Promise<void>).then !== "function") {
    throw new Error(`Invariant violation: refreshData must return a Promise for critical refresh (${normalizedReason})`)
  }

  await maybePromise
}
