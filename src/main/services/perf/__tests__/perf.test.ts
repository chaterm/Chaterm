import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { ipcMainMock, loggerMock } = vi.hoisted(() => ({
  ipcMainMock: { handle: vi.fn() },
  loggerMock: { info: vi.fn() }
}))

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
  BrowserWindow: {}
}))

vi.mock('@logging', () => ({
  createLogger: vi.fn(() => loggerMock)
}))

import {
  mark,
  getMarks,
  measure,
  getStartupTimeline,
  logStartupTimeline,
  exportMarksAsJson,
  registerPerfIpcHandlers,
  collectAndLogTimeline,
  type PerfMark
} from '../index'

describe('perf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getMarks', () => {
    it('returns an array sorted by startTime', () => {
      const result = getMarks()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(1)
      for (let i = 1; i < result.length; i++) {
        expect(result[i].startTime).toBeGreaterThanOrEqual(result[i - 1].startTime)
      }
    })

    it('returns a copy so that first mark has name chaterm/main/start', () => {
      const result = getMarks()
      const first = result.find((m) => m.name === 'chaterm/main/start')
      expect(first).toBeDefined()
      expect(first).toMatchObject({
        name: 'chaterm/main/start',
        startTime: expect.any(Number),
        timestamp: expect.any(Number)
      })
    })

    it('includes new marks after mark() is called', () => {
      const before = getMarks().length
      mark('perf-test/extra')
      const after = getMarks().length
      expect(after).toBe(before + 1)
      expect(getMarks().some((m) => m.name === 'perf-test/extra')).toBe(true)
    })
  })

  describe('measure', () => {
    it('returns null when start mark does not exist', () => {
      expect(measure('non-existent-start', 'chaterm/main/start')).toBe(null)
    })

    it('returns null when end mark does not exist', () => {
      expect(measure('chaterm/main/start', 'non-existent-end')).toBe(null)
    })

    it('returns null when both marks do not exist', () => {
      expect(measure('no-a', 'no-b')).toBe(null)
    })

    it('returns a non-negative duration (ms) when both marks exist', () => {
      mark('perf-test/end')
      const duration = measure('chaterm/main/start', 'perf-test/end')
      expect(duration).not.toBe(null)
      expect(typeof duration).toBe('number')
      expect(duration as number).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getStartupTimeline', () => {
    it('returns main process timeline with at least one mark', () => {
      const timeline = getStartupTimeline()
      expect(timeline).toEqual({
        process: 'main',
        marks: expect.any(Array)
      })
      expect(timeline.marks.length).toBeGreaterThanOrEqual(1)
    })

    it('uses first mark as origin so first offset is 0', () => {
      const timeline = getStartupTimeline()
      expect(timeline.marks[0].offset).toBe(0)
    })

    it('rounds offsets to two decimal places', () => {
      const timeline = getStartupTimeline()
      for (const m of timeline.marks) {
        const decimals = String(m.offset).split('.')[1] ?? ''
        expect(decimals.length).toBeLessThanOrEqual(2)
      }
    })
  })

  describe('exportMarksAsJson', () => {
    it('returns main timeline and null renderer when no renderer marks', () => {
      const out = exportMarksAsJson()
      expect(out.main).toBeDefined()
      expect(out.main.process).toBe('main')
      expect(out.renderer).toBe(null)
    })
  })

  describe('logStartupTimeline', () => {
    it('calls logger.info with Main Process Startup Timeline when marks exist', () => {
      logStartupTimeline()
      expect(loggerMock.info).toHaveBeenCalledTimes(1)
      const [message] = loggerMock.info.mock.calls[0]
      expect(message).toContain('=== Main Process Startup Timeline ===')
    })

    it('includes Key Durations section in logged message', () => {
      logStartupTimeline()
      const [message] = loggerMock.info.mock.calls[0]
      expect(message).toContain('Key Durations')
    })
  })

  describe('registerPerfIpcHandlers', () => {
    it('registers perf:report-marks and perf:get-startup-timeline handlers', () => {
      registerPerfIpcHandlers()
      expect(ipcMainMock.handle).toHaveBeenCalledWith('perf:report-marks', expect.any(Function))
      expect(ipcMainMock.handle).toHaveBeenCalledWith('perf:get-startup-timeline', expect.any(Function))
    })

    it('perf:report-marks handler stores array and returns success', async () => {
      registerPerfIpcHandlers()
      const reportHandler = ipcMainMock.handle.mock.calls.find((c: unknown[]) => c[0] === 'perf:report-marks')?.[1] as (
        _e: unknown,
        marks: PerfMark[]
      ) => Promise<{ success: boolean }>

      const marks: PerfMark[] = [
        { name: 'r1', startTime: 1, timestamp: 100 },
        { name: 'r2', startTime: 2, timestamp: 200 }
      ]
      const result = await reportHandler(null, marks)
      expect(result).toEqual({ success: true })

      const exported = exportMarksAsJson()
      expect(exported.renderer).not.toBe(null)
      expect(exported.renderer!.process).toBe('renderer')
      expect(exported.renderer!.marks).toHaveLength(2)
    })

    it('perf:report-marks handler ignores non-array payload and keeps previous marks', async () => {
      registerPerfIpcHandlers()
      const reportHandler = ipcMainMock.handle.mock.calls.find((c: unknown[]) => c[0] === 'perf:report-marks')?.[1] as (
        _e: unknown,
        marks: unknown
      ) => Promise<{ success: boolean }>

      const marks: PerfMark[] = [{ name: 'keep', startTime: 0, timestamp: 100 }]
      await reportHandler(null, marks)
      const afterSet = exportMarksAsJson()
      expect(afterSet.renderer?.marks).toHaveLength(1)

      await reportHandler(null, 'not-an-array')
      const afterInvalid = exportMarksAsJson()
      expect(afterInvalid.renderer?.marks).toHaveLength(1)
      expect(afterInvalid.renderer?.marks[0].name).toBe('keep')
    })

    it('perf:get-startup-timeline handler returns exportMarksAsJson()', async () => {
      registerPerfIpcHandlers()
      const getHandler = ipcMainMock.handle.mock.calls.find((c: unknown[]) => c[0] === 'perf:get-startup-timeline')?.[1] as () => ReturnType<
        typeof exportMarksAsJson
      >

      const result = getHandler()
      expect(result).toEqual(exportMarksAsJson())
    })
  })

  describe('collectAndLogTimeline', () => {
    it('does nothing when window is null', () => {
      collectAndLogTimeline(null as never)
      expect(loggerMock.info).not.toHaveBeenCalled()
    })

    it('sends perf:collect-marks and logs after delay when window is valid', () => {
      vi.useFakeTimers()
      const send = vi.fn()
      const mainWindow = {
        isDestroyed: () => false,
        webContents: { send }
      } as never

      collectAndLogTimeline(mainWindow)
      expect(send).toHaveBeenCalledWith('perf:collect-marks')
      expect(loggerMock.info).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      expect(loggerMock.info).toHaveBeenCalledTimes(1)
    })

    it('does nothing when window is destroyed', () => {
      const send = vi.fn()
      const mainWindow = {
        isDestroyed: () => true,
        webContents: { send }
      } as never

      collectAndLogTimeline(mainWindow)
      expect(send).not.toHaveBeenCalled()
    })
  })
})
