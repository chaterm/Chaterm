/**
 * Unit tests for TUI conditional auto-cancel strategy
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InteractionDetector } from '../index'
import type { InteractionDetectorConfig } from '../types'

describe('InteractionDetector TUI Conditional Auto-Cancel', () => {
  let detector: InteractionDetector

  const testConfig: InteractionDetectorConfig = {
    initialTimeout: 1000,
    maxTimeout: 5000,
    tuiCancelSilenceMs: 500 // Reduced for faster tests
  }

  afterEach(() => {
    if (detector) {
      detector.dispose()
    }
    vi.useRealTimers()
  })

  describe('TUI Command Classification', () => {
    it('should classify vim as always-TUI', () => {
      detector = new InteractionDetector('vim file.txt', 'cmd-1', testConfig)
      const state = detector.getState()
      expect(state.isSuppressed).toBe(false) // Not immediately suppressed anymore
    })

    it('should classify vi as always-TUI', () => {
      detector = new InteractionDetector('vi /etc/hosts', 'cmd-2', testConfig)
      const state = detector.getState()
      expect(state.isSuppressed).toBe(false)
    })

    it('should classify nano as always-TUI', () => {
      detector = new InteractionDetector('nano file.txt', 'cmd-3', testConfig)
      const state = detector.getState()
      expect(state.isSuppressed).toBe(false)
    })

    it('should classify tmux as always-TUI', () => {
      detector = new InteractionDetector('tmux new-session', 'cmd-4', testConfig)
      const state = detector.getState()
      expect(state.isSuppressed).toBe(false)
    })
  })

  describe('Conditional TUI with Non-Interactive Arguments', () => {
    it('should not treat top -n 1 as TUI (has non-interactive args)', () => {
      detector = new InteractionDetector('top -n 1', 'cmd-5', testConfig)
      // top -n 1 should be treated as normal command, not auto-cancelled
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      // Simulate alternate screen entry
      detector.onOutput('\x1b[?1049h')

      // Should not immediately trigger tui-detected because it has non-interactive args
      // The pager observation will start instead
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })

    it('should not treat top -b as TUI (batch mode)', () => {
      detector = new InteractionDetector('top -b -n 5', 'cmd-6', testConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      detector.onOutput('\x1b[?1049h')
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })

    it('should not treat mysql -e as TUI (execute mode)', () => {
      detector = new InteractionDetector('mysql -e "SELECT 1"', 'cmd-7', testConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      detector.onOutput('\x1b[?1049h')
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })

    it('should not treat mysql --execute as TUI', () => {
      detector = new InteractionDetector('mysql --execute="SELECT 1"', 'cmd-8', testConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      detector.onOutput('\x1b[?1049h')
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })

    it('should not treat psql -c as TUI (command mode)', () => {
      detector = new InteractionDetector('psql -c "SELECT 1"', 'cmd-9', testConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      detector.onOutput('\x1b[?1049h')
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })
  })

  describe('Pager Command Whitelist', () => {
    it('should detect man as pager command', () => {
      detector = new InteractionDetector('man ls', 'cmd-10', testConfig)
      const interactionNeededHandler = vi.fn()
      detector.on('interaction-needed', interactionNeededHandler)

      // Simulate alternate screen entry with pager output
      detector.onOutput('\x1b[?1049h')
      detector.onOutput('Manual page ls(1)\n')

      // man should trigger pager UI, not TUI
      expect(interactionNeededHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionType: 'pager'
        })
      )
    })

    it('should detect git log as pager command', () => {
      detector = new InteractionDetector('git log', 'cmd-11', testConfig)
      const interactionNeededHandler = vi.fn()
      detector.on('interaction-needed', interactionNeededHandler)

      detector.onOutput('\x1b[?1049h')
      detector.onOutput('commit abc123\nAuthor: test\n(END)')

      expect(interactionNeededHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionType: 'pager'
        })
      )
    })

    it('should detect journalctl as pager command', () => {
      detector = new InteractionDetector('journalctl -b', 'cmd-12', testConfig)
      const interactionNeededHandler = vi.fn()
      detector.on('interaction-needed', interactionNeededHandler)

      detector.onOutput('\x1b[?1049h')
      detector.onOutput('-- Logs begin at Mon 2024-01-01\n(END)')

      expect(interactionNeededHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionType: 'pager'
        })
      )
    })

    it('should detect less as pager command', () => {
      detector = new InteractionDetector('less file.txt', 'cmd-13', testConfig)
      const interactionNeededHandler = vi.fn()
      detector.on('interaction-needed', interactionNeededHandler)

      detector.onOutput('\x1b[?1049h')
      detector.onOutput('File content here\n(END)')

      expect(interactionNeededHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionType: 'pager'
        })
      )
    })
  })

  describe('TUI Auto-Cancel Silence Timer', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should trigger tui-detected after silence period for always-TUI', async () => {
      detector = new InteractionDetector('vim file.txt', 'cmd-14', testConfig, 'task-14')
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      // Enter alternate screen
      detector.onOutput('\x1b[?1049h')

      // Advance past silence timeout
      vi.advanceTimersByTime(testConfig.tuiCancelSilenceMs! + 100)

      expect(tuiDetectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'cmd-14',
          taskId: 'task-14'
        })
      )
    })

    it('should reset silence timer on new output', async () => {
      detector = new InteractionDetector('htop', 'cmd-15', testConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      // Enter alternate screen
      detector.onOutput('\x1b[?1049h')

      // Advance halfway
      vi.advanceTimersByTime(testConfig.tuiCancelSilenceMs! / 2)

      // New output should reset the timer
      detector.onOutput('CPU: 50 percent\n')

      // Advance remaining time (should not trigger because timer was reset)
      vi.advanceTimersByTime(testConfig.tuiCancelSilenceMs! / 2 + 50)

      expect(tuiDetectedHandler).not.toHaveBeenCalled()

      // Advance full silence window from the last output
      vi.advanceTimersByTime(testConfig.tuiCancelSilenceMs! + 50)

      expect(tuiDetectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'cmd-15'
        })
      )
    })
  })

  describe('TUI hard timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('auto-cancels blacklisted commands even without alternate screen output', () => {
      const hardTimeoutConfig: InteractionDetectorConfig = {
        ...testConfig,
        tuiCancelSilenceMs: 5000,
        tuiHardTimeoutMs: 200
      }
      detector = new InteractionDetector('top', 'cmd-16', hardTimeoutConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      vi.advanceTimersByTime(199)
      expect(tuiDetectedHandler).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2)
      expect(tuiDetectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'cmd-16'
        })
      )
    })

    it('does not auto-cancel when blacklisted command has non-interactive args', () => {
      const hardTimeoutConfig: InteractionDetectorConfig = {
        ...testConfig,
        tuiCancelSilenceMs: 5000,
        tuiHardTimeoutMs: 200
      }
      detector = new InteractionDetector('top -n 1', 'cmd-17', hardTimeoutConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      vi.advanceTimersByTime(300)
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })

    it('does not auto-cancel non-blacklist commands', () => {
      const hardTimeoutConfig: InteractionDetectorConfig = {
        ...testConfig,
        tuiCancelSilenceMs: 5000,
        tuiHardTimeoutMs: 200
      }
      detector = new InteractionDetector('some-custom-command', 'cmd-18', hardTimeoutConfig)
      const tuiDetectedHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)

      vi.advanceTimersByTime(300)
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })
  })

  describe('Alternate Screen Exit', () => {
    it('should reset all TUI state when exiting alternate screen', () => {
      detector = new InteractionDetector('vim file.txt', 'cmd-19', testConfig)

      // Enter alternate screen
      detector.onOutput('\x1b[?1049h')

      let state = detector.getState()
      expect(state.inAlternateScreen).toBe(true)

      // Exit alternate screen
      detector.onOutput('\x1b[?1049l')

      state = detector.getState()
      expect(state.inAlternateScreen).toBe(false)
    })
  })

  describe('Non-Blacklist Commands', () => {
    it('should not auto-cancel non-blacklist commands', async () => {
      vi.useFakeTimers()

      // A random command that's not in the TUI blacklist
      detector = new InteractionDetector('some-custom-command', 'cmd-18', testConfig)
      const tuiDetectedHandler = vi.fn()
      const alternateScreenHandler = vi.fn()
      detector.on('tui-detected', tuiDetectedHandler)
      detector.on('alternate-screen-entered', alternateScreenHandler)

      // Enter alternate screen
      detector.onOutput('\x1b[?1049h')

      // Should emit alternate-screen-entered with autoCancel: false
      expect(alternateScreenHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'cmd-18',
          autoCancel: false
        })
      )

      // Advance well past any timeout
      vi.advanceTimersByTime(testConfig.tuiCancelSilenceMs! + 1000)

      // tui-detected should NOT have been called for non-blacklist commands
      expect(tuiDetectedHandler).not.toHaveBeenCalled()
    })
  })
})
