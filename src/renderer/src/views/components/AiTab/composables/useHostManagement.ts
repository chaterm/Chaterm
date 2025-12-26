import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import debounce from 'lodash/debounce'
import type { Host, AssetInfo, HostOption, HostItemType } from '../types'
import { formatHosts } from '../utils'
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
export function useHostManagement() {
  const { t } = i18n.global

  const { hosts, chatTypeValue, autoUpdateHost, chatInputValue } = useSessionState()

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

  const onHostClick = (item: HostOption) => {
    // Handle jumpserver parent node click - toggle expand/collapse
    if (item.type === 'jumpserver' && !item.selectable) {
      toggleJumpserverExpand(item.key)
      return
    }

    const newHost: Host = {
      host: item.label,
      uuid: item.uuid,
      connection: item.isLocalHost ? 'localhost' : item.connect,
      organizationUuid: item.organizationUuid
    }

    if (chatTypeValue.value === 'cmd') {
      hosts.value = [newHost]
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

    if (chatInputValue.value.endsWith('@')) {
      chatInputValue.value = chatInputValue.value.slice(0, -1)
    }
  }

  const removeHost = (hostToRemove: Host) => {
    const index = hosts.value.findIndex((h) => h.uuid === hostToRemove.uuid)
    if (index > -1) {
      hosts.value = hosts.value.filter((_, i) => i !== index)
      autoUpdateHost.value = false
    }
  }

  const handleHostSearchKeyDown = (e: KeyboardEvent) => {
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
          onHostClick(filteredHostOptions.value[keyboardSelectedIndex.value])
        }
        break

      case 'Escape':
        e.preventDefault()
        closeHostSelect()
        break
    }
  }

  const scrollToSelectedItem = () => {
    nextTick(() => {
      const hostSelectList = document.querySelector('.host-select-list')
      const selectedItem = document.querySelector('.host-select-item.keyboard-selected')

      if (hostSelectList && selectedItem) {
        const listRect = hostSelectList.getBoundingClientRect()
        const itemRect = selectedItem.getBoundingClientRect()

        if (itemRect.top < listRect.top) {
          selectedItem.scrollIntoView({ block: 'start', behavior: 'smooth' })
        } else if (itemRect.bottom > listRect.bottom) {
          selectedItem.scrollIntoView({ block: 'end', behavior: 'smooth' })
        }
      }
    })
  }

  const closeHostSelect = () => {
    showHostSelect.value = false
    keyboardSelectedIndex.value = -1

    focusChatInput()
  }

  const handleMouseOver = (value: string, index: number) => {
    hovered.value = value
    keyboardSelectedIndex.value = index
  }

  const handleInputChange = async (e: Event) => {
    const value = (e.target as HTMLTextAreaElement).value

    if (value.endsWith('@')) {
      if (chatTypeValue.value === 'cmd' || chatTypeValue.value === 'chat') {
        showHostSelect.value = false
        return
      }

      showHostSelect.value = true
      hostSearchValue.value = ''

      await fetchHostOptions('')

      nextTick(() => {
        getElement(hostSearchInputRef.value)?.focus?.()
      })
    } else {
      showHostSelect.value = false
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
          level: 0
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

  const handleAddHostClick = async () => {
    showHostSelect.value = true
    hostSearchValue.value = ''

    if (chatTypeValue.value === 'cmd') {
      await fetchHostOptionsForCommandMode('')
    } else {
      await fetchHostOptions('')
    }

    nextTick(() => {
      getElement(hostSearchInputRef.value)?.focus?.()
    })
  }

  const updateHosts = (hostInfo: { ip: string; uuid: string; connection: string } | null) => {
    // Don't update hosts in chat mode
    if (chatTypeValue.value === 'chat') {
      hosts.value = []
      return
    }
    if (hostInfo) {
      const newHost: Host = {
        host: hostInfo.ip,
        uuid: hostInfo.uuid,
        connection: hostInfo.connection
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
        connection: assetInfo.connection || 'personal'
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
    toggleJumpserverExpand
  }
}
