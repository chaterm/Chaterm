import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import debounce from 'lodash/debounce'
import type { Host, AssetInfo, HostOption, HostItemType } from '../types'
import { formatHosts, isSwitchAssetType } from '../utils'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import { Notice } from '@/views/components/Notice'

/**
 * Maximum number of target hosts allowed for batch execution
 */
const MAX_TARGET_HOSTS = 5

/**
 * Composable for host management
 * Handles host selection, search, pagination loading and other functionalities
 */
export const useHostManagement = () => {
  const { t } = i18n.global

  const { hosts, chatTypeValue, autoUpdateHost, chatInputValue } = useSessionState()

  // Popup position in viewport coordinates (used with position: fixed)
  const popupPosition = ref<{ top: number; left: number } | null>(null)
  // Edit mode popup: keep it hidden until it has a final position.
  const popupReady = ref(false)
  const currentMode = ref<'create' | 'edit'>('create')

  const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
    const TIMEOUT_MS = 5000

    try {
      const assetInfo = await new Promise<AssetInfo | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventBus.off('assetInfoResult', handleResult)
          reject(new Error(t('ai.timeoutGettingAssetInfo')))
        }, TIMEOUT_MS)

        const handleResult = (assetInfo: AssetInfo | null) => {
          clearTimeout(timeout)
          eventBus.off('assetInfoResult', handleResult)
          resolve(assetInfo)
        }
        eventBus.on('assetInfoResult', handleResult)
        eventBus.emit('getActiveTabAssetInfo')
      })

      if (!assetInfo) {
        return null
      }

      assetInfo.connection = assetInfo.organizationId !== 'personal' ? 'jumpserver' : 'personal'
      return assetInfo
    } catch (error) {
      console.error('Error getting asset information:', error)
      return null
    }
  }
  const hostSearchInputRef = ref()
  const showHostSelect = ref(false)

  const hostOptions = ref<HostOption[]>([])

  const hostSearchValue = ref('')

  const hostOptionsLoading = ref(false)
  const hostOptionsLimit = 50

  const hovered = ref<string | null>(null)
  const keyboardSelectedIndex = ref(-1)

  // Track expanded jumpserver nodes (all expanded by default)
  const expandedJumpservers = ref<Set<string>>(new Set())

  // Toggle jumpserver expand/collapse
  const toggleJumpserverExpand = (key: string) => {
    if (expandedJumpservers.value.has(key)) {
      expandedJumpservers.value.delete(key)
    } else {
      expandedJumpservers.value.add(key)
    }
    // Force reactivity update
    expandedJumpservers.value = new Set(expandedJumpservers.value)
  }

  // Flatten host options with children based on expand state
  const flattenedHostOptions = computed(() => {
    const result: HostOption[] = []

    for (const item of hostOptions.value) {
      // Add the item itself
      const isExpanded = expandedJumpservers.value.has(item.key)
      result.push({
        ...item,
        expanded: isExpanded
      })

      // If it's a jumpserver and expanded, add its children
      if (item.type === 'jumpserver' && isExpanded && item.children) {
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
    if (chatTypeValue.value === 'cmd') {
      return flattenedHostOptions.value
    }

    const searchTerm = hostSearchValue.value.toLowerCase()
    if (!searchTerm) {
      return flattenedHostOptions.value
    }

    // When searching, filter items that match
    const result: HostOption[] = []
    for (const item of hostOptions.value) {
      const labelMatches = item.label.toLowerCase().includes(searchTerm)

      if (item.type === 'jumpserver') {
        // Check if any children match
        const matchingChildren = item.children?.filter((child) => child.label.toLowerCase().includes(searchTerm)) || []

        if (labelMatches || matchingChildren.length > 0) {
          // Add jumpserver node
          result.push({
            ...item,
            expanded: true // Always expanded when searching
          })
          // Add all matching children (or all children if jumpserver label matches)
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

  // Check if host is selected using key for uniqueness (handles duplicate IPs)
  const isHostSelected = (hostOption: HostOption): boolean => {
    // Use key-based matching to handle duplicate IPs from different sources
    return hosts.value.some((h) => {
      // Match by uuid for unique identification
      if (h.uuid === hostOption.uuid) return true
      // Fallback: match by host IP and connection type
      return h.host === hostOption.label && h.connection === hostOption.connect
    })
  }

  const onHostClick = (item: HostOption, inputValueRef?: Ref<string>) => {
    // Handle jumpserver parent node click - toggle expand/collapse
    if (item.type === 'jumpserver' && !item.selectable) {
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
      // Use key for unique identification when checking existing selection
      const existingIndex = hosts.value.findIndex((h) => h.uuid === item.uuid)

      if (existingIndex > -1) {
        // Remove host if already selected (toggle off)
        hosts.value = hosts.value.filter((_, i) => i !== existingIndex)
      } else {
        // Check if adding new host would exceed the limit
        let updatedHosts = [...hosts.value]

        if (!item.isLocalHost && item.label !== '127.0.0.1') {
          updatedHosts = updatedHosts.filter((h) => h.host !== '127.0.0.1')
        }

        // Validate host count limit before adding
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

    const targetInputValueRef = inputValueRef ?? chatInputValue
    if (targetInputValueRef.value.endsWith('@')) {
      targetInputValueRef.value = targetInputValueRef.value.slice(0, -1)
    }
  }

  const removeHost = (hostToRemove: Host) => {
    const index = hosts.value.findIndex((h) => h.uuid === hostToRemove.uuid)
    if (index > -1) {
      hosts.value = hosts.value.filter((_, i) => i !== index)
      autoUpdateHost.value = false
    }
  }

  const handleHostSearchKeyDown = (e: KeyboardEvent, inputValueRef?: Ref<string>) => {
    if (!showHostSelect.value || filteredHostOptions.value.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (keyboardSelectedIndex.value === -1) {
          keyboardSelectedIndex.value = 0
        } else {
          keyboardSelectedIndex.value = Math.min(keyboardSelectedIndex.value + 1, filteredHostOptions.value.length - 1)
        }
        scrollToSelectedItem()
        break

      case 'ArrowUp':
        e.preventDefault()
        if (keyboardSelectedIndex.value === -1) {
          keyboardSelectedIndex.value = filteredHostOptions.value.length - 1
        } else {
          keyboardSelectedIndex.value = Math.max(keyboardSelectedIndex.value - 1, 0)
        }
        scrollToSelectedItem()
        break

      case 'Enter':
        e.preventDefault()
        if (keyboardSelectedIndex.value >= 0 && keyboardSelectedIndex.value < filteredHostOptions.value.length) {
          onHostClick(filteredHostOptions.value[keyboardSelectedIndex.value], inputValueRef)
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closeHostSelect()
        break
    }
  }

  const scrollToSelectedItem = () => {
    nextTick(() => {
      const selectedItem = document.querySelector('.host-select-item.keyboard-selected') as HTMLElement
      if (!selectedItem) return

      const hostSelectList = selectedItem.closest('.host-select-list') as HTMLElement
      if (!hostSelectList) return

      const listRect = hostSelectList.getBoundingClientRect()
      const itemRect = selectedItem.getBoundingClientRect()

      if (itemRect.top < listRect.top) {
        hostSelectList.scrollTop -= listRect.top - itemRect.top
      } else if (itemRect.bottom > listRect.bottom) {
        hostSelectList.scrollTop += itemRect.bottom - listRect.bottom
      }
    })
  }

  const closeHostSelect = () => {
    showHostSelect.value = false
    keyboardSelectedIndex.value = -1
    popupPosition.value = null
    popupReady.value = false

    focusChatInput()
  }

  const handleMouseOver = (value: string, index: number) => {
    hovered.value = value
    keyboardSelectedIndex.value = index
  }

  const clamp = (val: number, min: number, max: number) => {
    if (max < min) return min
    return Math.min(max, Math.max(min, val))
  }

  const calculatePopupPosition = (textarea: HTMLTextAreaElement) => {
    try {
      const cursorPosition = textarea.selectionStart

      // Create a temporary div to measure cursor position (mirror technique)
      const tempDiv = document.createElement('div')
      const computed = window.getComputedStyle(textarea)

      // Copy all textarea styles for accurate measurement
      const stylesToCopy = [
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'font-variant',
        'line-height',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'border-top-width',
        'border-right-width',
        'border-bottom-width',
        'border-left-width',
        'border-style',
        'box-sizing',
        'width',
        'text-transform',
        'text-indent',
        'letter-spacing',
        'word-spacing',
        'white-space',
        'word-break',
        'overflow-wrap'
      ]

      stylesToCopy.forEach((prop) => {
        tempDiv.style[prop as any] = computed[prop as any]
      })

      // Mirror container setup
      tempDiv.style.position = 'absolute'
      tempDiv.style.visibility = 'hidden'
      tempDiv.style.pointerEvents = 'none'
      tempDiv.style.whiteSpace = 'pre-wrap'
      tempDiv.style.wordWrap = 'break-word'
      tempDiv.style.height = 'auto'
      tempDiv.style.overflow = 'hidden'

      document.body.appendChild(tempDiv)

      // Get text before cursor
      const textBeforeCursor = textarea.value.substring(0, cursorPosition)
      tempDiv.textContent = textBeforeCursor

      // Create a span to mark cursor position
      const span = document.createElement('span')
      // Use a character or dot to ensure span has height/width
      span.textContent = textarea.value.substring(cursorPosition, cursorPosition + 1) || '.'
      tempDiv.appendChild(span)

      // Get positions relative to the mirror div
      const spanRect = span.getBoundingClientRect()
      const tempDivRect = tempDiv.getBoundingClientRect()

      // Calculate cursor position relative to textarea's content top-left
      const cursorX = spanRect.left - tempDivRect.left
      const cursorY = spanRect.top - tempDivRect.top

      // Calculate line height for vertical offset
      const lineHeightValue = computed.lineHeight
      const lineHeight = lineHeightValue === 'normal' ? parseFloat(computed.fontSize) * 1.2 : parseFloat(lineHeightValue)

      // Clean up mirror element
      document.body.removeChild(tempDiv)

      // Get container and textarea rects to calculate relative positioning
      const textareaRect = textarea.getBoundingClientRect()

      // Caret position in viewport coordinates
      const caretAbsY = textareaRect.top + cursorY - textarea.scrollTop
      const caretAbsX = textareaRect.left + cursorX - textarea.scrollLeft

      // Use chat scroll container as the visible boundary (fallback to window viewport)
      const scrollContainer = textarea.closest('.chat-response-container') as HTMLElement | null
      const scrollRect = scrollContainer?.getBoundingClientRect() ?? {
        top: 0,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
      }

      // Popup dimensions (prefer real rendered size; fallback to max constraints)
      const popupEl = document.querySelector('.host-select-popup.is-edit-mode') as HTMLElement | null
      const popupRect = popupEl?.getBoundingClientRect()
      const popupHeight = popupRect?.height ?? 240
      const popupWidth = popupRect?.width ?? 229
      const bufferDistance = 4

      // Below-first decision based on available space inside scrollRect
      const spaceBelow = scrollRect.bottom - (caretAbsY + lineHeight)
      const spaceAbove = caretAbsY - scrollRect.top

      const shouldShowBelow = spaceBelow >= popupHeight + bufferDistance
      const shouldShowAbove = !shouldShowBelow && spaceAbove >= popupHeight + bufferDistance

      // Desired popup position in viewport coordinates
      let popupAbsTop = shouldShowAbove ? caretAbsY - popupHeight - bufferDistance : caretAbsY + lineHeight + bufferDistance
      let popupAbsLeft = caretAbsX

      // Clamp into visible scrollRect to reduce clipping
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
      console.error('Error calculating popup position:', error)
      popupPosition.value = null
    }
  }

  const calculateCreateModePopupPosition = (triggerEl?: HTMLElement | null) => {
    try {
      // Find the input container from the trigger element
      let inputContainer: HTMLElement | null = null
      if (triggerEl) {
        inputContainer = triggerEl.closest('.input-send-container') as HTMLElement | null
      }

      if (!inputContainer) {
        popupPosition.value = null
        return
      }

      const inputRect = inputContainer.getBoundingClientRect()
      const marginBottom = 4
      const marginLeft = 8

      // Get popup element to calculate its height for positioning
      const popupEl = document.querySelector('.host-select-popup') as HTMLElement | null
      const popupHeight = popupEl?.getBoundingClientRect().height ?? 240

      // Position popup above the input container
      // Popup bottom should be at input top - marginBottom
      // So popup top = input top - popup height - marginBottom
      const top = inputRect.top - popupHeight - marginBottom
      const left = inputRect.left + marginLeft

      popupPosition.value = { top, left }
    } catch (error) {
      console.error('Error calculating create mode popup position:', error)
      popupPosition.value = null
    }
  }

  const handleInputChange = async (e: Event, mode: 'create' | 'edit' = 'create') => {
    const value = (e.target as HTMLTextAreaElement).value
    const textarea = e.target as HTMLTextAreaElement

    currentMode.value = mode

    if (value.endsWith('@')) {
      if (chatTypeValue.value === 'cmd' || chatTypeValue.value === 'chat') {
        showHostSelect.value = false
        popupReady.value = false
        return
      }

      showHostSelect.value = true
      popupReady.value = false
      hostSearchValue.value = ''
      await fetchHostOptions('')

      if (mode === 'edit') {
        calculatePopupPosition(textarea)
      } else {
        calculateCreateModePopupPosition(textarea)
      }

      popupReady.value = true
      getElement(hostSearchInputRef.value)?.focus?.()
    } else {
      showHostSelect.value = false
      popupPosition.value = null
    }
  }

  const debouncedFetchHostOptions = debounce((search: string) => {
    if (chatTypeValue.value === 'cmd') {
      fetchHostOptionsForCommandMode(search)
    } else {
      fetchHostOptions(search)
    }
  }, 300)

  const fetchHostOptions = async (search: string) => {
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

      // Initialize all jumpservers as expanded by default
      const jumpserverKeys = formatted.filter((h) => h.type === 'jumpserver').map((h) => h.key)
      expandedJumpservers.value = new Set(jumpserverKeys)
    } catch (error) {
      console.error('Failed to fetch host options:', error)
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
      console.error('Failed to fetch host options for command mode:', error)
      hostOptions.value.splice(0, hostOptions.value.length)
    }
  }

  const handleAddHostClick = async (triggerEl?: HTMLElement | null) => {
    if (showHostSelect.value) {
      closeHostSelect()
      return
    }

    currentMode.value = 'create'
    showHostSelect.value = true
    popupReady.value = false
    hostSearchValue.value = ''

    if (chatTypeValue.value === 'cmd') {
      await fetchHostOptionsForCommandMode('')
    } else {
      await fetchHostOptions('')
    }

    nextTick(() => {
      calculateCreateModePopupPosition(triggerEl)
      popupReady.value = true
      getElement(hostSearchInputRef.value)?.focus?.()
    })
  }

  const updateHosts = (hostInfo: { ip: string; uuid: string; connection: string; assetType?: string } | null) => {
    // Don't update hosts in chat mode
    if (chatTypeValue.value === 'chat') {
      hosts.value = []
      return
    }
    if (hostInfo) {
      if (chatTypeValue.value === 'agent' && isSwitchAssetType(hostInfo.assetType)) {
        chatTypeValue.value = 'cmd'
        Notice.open({
          type: 'info',
          description: t('ai.switchNotSupportAgent'),
          placement: 'bottomRight'
        })
      }
      const newHost: Host = {
        host: hostInfo.ip,
        uuid: hostInfo.uuid,
        connection: hostInfo.connection,
        assetType: hostInfo.assetType
      }
      hosts.value = [newHost]
    } else {
      hosts.value = []
    }
  }

  const updateHostsForCommandMode = async () => {
    const assetInfo = await getCurentTabAssetInfo()

    if (assetInfo && assetInfo.ip) {
      updateHosts({
        ip: assetInfo.ip,
        uuid: assetInfo.uuid,
        connection: assetInfo.connection || 'personal',
        assetType: assetInfo.assetType
      })
    } else {
      updateHosts(null)
    }
  }

  watch(hostSearchValue, (newVal) => {
    keyboardSelectedIndex.value = -1
    debouncedFetchHostOptions(newVal)
  })

  const handleGlobalEscKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && showHostSelect.value) {
      closeHostSelect()
    }
  }

  const handleGlobalClick = (e: MouseEvent) => {
    if (!showHostSelect.value) return

    const target = e.target as HTMLElement
    const hostSelectPopup = document.querySelector('.host-select-popup')
    const hostTag = document.querySelector('.hosts-display-container-host-tag')

    if (hostSelectPopup && !hostSelectPopup.contains(target) && hostTag && !hostTag.contains(target)) {
      closeHostSelect()
    }
  }

  const getElement = (ref: any): any => {
    if (!ref) return null
    return Array.isArray(ref) ? ref[0] || null : ref
  }

  onMounted(() => {
    document.addEventListener('keydown', handleGlobalEscKey)
    document.addEventListener('click', handleGlobalClick)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleGlobalEscKey)
    document.removeEventListener('click', handleGlobalClick)
  })

  return {
    showHostSelect,
    hostOptions,
    hostSearchValue,
    hostOptionsLoading,
    hovered,
    keyboardSelectedIndex,
    filteredHostOptions,
    hostSearchInputRef,
    isHostSelected,
    onHostClick,
    removeHost,
    handleHostSearchKeyDown,
    scrollToSelectedItem,
    closeHostSelect,
    handleMouseOver,
    handleInputChange,
    fetchHostOptions,
    fetchHostOptionsForCommandMode,
    handleAddHostClick,
    updateHosts,
    updateHostsForCommandMode,
    getCurentTabAssetInfo,
    toggleJumpserverExpand,
    popupPosition,
    popupReady,
    currentMode
  }
}
