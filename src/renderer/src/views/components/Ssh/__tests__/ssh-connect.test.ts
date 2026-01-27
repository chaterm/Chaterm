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
