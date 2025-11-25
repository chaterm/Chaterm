import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import debounce from 'lodash/debounce'
import type { Host, AssetInfo } from '../types'
import { formatHosts } from '../utils'
import { useSessionState } from './useSessionState'
import { focusChatInput } from './useTabManagement'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'

interface HostOption {
  label: string
  value: string
  uuid: string
  connect: string
  title?: string
  isLocalHost?: boolean
}

/**
 * 主机管理的 composable
 * 负责主机选择、搜索、分页加载等功能
 */
export function useHostManagement() {
  const { t } = i18n.global

  const { hosts, chatTypeValue, autoUpdateHost, chatInputValue, currentChatId } = useSessionState()

  const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
    try {
      const assetInfo = await new Promise<AssetInfo | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventBus.off('assetInfoResult', handleResult)
          reject(new Error(t('ai.timeoutGettingAssetInfo')))
        }, 5000)

        const handleResult = (payload: { assetInfo: AssetInfo | null; tabId?: string } | AssetInfo | null) => {
          const { assetInfo, tabId } =
            payload && typeof payload === 'object' && 'assetInfo' in payload
              ? { assetInfo: payload.assetInfo as AssetInfo | null, tabId: payload.tabId }
              : { assetInfo: (payload as AssetInfo | null) ?? null, tabId: undefined }

          if (tabId && tabId !== currentChatId.value) {
            return
          }

          clearTimeout(timeout)
          eventBus.off('assetInfoResult', handleResult)
          resolve(assetInfo)
        }
        eventBus.on('assetInfoResult', handleResult)
        eventBus.emit('getActiveTabAssetInfo', { tabId: currentChatId.value ?? undefined })
      })

      if (assetInfo) {
        if (assetInfo.organizationId != 'personal') {
          assetInfo.connection = 'jumpserver'
        } else {
          assetInfo.connection = 'personal'
        }
        return assetInfo
      } else {
        return null
      }
    } catch (error) {
      console.error('Error getting asset information:', error)
      return null
    }
  }
  const hostSearchInputRef = ref()
  const showHostSelect = ref(false)

  const hostOptions = ref<HostOption[]>([])

  const hostSearchValue = ref('')

  const hostOptionsOffset = ref(0)
  const hostOptionsHasMore = ref(false)
  const hostOptionsLoading = ref(false)
  const hostOptionsLimit = 30

  const hovered = ref<string | null>(null)
  const keyboardSelectedIndex = ref(-1)

  const filteredHostOptions = computed(() => {
    if (chatTypeValue.value === 'cmd') {
      return hostOptions.value
    } else {
      return hostOptions.value.filter((item) => item.label.includes(hostSearchValue.value))
    }
  })

  const isHostSelected = (hostOption: HostOption): boolean => {
    return hosts.value.some((h) => h.host === hostOption.label)
  }

  const onHostClick = (item: any) => {
    const newHost: Host = {
      host: item.label,
      uuid: item.uuid,
      connection: item.isLocalHost ? 'localhost' : item.connection || item.connect
    }

    if (chatTypeValue.value === 'cmd') {
      hosts.value = [newHost]
    } else {
      const existingIndex = hosts.value.findIndex((h) => h.host === item.label)

      if (existingIndex > -1) {
        hosts.value = hosts.value.filter((_, i) => i !== existingIndex)
      } else {
        let updatedHosts = [...hosts.value]

        if (!item.isLocalHost && item.label !== '127.0.0.1') {
          updatedHosts = updatedHosts.filter((h) => h.host !== '127.0.0.1')
        }

        hosts.value = [...updatedHosts, newHost]
      }
    }

    autoUpdateHost.value = false

    chatInputValue.value = ''
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

    if (value === '@') {
      if (chatTypeValue.value === 'cmd' || chatTypeValue.value === 'chat') {
        showHostSelect.value = false
        return
      }

      showHostSelect.value = true
      hostSearchValue.value = ''

      hostOptionsOffset.value = 0
      hostOptionsHasMore.value = false

      await fetchHostOptions('', true)

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
      // 重置分页
      hostOptionsOffset.value = 0
      hostOptionsHasMore.value = false
      fetchHostOptions(search, true)
    }
  }, 300)

  const fetchHostOptions = async (search: string, reset: boolean = true) => {
    if (hostOptionsLoading.value) return

    hostOptionsLoading.value = true

    try {
      const offset = reset ? 0 : hostOptionsOffset.value
      const result = await window.api.getUserHosts(search, hostOptionsLimit, offset)

      if (!result || !result.data) {
        hostOptions.value = []
        hostOptionsHasMore.value = false
        return
      }

      let formatted = formatHosts(result.data || [])

      if (reset || hostOptions.value.length === 0) {
        const localHostOption: HostOption = {
          label: '127.0.0.1',
          value: 'localhost',
          uuid: 'localhost',
          connect: 'localhost',
          title: t('ai.localhost'),
          isLocalHost: true
        }

        const shouldShowLocalHost =
          !search || 'localhost'.includes(search.toLowerCase()) || '127.0.0.1'.includes(search) || t('ai.localhost').includes(search)

        if (shouldShowLocalHost) {
          formatted.unshift(localHostOption)
        }
      }

      if (reset) {
        hostOptions.value = formatted
        const backendResultCount = result.data?.length || 0
        hostOptionsOffset.value = backendResultCount
      } else {
        const existingHosts = new Set(hostOptions.value.map((h) => h.uuid))
        const newItems = formatted.filter((h) => !existingHosts.has(h.uuid))
        hostOptions.value = [...hostOptions.value, ...newItems]
        const backendResultCount = result.data?.length || 0
        hostOptionsOffset.value += backendResultCount
      }

      hostOptionsHasMore.value = result.hasMore || false
    } catch (error) {
      console.error('Failed to fetch host options:', error)
      if (reset) {
        hostOptions.value = []
      }
      hostOptionsHasMore.value = false
    } finally {
      hostOptionsLoading.value = false
    }
  }

  const fetchHostOptionsForCommandMode = async (search: string) => {
    try {
      const assetInfo = await getCurentTabAssetInfo()

      if (assetInfo && assetInfo.ip) {
        const currentHostOption: HostOption = {
          label: assetInfo.ip,
          value: assetInfo.ip,
          uuid: assetInfo.uuid,
          connect: assetInfo.connection || 'personal',
          title: assetInfo.title || assetInfo.ip,
          isLocalHost: assetInfo.ip === '127.0.0.1' || assetInfo.ip === 'localhost'
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

  const handleHostListScroll = (e: Event) => {
    const target = e.target as HTMLElement
    if (!target) return

    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    if (scrollBottom < 50 && hostOptionsHasMore.value && !hostOptionsLoading.value) {
      loadMoreHosts()
    }
  }

  const loadMoreHosts = async () => {
    if (hostOptionsLoading.value || !hostOptionsHasMore.value) return
    await fetchHostOptions(hostSearchValue.value, false)
  }

  const handleAddHostClick = async () => {
    showHostSelect.value = true
    hostSearchValue.value = ''
    hostOptionsOffset.value = 0
    hostOptionsHasMore.value = false

    if (chatTypeValue.value === 'cmd') {
      await fetchHostOptionsForCommandMode('')
    } else {
      await fetchHostOptions('', true)
    }

    nextTick(() => {
      getElement(hostSearchInputRef.value)?.focus?.()
    })
  }

  const updateHosts = (hostInfo: { ip: string; uuid: string; connection: string } | null) => {
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
    hostOptionsOffset,
    hostOptionsHasMore,
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
    handleHostListScroll,
    loadMoreHosts,
    handleAddHostClick,
    updateHosts,
    updateHostsForCommandMode,
    getCurentTabAssetInfo
  }
}
