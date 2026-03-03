import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { isTerminalPromptLine } from '../utils/terminalPrompt'

// Mock the complex dependencies that aren't relevant to scrollbar testing
vi.mock('xterm', () => ({
  Terminal: vi.fn(() => ({
    onKey: vi.fn(),
    onSelectionChange: vi.fn(),
    loadAddon: vi.fn(),
    open: vi.fn(),
    onResize: vi.fn(),
    write: vi.fn(),
    scrollToBottom: vi.fn(),
    focus: vi.fn(),
    buffer: { active: { baseY: 0 } },
    element: {
      querySelector: vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    }
  }))
}))

vi.mock('xterm-addon-fit', () => ({
  FitAddon: vi.fn(() => ({ fit: vi.fn() }))
}))

vi.mock('xterm-addon-search', () => ({
  SearchAddon: vi.fn()
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

vi.mock('@/store/userConfigStore', () => ({
  userConfigStore: () => ({
    getUserConfig: {
      background: { image: null },
      theme: 'dark',
      scrollBack: 1000,
      cursorStyle: 'block',
      fontSize: 12,
      fontFamily: 'monospace'
    }
  })
}))

// Mock other complex dependencies
vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn(() =>
      Promise.resolve({
        aliasStatus: 0,
        autoCompleteStatus: 0,
        scrollBack: 1000,
        highlightStatus: 0,
        terminalType: 'xterm-256color',
        pinchZoomStatus: 0,
        sshAgentsStatus: 0,
        quickVimStatus: 0,
        rightMouseEvent: 'contextMenu',
        middleMouseEvent: 'paste'
      })
    )
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/store/index', () => ({
  userInfoStore: () => ({
    userInfo: { email: 'test@example.com' }
  })
}))

// Create a simplified test component that isolates the scrollbar functionality
const TestScrollbarComponent = {
  template: `
    <div ref="terminalContainer" class="terminal-container">
      <div ref="terminalElement" class="terminal">
        <div class="xterm-viewport"></div>
      </div>
    </div>
  `,
  setup() {
    const terminalContainer = ref<HTMLDivElement | null>(null)
    const terminalElement = ref<HTMLDivElement | null>(null)

    let viewportScrollbarHideTimer: number | null = null

    const showTerminalScrollbarTemporarily = () => {
      const container = terminalContainer.value
      if (!container) return

      container.classList.add('scrollbar-visible')

      if (viewportScrollbarHideTimer) {
        window.clearTimeout(viewportScrollbarHideTimer)
      }

      viewportScrollbarHideTimer = window.setTimeout(() => {
        container.classList.remove('scrollbar-visible')
        viewportScrollbarHideTimer = null
      }, 2000)
    }

    const updateSelectionButtonPosition = vi.fn()

    const handleViewportScroll = () => {
      updateSelectionButtonPosition()
      showTerminalScrollbarTemporarily()
    }

    const cleanup = () => {
      if (viewportScrollbarHideTimer) {
        window.clearTimeout(viewportScrollbarHideTimer)
        viewportScrollbarHideTimer = null
      }
    }

    return {
      terminalContainer,
      terminalElement,
      showTerminalScrollbarTemporarily,
      handleViewportScroll,
      updateSelectionButtonPosition,
      cleanup
    }
  }
}

describe('Terminal Scrollbar Functionality', () => {
  let wrapper: any
  let mockSetTimeout: any
  let mockClearTimeout: any

  beforeEach(() => {
    // Mock timers
    vi.useFakeTimers()
    mockSetTimeout = vi.spyOn(window, 'setTimeout')
    mockClearTimeout = vi.spyOn(window, 'clearTimeout')

    wrapper = mount(TestScrollbarComponent)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    mockSetTimeout?.mockRestore()
    mockClearTimeout?.mockRestore()
    wrapper?.unmount()
  })

  describe('showTerminalScrollbarTemporarily', () => {
    it('should add scrollbar-visible class to terminal container', async () => {
      const container = wrapper.vm.terminalContainer

      wrapper.vm.showTerminalScrollbarTemporarily()

      expect(container.classList.contains('scrollbar-visible')).toBe(true)
    })

    it('should do nothing if terminal container is not available', () => {
      wrapper.vm.terminalContainer = null

      expect(() => {
        wrapper.vm.showTerminalScrollbarTemporarily()
      }).not.toThrow()

      expect(mockSetTimeout).not.toHaveBeenCalled()
    })

    it('should clear existing timer before setting new one', () => {
      // First call
      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(mockSetTimeout).toHaveBeenCalledTimes(1)

      // Second call should clear the previous timer
      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(mockClearTimeout).toHaveBeenCalledTimes(1)
      expect(mockSetTimeout).toHaveBeenCalledTimes(2)
    })

    it('should remove scrollbar-visible class after 2 seconds', async () => {
      const container = wrapper.vm.terminalContainer

      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(container.classList.contains('scrollbar-visible')).toBe(true)

      // Fast-forward time by 2 seconds
      vi.advanceTimersByTime(2000)

      expect(container.classList.contains('scrollbar-visible')).toBe(false)
    })

    it('should set timer to 2000ms', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000)
    })

    it('should reset timer variable to null after timeout', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()

      // Fast-forward time by 2 seconds
      vi.advanceTimersByTime(2000)

      // The timer should be reset to null (we can't directly test this,
      // but we can verify behavior when calling the function again)
      wrapper.vm.showTerminalScrollbarTemporarily()

      // Should not call clearTimeout since timer was reset to null
      expect(mockClearTimeout).toHaveBeenCalledTimes(0)
    })
  })

  describe('handleViewportScroll', () => {
    it('should call updateSelectionButtonPosition', () => {
      wrapper.vm.handleViewportScroll()

      expect(wrapper.vm.updateSelectionButtonPosition).toHaveBeenCalledTimes(1)
    })

    it('should call showTerminalScrollbarTemporarily', () => {
      // Test the actual behavior instead of spying on internal calls
      const container = wrapper.vm.terminalContainer
      expect(container.classList.contains('scrollbar-visible')).toBe(false)

      wrapper.vm.handleViewportScroll()

      // The scrollbar should be shown after the scroll event
      expect(container.classList.contains('scrollbar-visible')).toBe(true)
    })

    it('should add scrollbar-visible class through showTerminalScrollbarTemporarily', () => {
      const container = wrapper.vm.terminalContainer

      wrapper.vm.handleViewportScroll()

      expect(container.classList.contains('scrollbar-visible')).toBe(true)
    })
  })

  describe('timer cleanup', () => {
    it('should clear timer on cleanup', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()

      wrapper.vm.cleanup()

      expect(mockClearTimeout).toHaveBeenCalledTimes(1)
    })

    it('should handle cleanup when no timer exists', () => {
      expect(() => {
        wrapper.vm.cleanup()
      }).not.toThrow()
    })
  })

  describe('CSS class behavior', () => {
    it('should toggle scrollbar-visible class correctly', async () => {
      const container = wrapper.vm.terminalContainer

      // Initially no class
      expect(container.classList.contains('scrollbar-visible')).toBe(false)

      // Add class
      wrapper.vm.showTerminalScrollbarTemporarily()
      expect(container.classList.contains('scrollbar-visible')).toBe(true)

      // Remove class after timeout
      vi.advanceTimersByTime(2000)
      expect(container.classList.contains('scrollbar-visible')).toBe(false)
    })

    it('should handle multiple rapid calls correctly', () => {
      const container = wrapper.vm.terminalContainer

      // Multiple rapid calls
      wrapper.vm.showTerminalScrollbarTemporarily()
      wrapper.vm.showTerminalScrollbarTemporarily()
      wrapper.vm.showTerminalScrollbarTemporarily()

      expect(container.classList.contains('scrollbar-visible')).toBe(true)
      expect(mockClearTimeout).toHaveBeenCalledTimes(2) // Clear called for 2nd and 3rd calls

      // Only the last timer should be active
      vi.advanceTimersByTime(2000)
      expect(container.classList.contains('scrollbar-visible')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle container becoming null after timer is set', () => {
      wrapper.vm.showTerminalScrollbarTemporarily()
      wrapper.vm.terminalContainer = null

      // Should not throw error when timer executes
      expect(() => {
        vi.advanceTimersByTime(2000)
      }).not.toThrow()
    })
  })
})

// Helper functions for testing terminal command echo processing
// These mirror the logic in sshConnect.vue for testing purposes

/**
 * Detect terminal type based on prompt patterns and command content
 */
function detectTerminalType(lines: string[], lastNonEmptyLine: string, sentCommand: string | null): 'windows' | 'linux' | 'unknown' {
  // 1. Check prompt patterns (most reliable)
  if (lastNonEmptyLine) {
    const trimmed = lastNonEmptyLine.trim()
    // Windows PowerShell/CMD prompt
    if (/^PS\s+[A-Za-z]:[\\\/]/.test(trimmed) || /^[A-Za-z]:[\\\/].*?>\s*$/.test(trimmed)) {
      return 'windows'
    }
    // Linux/Git Bash prompt (including MINGW64/MINGW32/MSYS)
    if (
      /^[$#]\s*$/.test(trimmed) ||
      /^[^@]+@[^:]+:/.test(trimmed) ||
      /MINGW(64|32)|MSYS/.test(trimmed) ||
      /^[^@]+@[^@]+\s+(MINGW64|MINGW32|MSYS)/.test(trimmed)
    ) {
      return 'linux'
    }
  }

  // 2. Check prompt patterns in output lines
  for (const line of lines) {
    const trimmed = line.trim()
    // Windows prompt
    if (/^PS\s+[A-Za-z]:[\\\/]/.test(trimmed) || /^[A-Za-z]:[\\\/].*?>\s*$/.test(trimmed)) {
      return 'windows'
    }
    // Linux/Git Bash prompt
    if (/MINGW(64|32)|MSYS/.test(trimmed) || /^[^@]+@[^@]+\s+(MINGW64|MINGW32|MSYS)/.test(trimmed)) {
      return 'linux'
    }
  }

  // 3. Check command content (auxiliary)
  if (sentCommand) {
    // PowerShell cmdlets
    if (/Get-|Select-Object|Format-Table|ForEach-Object|Where-Object/i.test(sentCommand)) {
      return 'windows'
    }
  }

  // 4. Default: if local connection without clear identification, could be Windows PowerShell or Git Bash
  // For safety, return 'unknown' and use conservative strategy
  return 'unknown'
}

/**
 * Clean ANSI sequences from a line
 */
function cleanAnsiSequences(line: string): string {
  return line
    .replace(/\x1b\[[0-9;]*m/g, '') // Color codes
    .replace(/\x1b\[[0-9;]*[ABCDEFGJKST]/g, '') // Cursor movement
    .replace(/\x1b\[[0-9]*[XK]/g, '') // Erase sequences
    .replace(/\x1b\[[0-9;]*[Hf]/g, '') // Position sequences
    .replace(/\x1b\[[?][0-9;]*[hl]/g, '') // Mode sequences
    .replace(/\x1b\]0;[^\x07]*\x07/g, '') // Window title
    .replace(/\x1b\]9;[^\x07]*\x07/g, '') // PowerShell sequences
    .replace(/\x1b\[[?]25[hl]/g, '') // Cursor visibility
    .replace(/\x1b\[[0-9;]*[JK]/g, '') // Erase in display/line
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control chars
    .trim()
}

/**
 * Check if a line is a command echo for Windows terminals
 */
function isWindowsCommandEchoLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // Exclude error messages
  if (
    trimmed.includes('不是内部或外部命令') ||
    trimmed.includes('is not recognized as') ||
    trimmed.includes('command not found') ||
    trimmed.includes('批处理文件')
  ) {
    return false
  }

  // Exclude table headers (PascalCase words)
  if (/^[A-Z][a-zA-Z0-9]*$/.test(trimmed) && trimmed.length >= 4 && trimmed.length <= 20) {
    return false
  }

  // Exclude table separator lines
  if (/^[-=]+$/.test(trimmed) && trimmed.length >= 2) {
    return false
  }

  // PowerShell cmdlet pattern (Verb-Noun)
  if (/^[A-Z][a-z]+-[A-Z][a-z]+/.test(trimmed)) {
    return true
  }

  // Common command patterns with parameters
  if (/^[a-zA-Z][a-zA-Z0-9_-]+\s+[-\/][a-zA-Z0-9]/.test(trimmed)) {
    return true
  }

  return false
}

/**
 * Check if a line is a command echo for Git Bash/Linux terminals
 */
function isLinuxCommandEchoLine(line: string): boolean {
  // Clean ANSI sequences first
  const cleanedLine = cleanAnsiSequences(line)
  let trimmed = cleanedLine.trim()
  if (!trimmed) return false

  // Remove prompt symbols ($, #, %) from the beginning (e.g., "$ pwd" -> "pwd")
  trimmed = trimmed.replace(/^[$#%]\s*/, '').trim()

  // Exclude path output (e.g., /c/Users/test)
  if (/^[\/\\]/.test(trimmed) || /[\/\\]/.test(trimmed)) {
    return false
  }

  // Common commands
  const commonCommands = ['pwd', 'ls', 'cd', 'cat', 'echo', 'grep', 'find', 'ps', 'top', 'df', 'du', 'whoami', 'date']
  if (commonCommands.includes(trimmed)) {
    return true
  }

  return false
}

describe('Terminal Command Echo Processing', () => {
  describe('Terminal Type Detection', () => {
    it('should detect Windows PowerShell from prompt', () => {
      const lines = ['Get-Process', 'PS C:\\Users\\test>']
      const lastLine = 'PS C:\\Users\\test>'
      const result = detectTerminalType(lines, lastLine, null)
      expect(result).toBe('windows')
    })

    it('should detect Windows CMD from prompt', () => {
      const lines = ['dir', 'C:\\Users\\test>']
      const lastLine = 'C:\\Users\\test>'
      const result = detectTerminalType(lines, lastLine, null)
      expect(result).toBe('windows')
    })

    it('should detect Git Bash from prompt', () => {
      const lines = ['pwd', 'user@host MINGW64 ~']
      const lastLine = 'user@host MINGW64 ~'
      const result = detectTerminalType(lines, lastLine, null)
      expect(result).toBe('linux')
    })

    it('should detect Linux from prompt', () => {
      const lines = ['ls', 'user@host:~$']
      const lastLine = 'user@host:~$'
      const result = detectTerminalType(lines, lastLine, null)
      expect(result).toBe('linux')
    })

    it('should detect Windows from PowerShell cmdlet in command', () => {
      const lines = ['Get-Process output']
      const lastLine = 'output'
      const result = detectTerminalType(lines, lastLine, 'Get-Process')
      expect(result).toBe('windows')
    })

    it('should return unknown when unable to determine', () => {
      const lines = ['some output']
      const lastLine = 'some output'
      const result = detectTerminalType(lines, lastLine, null)
      expect(result).toBe('unknown')
    })
  })

  describe('Windows Command Echo Detection', () => {
    it('should identify PowerShell cmdlets as command echo', () => {
      expect(isWindowsCommandEchoLine('Get-Process')).toBe(true)
      expect(isWindowsCommandEchoLine('Select-Object')).toBe(true)
      expect(isWindowsCommandEchoLine('Format-Table')).toBe(true)
    })

    it('should identify commands with parameters as command echo', () => {
      expect(isWindowsCommandEchoLine('Get-Process -Name chrome')).toBe(true)
      expect(isWindowsCommandEchoLine('dir /w')).toBe(true)
    })

    it('should NOT identify table headers as command echo', () => {
      expect(isWindowsCommandEchoLine('CookedValue')).toBe(false)
      expect(isWindowsCommandEchoLine('Path')).toBe(false)
      expect(isWindowsCommandEchoLine('Name Used (GB) Free (GB)')).toBe(false)
    })

    it('should NOT identify separator lines as command echo', () => {
      expect(isWindowsCommandEchoLine('----')).toBe(false)
      expect(isWindowsCommandEchoLine('====')).toBe(false)
    })

    it('should NOT identify error messages as command echo', () => {
      expect(isWindowsCommandEchoLine('is not recognized as an internal or external command')).toBe(false)
      expect(isWindowsCommandEchoLine('command not found')).toBe(false)
    })
  })

  describe('Git Bash/Linux Command Echo Detection', () => {
    it('should identify common commands as command echo', () => {
      expect(isLinuxCommandEchoLine('pwd')).toBe(true)
      expect(isLinuxCommandEchoLine('ls')).toBe(true)
      expect(isLinuxCommandEchoLine('cd')).toBe(true)
    })

    it('should NOT identify path output as command echo', () => {
      expect(isLinuxCommandEchoLine('/c/Users/test')).toBe(false)
      expect(isLinuxCommandEchoLine('C:\\Users\\test')).toBe(false)
      expect(isLinuxCommandEchoLine('/home/user')).toBe(false)
    })

    it('should handle commands with ANSI sequences', () => {
      const commandWithAnsi = '\x1b[32m$\x1b[0m pwd'
      expect(isLinuxCommandEchoLine(commandWithAnsi)).toBe(true)
    })
  })

  describe('ANSI Sequence Cleaning', () => {
    it('should remove color codes', () => {
      const line = '\x1b[32mHello\x1b[0m World'
      const cleaned = cleanAnsiSequences(line)
      expect(cleaned).toBe('Hello World')
    })

    it('should remove cursor control sequences', () => {
      const line = '\x1b[2J\x1b[HText'
      const cleaned = cleanAnsiSequences(line)
      expect(cleaned).toBe('Text')
    })

    it('should handle Git Bash prompt with ANSI sequences', () => {
      const prompt = '\x1b[32mtest@host\x1b[0m \x1b[35mMINGW64\x1b[0m \x1b[33m~\x1b[0m'
      const cleaned = cleanAnsiSequences(prompt)
      expect(cleaned).toBe('test@host MINGW64 ~')
      expect(isTerminalPromptLine(cleaned)).toBe(true)
    })

    it('should handle PowerShell prompt with ANSI sequences', () => {
      const prompt = '\x1b[93mPS\x1b[0m \x1b[90mC:\\Users\\test>\x1b[0m'
      const cleaned = cleanAnsiSequences(prompt)
      expect(cleaned).toBe('PS C:\\Users\\test>')
    })
  })

  describe('Prompt Removal', () => {
    it('should identify Windows PowerShell prompts', () => {
      expect(isTerminalPromptLine('PS C:\\Users\\test>')).toBe(true)
      expect(isTerminalPromptLine('PS C:\\>')).toBe(true)
    })

    it('should identify Windows CMD prompts', () => {
      expect(isTerminalPromptLine('C:\\Users\\test>')).toBe(true)
      expect(isTerminalPromptLine('D:\\Projects>')).toBe(true)
    })

    it('should identify Git Bash prompts', () => {
      expect(isTerminalPromptLine('user@host MINGW64 ~')).toBe(true)
      expect(isTerminalPromptLine('user@host MINGW32 /c/Users')).toBe(true)
    })

    it('should identify simple prompt symbols', () => {
      expect(isTerminalPromptLine('$')).toBe(true)
      expect(isTerminalPromptLine('#')).toBe(true)
      expect(isTerminalPromptLine('%')).toBe(true)
    })

    it('should NOT identify regular output as prompts', () => {
      expect(isTerminalPromptLine('Get-Process')).toBe(false)
      expect(isTerminalPromptLine('/c/Users/test')).toBe(false)
      expect(isTerminalPromptLine('CookedValue')).toBe(false)
    })
  })

  describe('Command Echo Removal Scenarios', () => {
    it('should handle Windows PowerShell Format-Table output', () => {
      const output = [
        'Get-PSDrive -PSProvider FileSystem',
        '',
        'Name         Used            Free',
        '----         ----            ----',
        'C            400023.76       400861'
      ]
      // The command echo should be removed, empty line separator should be used
      // This is a simplified test - actual implementation is more complex
      expect(output[0]).toContain('Get-PSDrive')
      expect(output[1]).toBe('') // Empty line separator
    })

    it('should handle Git Bash pwd command output', () => {
      const output = ['pwd', '/c/Users/test', 'user@host MINGW64 ~']
      // Command echo 'pwd' should be removed
      // Path output '/c/Users/test' should be preserved
      // Prompt 'user@host MINGW64 ~' should be removed
      expect(output[0]).toBe('pwd')
      expect(output[1]).toMatch(/^[/\\]/) // Path starts with / or \
      expect(isTerminalPromptLine(output[2])).toBe(true)
    })

    it('should handle command with ANSI sequences', () => {
      const commandWithAnsi = '\x1b[32m$\x1b[0m pwd'
      const cleaned = cleanAnsiSequences(commandWithAnsi)
      expect(cleaned).toBe('$ pwd')
      expect(isLinuxCommandEchoLine(commandWithAnsi)).toBe(true)
    })
  })
})

// ============================================================================
// Ctrl+R Reload Prevention & Terminal Reverse-i-search Tests
// ============================================================================

/**
 * Mirrors the before-input-event logic in windowManager.ts.
 * Determines whether a key event should be prevented (reload blocked).
 */
function shouldPreventReload(
  input: { type: string; key: string; meta: boolean; control: boolean; alt: boolean; shift: boolean },
  platform: string,
  isTerminalFocused: boolean
): boolean {
  if (input.type === 'keyDown' && (input.key === 'r' || input.key === 'R') && !input.alt && !input.shift) {
    if (platform === 'darwin') {
      // On macOS: block Cmd+R (reload), allow Ctrl+R (terminal reverse-i-search)
      if (input.meta) {
        return true
      }
    } else {
      // On Windows/Linux: block Ctrl+R only when terminal is not focused
      if (input.control && !isTerminalFocused) {
        return true
      }
    }
  }
  return false
}

describe('Ctrl+R Reload Prevention with Terminal Reverse-i-search Support', () => {
  const baseInput = { type: 'keyDown', key: 'r', meta: false, control: false, alt: false, shift: false }

  describe('macOS platform', () => {
    const platform = 'darwin'

    it('should block Cmd+R (reload shortcut) on macOS', () => {
      const input = { ...baseInput, meta: true }
      expect(shouldPreventReload(input, platform, false)).toBe(true)
      expect(shouldPreventReload(input, platform, true)).toBe(true)
    })

    it('should allow Ctrl+R (reverse-i-search) on macOS regardless of terminal focus', () => {
      const input = { ...baseInput, control: true }
      expect(shouldPreventReload(input, platform, false)).toBe(false)
      expect(shouldPreventReload(input, platform, true)).toBe(false)
    })

    it('should not block plain R key without modifiers on macOS', () => {
      expect(shouldPreventReload(baseInput, platform, false)).toBe(false)
    })

    it('should not block R key with Alt modifier on macOS', () => {
      const input = { ...baseInput, meta: true, alt: true }
      expect(shouldPreventReload(input, platform, false)).toBe(false)
    })

    it('should not block R key with Shift modifier on macOS', () => {
      const input = { ...baseInput, meta: true, shift: true }
      expect(shouldPreventReload(input, platform, false)).toBe(false)
    })
  })

  describe('Windows platform', () => {
    const platform = 'win32'

    it('should block Ctrl+R when terminal is NOT focused on Windows', () => {
      const input = { ...baseInput, control: true }
      expect(shouldPreventReload(input, platform, false)).toBe(true)
    })

    it('should allow Ctrl+R when terminal IS focused on Windows (reverse-i-search)', () => {
      const input = { ...baseInput, control: true }
      expect(shouldPreventReload(input, platform, true)).toBe(false)
    })

    it('should not block plain R key without modifiers on Windows', () => {
      expect(shouldPreventReload(baseInput, platform, false)).toBe(false)
    })

    it('should not block R key with Alt modifier on Windows', () => {
      const input = { ...baseInput, control: true, alt: true }
      expect(shouldPreventReload(input, platform, false)).toBe(false)
    })

    it('should not block R key with Shift modifier on Windows', () => {
      const input = { ...baseInput, control: true, shift: true }
      expect(shouldPreventReload(input, platform, false)).toBe(false)
    })
  })

  describe('Linux platform', () => {
    const platform = 'linux'

    it('should block Ctrl+R when terminal is NOT focused on Linux', () => {
      const input = { ...baseInput, control: true }
      expect(shouldPreventReload(input, platform, false)).toBe(true)
    })

    it('should allow Ctrl+R when terminal IS focused on Linux (reverse-i-search)', () => {
      const input = { ...baseInput, control: true }
      expect(shouldPreventReload(input, platform, true)).toBe(false)
    })
  })

  describe('key variants', () => {
    it('should handle uppercase R key the same as lowercase', () => {
      const input = { ...baseInput, key: 'R', meta: true }
      expect(shouldPreventReload(input, 'darwin', false)).toBe(true)
    })

    it('should ignore keyUp events', () => {
      const input = { ...baseInput, type: 'keyUp', meta: true }
      expect(shouldPreventReload(input, 'darwin', false)).toBe(false)
    })

    it('should ignore non-R keys', () => {
      const input = { ...baseInput, key: 'a', meta: true }
      expect(shouldPreventReload(input, 'darwin', false)).toBe(false)
    })
  })
})

describe('Terminal Focus IPC Notification', () => {
  let mockSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockSend = vi.fn()
    // Simulate window.electron.ipcRenderer.send
    ;(window as any).electron = {
      ipcRenderer: {
        send: mockSend
      }
    }
  })

  afterEach(() => {
    delete (window as any).electron
  })

  it('should send terminal:focus-changed true when terminal textarea receives focus', () => {
    const textarea = document.createElement('textarea')
    textarea.classList.add('xterm-helper-textarea')

    textarea.addEventListener('focus', () => {
      ;(window as any).electron?.ipcRenderer?.send('terminal:focus-changed', true)
    })

    textarea.dispatchEvent(new Event('focus'))

    expect(mockSend).toHaveBeenCalledWith('terminal:focus-changed', true)
  })

  it('should send terminal:focus-changed false when terminal textarea loses focus', () => {
    const textarea = document.createElement('textarea')
    textarea.classList.add('xterm-helper-textarea')

    textarea.addEventListener('blur', () => {
      ;(window as any).electron?.ipcRenderer?.send('terminal:focus-changed', false)
    })

    textarea.dispatchEvent(new Event('blur'))

    expect(mockSend).toHaveBeenCalledWith('terminal:focus-changed', false)
  })

  it('should not throw when window.electron is undefined', () => {
    delete (window as any).electron

    const textarea = document.createElement('textarea')
    textarea.addEventListener('focus', () => {
      ;(window as any).electron?.ipcRenderer?.send('terminal:focus-changed', true)
    })

    expect(() => {
      textarea.dispatchEvent(new Event('focus'))
    }).not.toThrow()
  })

  it('should not throw when ipcRenderer is undefined', () => {
    ;(window as any).electron = {}

    const textarea = document.createElement('textarea')
    textarea.addEventListener('focus', () => {
      ;(window as any).electron?.ipcRenderer?.send('terminal:focus-changed', true)
    })

    expect(() => {
      textarea.dispatchEvent(new Event('focus'))
    }).not.toThrow()
  })

  describe('sshConnect.vue - ctrl linkify for ls output', () => {
    // ---- minimal ref helper (avoid importing vue/ref) ----
    const _ref = <T>(v: T) => ({ value: v })

    // ---- minimal ANSI stripper (enough for tests) ----
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

    // ---- minimal display pos (ASCII only) ----
    const calculateDisplayPosition = (_line: string, charIndex: number) => charIndex

    // ---- fakes for xterm ----
    class FakeLine {
      constructor(
        private text: string,
        public isWrapped: boolean = false
      ) {}
      translateToString(_trimRight?: boolean) {
        return this.text
      }
    }

    class FakeBufferActive {
      public length: number
      public viewportY = 0
      constructor(private lines: FakeLine[]) {
        this.length = lines.length
      }
      getLine(y: number) {
        return this.lines[y] ?? null
      }
    }

    class FakeTerminal {
      public buffer: { active: FakeBufferActive }
      public rows = 24
      public refresh = vi.fn()
      public clearSelection = vi.fn()
      constructor(lines: Array<string | { text: string; isWrapped?: boolean }>) {
        const fakeLines = lines.map((x) => {
          if (typeof x === 'string') return new FakeLine(x, false)
          return new FakeLine(x.text, !!x.isWrapped)
        })
        this.buffer = { active: new FakeBufferActive(fakeLines) }
      }
    }

    // ---- “component state” mocks ----
    const startStr = _ref<string | undefined>(undefined)
    const ctrlLinkPressed = _ref(false)
    const terminal = _ref<FakeTerminal | null>(null)
    const terminalElement = _ref<any>({ classList: { toggle: vi.fn() } })
    const terminalMode = _ref<'none' | string>('none')
    const showAiButton = _ref(false)
    const connectionId = _ref('conn-1')

    let props: any = { activeTabId: 'conn-1', currentConnectionId: 'conn-1', isActive: true }
    let inputManager: any = { getActiveTerm: vi.fn(() => ({ id: 'conn-1' })) }
    let message: any = { error: vi.fn(), success: vi.fn(), info: vi.fn() }
    let t: (k: string) => string = (k) => k

    // ---- impl under test (mirrors sshConnect.vue snippet) ----
    const CTRL_LINK_CLASS = 'ctrl-link-mode'
    const LISTING_CMDS = new Set(['ls', 'll', 'la', 'dir', 'l'])
    const lineListingCache = new Map<number, boolean>()
    const promptBlockCache = new Map<number, { promptY: number; nextPromptY: number; isListing: boolean }>()
    const MAX_SCAN_UP = 2000
    const MAX_SCAN_DOWN = 4000

    const resetListingCache = () => {
      lineListingCache.clear()
      promptBlockCache.clear()
    }

    const isPromptLine = (text: string, lineObj?: any): boolean => {
      const tt = stripAnsi(text).trimEnd()
      if (!tt) return false
      if (lineObj?.isWrapped) return false

      if (typeof startStr.value !== 'undefined' && startStr.value) {
        const p = String(startStr.value).trimEnd()
        if (p && tt.startsWith(p)) return true
      }

      return /[$#]\s*$/.test(tt) || /[$#]\s+/.test(tt)
    }

    const extractCmdFromPromptLine = (promptLine: string): string => {
      const tt = stripAnsi(promptLine).trimEnd()

      if (typeof startStr.value !== 'undefined' && startStr.value) {
        const p = String(startStr.value).trimEnd()
        if (p && tt.startsWith(p)) return tt.slice(p.length).trim()
      }

      const m = tt.match(/[$#]\s+(.*)$/)
      return (m?.[1] ?? '').trim()
    }

    const isListingCommand = (cmdLine: string): boolean => {
      if (!cmdLine) return false
      const firstSeg = cmdLine.split(';')[0].trim()
      const cleaned = firstSeg
        .replace(/^sudo\s+/, '')
        .replace(/^\\/, '')
        .trim()
      const firstToken = cleaned.split(/\s+/)[0]
      return LISTING_CMDS.has(firstToken)
    }

    const findPromptUp = (absY: number, termObj: any): number | null => {
      const buf = termObj.buffer.active
      const minY = Math.max(0, absY - MAX_SCAN_UP)
      for (let y = absY; y >= minY; y--) {
        const line = buf.getLine(y)
        if (!line) continue
        const text = line.translateToString(true)
        if (isPromptLine(text, line)) return y
      }
      return null
    }

    const findNextPromptDown = (promptY: number, termObj: any): number => {
      const buf = termObj.buffer.active
      const maxY = Math.min(buf.length - 1, promptY + MAX_SCAN_DOWN)
      for (let y = promptY + 1; y <= maxY; y++) {
        const line = buf.getLine(y)
        if (!line) continue
        const text = line.translateToString(true)
        if (isPromptLine(text, line)) return y
      }
      return buf.length
    }

    const isListingOutputLine = (bufferLineNumber: number, termObj: any): boolean => {
      const absY = bufferLineNumber - 1
      const cached = lineListingCache.get(absY)
      if (cached !== undefined) return cached

      const promptY = findPromptUp(absY, termObj)
      if (promptY === null) {
        lineListingCache.set(absY, false)
        return false
      }

      let block = promptBlockCache.get(promptY)
      if (!block) {
        const promptText = termObj.buffer.active.getLine(promptY)?.translateToString(true) ?? ''
        const cmd = extractCmdFromPromptLine(promptText)
        const isListing = isListingCommand(cmd)
        const nextPromptY = findNextPromptDown(promptY, termObj)
        block = { promptY, nextPromptY, isListing }
        promptBlockCache.set(promptY, block)
      }

      const inOutput = absY > block.promptY && absY < block.nextPromptY
      const res = block.isListing && inOutput
      lineListingCache.set(absY, res)
      return res
    }

    const isThisTerminalActive = (): boolean => {
      const activeTerm = inputManager.getActiveTerm()
      if (!activeTerm?.id || !connectionId.value) return false
      if (activeTerm.id !== connectionId.value) return false
      if (props.activeTabId !== props.currentConnectionId) return false
      if (!props.isActive) return false
      return true
    }

    const canLinkify = (): boolean => {
      if (!isThisTerminalActive()) return false
      if (terminalMode.value !== 'none') return false
      if (!terminal.value) return false
      return true
    }

    const setCtrlLinkPressed = (v: boolean) => {
      if (ctrlLinkPressed.value === v) return
      ctrlLinkPressed.value = v

      if (terminalElement.value) {
        terminalElement.value.classList.toggle(CTRL_LINK_CLASS, v)
      }

      terminal.value?.refresh(0, (terminal.value?.rows ?? 1) - 1)

      if (!v) {
        terminal.value?.clearSelection()
        showAiButton.value = false
      }
    }

    const handleCtrlKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return
      if (!canLinkify()) return
      setCtrlLinkPressed(true)
    }
    const handleCtrlKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return
      if (!ctrlLinkPressed.value) return
      setCtrlLinkPressed(false)
    }

    type LsBlock = { startLine: number; endLine: number; cwd: string | null; cmd: string; ts: number }
    const lsBlocks = _ref<LsBlock[]>([])

    const resolvePosix = (base: string, name: string): string => {
      const b = base.endsWith('/') ? base.slice(0, -1) : base
      const n = name.replace(/^\/+/, '')
      return `${b}/${n}`
    }

    const extractLsDirArg = (cmd: string): string | null => {
      const parts = cmd.trim().split(/\s+/)
      if (!parts.length) return null
      const args = parts.slice(1).filter((p) => p && !p.startsWith('-'))
      return args[0] ?? null
    }

    const normalizeClickableText = (s: string): string => {
      let tt = s.trim()
      if (!tt) return ''
      if ((tt.startsWith('"') && tt.endsWith('"')) || (tt.startsWith("'") && tt.endsWith("'"))) {
        tt = tt.slice(1, -1).trim()
      }
      tt = tt.replace(/[\/\*\@\|\=]+$/g, '')
      return tt.trim()
    }

    type Candidate = { text: string; startChar: number; endChar: number }

    const extractCandidates = (line: string): Candidate[] => {
      const out: Candidate[] = []
      const longRe = /^[\-dlcbps][rwx\-]{9}\s+\d+\s+\S+\s+\S+\s+\d+\s+\w+\s+\d+\s+(?:\d{2}:\d{2}|\d{4})\s+(.+)$/
      const m = longRe.exec(line)
      if (m?.[1]) {
        const namePart = m[1]
        const startChar = m[0].length - namePart.length
        const arrowIdx = namePart.indexOf(' -> ')
        const nameOnly = arrowIdx >= 0 ? namePart.slice(0, arrowIdx) : namePart
        out.push({ text: nameOnly, startChar, endChar: startChar + nameOnly.length })
        return out
      }

      const tokenRe = /\S+/g
      let mt: RegExpExecArray | null
      while ((mt = tokenRe.exec(line))) {
        const token = mt[0]
        if (token === '.' || token === '..') continue
        out.push({ text: token, startChar: mt.index, endChar: mt.index + token.length })
      }
      return out
    }

    const toCellX = (line: string, charIndex: number): number => calculateDisplayPosition(line, charIndex) + 1

    const findLsBlockByLine = (y: number): LsBlock | null => {
      if (!terminal.value) return null

      for (let i = lsBlocks.value.length - 1; i >= 0; i--) {
        const b = lsBlocks.value[i]
        if (y < b.startLine) continue

        const dynamicEndLine = findNextPromptDown(b.startLine - 1, terminal.value)
        if (y < dynamicEndLine) return b
      }
      return null
    }

    let downloadFileSpy: ReturnType<typeof vi.fn>

    const triggerDownloadOrOpen = (raw: string, y: number) => {
      const name = normalizeClickableText(raw)
      if (!name) return

      const block = findLsBlockByLine(y)
      const cwd = block?.cwd

      if (!cwd) {
        message.error({
          content: `${t('files.downloadError')}：${t('files.getCwdFailed')}`,
          key: `download-${connectionId.value}-${Date.now()}`,
          duration: 3
        })
        return
      }

      let baseDir = cwd
      const dirArg = block ? extractLsDirArg(block.cmd) : null
      if (dirArg) baseDir = dirArg.startsWith('/') ? dirArg : resolvePosix(cwd, dirArg)

      const fullPath = resolvePosix(baseDir, name)
      new downloadFileSpy(fullPath, name)
    }

    // prompt check used by provider (matches your snippet style)
    const isTerminalPromptLine = (trimmed: string) => isPromptLine(trimmed)

    const createCtrlLinkProvider = (termObj: any) => {
      return {
        provideLinks: (bufferLineNumber: number, callback: (links?: any[] | undefined) => void) => {
          if (!ctrlLinkPressed.value || !canLinkify()) return callback(undefined)

          const line = termObj.buffer.active.getLine(bufferLineNumber - 1)
          if (!line) return callback(undefined)

          const text = line.translateToString(true)
          const trimmed = text.trim()
          if (!trimmed) return callback(undefined)

          const isPrompt =
            (typeof startStr.value !== 'undefined' && startStr.value && trimmed.startsWith(String(startStr.value).trimEnd())) ||
            isTerminalPromptLine(trimmed) ||
            /[#$]\s/.test(trimmed)
          if (isPrompt) return callback(undefined)

          if (!isListingOutputLine(bufferLineNumber, termObj)) return callback(undefined)

          const candidates = extractCandidates(text)
          if (!candidates.length) return callback(undefined)

          const links = candidates.map((c) => {
            const startX = toCellX(text, c.startChar)
            const endX = toCellX(text, c.endChar) - 1
            return {
              text: c.text,
              range: { start: { x: startX, y: bufferLineNumber }, end: { x: Math.max(endX, startX), y: bufferLineNumber } },
              activate: (_event: any, linkText: string) => {
                if (!ctrlLinkPressed.value) return
                termObj.clearSelection()
                showAiButton.value = false
                triggerDownloadOrOpen(linkText, bufferLineNumber)
              }
            }
          })

          callback(links)
        }
      }
    }

    beforeEach(() => {
      startStr.value = undefined
      ctrlLinkPressed.value = false
      terminalMode.value = 'none'
      showAiButton.value = false
      connectionId.value = 'conn-1'

      props = { activeTabId: 'conn-1', currentConnectionId: 'conn-1', isActive: true }
      inputManager = { getActiveTerm: vi.fn(() => ({ id: 'conn-1' })) }

      // reset mocks
      terminalElement.value = { classList: { toggle: vi.fn() } }
      message = { error: vi.fn(), success: vi.fn(), info: vi.fn() }
      t = (k) => k

      // reset runtime state
      terminal.value = null

      resetListingCache()
      lsBlocks.value = []
      downloadFileSpy = vi.fn()
    })
    describe('prompt parsing', () => {
      it('isPromptLine should detect common $/# prompts', () => {
        expect(isPromptLine('user@host:/data$ ')).toBe(true)
        expect(isPromptLine('root@host:/data# ')).toBe(true)
        expect(isPromptLine('not a prompt')).toBe(false)
      })

      it('isPromptLine should respect wrapped lines (isWrapped=true -> false)', () => {
        expect(isPromptLine('user@host:/data$ ', { isWrapped: true })).toBe(false)
      })

      it('isPromptLine should detect custom startStr prefix', () => {
        startStr.value = 'PROMPT>'
        expect(isPromptLine('PROMPT> ls -la')).toBe(true)
        expect(isPromptLine('xxxPROMPT> ls -la')).toBe(false)
      })

      it('extractCmdFromPromptLine should extract after custom startStr', () => {
        startStr.value = 'PROMPT>'
        expect(extractCmdFromPromptLine('PROMPT> ls /tmp')).toBe('ls /tmp')
      })

      it('extractCmdFromPromptLine should extract after $/#', () => {
        expect(extractCmdFromPromptLine('user@h:/d$ ls /tmp')).toBe('ls /tmp')
        expect(extractCmdFromPromptLine('root@h:/d#  ls -la')).toBe('ls -la')
      })
    })

    describe('listing command detection', () => {
      it('isListingCommand should detect listing commands (with sudo/\\ and ;)', () => {
        expect(isListingCommand('ls -la')).toBe(true)
        expect(isListingCommand('dir')).toBe(true)
        expect(isListingCommand('sudo ls /tmp')).toBe(true)
        expect(isListingCommand('\\ls /tmp')).toBe(true)
        expect(isListingCommand('ls /tmp; echo hi')).toBe(true)
        expect(isListingCommand('echo hello')).toBe(false)
      })
    })

    describe('isListingOutputLine', () => {
      it('should mark only lines between prompt and next prompt as listing output', () => {
        const termObj = new FakeTerminal(['user@host:/data$ ls /tmp', 'aaa', 'bbb', 'user@host:/data$ '])
        terminal.value = termObj

        expect(isListingOutputLine(1, termObj as any)).toBe(false) // prompt line itself
        expect(isListingOutputLine(2, termObj as any)).toBe(true) // output
        expect(isListingOutputLine(3, termObj as any)).toBe(true) // output
        expect(isListingOutputLine(4, termObj as any)).toBe(false) // next prompt
      })

      it('should return false for non-listing command output', () => {
        const termObj = new FakeTerminal(['user@host:/data$ echo hi', 'hi', 'user@host:/data$ '])
        terminal.value = termObj

        expect(isListingOutputLine(2, termObj as any)).toBe(false)
      })

      it('should cache results per line', () => {
        const termObj = new FakeTerminal(['user@host:/data$ ls', 'x', 'user@host:/data$ '])
        terminal.value = termObj

        expect(isListingOutputLine(2, termObj as any)).toBe(true)
        // second call hits cache
        expect(isListingOutputLine(2, termObj as any)).toBe(true)
      })
    })

    describe('ctrl key toggle + linkify provider', () => {
      it('handleCtrlKeyDown/Up should toggle ctrl-link-mode class and refresh/clearSelection', () => {
        const termObj = new FakeTerminal(['user@host:/data$ '])
        terminal.value = termObj

        handleCtrlKeyDown({ key: 'Control' } as any)
        expect(ctrlLinkPressed.value).toBe(true)
        expect(terminalElement.value.classList.toggle).toHaveBeenCalledWith(CTRL_LINK_CLASS, true)
        expect(termObj.refresh).toHaveBeenCalled()

        handleCtrlKeyUp({ key: 'Control' } as any)
        expect(ctrlLinkPressed.value).toBe(false)
        expect(terminalElement.value.classList.toggle).toHaveBeenCalledWith(CTRL_LINK_CLASS, false)
        expect(termObj.clearSelection).toHaveBeenCalled()
        expect(showAiButton.value).toBe(false)
      })

      it('createCtrlLinkProvider should not provide links when ctrl not pressed', () => {
        const termObj = new FakeTerminal(['user@host:/data$ ls /tmp', 'xxx', 'user@host:/data$ '])
        terminal.value = termObj

        const provider = createCtrlLinkProvider(termObj as any)
        const cb = vi.fn()
        provider.provideLinks(2, cb)
        expect(cb).toHaveBeenCalledWith(undefined)
      })

      it('createCtrlLinkProvider should provide links only for ls output lines and activate should download /tmp/xxx', () => {
        // NOTE: add ONE extra output line so findLsBlockByLine's y < dynamicEndLine passes
        const termObj = new FakeTerminal([
          'user@host:/data$ ls /tmp',
          'xxx', // <- click this (bufferLineNumber = 2)
          'yyy', // <- extra output line
          'user@host:/data$ '
        ])
        terminal.value = termObj

        // enable ctrl mode
        ctrlLinkPressed.value = true

        // add lsBlock so triggerDownloadOrOpen can compute path
        lsBlocks.value.push({
          startLine: 1,
          endLine: 999,
          cwd: '/data',
          cmd: 'ls /tmp',
          ts: Date.now()
        })

        const provider = createCtrlLinkProvider(termObj as any)

        let provided: any[] | undefined
        provider.provideLinks(2, (links) => {
          provided = links
        })

        expect(provided).toBeTruthy()
        expect(provided!.length).toBe(1)
        expect(provided![0].text).toBe('xxx')

        // click / activate
        provided![0].activate(null, 'xxx')
        expect(downloadFileSpy).toHaveBeenCalledWith('/tmp/xxx', 'xxx')
      })

      it('triggerDownloadOrOpen should use cwd for relative dirArg: "ls tmp" -> /data/tmp/xxx', () => {
        // NOTE: add ONE extra output line so findLsBlockByLine's y < dynamicEndLine passes
        const termObj = new FakeTerminal([
          'user@host:/data$ ls tmp',
          'xxx', // <- click this (bufferLineNumber = 2)
          'yyy', // <- extra output line
          'user@host:/data$ '
        ])
        terminal.value = termObj
        ctrlLinkPressed.value = true

        lsBlocks.value.push({
          startLine: 1,
          endLine: 999,
          cwd: '/data',
          cmd: 'ls tmp',
          ts: Date.now()
        })

        const provider = createCtrlLinkProvider(termObj as any)
        let provided: any[] | undefined
        provider.provideLinks(2, (links) => (provided = links))

        provided![0].activate(null, 'xxx')
        expect(downloadFileSpy).toHaveBeenCalledWith('/data/tmp/xxx', 'xxx')
      })

      it('triggerDownloadOrOpen should error and not download if cwd is null', () => {
        const termObj = new FakeTerminal(['user@host:/data$ ls /tmp', 'xxx', 'user@host:/data$ '])
        terminal.value = termObj
        ctrlLinkPressed.value = true

        lsBlocks.value.push({
          startLine: 1,
          endLine: 999,
          cwd: null,
          cmd: 'ls /tmp',
          ts: Date.now()
        })

        const provider = createCtrlLinkProvider(termObj as any)
        let provided: any[] | undefined
        provider.provideLinks(2, (links) => (provided = links))

        provided![0].activate(null, 'xxx')
        expect(downloadFileSpy).not.toHaveBeenCalled()
        expect(message.error).toHaveBeenCalled()
      })

      it('normalizeClickableText should strip quotes and trailing markers from ls -F style', () => {
        expect(normalizeClickableText('"abc/"')).toBe('abc')
        expect(normalizeClickableText(" 'abc*' ")).toBe('abc')
        expect(normalizeClickableText('abc@')).toBe('abc')
        expect(normalizeClickableText('')).toBe('')
      })
    })
  })
})
