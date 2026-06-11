import { ipcRenderer } from 'electron'

export interface PerfMark {
  name: string
  startTime: number
  timestamp: number
}

const marks: PerfMark[] = []

export function mark(name: string): void {
  marks.push({
    name,
    startTime: performance.now(),
    timestamp: Date.now()
  })
}

export function getMarks(): PerfMark[] {
  return [...marks].sort((a, b) => a.startTime - b.startTime)
}

export async function reportPreloadMarksToMain(): Promise<void> {
  try {
    await ipcRenderer.invoke('perf:report-marks', {
      process: 'preload',
      marks
    })
  } catch {
    // Perf reporting must never block preload bootstrap.
  }
}

mark('chaterm/preload/start')
