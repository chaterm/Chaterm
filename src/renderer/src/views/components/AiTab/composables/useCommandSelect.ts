import { ref, computed, nextTick, onMounted, onUnmounted, type Ref, type InjectionKey } from 'vue'
import type { ContextCommandRef, ContentPart } from '@shared/WebviewMessage'

const logger = createRendererLogger('aitab.commandSelect')

// Command option from knowledge base commands directory
export interface CommandOption {
  name: string // file name without extension
  relPath: string // relative path in knowledge base
  absPath: string // absolute path
  type: 'file'
}

export interface UseCommandSelectOptions {
  focusInput?: () => void
}

// Popup position type supporting both top and bottom positioning
export interface PopupPosition {
  left: number
  top?: number
  bottom?: number
}

// Injection key for command select context
export const commandSelectInjectionKey: InjectionKey<ReturnType<typeof useCommandSelect>> = Symbol('commandSelect')

export function useCommandSelect(options: UseCommandSelectOptions = {}) {
  const { focusInput } = options

  // UI state
  const showCommandPopup = ref(false)
  const searchValue = ref('')
  const keyboardSelectedIndex = ref(-1)
  const popupPosition = ref<PopupPosition | null>(null)
  const popupReady = ref(false)
  const searchInputRef = ref<HTMLInputElement | null>(null)

  // Data state
  const commandOptions = ref<CommandOption[]>([])
  const commandOptionsLoading = ref(false)
  const kbRoot = ref('')

  // Command chip insert handler, set by parent component
  const commandChipInsertHandler = ref<((command: string, label: string, path: string) => void) | null>(null)

  // Filtered command options based on search value
  const filteredCommandOptions = computed(() => {
    if (!searchValue.value.trim()) {
      return commandOptions.value
    }
    const search = searchValue.value.toLowerCase()
    return commandOptions.value.filter((cmd) => cmd.name.toLowerCase().includes(search))
  })

  /**
   * Remove file extension from filename.
   */
  const removeExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.')
    if (lastDot === -1) return filename
    return filename.slice(0, lastDot)
  }

  /**
   * Fetch command options from knowledge base commands directory.
   */
  const fetchCommandOptions = async () => {
    if (commandOptionsLoading.value) return

    commandOptionsLoading.value = true
    try {
      // Ensure kbRoot is fetched
      if (!kbRoot.value) {
        const { root } = await window.api.kbGetRoot()
        kbRoot.value = root
      }

      // List files in commands directory
      const result = await window.api.kbListDir('commands')
      const separator = kbRoot.value.includes('\\') ? '\\' : '/'

      // Filter only files (exclude directories) and map to CommandOption
      commandOptions.value = result
        .filter((item) => item.type === 'file')
        .map((item) => ({
          name: removeExtension(item.name),
          relPath: item.relPath,
          absPath: kbRoot.value + separator + item.relPath.replace(/\//g, separator),
          type: 'file' as const
        }))
    } catch (error) {
      logger.error('Failed to fetch command options', { error: error })
      commandOptions.value = []
    } finally {
      commandOptionsLoading.value = false
    }
  }

  /**
   * Build a ContextCommandRef with path.
   */
  const buildCommandRef = (name: string, absPath: string): ContextCommandRef => {
    return {
      command: `/${name}`,
      label: `/${name}`,
      path: absPath
    }
  }

  /**
   * Handle command selection.
   * Adds '/' prefix to both command and label when inserting chip.
   */
  const onCommandClick = (cmd: CommandOption) => {
    if (commandChipInsertHandler.value) {
      commandChipInsertHandler.value(`/${cmd.name}`, `/${cmd.name}`, cmd.absPath)
    }
    closeCommandPopup()
  }

  /**
   * Set the command chip insert handler.
   */
  const setCommandChipInsertHandler = (handler: (command: string, label: string, path: string) => void) => {
    commandChipInsertHandler.value = handler
  }

  /**
   * Close the command popup and reset state.
   */
  const closeCommandPopup = () => {
    showCommandPopup.value = false
    searchValue.value = ''
    keyboardSelectedIndex.value = -1
    popupPosition.value = null
    popupReady.value = false
    if (focusInput) {
      focusInput()
    }
  }

  /**
   * Show the command popup.
   */
  const handleShowCommandPopup = async (triggerEl?: HTMLElement | null) => {
    if (showCommandPopup.value) {
      closeCommandPopup()
      return
    }

    showCommandPopup.value = true
    popupReady.value = false
    searchValue.value = ''
    keyboardSelectedIndex.value = -1

    // Fetch command options
    await fetchCommandOptions()

    nextTick(() => {
      if (triggerEl) {
        calculatePopupPosition(triggerEl)
      }
      popupReady.value = true
      searchInputRef.value?.focus()
    })
  }

  /**
   * Calculate popup position based on trigger element.
   * Uses bottom positioning (expands upward from input), same as ContextSelectPopup.
   */
  const calculatePopupPosition = (triggerEl: HTMLElement) => {
    try {
      // Find input container - either the element itself or find it via closest
      let inputContainer: HTMLElement | null = null
      if (triggerEl) {
        if (triggerEl.classList.contains('input-send-container')) {
          inputContainer = triggerEl
        } else {
          inputContainer = triggerEl.closest('.input-send-container') as HTMLElement | null
        }
      }

      if (!inputContainer) {
        // Fallback: try to find any input-send-container in the DOM
        inputContainer = document.querySelector('.input-send-container') as HTMLElement | null
      }

      if (!inputContainer) {
        popupPosition.value = null
        return
      }

      const inputRect = inputContainer.getBoundingClientRect()

      const bottom = window.innerHeight - inputRect.top
      const left = inputRect.left

      popupPosition.value = { bottom, left }
    } catch (error) {
      logger.error('Error calculating command popup position', { error: error })
      popupPosition.value = null
    }
  }

  /**
   * Handle keyboard navigation in search input.
   */
  const handleSearchKeyDown = (e: KeyboardEvent) => {
    const currentList = filteredCommandOptions.value

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (currentList.length > 0) {
          if (keyboardSelectedIndex.value === -1) {
            keyboardSelectedIndex.value = 0
          } else {
            keyboardSelectedIndex.value = Math.min(keyboardSelectedIndex.value + 1, currentList.length - 1)
          }
        }
        break

      case 'ArrowUp':
        e.preventDefault()
        if (currentList.length > 0) {
          if (keyboardSelectedIndex.value === -1) {
            keyboardSelectedIndex.value = currentList.length - 1
          } else {
            keyboardSelectedIndex.value = Math.max(keyboardSelectedIndex.value - 1, 0)
          }
        }
        break

      case 'Enter':
        e.preventDefault()
        if (keyboardSelectedIndex.value >= 0 && keyboardSelectedIndex.value < currentList.length) {
          onCommandClick(currentList[keyboardSelectedIndex.value])
        }
        break

      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closeCommandPopup()
        break
    }
  }

  /**
   * Remove trailing slash from input parts.
   */
  const removeTrailingSlashFromInputParts = (chatInputParts: Ref<ContentPart[]>) => {
    const parts = chatInputParts.value
    if (parts.length === 0) return

    const lastPart = parts[parts.length - 1]
    if (lastPart.type === 'text' && lastPart.text.endsWith('/')) {
      lastPart.text = lastPart.text.slice(0, -1)
    }
  }

  /**
   * Global click event handler.
   * This function is used to detect clicks outside of the command select popup (.command-select-popup).
   * If the popup is open and a click occurs outside the popup, the command popup will be closed.
   * This includes clicks on the input element itself, which will close the popup and allow normal editing.
   *
   * @param e MouseEvent object
   */
  const handleGlobalClick = (e: MouseEvent) => {
    if (!showCommandPopup.value) return

    const target = e.target as HTMLElement
    const commandPopup = document.querySelector('.command-select-popup')

    // Check if click is inside popup
    const isInsidePopup = commandPopup && commandPopup.contains(target)

    if (!isInsidePopup) {
      closeCommandPopup()
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleGlobalClick)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleGlobalClick)
  })

  return {
    // UI state
    showCommandPopup,
    searchValue,
    keyboardSelectedIndex,
    popupPosition,
    popupReady,
    searchInputRef,

    // Data state
    commandOptions,
    commandOptionsLoading,
    filteredCommandOptions,

    // Methods
    fetchCommandOptions,
    buildCommandRef,
    onCommandClick,
    setCommandChipInsertHandler,
    closeCommandPopup,
    handleShowCommandPopup,
    handleSearchKeyDown,
    removeTrailingSlashFromInputParts
  }
}
