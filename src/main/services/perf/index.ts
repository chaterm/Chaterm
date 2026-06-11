/**
 * Performance Marks system for Chaterm main process.
 *
 * Inspired by VS Code's `vs/base/common/performance.ts`, this module provides
 * a lightweight, cross-process performance measurement infrastructure.
 *
 * Uses `Date.now()` for cross-process timeline alignment and
 * `performance.now()` for high-resolution duration calculation within a process.
 */

import { app, ipcMain, type BrowserWindow } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import path from 'path'

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

export type PerfProcess = 'main' | 'preload' | 'renderer'

export interface PerfTimeline {
  process: PerfProcess
  marks: Array<{ name: string; offset: number; timestamp: number }>
}

type ExternalPerfProcess = Exclude<PerfProcess, 'main'>
type PerfReportPayload = PerfMark[] | { process?: ExternalPerfProcess; marks?: PerfMark[] }
type StartupDurationPair = { label: string; start: string; end: string; minMs?: number }
type StartupMilestone = { name: string; label: string }
type CollectTimelineOptions = { delayMs?: number }

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const _marks: PerfMark[] = []
let _rendererMarks: PerfMark[] = []
let _preloadMarks: PerfMark[] = []

// Record the very first timestamp as early as possible
const _processStartTime = performance.now()
const STARTUP_MARK_COLLECTION_DELAY_MS = 500
const STARTUP_LOG_DELAY_AFTER_COLLECTION_MS = 50
const STARTUP_LOG_FALLBACK_DELAY_MS = 10000
let startupTimelineCollectionTimer: ReturnType<typeof setTimeout> | null = null
let startupTimelineWriteTimer: ReturnType<typeof setTimeout> | null = null
let startupTimelineLogged = false

const STARTUP_MILESTONES: StartupMilestone[] = [
  { name: 'chaterm/main/start', label: 'Main process started' },
  { name: 'chaterm/main/appReady', label: 'Electron app ready' },
  { name: 'chaterm/main/didCreateBrowserWindow', label: 'BrowserWindow created' },
  { name: 'chaterm/main/didStartRendererLoad', label: 'Renderer load requested' },
  { name: 'chaterm/main/ready', label: 'Main bootstrap ready' },
  { name: 'chaterm/preload/didExposeBridge', label: 'Preload bridge ready' },
  { name: 'chaterm/renderer/start', label: 'Renderer JS started' },
  { name: 'chaterm/main/windowDomReady', label: 'Renderer DOM ready' },
  { name: 'chaterm/main/windowReadyToShow', label: 'Window ready to show' },
  { name: 'chaterm/main/didLoadRenderer', label: 'Renderer document loaded' },
  { name: 'chaterm/renderer/interactive', label: 'Renderer interactive' },
  { name: 'chaterm/renderer/didRouteAuth', label: 'Renderer route auth done' },
  { name: 'chaterm/renderer/didRequestMainWindowShow', label: 'Renderer requested window show' },
  { name: 'chaterm/main/didShowWindow', label: 'Window shown' },
  { name: 'chaterm/main/didInitUserDatabase', label: 'User database ready' }
]

const STARTUP_DURATIONS: StartupDurationPair[] = [
  { label: 'Electron app ready', start: 'chaterm/main/start', end: 'chaterm/main/appReady' },
  { label: 'Main bootstrap ready', start: 'chaterm/main/start', end: 'chaterm/main/ready' },
  { label: 'Preload bridge ready', start: 'chaterm/preload/start', end: 'chaterm/preload/didExposeBridge' },
  { label: 'Renderer JS start delay', start: 'chaterm/main/willLoadRenderer', end: 'chaterm/renderer/start' },
  { label: 'Renderer document load', start: 'chaterm/main/willLoadRenderer', end: 'chaterm/main/didLoadRenderer' },
  { label: 'Renderer interactive', start: 'chaterm/renderer/start', end: 'chaterm/renderer/interactive' },
  { label: 'First contentful paint', start: 'chaterm/renderer/start', end: 'chaterm/renderer/paint/firstContentfulPaint' },
  { label: 'Route auth', start: 'chaterm/renderer/willRouteAuth', end: 'chaterm/renderer/didRouteAuth' },
  { label: 'Renderer show request', start: 'chaterm/renderer/willRequestMainWindowShow', end: 'chaterm/renderer/didRequestMainWindowShow' },
  { label: 'Window show gate', start: 'chaterm/main/willShowWindow', end: 'chaterm/main/didShowWindow' },
  { label: 'Startup to user DB ready', start: 'chaterm/main/start', end: 'chaterm/main/didInitUserDatabase' }
]

const MAIN_BOOTSTRAP_DURATIONS: StartupDurationPair[] = [
  { label: 'Main module import gap', start: 'chaterm/main/start', end: 'chaterm/main/willInitUserDataPath', minMs: 1 },
  { label: 'Post-appReady setup gap', start: 'chaterm/main/appReady', end: 'chaterm/main/willSetupIPC', minMs: 1 },
  { label: 'BrowserWindow constructor', start: 'chaterm/main/willCreateBrowserWindow', end: 'chaterm/main/didCreateBrowserWindow', minMs: 1 },
  { label: 'Renderer load dispatch', start: 'chaterm/main/willLoadRenderer', end: 'chaterm/main/didStartRendererLoad', minMs: 1 },
  { label: 'Initial plugin load', start: 'chaterm/main/willLoadPlugins', end: 'chaterm/main/didLoadPlugins', minMs: 1 },
  { label: 'Security config load', start: 'chaterm/main/willLoadSecurityConfig', end: 'chaterm/main/didLoadSecurityConfig', minMs: 1 },
  { label: 'App ready to main ready', start: 'chaterm/main/appReady', end: 'chaterm/main/ready', minMs: 1 }
]

const USER_DATABASE_DURATIONS: StartupDurationPair[] = [
  { label: 'Resolve startup user', start: 'chaterm/main/willResolveStartupUser', end: 'chaterm/main/didResolveStartupUser', minMs: 1 },
  { label: 'Open Chaterm database', start: 'chaterm/main/willInitChatermDatabase', end: 'chaterm/main/didInitChatermDatabase', minMs: 1 },
  {
    label: 'Open autocomplete database',
    start: 'chaterm/main/willInitAutocompleteDatabase',
    end: 'chaterm/main/didInitAutocompleteDatabase',
    minMs: 1
  },
  { label: 'Load user theme', start: 'chaterm/main/willLoadUserTheme', end: 'chaterm/main/didLoadUserTheme', minMs: 1 },
  { label: 'Set auth info', start: 'chaterm/main/willSetAuthInfo', end: 'chaterm/main/didSetAuthInfo', minMs: 1 },
  { label: 'Reload skill states', start: 'chaterm/main/willReloadSkillStates', end: 'chaterm/main/didReloadSkillStates', minMs: 1 },
  {
    label: 'Bootstrap preinstalled plugins',
    start: 'chaterm/main/willBootstrapPreinstalledPlugins',
    end: 'chaterm/main/didBootstrapPreinstalledPlugins',
    minMs: 1
  },
  { label: 'Reload user plugins', start: 'chaterm/main/willReloadUserPlugins', end: 'chaterm/main/didReloadUserPlugins', minMs: 1 },
  { label: 'Init KB search', start: 'chaterm/main/willInitKbSearch', end: 'chaterm/main/didInitKbSearch', minMs: 1 },
  { label: 'Total user database init', start: 'chaterm/main/willInitUserDatabase', end: 'chaterm/main/didInitUserDatabase', minMs: 1 }
]

const RENDERER_ROUTE_DURATIONS: StartupDurationPair[] = [
  { label: 'Renderer DB IPC roundtrip', start: 'chaterm/renderer/willInitUserDatabase', end: 'chaterm/renderer/didInitUserDatabase', minMs: 1 },
  { label: 'Verify token', start: 'chaterm/renderer/willVerifyToken', end: 'chaterm/renderer/didVerifyToken', minMs: 1 },
  { label: 'Load home route chunk', start: 'chaterm/renderer/willLoadHomeRoute', end: 'chaterm/renderer/didLoadHomeRoute', minMs: 1 },
  { label: 'Load default layout', start: 'chaterm/renderer/willLoadDefaultLayout', end: 'chaterm/renderer/didLoadDefaultLayout', minMs: 1 }
]

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

function isValidPerfMark(mark: unknown): mark is PerfMark {
  if (!mark || typeof mark !== 'object') return false
  const candidate = mark as PerfMark
  return (
    typeof candidate.name === 'string' && candidate.name.length > 0 && Number.isFinite(candidate.startTime) && Number.isFinite(candidate.timestamp)
  )
}

function sanitizeMarks(marks: PerfMark[]): PerfMark[] {
  return marks.filter(isValidPerfMark).sort((a, b) => a.startTime - b.startTime)
}

function buildExternalTimeline(process: ExternalPerfProcess, marks: PerfMark[]): PerfTimeline | null {
  if (marks.length === 0) return null

  const sorted = [...marks].sort((a, b) => a.timestamp - b.timestamp)
  const origin = sorted[0].timestamp
  return {
    process,
    marks: sorted.map((m) => ({
      name: m.name,
      offset: Math.round((m.timestamp - origin) * 100) / 100,
      timestamp: m.timestamp
    }))
  }
}

function setExternalMarks(process: ExternalPerfProcess, marks: PerfMark[]): void {
  if (process === 'preload') {
    _preloadMarks = sanitizeMarks(marks)
    return
  }
  _rendererMarks = sanitizeMarks(marks)
}

function findMark(name: string): (PerfMark & { process: PerfProcess }) | null {
  const allMarks: Array<PerfMark & { process: PerfProcess }> = [
    ..._marks.map((m) => ({ ...m, process: 'main' as const })),
    ..._preloadMarks.map((m) => ({ ...m, process: 'preload' as const })),
    ..._rendererMarks.map((m) => ({ ...m, process: 'renderer' as const }))
  ]

  return allMarks.find((m) => m.name === name) ?? null
}

function measureStartupPair(startMark: string, endMark: string): number | null {
  const start = findMark(startMark)
  const end = findMark(endMark)
  if (!start || !end) return null

  const duration = start.process === end.process ? end.startTime - start.startTime : end.timestamp - start.timestamp
  return duration >= 0 ? duration : null
}

function appendMilestones(lines: string[]): void {
  const origin = findMark('chaterm/main/start') ?? STARTUP_MILESTONES.map((m) => findMark(m.name)).find(Boolean)
  if (!origin) return

  const entries = STARTUP_MILESTONES.map((milestone) => {
    const mark = findMark(milestone.name)
    if (!mark) return null
    return {
      ...milestone,
      process: mark.process,
      timestamp: mark.timestamp,
      offset: mark.timestamp - origin.timestamp
    }
  })
    .filter((entry): entry is StartupMilestone & { process: PerfProcess; timestamp: number; offset: number } => entry !== null)
    .sort((a, b) => a.timestamp - b.timestamp)

  if (entries.length === 0) return

  lines.push('=== Startup Milestones ===')
  for (const entry of entries) {
    const offset = entry.offset.toFixed(1).padStart(9)
    lines.push(` +${offset}ms  [${entry.process.padEnd(8)}] ${entry.label}`)
  }
}

function appendDurationSection(lines: string[], title: string, pairs: StartupDurationPair[]): void {
  const rows = pairs
    .map((pair) => {
      const duration = measureStartupPair(pair.start, pair.end)
      if (duration === null || duration < (pair.minMs ?? 0)) return null
      return { label: pair.label, duration }
    })
    .filter((row): row is { label: string; duration: number } => row !== null)

  if (rows.length === 0) return

  lines.push(`=== ${title} ===`)
  for (const row of rows) {
    lines.push(` ${row.label.padEnd(30)} ${row.duration.toFixed(1)}ms`)
  }
}

/**
 * Build the startup timeline report.
 */
export function buildStartupTimelineReport(): string | null {
  const timeline = getStartupTimeline()
  if (timeline.marks.length === 0) return null

  const lines: string[] = []
  appendMilestones(lines)
  appendDurationSection(lines, 'Startup Durations', STARTUP_DURATIONS)
  appendDurationSection(lines, 'Main Bootstrap Details', MAIN_BOOTSTRAP_DURATIONS)
  appendDurationSection(lines, 'User Database Details', USER_DATABASE_DURATIONS)
  appendDurationSection(lines, 'Renderer Route Details', RENDERER_ROUTE_DURATIONS)

  return lines.join('\n')
}

export function getStartupLogPath(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return path.join(app.getPath('userData'), 'logs', `chaterm_startup_${yyyy}-${mm}-${dd}.log`)
}

/**
 * Write the startup timeline to a dedicated startup log file.
 *
 * Startup timelines can be long, so they intentionally bypass the unified
 * application logger to avoid mixing with regular logs or sanitizer truncation.
 */
export async function writeStartupTimeline(): Promise<string | null> {
  const report = buildStartupTimelineReport()
  if (!report) return null

  const logPath = getStartupLogPath()
  await mkdir(path.dirname(logPath), { recursive: true })
  await appendFile(logPath, `[${new Date().toISOString()}]\n${report}\n\n`, 'utf8')
  return logPath
}

export function logStartupTimeline(): void {
  void writeStartupTimeline().catch(() => undefined)
}

function clearStartupTimelineTimers(): void {
  if (startupTimelineCollectionTimer) {
    clearTimeout(startupTimelineCollectionTimer)
    startupTimelineCollectionTimer = null
  }
  if (startupTimelineWriteTimer) {
    clearTimeout(startupTimelineWriteTimer)
    startupTimelineWriteTimer = null
  }
}

/**
 * Export all marks (main + renderer) as a JSON-serializable object.
 * Suitable for telemetry or CI comparison.
 */
export function exportMarksAsJson(): {
  main: PerfTimeline
  preload: PerfTimeline | null
  renderer: PerfTimeline | null
} {
  const main = getStartupTimeline()

  const preload = buildExternalTimeline('preload', _preloadMarks)
  const renderer = buildExternalTimeline('renderer', _rendererMarks)

  return { main, preload, renderer }
}

// ---------------------------------------------------------------------------
// IPC bridge for renderer marks
// ---------------------------------------------------------------------------

/**
 * Register IPC handlers to collect marks from the renderer process.
 * Call this once during startup after `app.whenReady()`.
 */
export function registerPerfIpcHandlers(): void {
  ipcMain.handle('perf:report-marks', (_event, payload: PerfReportPayload) => {
    if (Array.isArray(payload)) {
      setExternalMarks('renderer', payload)
      return { success: true }
    }

    if (payload && typeof payload === 'object') {
      const process = payload.process === 'preload' ? 'preload' : 'renderer'
      if (Array.isArray(payload.marks)) {
        setExternalMarks(process, payload.marks)
      }
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
export function collectAndLogTimeline(mainWindow: BrowserWindow, options: CollectTimelineOptions = {}): void {
  if (!mainWindow || mainWindow.isDestroyed() || startupTimelineLogged) return

  clearStartupTimelineTimers()
  startupTimelineCollectionTimer = setTimeout(() => {
    startupTimelineCollectionTimer = null
    if (!mainWindow || mainWindow.isDestroyed() || startupTimelineLogged) return

    mainWindow.webContents.send('perf:collect-marks')
    startupTimelineWriteTimer = setTimeout(() => {
      startupTimelineWriteTimer = null
      if (startupTimelineLogged) return
      startupTimelineLogged = true
      logStartupTimeline()
    }, STARTUP_LOG_DELAY_AFTER_COLLECTION_MS)
  }, options.delayMs ?? STARTUP_MARK_COLLECTION_DELAY_MS)
}

export function scheduleStartupTimelineFallback(mainWindow: BrowserWindow): void {
  collectAndLogTimeline(mainWindow, { delayMs: STARTUP_LOG_FALLBACK_DELAY_MS })
}

// Record the very first mark
mark('chaterm/main/start')
