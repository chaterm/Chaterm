import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeScript } from '../commandScript'

describe('commandScript', () => {
  let mockTerminal: { write: (data: string) => void; writtenData: string[] }

  beforeEach(() => {
    const writtenData: string[] = []
    const writeFn = vi.fn((data: string) => {
      writtenData.push(data)
    })
    mockTerminal = {
      writtenData,
      write: writeFn as (data: string) => void
    }
  })

  describe('Basic command parsing', () => {
    it('should execute normal commands and add carriage return', async () => {
      await executeScript('ls -la', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledWith('ls -la\r')
    })

    it('should handle multi-line commands', async () => {
      await executeScript('echo hello\necho world', mockTerminal)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
      expect(mockTerminal.writtenData).toContain('echo world\r')
    })

    it('should not add carriage return to last command when autoExecute=false', async () => {
      await executeScript('echo hello\necho world', mockTerminal, false)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
      expect(mockTerminal.writtenData).toContain('echo world') // no \r
      expect(mockTerminal.writtenData).not.toContain('echo world\r')
    })
  })

  describe('Comment handling', () => {
    it('should skip comments starting with #', async () => {
      await executeScript('# This is a comment\necho hello', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(1)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
    })

    it('should skip comments starting with //', async () => {
      await executeScript('// This is a comment\necho hello', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(1)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
    })

    it('should skip empty lines', async () => {
      await executeScript('echo hello\n\necho world', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    })
  })

  describe('sleep command', () => {
    it('should parse sleep==100 format delay command', async () => {
      const startTime = Date.now()
      await executeScript('sleep==110', mockTerminal)
      const elapsed = Date.now() - startTime

      // Should wait approximately 100ms (plus 50ms base delay, allowing some error)
      // Lower bound: at least wait 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100)
      // Upper bound: should not exceed 300ms (100ms sleep + 50ms delay + error)
      expect(elapsed).toBeLessThan(300)
      // Should not write any content to terminal
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('sleep command should be case-insensitive', async () => {
      await executeScript('SLEEP==50', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })
  })

  describe('Special keys', () => {
    it('should handle esc key', async () => {
      await executeScript('esc', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b')
    })

    it('should handle tab key', async () => {
      await executeScript('tab', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\t')
    })

    it('should handle return key', async () => {
      await executeScript('return', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\r')
    })

    it('should handle backspace key', async () => {
      await executeScript('backspace', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\b')
    })

    it('special keys should be case-insensitive', async () => {
      await executeScript('TAB', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\t')
    })
  })

  describe('Arrow keys', () => {
    it('should handle up key', async () => {
      await executeScript('up', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[A')
    })

    it('should handle down key', async () => {
      await executeScript('down', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[B')
    })

    it('should handle left key', async () => {
      await executeScript('left', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[D')
    })

    it('should handle right key', async () => {
      await executeScript('right', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[C')
    })
  })

  describe('Ctrl key combinations', () => {
    it('should handle ctrl+c', async () => {
      await executeScript('ctrl+c', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x03')
    })

    it('should handle ctrl+d', async () => {
      await executeScript('ctrl+d', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x04')
    })

    it('should handle ctrl+z', async () => {
      await executeScript('ctrl+z', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1a')
    })

    it('should handle ctrl+l (clear screen)', async () => {
      await executeScript('ctrl+l', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x0c')
    })

    it('ctrl key combinations should be case-insensitive', async () => {
      await executeScript('CTRL+C', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x03')
    })
  })

  describe('Complex scripts', () => {
    it('should execute mixed scripts in order', async () => {
      const script = `
# This is a comment
echo hello
sleep==50
ctrl+c
up
echo world
`
      await executeScript(script, mockTerminal)

      // Verify execution order
      const calls = mockTerminal.writtenData
      expect(calls[0]).toBe('echo hello\r')
      expect(calls[1]).toBe('\x03') // ctrl+c
      expect(calls[2]).toBe('\x1b[A') // up
      expect(calls[3]).toBe('echo world\r')
    })

    it('should handle Windows-style line breaks (CRLF)', async () => {
      await executeScript('echo hello\r\necho world', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    })

    it('should handle old Mac-style line breaks (CR)', async () => {
      await executeScript('echo hello\recho world', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    })
  })

  describe('Edge cases', () => {
    it('empty script should not execute any commands', async () => {
      await executeScript('', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('script with only whitespace should not execute any commands', async () => {
      await executeScript('   \n   \n   ', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('script with only comments should not execute any commands', async () => {
      await executeScript('# comment\n// another comment', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('should trim whitespace before and after commands', async () => {
      await executeScript('   echo hello   ', mockTerminal)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
    })
  })
})
