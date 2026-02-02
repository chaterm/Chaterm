import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useCommandSelect } from '../useCommandSelect'

// Mock window.api
const mockKbGetRoot = vi.fn()
const mockKbListDir = vi.fn()
const mockKbEnsureRoot = vi.fn()

vi.stubGlobal('window', {
  api: {
    kbGetRoot: mockKbGetRoot,
    kbListDir: mockKbListDir,
    kbEnsureRoot: mockKbEnsureRoot
  }
})

describe('useCommandSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockKbGetRoot.mockResolvedValue({ root: '/Users/test/.chaterm/knowledgebase' })
    mockKbEnsureRoot.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchCommandOptions', () => {
    it('should fetch commands from commands directory', async () => {
      mockKbListDir.mockResolvedValue([
        { name: 'deploy-guide.md', relPath: 'commands/deploy-guide.md', type: 'file' },
        { name: 'troubleshoot.md', relPath: 'commands/troubleshoot.md', type: 'file' }
      ])

      const { fetchCommandOptions, commandOptions, commandOptionsLoading } = useCommandSelect()

      expect(commandOptionsLoading.value).toBe(false)
      await fetchCommandOptions()

      expect(mockKbListDir).toHaveBeenCalledWith('commands')
      expect(commandOptions.value).toHaveLength(2)
      expect(commandOptions.value[0]).toEqual({
        name: 'deploy-guide',
        relPath: 'commands/deploy-guide.md',
        absPath: '/Users/test/.chaterm/knowledgebase/commands/deploy-guide.md',
        type: 'file'
      })
    })

    it('should filter out directories from command list', async () => {
      mockKbListDir.mockResolvedValue([
        { name: 'subdir', relPath: 'commands/subdir', type: 'dir' },
        { name: 'valid-cmd.md', relPath: 'commands/valid-cmd.md', type: 'file' }
      ])

      const { fetchCommandOptions, commandOptions } = useCommandSelect()
      await fetchCommandOptions()

      expect(commandOptions.value).toHaveLength(1)
      expect(commandOptions.value[0].name).toBe('valid-cmd')
    })

    it('should handle empty commands directory', async () => {
      mockKbListDir.mockResolvedValue([])

      const { fetchCommandOptions, commandOptions } = useCommandSelect()
      await fetchCommandOptions()

      expect(commandOptions.value).toHaveLength(0)
    })

    it('should handle error when fetching commands', async () => {
      mockKbListDir.mockRejectedValue(new Error('Directory not found'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { fetchCommandOptions, commandOptions } = useCommandSelect()
      await fetchCommandOptions()

      expect(commandOptions.value).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('filteredCommandOptions', () => {
    it('should filter commands by search value', async () => {
      mockKbListDir.mockResolvedValue([
        { name: 'deploy-production.md', relPath: 'commands/deploy-production.md', type: 'file' },
        { name: 'deploy-staging.md', relPath: 'commands/deploy-staging.md', type: 'file' },
        { name: 'troubleshoot.md', relPath: 'commands/troubleshoot.md', type: 'file' }
      ])

      const { fetchCommandOptions, filteredCommandOptions, searchValue } = useCommandSelect()
      await fetchCommandOptions()

      searchValue.value = 'deploy'
      await nextTick()

      expect(filteredCommandOptions.value).toHaveLength(2)
      expect(filteredCommandOptions.value.every((c) => c.name.includes('deploy'))).toBe(true)
    })

    it('should return all commands when search is empty', async () => {
      mockKbListDir.mockResolvedValue([
        { name: 'cmd1.md', relPath: 'commands/cmd1.md', type: 'file' },
        { name: 'cmd2.md', relPath: 'commands/cmd2.md', type: 'file' }
      ])

      const { fetchCommandOptions, filteredCommandOptions, searchValue } = useCommandSelect()
      await fetchCommandOptions()

      searchValue.value = ''
      await nextTick()

      expect(filteredCommandOptions.value).toHaveLength(2)
    })

    it('should be case-insensitive when filtering', async () => {
      mockKbListDir.mockResolvedValue([{ name: 'DeployGuide.md', relPath: 'commands/DeployGuide.md', type: 'file' }])

      const { fetchCommandOptions, filteredCommandOptions, searchValue } = useCommandSelect()
      await fetchCommandOptions()

      searchValue.value = 'deploy'
      await nextTick()

      expect(filteredCommandOptions.value).toHaveLength(1)
    })
  })

  describe('onCommandClick', () => {
    it('should call chip insert handler with correct parameters', async () => {
      mockKbListDir.mockResolvedValue([{ name: 'my-command.md', relPath: 'commands/my-command.md', type: 'file' }])

      const mockInsertHandler = vi.fn()
      const { fetchCommandOptions, commandOptions, onCommandClick, setCommandChipInsertHandler } = useCommandSelect()

      setCommandChipInsertHandler(mockInsertHandler)
      await fetchCommandOptions()

      onCommandClick(commandOptions.value[0])

      expect(mockInsertHandler).toHaveBeenCalledWith('/my-command', '/my-command', '/Users/test/.chaterm/knowledgebase/commands/my-command.md')
    })

    it('should close popup after command selection', async () => {
      mockKbListDir.mockResolvedValue([{ name: 'cmd.md', relPath: 'commands/cmd.md', type: 'file' }])

      const { fetchCommandOptions, commandOptions, onCommandClick, showCommandPopup } = useCommandSelect()
      await fetchCommandOptions()

      showCommandPopup.value = true
      onCommandClick(commandOptions.value[0])

      expect(showCommandPopup.value).toBe(false)
    })
  })

  describe('buildCommandRef', () => {
    it('should build ContextCommandRef with path', () => {
      const { buildCommandRef } = useCommandSelect()

      const ref = buildCommandRef('my-command', '/kb/commands/my-command.md')

      expect(ref).toEqual({
        command: '/my-command',
        label: '/my-command',
        path: '/kb/commands/my-command.md'
      })
    })
  })

  describe('popup state management', () => {
    it('should open popup and fetch commands', async () => {
      mockKbListDir.mockResolvedValue([])

      const { handleShowCommandPopup, showCommandPopup } = useCommandSelect()

      expect(showCommandPopup.value).toBe(false)
      await handleShowCommandPopup()

      expect(showCommandPopup.value).toBe(true)
      expect(mockKbListDir).toHaveBeenCalledWith('commands')
    })

    it('should close popup when already open', async () => {
      mockKbListDir.mockResolvedValue([])

      const { handleShowCommandPopup, showCommandPopup, closeCommandPopup } = useCommandSelect()

      await handleShowCommandPopup()
      expect(showCommandPopup.value).toBe(true)

      closeCommandPopup()
      expect(showCommandPopup.value).toBe(false)
    })

    it('should reset search value when closing popup', async () => {
      mockKbListDir.mockResolvedValue([])

      const { handleShowCommandPopup, searchValue, closeCommandPopup } = useCommandSelect()

      await handleShowCommandPopup()
      searchValue.value = 'test'
      closeCommandPopup()

      expect(searchValue.value).toBe('')
    })
  })

  describe('keyboard navigation', () => {
    it('should handle ArrowDown key', async () => {
      mockKbListDir.mockResolvedValue([
        { name: 'cmd1.md', relPath: 'commands/cmd1.md', type: 'file' },
        { name: 'cmd2.md', relPath: 'commands/cmd2.md', type: 'file' }
      ])

      const { fetchCommandOptions, handleSearchKeyDown, keyboardSelectedIndex } = useCommandSelect()
      await fetchCommandOptions()

      expect(keyboardSelectedIndex.value).toBe(-1)

      const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent
      handleSearchKeyDown(event)

      expect(keyboardSelectedIndex.value).toBe(0)
    })

    it('should handle ArrowUp key', async () => {
      mockKbListDir.mockResolvedValue([
        { name: 'cmd1.md', relPath: 'commands/cmd1.md', type: 'file' },
        { name: 'cmd2.md', relPath: 'commands/cmd2.md', type: 'file' }
      ])

      const { fetchCommandOptions, handleSearchKeyDown, keyboardSelectedIndex } = useCommandSelect()
      await fetchCommandOptions()

      keyboardSelectedIndex.value = 1
      const event = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as KeyboardEvent
      handleSearchKeyDown(event)

      expect(keyboardSelectedIndex.value).toBe(0)
    })

    it('should handle Enter key to select command', async () => {
      mockKbListDir.mockResolvedValue([{ name: 'cmd1.md', relPath: 'commands/cmd1.md', type: 'file' }])

      const mockInsertHandler = vi.fn()
      const { fetchCommandOptions, handleSearchKeyDown, keyboardSelectedIndex, setCommandChipInsertHandler } = useCommandSelect()

      setCommandChipInsertHandler(mockInsertHandler)
      await fetchCommandOptions()

      keyboardSelectedIndex.value = 0
      const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent
      handleSearchKeyDown(event)

      expect(mockInsertHandler).toHaveBeenCalled()
    })

    it('should handle Escape key to close popup', async () => {
      mockKbListDir.mockResolvedValue([])

      const { handleShowCommandPopup, handleSearchKeyDown, showCommandPopup } = useCommandSelect()

      await handleShowCommandPopup()
      expect(showCommandPopup.value).toBe(true)

      const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent
      handleSearchKeyDown(event)

      expect(showCommandPopup.value).toBe(false)
    })
  })

  describe('remove slash from input', () => {
    it('should remove trailing slash from text', () => {
      const mockFocusInput = vi.fn()
      const { removeTrailingSlashFromInputParts } = useCommandSelect({
        focusInput: mockFocusInput
      })

      const parts = ref([{ type: 'text' as const, text: 'hello /' }])
      removeTrailingSlashFromInputParts(parts)

      expect(parts.value[0].text).toBe('hello ')
    })
  })
})
