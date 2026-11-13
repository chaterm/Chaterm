import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { runMarkerBasedCommand, type MarkerStream, type MarkerRunnerConfig } from '../marker-based-runner'

function stripHtmlLikeTags(text: string): string {
  let result = ''
  let inTag = false

  for (const char of text) {
    if (char === '<') {
      inTag = true
      continue
    }
    if (char === '>' && inTag) {
      inTag = false
      continue
    }
    if (!inTag) {
      result += char
    }
  }

  return result
}

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
  stripForDetect: stripHtmlLikeTags,
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

  it('sends Ctrl+C on timeout and completes when the end marker follows', async () => {
    const stream = createMockStream()
    const onTimeout = vi.fn()
    const onCompleted = vi.fn()
    const onExitCode = vi.fn()
    const onInterruptFailed = vi.fn()

    const config = createConfig(stream, { onTimeout, onCompleted, onExitCode, onInterruptFailed, timeoutMs: 1000 })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('some output\n')

    await vi.advanceTimersByTimeAsync(1000)

    expect(onTimeout).toHaveBeenCalled()
    expect(stream.write).toHaveBeenLastCalledWith('\x03')
    expect(onCompleted).not.toHaveBeenCalled()

    // The wrapper traps INT, so the interrupted command still reports its end marker
    stream.emitData('^C===CHATERM_END===:130\n')

    const result = await resultPromise

    expect(result).toEqual({ completed: true, exitCode: 130, timedOut: true })
    expect(onExitCode).toHaveBeenCalledWith(130)
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(onInterruptFailed).not.toHaveBeenCalled()
  })

  it('sends default timeout message when onTimeout is not provided', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const config = createConfig(stream, { onLine, timeoutMs: 120000 })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')

    await vi.advanceTimersByTimeAsync(120000)

    expect(lines).toEqual(['Command execution timed out after 2 minutes.', 'Chaterm sent Ctrl+C to stop it.'])

    stream.emitData('===CHATERM_END===:130\n')
    await resultPromise
  })

  it('reports an interrupt failure when Ctrl+C does not stop the command', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))
    const onExitCode = vi.fn()
    const calls: string[] = []
    const onInterruptFailed = vi.fn(() => calls.push('interrupt-failed'))
    const onCompleted = vi.fn(() => calls.push('completed'))

    const config = createConfig(stream, { onLine, onExitCode, onInterruptFailed, onCompleted, timeoutMs: 60000, interruptGraceMs: 1000 })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')

    await vi.advanceTimersByTimeAsync(60000 + 999)
    expect(onInterruptFailed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    const result = await resultPromise

    expect(result).toEqual({ completed: true, exitCode: 0, timedOut: true })
    expect(lines).toEqual([
      'Command execution timed out after 1 minute.',
      'Chaterm sent Ctrl+C to stop it.',
      'The command did not stop after Ctrl+C and may still be running on the server.'
    ])
    expect(calls).toEqual(['interrupt-failed', 'completed'])
    expect(onExitCode).not.toHaveBeenCalled()
  })

  it('completes without an exit code when the stream closes before the end marker', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))
    const onExitCode = vi.fn()
    const onCompleted = vi.fn()
    const onContinue = vi.fn()

    const config = createConfig(stream, { onLine, onExitCode, onCompleted, onContinue })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('partial\n')
    stream.emit('close')

    const result = await resultPromise

    expect(result).toEqual({ completed: true, exitCode: 0, timedOut: false })
    expect(lines).toEqual(['partial', 'Connection closed before the command finished.'])
    expect(onExitCode).not.toHaveBeenCalled()
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(stream.listenerCount('close')).toBe(0)
  })

  it('flushes output still waiting for a newline when the stream closes', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))
    const onDetectorOutput = vi.fn()

    const resultPromise = runMarkerBasedCommand(createConfig(stream, { onLine, onDetectorOutput }))

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('last words without newline')
    stream.emit('close')

    await resultPromise

    expect(lines).toEqual(['last words without newline', 'Connection closed before the command finished.'])
    expect(onDetectorOutput).toHaveBeenCalledWith('last words without newline\n')
  })

  it('does not flush marker text left in the buffer when the stream closes', async () => {
    const stream = createMockStream()
    const lines: string[] = []
    const onLine = vi.fn((line: string) => lines.push(line))

    const resultPromise = runMarkerBasedCommand(createConfig(stream, { onLine }))

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('===CHATERM_PARTIAL')
    stream.emit('close')

    await resultPromise

    expect(lines).toEqual(['Connection closed before the command finished.'])
  })

  it('stops tracking silently when aborted', async () => {
    const stream = createMockStream()
    const controller = new AbortController()
    const onLine = vi.fn()
    const onCompleted = vi.fn()
    const onContinue = vi.fn()
    const cleanupInteractionDetector = vi.fn()

    const config = createConfig(stream, { onLine, onCompleted, onContinue, cleanupInteractionDetector, signal: controller.signal })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    controller.abort()

    const result = await resultPromise

    stream.emitData('late output\n')
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    expect(result).toEqual({ completed: false, exitCode: 0, timedOut: false })
    expect(onLine).not.toHaveBeenCalled()
    expect(onCompleted).not.toHaveBeenCalled()
    expect(onContinue).not.toHaveBeenCalled()
    expect(cleanupInteractionDetector).not.toHaveBeenCalled()
    expect(stream.listenerCount('data')).toBe(0)
    expect(stream.listenerCount('close')).toBe(0)
  })

  it('does not send the command when already aborted', async () => {
    const stream = createMockStream()
    const controller = new AbortController()
    controller.abort()

    const result = await runMarkerBasedCommand(createConfig(stream, { signal: controller.signal }))

    expect(result).toEqual({ completed: false, exitCode: 0, timedOut: false })
    expect(stream.write).not.toHaveBeenCalled()
    expect(stream.listenerCount('data')).toBe(0)
  })

  it('reports the exit code before completion callbacks', async () => {
    const stream = createMockStream()
    const calls: string[] = []

    const config = createConfig(stream, {
      onExitCode: () => calls.push('exitCode'),
      onCompleted: () => calls.push('completed'),
      onContinue: () => calls.push('continue')
    })

    const resultPromise = runMarkerBasedCommand(config)

    stream.emitData('===CHATERM_START===\n')
    stream.emitData('===CHATERM_END===:1\n')

    await resultPromise

    expect(calls).toEqual(['exitCode', 'completed', 'continue'])
    expect(stream.listenerCount('data')).toBe(0)
    expect(stream.listenerCount('close')).toBe(0)
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

  it('prepends a space to wrappedCommand so it is excluded from shell history', async () => {
    const stream = createMockStream()
    const config = createConfig(stream, { wrappedCommand: 'bash -l -c "echo hi"' })

    const resultPromise = runMarkerBasedCommand(config)

    // Verify the command written to the stream starts with a leading space
    expect(stream.write).toHaveBeenCalledWith(expect.stringMatching(/^ /))
    // Verify the original command is still present after the leading space
    expect(stream.write).toHaveBeenCalledWith(' bash -l -c "echo hi"\r')

    // Complete the command so the promise resolves
    stream.emitData('===CHATERM_START===\n')
    stream.emitData('===CHATERM_END===:0\n')
    await resultPromise
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
