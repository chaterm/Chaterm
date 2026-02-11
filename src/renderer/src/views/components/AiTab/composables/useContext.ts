import { ref, computed, watch, nextTick, onMounted, onUnmounted, type Ref } from 'vue'
import type { InjectionKey } from 'vue'
import debounce from 'lodash/debounce'

const logger = createRendererLogger('ai.context')
import type { Host, HostOption, HostItemType, ContextMenuLevel, DocOption, ChatOption } from '../types'
import { formatHosts, isSwitchAssetType } from '../utils'
import { isBastionHostType } from '../types'
import { useSessionState } from './useSessionState'
import { useHostState } from './useHostState'
import { focusChatInput } from './useTabManagement'
import { getGlobalState } from '@renderer/agent/storage/state'
import type { TaskHistoryItem } from '../types'
import i18n from '@/locales'
import { Notice } from '@/views/components/Notice'
import type { ContentPart } from '@shared/WebviewMessage'
import eventBus from '@/utils/eventBus'

// Type for the context return value
export type ContextInstance = ReturnType<typeof useContext>

// Injection key for sharing context between parent and child components
export const contextInjectionKey: InjectionKey<ContextInstance> = Symbol('context')

export interface UseContextOptions {
  chatInputParts?: Ref<ContentPart[]>
  focusInput?: () => void
}

/**
 * Maximum number of target hosts allowed for batch execution
 */
const MAX_TARGET_HOSTS = 5

/**
 * Composable for context management (non-singleton)
 * Handles UI state for host/resource selection, search, and popup positioning
 * Each component instance gets its own UI state
 *
 * Note: This composable will be extended to support other resource types in the future
 */
export const useContext = (options: UseContextOptions = {}) => {
  const { t } = i18n.global

  const { hosts, chatTypeValue, autoUpdateHost, chatInputParts: globalChatInputParts } = useSessionState()
  const chatInputParts = options.chatInputParts ?? globalChatInputParts

  const { getCurentTabAssetInfo } = useHostState()

  // ========== Local UI State (per instance) ==========
  // Popup position in viewport coordinates (used with position: fixed)
  // createMode uses bottom positioning (expands upward), editMode uses top positioning
  const popupPosition = ref<{ top?: number; bottom?: number; left: number } | null>(null)
  // Edit mode popup: keep it hidden until it has a final position
  const popupReady = ref(false)
  const currentMode = ref<'create' | 'edit'>('create')

  // Menu level for context popup (main shows categories, others show lists)
  const currentMenuLevel = ref<ContextMenuLevel>('main')

  const searchInputRef = ref()
  const showContextPopup = ref(false)
  // Unified search value for all menu levels
  const searchValue = ref('')
  const hovered = ref<string | null>(null)
  const keyboardSelectedIndex = ref(-1)

  const mainMenuItems = computed<ContextMenuLevel[]>(() => {
    const items: ContextMenuLevel[] = []
    if (chatTypeValue.value !== 'chat' && chatTypeValue.value !== 'cmd') {
      items.push('hosts')
    }
    items.push('docs', 'chats')
    return items
  })

  // ========== Hosts State ==========
  const hostOptions = ref<HostOption[]>([])
  const hostOptionsLoading = ref(false)
  const hostOptionsLimit = 50
  // Track expanded jumpserver nodes (all expanded by default)
  const expandedJumpservers = ref<Set<string>>(new Set())

  // ========== Docs State ==========
  const docsOptions = ref<DocOption[]>([])
  const docsOptionsLoading = ref(false)
  // Cached knowledge base root directory (absolute path)
  const kbRoot = ref<string>('')
  // Current docs directory (relative path from kb root, POSIX-style)
  const docsCurrentRelDir = ref<string>('')
  // Directory stack for docs navigation (used to go back to parent directory)
  const docsDirStack = ref<string[]>([])

  // ========== Chats State ==========
  const chatsOptions = ref<ChatOption[]>([])
  const chatsOptionsLoading = ref(false)
  const chipInsertHandler = ref<((chipType: 'doc' | 'chat', ref: DocOption | ChatOption, label: string) => void) | null>(null)

  // ========== Opened Hosts State ==========
  // List of hosts from currently opened terminal tabs for quick selection
  const openedHostsList = ref<HostOption[]>([])
  const openedHostsLoading = ref(false)

  const toggleJumpserverExpand = (key: string) => {
    if (expandedJumpservers.value.has(key)) {
      expandedJumpservers.value.delete(key)
    } else {
      expandedJumpservers.value.add(key)
    }
    expandedJumpservers.value = new Set(expandedJumpservers.value)
  }

  // Flatten host options with children based on expand state
  const flattenedHostOptions = computed(() => {
    const result: HostOption[] = []

    for (const item of hostOptions.value) {
      const isExpanded = expandedJumpservers.value.has(item.key)
      result.push({
        ...item,
        expanded: isExpanded
      })

      // If it's a bastion host and expanded, add its children
      if (isBastionHostType(item.type) && isExpanded && item.children) {
        for (const child of item.children) {
          result.push({
            key: child.key,
            label: child.label,
            value: child.key,
            uuid: child.uuid,
            connect: child.connection,
            type: child.type as HostItemType,
            selectable: child.selectable,
            organizationUuid: child.organizationUuid,
            assetType: child.assetType,
            level: 1
          })
        }
      }
    }

    return result
  })

  const filteredHostOptions = computed(() => {
    if (chatTypeValue.value === 'chat') {
      return []
    }
    if (chatTypeValue.value === 'cmd') {
      return flattenedHostOptions.value
    }

    const searchTerm = searchValue.value.toLowerCase()
    if (!searchTerm) {
      return flattenedHostOptions.value
    }

    const result: HostOption[] = []
    for (const item of hostOptions.value) {
      const labelMatches = item.label.toLowerCase().includes(searchTerm)

      if (isBastionHostType(item.type)) {
        // Check if any children match
        const matchingChildren = item.children?.filter((child) => child.label.toLowerCase().includes(searchTerm)) || []

        if (labelMatches || matchingChildren.length > 0) {
          // Add bastion host node
          result.push({
            ...item,
            expanded: true
          })
          // Add all matching children (or all children if bastion host label matches)
          const childrenToShow = labelMatches ? item.children || [] : matchingChildren
          for (const child of childrenToShow) {
            result.push({
              key: child.key,
              label: child.label,
              value: child.key,
              uuid: child.uuid,
              connect: child.connection,
              type: child.type as HostItemType,
              selectable: child.selectable,
              organizationUuid: child.organizationUuid,
              level: 1
            })
          }
        }
      } else if (labelMatches) {
        result.push(item)
      }
    }

    return result
  })

  // Filtered docs options based on search value
  const filteredDocsOptions = computed(() => {
    const searchTerm = searchValue.value.toLowerCase()
    if (!searchTerm) {
      return docsOptions.value
    }
    return docsOptions.value.filter((doc) => doc.name.toLowerCase().includes(searchTerm))
  })

  // Filtered chats options based on search value
  const filteredChatsOptions = computed(() => {
    const searchTerm = searchValue.value.toLowerCase()
    if (!searchTerm) {
      return chatsOptions.value
    }
    return chatsOptions.value.filter((chat) => chat.title.toLowerCase().includes(searchTerm))
  })

  // Filtered opened hosts for main menu quick selection
  const filteredOpenedHosts = computed(() => {
    // Only show opened hosts in agent mode
    if (chatTypeValue.value !== 'agent') {
      return []
    }
    const searchTerm = searchValue.value.toLowerCase()
    if (!searchTerm) {
      return openedHostsList.value
    }
    return openedHostsList.value.filter(
      (host) => host.label.toLowerCase().includes(searchTerm) || (host.title && host.title.toLowerCase().includes(searchTerm))
    )
  })

  // Limit displayed opened hosts to max 4 items
  const MAX_DISPLAYED_OPENED_HOSTS = 4
  const displayedOpenedHosts = computed(() => {
    return filteredOpenedHosts.value.slice(0, MAX_DISPLAYED_OPENED_HOSTS)
  })

  // Total items in main menu (displayed opened hosts + category items)
  const mainMenuTotalItems = computed(() => {
    return displayedOpenedHosts.value.length + mainMenuItems.value.length
  })

  const isHostSelected = (hostOption: HostOption): boolean => {
    return hosts.value.some((h) => {
      if (h.uuid === hostOption.uuid) return true
      return h.host === hostOption.label && h.connection === hostOption.connect
    })
  }

  const onHostClick = (item: HostOption) => {
    // Handle bastion host parent node click - toggle expand/collapse
    if (isBastionHostType(item.type) && !item.selectable) {
      toggleJumpserverExpand(item.key)
      return
    }

    const newHost: Host = {
      host: item.label,
      uuid: item.uuid,
      connection: item.isLocalHost ? 'localhost' : item.connect,
      organizationUuid: item.organizationUuid,
      assetType: item.assetType
    }

    const isSwitchHost = isSwitchAssetType(item.assetType)

    if (chatTypeValue.value === 'cmd') {
      hosts.value = [newHost]
    } else if (isSwitchHost) {
      chatTypeValue.value = 'cmd'
      hosts.value = [newHost]
      autoUpdateHost.value = false
      Notice.open({
        type: 'info',
        description: t('ai.switchNotSupportAgent'),
        placement: 'bottomRight'
      })
    } else {
      const existingIndex = hosts.value.findIndex((h) => h.uuid === item.uuid)

      if (existingIndex > -1) {
        hosts.value = hosts.value.filter((_, i) => i !== existingIndex)
      } else {
        let updatedHosts = [...hosts.value]

        if (!item.isLocalHost && item.label !== '127.0.0.1') {
          updatedHosts = updatedHosts.filter((h) => h.host !== '127.0.0.1')
        }

        if (updatedHosts.length >= MAX_TARGET_HOSTS) {
          Notice.open({
            type: 'warning',
            description: t('ai.maxHostsLimitReached', { max: MAX_TARGET_HOSTS }),
            placement: 'bottomRight',
            duration: 2
          })
          return
        }

        hosts.value = [...updatedHosts, newHost]
      }
    }

    autoUpdateHost.value = false

    removeTrailingAtFromInputParts()
  }

  const removeTrailingAtFromInputParts = () => {
    if (chatInputParts.value.length === 0) return
    for (let i = chatInputParts.value.length - 1; i >= 0; i--) {
      const part = chatInputParts.value[i]
      if (part.type !== 'text') continue
      if (part.text.endsWith('@')) {
        const nextText = part.text.slice(0, -1)
        if (nextText.length === 0) {
          chatInputParts.value.splice(i, 1)
        } else {
          chatInputParts.value.splice(i, 1, { ...part, text: nextText })
        }
      }
      break
    }
  }

  const removeHost = (hostToRemove: Host) => {
    const index = hosts.value.findIndex((h) => h.uuid === hostToRemove.uuid)
    if (index > -1) {
      hosts.value = hosts.value.filter((_, i) => i !== index)
      autoUpdateHost.value = false
    }
  }

  const scrollToSelectedItem = () => {
    nextTick(() => {
      const selectedItem = document.querySelector('.select-item.keyboard-selected') as HTMLElement
      if (!selectedItem) return

      const selectList = selectedItem.closest('.select-list') as HTMLElement
      if (!selectList) return

      const listRect = selectList.getBoundingClientRect()
      const itemRect = selectedItem.getBoundingClientRect()

      if (itemRect.top < listRect.top) {
        selectList.scrollTop -= listRect.top - itemRect.top
      } else if (itemRect.bottom > listRect.bottom) {
        selectList.scrollTop += itemRect.bottom - listRect.bottom
      }
    })
  }

  // Get current filtered list based on menu level
  const getCurrentFilteredList = () => {
    switch (currentMenuLevel.value) {
      case 'hosts':
        return filteredHostOptions.value
      case 'docs':
        return filteredDocsOptions.value
      case 'chats':
        return filteredChatsOptions.value
      default:
        return []
    }
  }

  const handleSearchKeyDown = async (e: KeyboardEvent) => {
    if (!showContextPopup.value) return

    const currentList = getCurrentFilteredList()

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (currentMenuLevel.value === 'main') {
          // Main menu: opened hosts + category items
          const maxIndex = Math.max(0, mainMenuTotalItems.value - 1)
          keyboardSelectedIndex.value = Math.min(keyboardSelectedIndex.value + 1, maxIndex)
        } else if (currentList.length > 0) {
          if (keyboardSelectedIndex.value === -1) {
            keyboardSelectedIndex.value = 0
          } else {
            keyboardSelectedIndex.value = Math.min(keyboardSelectedIndex.value + 1, currentList.length - 1)
          }
        }
        scrollToSelectedItem()
        break

      case 'ArrowUp':
        e.preventDefault()
        if (currentMenuLevel.value === 'main') {
          keyboardSelectedIndex.value = Math.max(keyboardSelectedIndex.value - 1, 0)
        } else if (currentList.length > 0) {
          if (keyboardSelectedIndex.value === -1) {
            keyboardSelectedIndex.value = currentList.length - 1
          } else {
            keyboardSelectedIndex.value = Math.max(keyboardSelectedIndex.value - 1, 0)
          }
        }
        scrollToSelectedItem()
        break

      case 'Enter':
        e.preventDefault()
        if (currentMenuLevel.value === 'main') {
          const openedHostsCount = displayedOpenedHosts.value.length
          if (keyboardSelectedIndex.value >= 0 && keyboardSelectedIndex.value < openedHostsCount) {
            // Selected an opened host - directly select it
            onHostClick(displayedOpenedHosts.value[keyboardSelectedIndex.value])
          } else {
            // Selected a category menu item
            const categoryIndex = keyboardSelectedIndex.value - openedHostsCount
            if (categoryIndex >= 0 && categoryIndex < mainMenuItems.value.length) {
              await goToLevel2(mainMenuItems.value[categoryIndex])
            }
          }
        } else if (keyboardSelectedIndex.value >= 0 && keyboardSelectedIndex.value < currentList.length) {
          const item = currentList[keyboardSelectedIndex.value]
          if (currentMenuLevel.value === 'hosts') {
            onHostClick(item as HostOption)
          } else if (currentMenuLevel.value === 'docs') {
            await onDocClick(item as DocOption)
          } else if (currentMenuLevel.value === 'chats') {
            onChatClick(item as ChatOption)
          }
        }
        break

      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        if (currentMenuLevel.value !== 'main') {
          await goBack()
        } else {
          closeContextPopup()
        }
        break

      case 'Backspace':
        // Go back to main menu when backspace is pressed with empty search
        if (searchValue.value === '' && currentMenuLevel.value !== 'main') {
          e.preventDefault()
          await goBack()
        }
        break
    }
  }

  const closeContextPopup = () => {
    showContextPopup.value = false
    currentMenuLevel.value = 'main'
    keyboardSelectedIndex.value = -1
    popupPosition.value = null
    popupReady.value = false
    searchValue.value = ''
    if (options.focusInput) {
      options.focusInput()
      return
    }
    focusChatInput()
  }

  // Navigate to level 2 menu
  const goToLevel2 = async (level: ContextMenuLevel) => {
    if (level === 'main') return

    currentMenuLevel.value = level
    searchValue.value = ''
    keyboardSelectedIndex.value = -1

    // Fetch data for the selected category
    if (level === 'hosts') {
      if (chatTypeValue.value === 'chat') {
        hostOptions.value.splice(0, hostOptions.value.length)
      } else if (chatTypeValue.value === 'cmd') {
        await fetchHostOptionsForCommandMode('')
      } else {
        await fetchHostOptions('')
      }
    } else if (level === 'docs') {
      docsCurrentRelDir.value = ''
      docsDirStack.value = []
      await fetchDocsOptions('')
    } else if (level === 'chats') {
      await fetchChatsOptions()
    }

    nextTick(() => {
      getElement(searchInputRef.value)?.focus?.()
    })
  }

  // Navigate back to main menu
  const goBackToMain = () => {
    currentMenuLevel.value = 'main'
    searchValue.value = ''
    keyboardSelectedIndex.value = -1
    docsCurrentRelDir.value = ''
    docsDirStack.value = []
    nextTick(() => {
      getElement(searchInputRef.value)?.focus?.()
    })
  }

  async function goBack() {
    if (currentMenuLevel.value === 'docs' && docsDirStack.value.length > 0) {
      await goBackDocsDir()
      return
    }
    goBackToMain()
  }

  const handleMouseOver = (value: string, index: number) => {
    hovered.value = value
    keyboardSelectedIndex.value = index
  }

  const clamp = (val: number, min: number, max: number) => {
    if (max < min) return min
    return Math.min(max, Math.max(min, val))
  }

  /**
   * Calculate popup position for contenteditable element using Selection API
   */
  const calculateEditModePopupPosition = (editableEl: HTMLElement) => {
    try {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        popupPosition.value = null
        return
      }

      const range = selection.getRangeAt(0)
      if (!editableEl.contains(range.startContainer)) {
        popupPosition.value = null
        return
      }

      // Get caret position using range.getBoundingClientRect()
      const caretRect = range.getBoundingClientRect()
      const computed = window.getComputedStyle(editableEl)
      const lineHeightValue = computed.lineHeight
      const lineHeight = lineHeightValue === 'normal' ? parseFloat(computed.fontSize) * 1.2 : parseFloat(lineHeightValue)

      const caretAbsY = caretRect.top
      const caretAbsX = caretRect.left

      const scrollContainer = editableEl.closest('.chat-response-container') as HTMLElement | null
      const scrollRect = scrollContainer?.getBoundingClientRect() ?? {
        top: 0,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
      }

      const popupEl = document.querySelector('.context-select-popup.is-edit-mode') as HTMLElement | null
      const popupRect = popupEl?.getBoundingClientRect()
      const popupHeight = popupRect?.height ?? 240
      const popupWidth = popupRect?.width ?? 229
      const bufferDistance = 4

      const spaceBelow = scrollRect.bottom - (caretAbsY + lineHeight)
      const spaceAbove = caretAbsY - scrollRect.top

      const shouldShowBelow = spaceBelow >= popupHeight + bufferDistance
      const shouldShowAbove = !shouldShowBelow && spaceAbove >= popupHeight + bufferDistance

      let popupAbsTop = shouldShowAbove ? caretAbsY - popupHeight - bufferDistance : caretAbsY + lineHeight + bufferDistance
      let popupAbsLeft = caretAbsX

      const minAbsTop = scrollRect.top + 8
      const maxAbsTop = scrollRect.bottom - popupHeight - 8
      popupAbsTop = clamp(popupAbsTop, minAbsTop, maxAbsTop)

      const minAbsLeft = scrollRect.left + 8
      const maxAbsLeft = scrollRect.right - popupWidth - 8
      popupAbsLeft = clamp(popupAbsLeft, minAbsLeft, maxAbsLeft)

      popupPosition.value = {
        top: popupAbsTop,
        left: popupAbsLeft
      }
    } catch (error) {
      logger.error('Error calculating popup position for contenteditable', { error: error instanceof Error ? error.message : String(error) })
      popupPosition.value = null
    }
  }

  const calculateCreateModePopupPosition = (triggerEl?: HTMLElement | null) => {
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
      logger.error('Error calculating create mode popup position', { error: error instanceof Error ? error.message : String(error) })
      popupPosition.value = null
    }
  }

  const fetchHostOptions = async (search: string) => {
    if (chatTypeValue.value === 'chat') {
      hostOptions.value = []
      return
    }
    if (hostOptionsLoading.value) return

    hostOptionsLoading.value = true

    try {
      const result = await window.api.getUserHosts(search, hostOptionsLimit)

      const formatted = result?.data ? formatHosts(result.data || {}) : []

      const localHostOption: HostOption = {
        key: 'localhost',
        label: '127.0.0.1',
        value: 'localhost',
        uuid: 'localhost',
        connect: 'localhost',
        title: t('ai.localhost'),
        isLocalHost: true,
        type: 'personal',
        selectable: true,
        level: 0
      }

      const shouldShowLocalHost =
        !search || 'localhost'.includes(search.toLowerCase()) || '127.0.0.1'.includes(search) || t('ai.localhost').includes(search)

      if (shouldShowLocalHost) {
        hostOptions.value = [localHostOption, ...formatted]
      } else {
        hostOptions.value = formatted
      }

      // Initialize all bastion hosts as expanded by default
      const bastionKeys = formatted.filter((h) => isBastionHostType(h.type)).map((h) => h.key)
      expandedJumpservers.value = new Set(bastionKeys)
    } catch (error) {
      logger.error('Failed to fetch host options', { error: error instanceof Error ? error.message : String(error) })
      hostOptions.value = []
    } finally {
      hostOptionsLoading.value = false
    }
  }

  const fetchHostOptionsForCommandMode = async (search: string) => {
    try {
      const assetInfo = await getCurentTabAssetInfo()

      if (assetInfo && assetInfo.ip) {
        const currentHostOption: HostOption = {
          key: assetInfo.uuid,
          value: assetInfo.uuid,
          uuid: assetInfo.uuid,
          label: assetInfo.ip,
          connect: assetInfo.connection || 'personal',
          title: assetInfo.title || assetInfo.ip,
          isLocalHost: assetInfo.ip === '127.0.0.1' || assetInfo.ip === 'localhost',
          type: 'personal',
          selectable: true,
          level: 0,
          assetType: assetInfo.assetType
        }

        if (!search || currentHostOption.label.includes(search) || (currentHostOption.title && currentHostOption.title.includes(search))) {
          hostOptions.value.splice(0, hostOptions.value.length, currentHostOption)
        } else {
          hostOptions.value.splice(0, hostOptions.value.length)
        }
      } else {
        hostOptions.value.splice(0, hostOptions.value.length)
      }
    } catch (error) {
      logger.error('Failed to fetch host options for command mode', { error: error instanceof Error ? error.message : String(error) })
      hostOptions.value.splice(0, hostOptions.value.length)
    }
  }

  /**
   * Fetch list of hosts from currently opened terminal tabs
   */
  const fetchOpenedHosts = async () => {
    if (chatTypeValue.value === 'chat') {
      openedHostsList.value = []
      return
    }

    openedHostsLoading.value = true
    const TIMEOUT_MS = 3000

    try {
      const hosts = await new Promise<Array<{ uuid: string; ip: string; title: string; organizationId?: string; assetType?: string }>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            eventBus.off('allOpenedHostsResult', handleResult)
            reject(new Error('Timeout getting opened hosts'))
          }, TIMEOUT_MS)

          const handleResult = (result: Array<{ uuid: string; ip: string; title: string; organizationId?: string; assetType?: string }>) => {
            clearTimeout(timeout)
            eventBus.off('allOpenedHostsResult', handleResult)
            resolve(result)
          }
          eventBus.on('allOpenedHostsResult', handleResult)
          eventBus.emit('getAllOpenedHosts')
        }
      )

      // Convert to HostOption format
      openedHostsList.value = hosts.map((h) => ({
        key: h.uuid,
        value: h.uuid,
        uuid: h.uuid,
        label: h.ip,
        connect: 'personal',
        title: h.title || h.ip,
        isLocalHost: h.ip === '127.0.0.1' || h.ip === 'localhost',
        type: 'personal' as const,
        selectable: true,
        level: 0,
        organizationUuid: h.organizationId,
        assetType: h.assetType
      }))
    } catch (error) {
      logger.error('Failed to fetch opened hosts', { error: error instanceof Error ? error.message : String(error) })
      openedHostsList.value = []
    } finally {
      openedHostsLoading.value = false
    }
  }

  const fetchDocsOptions = async (relDir: string = docsCurrentRelDir.value) => {
    if (docsOptionsLoading.value) return

    docsOptionsLoading.value = true
    try {
      // Ensure kbRoot is fetched
      if (!kbRoot.value) {
        const { root } = await window.api.kbGetRoot()
        kbRoot.value = root
      }

      docsCurrentRelDir.value = relDir
      const result = await window.api.kbListDir(relDir)
      const separator = kbRoot.value.includes('\\') ? '\\' : '/'
      docsOptions.value = result.map((item) => ({
        name: item.name,
        relPath: item.relPath,
        absPath: kbRoot.value + separator + item.relPath.replace(/\//g, separator),
        type: item.type
      }))
    } catch (error) {
      logger.error('Failed to fetch docs options', { error: error instanceof Error ? error.message : String(error) })
      docsOptions.value = []
    } finally {
      docsOptionsLoading.value = false
    }
  }

  const enterDocsDir = async (doc: DocOption) => {
    if (doc.type !== 'dir') return
    const nextRelDir = doc.relPath
    if (!nextRelDir) return

    // Save current directory to enable back navigation.
    docsDirStack.value = [...docsDirStack.value, docsCurrentRelDir.value]
    searchValue.value = ''
    keyboardSelectedIndex.value = -1
    hovered.value = null
    await fetchDocsOptions(nextRelDir)
  }

  const goBackDocsDir = async () => {
    if (docsDirStack.value.length === 0) {
      goBackToMain()
      return
    }
    const prevRelDir = docsDirStack.value[docsDirStack.value.length - 1] ?? ''
    docsDirStack.value = docsDirStack.value.slice(0, -1)
    searchValue.value = ''
    keyboardSelectedIndex.value = -1
    hovered.value = null
    await fetchDocsOptions(prevRelDir)
  }

  // Fetch past chat history
  const fetchChatsOptions = async () => {
    if (chatsOptionsLoading.value) return

    chatsOptionsLoading.value = true
    try {
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      chatsOptions.value = taskHistory
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .map((item) => ({
          id: item.id,
          title: item.chatTitle || item.task || 'Untitled Chat',
          ts: item.ts || 0
        }))
    } catch (error) {
      logger.error('Failed to fetch chats options', { error: error instanceof Error ? error.message : String(error) })
      chatsOptions.value = []
    } finally {
      chatsOptionsLoading.value = false
    }
  }

  const isDocSelected = (doc: DocOption): boolean => {
    return chatInputParts.value.some((part) => part.type === 'chip' && part.chipType === 'doc' && part.ref.absPath === doc.absPath)
  }

  // Check if chat is selected by looking at chatInputParts chips
  const isChatSelected = (chat: ChatOption): boolean => {
    return chatInputParts.value.some((part) => part.type === 'chip' && part.chipType === 'chat' && part.ref.taskId === chat.id)
  }

  const onDocClick = async (doc: DocOption) => {
    if (doc.type === 'dir') {
      await enterDocsDir(doc)
      return
    }
    if (isDocSelected(doc)) {
      closeContextPopup()
      return
    }
    if (chipInsertHandler.value) {
      chipInsertHandler.value('doc', doc, doc.name)
    }
    closeContextPopup()
  }

  // Handle chat click - insert chip via handler
  const onChatClick = (chat: ChatOption) => {
    if (isChatSelected(chat)) {
      closeContextPopup()
      return
    }
    if (chipInsertHandler.value) {
      chipInsertHandler.value('chat', chat, chat.title)
    }
    closeContextPopup()
  }

  const getElement = (ref: unknown): HTMLElement | null => {
    if (!ref) return null
    return Array.isArray(ref) ? ref[0] || null : (ref as HTMLElement)
  }

  const handleAddContextClick = async (triggerEl?: HTMLElement | null, mode: 'create' | 'edit' = 'create') => {
    if (showContextPopup.value) {
      closeContextPopup()
      return
    }

    currentMode.value = mode
    showContextPopup.value = true
    popupReady.value = false
    searchValue.value = ''
    currentMenuLevel.value = 'main'

    // Fetch opened hosts when popup opens (for quick selection in main menu)
    fetchOpenedHosts()

    nextTick(() => {
      if (mode === 'edit' && triggerEl) {
        calculateEditModePopupPosition(triggerEl)
      } else {
        calculateCreateModePopupPosition(triggerEl)
      }
      popupReady.value = true
      getElement(searchInputRef.value)?.focus?.()
    })
  }

  // Debounced search handler based on current menu level
  const debouncedSearch = debounce(() => {
    // For hosts, refetch with search term
    if (currentMenuLevel.value === 'hosts') {
      if (chatTypeValue.value === 'cmd') {
        fetchHostOptionsForCommandMode(searchValue.value)
      } else {
        fetchHostOptions(searchValue.value)
      }
    }
    // For docs and chats, filtering is done via computed properties
  }, 300)

  watch(searchValue, () => {
    keyboardSelectedIndex.value = -1
    debouncedSearch()
  })

  const handleGlobalEscKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && showContextPopup.value) {
      if (currentMenuLevel.value !== 'main') {
        void goBack()
      } else {
        closeContextPopup()
      }
    }
  }

  /**
   * Global click event handler.
   * This function is used to detect clicks outside of the context select popup (.context-select-popup)
   * and its trigger element (.context-display-container). If the popup is open and a click occurs
   * outside these elements, the context popup will be closed.
   *
   * @param e MouseEvent object
   */
  const handleGlobalClick = (e: MouseEvent) => {
    if (!showContextPopup.value) return

    const target = e.target as HTMLElement
    const contextPopup = document.querySelector('.context-select-popup')
    const contextTag = document.querySelector('.context-display-container')

    // Check if click is inside popup or trigger tag
    const isInsidePopup = contextPopup && contextPopup.contains(target)
    const isInsideTrigger = contextTag && contextTag.contains(target)

    if (!isInsidePopup && !isInsideTrigger) {
      closeContextPopup()
    }
  }

  const normalizeDocPath = (value: string): string => {
    return value.replace(/\\/g, '/')
  }

  const resolveDocAbsPath = async (relPath: string): Promise<string> => {
    if (!relPath) return ''
    if (!kbRoot.value) {
      const { root } = await window.api.kbGetRoot()
      kbRoot.value = root || ''
    }
    if (!kbRoot.value) return ''
    const normalizedRoot = normalizeDocPath(kbRoot.value)
    const normalizedRel = normalizeDocPath(relPath)
    const separator = normalizedRoot.endsWith('/') ? '' : '/'
    return `${normalizedRoot}${separator}${normalizedRel}`
  }

  const resolveDocRelPath = (absPath: string): string => {
    const root = normalizeDocPath(kbRoot.value)
    const normalizedAbs = normalizeDocPath(absPath)
    if (!root || !normalizedAbs.startsWith(root)) return ''
    const normalizedRoot = root.endsWith('/') ? root.slice(0, -1) : root
    let relPath = normalizedAbs.slice(normalizedRoot.length)
    if (relPath.startsWith('/')) relPath = relPath.slice(1)
    return relPath
  }

  /**
   * Open a knowledge base file in the editor.
   * @param absPath - Absolute path to the file * @param name - Optional display name for the tab title */
  const openKbFile = async (absPath: string | undefined, name?: string) => {
    if (!absPath) return
    const { root } = await window.api.kbGetRoot()
    kbRoot.value = root
    const relPath = resolveDocRelPath(absPath)
    if (!relPath) return
    const title = name || relPath.split('/').pop() || 'KnowledgeCenter'
    eventBus.emit('openUserTab', {
      key: 'KnowledgeCenterEditor',
      title,
      id: `kb:${relPath}`,
      props: { relPath }
    })
  }

  const handleKbAddDocToChat = async (payload: Array<{ relPath: string; name?: string }>) => {
    let inserted = false
    for (const item of payload) {
      const relPath = item?.relPath?.trim()
      if (!relPath) continue
      const absPath = await resolveDocAbsPath(relPath)
      if (!absPath) continue
      const docName = item?.name || relPath.split('/').pop() || relPath
      const doc: DocOption = { absPath, name: docName, type: 'file' }
      if (isDocSelected(doc)) continue
      if (chipInsertHandler.value) {
        chipInsertHandler.value('doc', doc, docName)
        inserted = true
      }
    }
    if (inserted) {
      options.focusInput?.()
    }
  }

  onMounted(() => {
    eventBus.on('kbAddDocToChat', handleKbAddDocToChat)
    document.addEventListener('keydown', handleGlobalEscKey)
    document.addEventListener('click', handleGlobalClick)
  })

  onUnmounted(() => {
    eventBus.off('kbAddDocToChat', handleKbAddDocToChat)
    document.removeEventListener('keydown', handleGlobalEscKey)
    document.removeEventListener('click', handleGlobalClick)
  })

  return {
    // UI state
    showContextPopup,
    currentMenuLevel,
    searchValue,
    hovered,
    keyboardSelectedIndex,
    popupPosition,
    popupReady,
    currentMode,
    searchInputRef,
    chatTypeValue,

    // Hosts state
    hostOptions,
    hostOptionsLoading,
    filteredHostOptions,
    isHostSelected,
    onHostClick,
    removeHost,
    toggleJumpserverExpand,
    fetchHostOptions,
    fetchHostOptionsForCommandMode,

    // Opened hosts state (for quick selection in main menu)
    openedHostsList,
    openedHostsLoading,
    filteredOpenedHosts,
    displayedOpenedHosts,

    // Docs state
    docsOptions,
    docsOptionsLoading,
    filteredDocsOptions,
    isDocSelected,
    onDocClick,
    fetchDocsOptions,

    // Chats state
    chatsOptions,
    chatsOptionsLoading,
    filteredChatsOptions,
    isChatSelected,
    onChatClick,
    fetchChatsOptions,
    openKbFile,
    // Chip insertion
    setChipInsertHandler: (handler: (chipType: 'doc' | 'chat', ref: DocOption | ChatOption, label: string) => void) => {
      chipInsertHandler.value = handler
    },

    // UI interaction handlers
    handleSearchKeyDown,
    scrollToSelectedItem,
    closeContextPopup,
    handleMouseOver,
    handleAddContextClick,
    goToLevel2,
    goBackToMain,
    goBack
  }
}
