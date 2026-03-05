/**
 * Performance Marks system for Chaterm main process.
 *
 * Inspired by VS Code's `vs/base/common/performance.ts`, this module provides
 * a lightweight, cross-process performance measurement infrastructure.
 *
 * Uses `Date.now()` for cross-process timeline alignment and
 * `performance.now()` for high-resolution duration calculation within a process.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { createLogger } from '@logging'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerfMark {
  /** Hierarchical mark name, e.g. "chaterm/main/appReady" */
  name: string
  /** High-resolution monotonic timestamp (ms) for intra-process duration */
  startTime: number
  /** Unix epoch timestamp (ms) for cross-process alignment */
  timestamp: number
}

export interface PerfTimeline {
  process: 'main' | 'renderer'
  marks: Array<{ name: string; offset: number; timestamp: number }>
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const _marks: PerfMark[] = []
let _rendererMarks: PerfMark[] = []

// Record the very first timestamp as early as possible
const _processStartTime = performance.now()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a performance mark at the current instant.
 */
export function mark(name: string): void {
  _marks.push({
    name,
    startTime: performance.now(),
    timestamp: Date.now()
  })
}

/**
 * Get all main process marks, sorted by time.
 */
export function getMarks(): PerfMark[] {
  return [..._marks].sort((a, b) => a.startTime - b.startTime)
}

/**
 * Measure duration between two named marks (ms).
 * Returns `null` if either mark is not found.
 */
export function measure(startMark: string, endMark: string): number | null {
  const start = _marks.find((m) => m.name === startMark)
  const end = _marks.find((m) => m.name === endMark)
  if (!start || !end) return null
  return end.startTime - start.startTime
}

/**
 * Build a timeline relative to the earliest mark.
 */
export function getStartupTimeline(): PerfTimeline {
  const sorted = getMarks()
  const origin = sorted.length > 0 ? sorted[0].startTime : _processStartTime

  return {
    process: 'main',
    marks: sorted.map((m) => ({
      name: m.name,
      offset: Math.round((m.startTime - origin) * 100) / 100,
      timestamp: m.timestamp
    }))
  }
}

const logger = createLogger('perf')

/**
 * Print the startup timeline via the unified logging system.
 */
export function logStartupTimeline(): void {
  const timeline = getStartupTimeline()
  if (timeline.marks.length === 0) return

  // Build main process timeline
  const lines: string[] = ['=== Main Process Startup Timeline ===']
  for (const entry of timeline.marks) {
    const offset = entry.offset.toFixed(1).padStart(9)
    lines.push(` +${offset}ms  ${entry.name}`)
  }

  // Append renderer marks if available
  if (_rendererMarks.length > 0) {
    lines.push('=== Renderer Process Marks ===')
    const rSorted = [..._rendererMarks].sort((a, b) => a.timestamp - b.timestamp)
    const rOrigin = rSorted[0].timestamp
    for (const rm of rSorted) {
      const offset = (rm.timestamp - rOrigin).toFixed(1).padStart(9)
      lines.push(` +${offset}ms  ${rm.name}`)
    }
  }

  // Append key durations
  const keyPairs: Array<[string, string, string]> = [
    ['chaterm/main/start', 'chaterm/main/appReady', 'App Ready'],
    ['chaterm/main/appReady', 'chaterm/main/didCreateWindow', 'Window Creation'],
    ['chaterm/main/willSetupIPC', 'chaterm/main/didSetupIPC', 'IPC Setup'],
    ['chaterm/main/willLoadPlugins', 'chaterm/main/didLoadPlugins', 'Plugin Loading'],
    ['chaterm/main/willCreateController', 'chaterm/main/didCreateController', 'Controller Init'],
    ['chaterm/main/start', 'chaterm/main/ready', 'Total Startup']
  ]

  lines.push('=== Key Durations ===')
  for (const [start, end, label] of keyPairs) {
    const duration = measure(start, end)
    if (duration !== null) {
      lines.push(` ${label.padEnd(24)} ${duration.toFixed(1)}ms`)
    }
  }

  logger.info(lines.join('\n'), { event: 'perf.startup.timeline' })
}

/**
 * Export all marks (main + renderer) as a JSON-serializable object.
 * Suitable for telemetry or CI comparison.
 */
export function exportMarksAsJson(): {
  main: PerfTimeline
  renderer: PerfTimeline | null
} {
  const main = getStartupTimeline()

  let renderer: PerfTimeline | null = null
  if (_rendererMarks.length > 0) {
    const sorted = [..._rendererMarks].sort((a, b) => a.timestamp - b.timestamp)
    const origin = sorted[0].timestamp
    renderer = {
      process: 'renderer',
      marks: sorted.map((m) => ({
        name: m.name,
        offset: Math.round((m.timestamp - origin) * 100) / 100,
        timestamp: m.timestamp
      }))
    }
  }

  return { main, renderer }
}

// ---------------------------------------------------------------------------
// IPC bridge for renderer marks
// ---------------------------------------------------------------------------

/**
 * Register IPC handlers to collect marks from the renderer process.
 * Call this once during startup after `app.whenReady()`.
 */
export function registerPerfIpcHandlers(): void {
  ipcMain.handle('perf:report-marks', (_event, marks: PerfMark[]) => {
    if (Array.isArray(marks)) {
      _rendererMarks = marks
    }
    return { success: true }
  })

  ipcMain.handle('perf:get-startup-timeline', () => {
    return exportMarksAsJson()
  })
}

/**
 * Request renderer to send its marks, then log the combined timeline.
 * Call after the renderer has fully loaded.
 */
export function collectAndLogTimeline(mainWindow: BrowserWindow): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  mainWindow.webContents.send('perf:collect-marks')

  // Give renderer a moment to respond, then log
  setTimeout(() => {
    logStartupTimeline()
  }, 500)
}

// Record the very first mark
mark('chaterm/main/start')
