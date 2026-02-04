import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { runMarkerBasedCommand, type MarkerStream, type MarkerRunnerConfig } from '../marker-based-runner'

// Create a mock stream
const createMockStream = (): MarkerStream & { emitData: (data: string) => void } => {
  const emitter = new EventEmitter()
  const stream = emitter as MarkerStream & { emitData: (data: string) => void }
  stream.write = vi.fn().mockReturnValue(true)
  stream.writable = true
  stream.emitData = (data: string) => {
    emitter.emit('data', Buffer.from(data, 'utf8'))
  }
  return stream
}

// Default config factory
const createConfig = (stream: MarkerStream, overrides: Partial<MarkerRunnerConfig> = {}): MarkerRunnerConfig => ({
  stream,
  wrappedCommand: 'echo test',
  startMarker: '===CHATERM_START===',
  endMarker: '===CHATERM_END===',
  logPrefix: 'test',
  timeoutMs: 5000,
  isListening: () => true,
  stripForDetect: (v) => v.replace(/<[^>]*>/g, ''),
  renderForDisplay: (v) => v,
  shouldFilterEcho: () => false,
  onLine: vi.fn(),
  onDetectorOutput: vi.fn(),
  onCompleted: vi.fn(),
  onContinue: vi.fn(),
  onExitCode: vi.fn(),
  cleanupInteractionDetector: vi.fn(),
  ...overrides
})

describe('runMarkerBasedCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits lines between markers and completes on end marker', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))
    const onCompleted = vi.fn()
    const onContinue = vi.fn()
    const onExitCode = vi.fn()

    const config = createConfig(stream, { onLine, onCompleted, onContinue, onExitCode })

    const resultPromise = runMarkerBasedCommand(config)

    // Emit start marker
    stream.emitData('noise before\n===CHATERM_START===\n')
    // Emit output lines
    stream.emitData('hello\nworld\n')
    // Emit end marker with exit code
    stream.emitData('===CHATERM_END===:0\n')

    const result = await resultPromise

    expect(result.completed).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.timedOut).toBe(false)
    expect(lines).toContain('hello')
    expect(lines).toContain('world')
    expect(lines).not.toContain('noise before')
    expect(onCompleted).toHaveBeenCalled()
    expect(onContinue).toHaveBeenCalled()
    expect(onExitCode).toHaveBeenCalledWith(0)
  })

  it('extracts non-zero exit code', async () => {
    const stream = createMockStream()
    const onExitCode = vi.fn()

    const config = createConfig(stream, { onExitCode })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('error output\n')
    stream.emitData('===CHATERM_END===:127\n')

    const result = await resultPromise

    expect(result.exitCode).toBe(127)
    expect(onExitCode).toHaveBeenCalledWith(127)
  })

  it('filters command echo before start marker', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))
    const shouldFilterEcho = vi.fn((line: string) => line.includes('bash -l -c'))

    const config = createConfig(stream, { onLine, shouldFilterEcho })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('bash -l -c echo test\n')
    stream.emitData('===CHATERM_START===\n')
    stream.emitData('actual output\n')
    stream.emitData('===CHATERM_END===:0\n')

    await resultPromise

    expect(lines).toContain('actual output')
    expect(lines).not.toContain('bash -l -c echo test')
    expect(shouldFilterEcho).toHaveBeenCalled()
  })

  it('handles cross-chunk marker detection', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, { onLine })

    const resultPromise = runMarkerBasedCommand(config)

    // Split start marker across chunks
    stream.emitData('===CHATERM_')
    stream.emitData('START===\n')
    stream.emitData('output line\n')
    // Split end marker across chunks
    stream.emitData('===CHATERM_')
    stream.emitData('END===:0\n')

    const result = await resultPromise

    expect(result.completed).toBe(true)
    expect(lines).toContain('output line')
  })

  it('releases half-line buffer after timeout', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, { onLine, halfLineTimeoutMs: 100 })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    // Emit data without newline
    stream.emitData('partial output')

    // Advance time to trigger half-line release
    await vi.advanceTimersByTimeAsync(150)

    // Now complete the command
    stream.emitData('\n===CHATERM_END===:0\n')

    await resultPromise

    expect(lines).toContain('partial output')
  })

  it('handles timeout correctly', async () => {
    const stream = createMockStream()
    const onLine = vi.fn()
    const onTimeout = vi.fn()
    const onCompleted = vi.fn()

    const config = createConfig(stream, { onLine, onTimeout, onCompleted, timeoutMs: 1000 })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('some output\n')
    // Don't send end marker - let it timeout

    // Advance time past timeout
    await vi.advanceTimersByTimeAsync(1500)

    const result = await resultPromise

    expect(result.timedOut).toBe(true)
    expect(onTimeout).toHaveBeenCalled()
    expect(onCompleted).toHaveBeenCalled()
  })

  it('sends default timeout message when onTimeout is not provided', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, { onLine, timeoutMs: 60000 })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')

    await vi.advanceTimersByTimeAsync(61000)

    await resultPromise

    expect(lines.some((l) => l.includes('timed out'))).toBe(true)
  })

  it('ignores end marker before start marker (command echo)', async () => {
    const stream = createMockStream()
    const onExitCode = vi.fn()

    const config = createConfig(stream, { onExitCode })

    const resultPromise = runMarkerBasedCommand(config)

    // End marker appears in command echo before start
    stream.emitData('echo "===CHATERM_END===:0"\n')
    stream.emitData('===CHATERM_START===\n')
    stream.emitData('real output\n')
    stream.emitData('===CHATERM_END===:42\n')

    const result = await resultPromise

    // Should get the real exit code, not the echo
    expect(result.exitCode).toBe(42)
    expect(onExitCode).toHaveBeenCalledWith(42)
  })

  it('does not emit marker lines in output', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, { onLine })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('good output\n')
    stream.emitData('===CHATERM_END===:0\n')

    await resultPromise

    expect(lines).not.toContain('===CHATERM_START===')
    expect(lines.some((l) => l.includes('===CHATERM_END==='))).toBe(false)
    expect(lines).toContain('good output')
  })

  it('respects isListening flag', async () => {
    const stream = createMockStream()
    let listening = true
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, {
      onLine,
      isListening: () => listening
    })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('visible\n')

    // Stop listening
    listening = false
    stream.emitData('invisible\n')

    // Resume listening
    listening = true
    stream.emitData('visible again\n')
    stream.emitData('===CHATERM_END===:0\n')

    await resultPromise

    expect(lines).toContain('visible')
    expect(lines).not.toContain('invisible')
    expect(lines).toContain('visible again')
  })

  it('calls cleanupInteractionDetector on completion', async () => {
    const stream = createMockStream()
    const cleanupInteractionDetector = vi.fn()

    const config = createConfig(stream, { cleanupInteractionDetector })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('===CHATERM_END===:0\n')

    await resultPromise

    expect(cleanupInteractionDetector).toHaveBeenCalled()
  })

  it('feeds output to detector via onDetectorOutput', async () => {
    const stream = createMockStream()
    const detectorOutput: string[] = []
    const onDetectorOutput = vi.fn((chunk: string) => detectorOutput.push(chunk))

    const config = createConfig(stream, { onDetectorOutput })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('detector input\n')
    stream.emitData('===CHATERM_END===:0\n')

    await resultPromise

    expect(detectorOutput.join('')).toContain('detector input')
    expect(onDetectorOutput).toHaveBeenCalled()
  })

  it('applies renderForDisplay to output', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, {
      onLine,
      renderForDisplay: (v) => `[RENDERED] ${v}`
    })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('raw output\n')
    stream.emitData('===CHATERM_END===:0\n')

    await resultPromise

    expect(lines.some((l) => l.includes('[RENDERED]'))).toBe(true)
  })
})
