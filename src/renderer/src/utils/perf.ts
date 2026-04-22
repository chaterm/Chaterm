/**
 * Performance Marks system for Chaterm renderer process.
 *
 * Mirror of the main process perf module, designed to capture renderer-side
 * startup and interaction timing. Marks are reported to the main process
 * via IPC for unified timeline analysis.
 */

// ---------------------------------------------------------------------------
// Types (duplicated to avoid cross-process import)
// ---------------------------------------------------------------------------

export interface PerfMark {
  name: string
  startTime: number
  timestamp: number
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const _marks: PerfMark[] = []

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a performance mark at the current instant.
 */
export function mark(name: string): void {
  const entry = {
    name,
    startTime: performance.now(),
    timestamp: Date.now()
  }
  _marks.push(entry)
}

/**
 * Get all renderer marks sorted by time.
 */
export function getMarks(): PerfMark[] {
  return [..._marks].sort((a, b) => a.startTime - b.startTime)
}

/**
 * Measure duration between two named marks (ms).
 */
export function measure(startMark: string, endMark: string): number | null {
  const start = _marks.find((m) => m.name === startMark)
  const end = _marks.find((m) => m.name === endMark)
  if (!start || !end) return null
  return end.startTime - start.startTime
}

/**
 * Report all renderer marks to the main process via IPC.
 */
export function reportMarksToMain(): void {
  const electronAPI = (window as any).electron
  if (!electronAPI?.ipcRenderer) return

  electronAPI.ipcRenderer.send('perf:report-marks-sync', _marks)
}

/**
 * Report marks via invoke (async, with confirmation).
 */
export async function reportMarksToMainAsync(): Promise<void> {
  try {
    const api = (window as any).api
    if (api?.reportPerfMarks) {
      await api.reportPerfMarks(_marks)
    }
  } catch {
    // Silently ignore if IPC not available
  }
}

/* eslint-disable no-console */

/**
 * Print renderer timeline to console (dev-only).
 * Uses console.log intentionally for developer tooling output.
 */
export function logRendererTimeline(): void {
  const sorted = getMarks()
  if (sorted.length === 0) return

  const origin = sorted[0].startTime
  console.log('[perf] === Renderer Process Startup Timeline ===')
  for (const entry of sorted) {
    const offset = (entry.startTime - origin).toFixed(1).padStart(9)
    console.log(`[perf]  +${offset}ms  ${entry.name}`)
  }

  // Log key durations
  const keyPairs: Array<[string, string, string]> = [
    ['chaterm/renderer/start', 'chaterm/renderer/didMountApp', 'App Mount'],
    ['chaterm/renderer/start', 'chaterm/renderer/interactive', 'Time to Interactive']
  ]

  console.log('[perf] === Key Durations ===')
  for (const [start, end, label] of keyPairs) {
    const duration = measure(start, end)
    if (duration !== null) {
      console.log(`[perf]  ${label.padEnd(24)} ${duration.toFixed(1)}ms`)
    }
  }
}

/* eslint-enable no-console */

/**
 * Setup IPC listener for main process mark collection requests.
 */
export function setupPerfIpcListener(): void {
  const electronAPI = (window as any).electron
  if (!electronAPI?.ipcRenderer) return

  electronAPI.ipcRenderer.on('perf:collect-marks', async () => {
    try {
      const api = (window as any).api
      if (api?.reportPerfMarks) {
        await api.reportPerfMarks(_marks)
      }
    } catch {
      // Silently ignore
    }
  })
}

// Record the very first renderer mark
mark('chaterm/renderer/start')
