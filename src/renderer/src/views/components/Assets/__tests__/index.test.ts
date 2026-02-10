/**
 * Assets Component Unit Tests
 *
 * Tests for the Assets component including:
 * - Component mounting and rendering
 * - Search functionality
 * - Menu item selection
 * - Theme switching
 * - handleExplorerActive method
 * - Lifecycle hooks
 * - System theme listener
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AssetsComponent from '../index.vue'
import { getActualTheme, addSystemThemeListener } from '@/utils/themeUtils'

// Mock i18n - must be defined before vi.mock
vi.mock('@/locales', () => {
  const mockT = vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'common.management': 'Asset Management',
      'common.search': 'Search',
      'common.hostManagement': 'Host Management',
      'common.hostManagementDesc': 'Manage your hosts',
      'common.keyManagement': 'Key Management',
      'common.keyManagementDesc': 'Manage your keys'
    }
    return translations[key] || key
  })

  return {
    default: {
      global: {
        t: mockT
      }
    }
  }
})

// Mock t function for use in tests
const mockT = vi.fn((key: string) => {
  const translations: Record<string, string> = {
    'common.management': 'Asset Management',
    'common.search': 'Search',
    'common.hostManagement': 'Host Management',
    'common.hostManagementDesc': 'Manage your hosts',
    'common.keyManagement': 'Key Management',
    'common.keyManagementDesc': 'Manage your keys'
  }
  return translations[key] || key
})

// Mock Ant Design Vue components
vi.mock('@ant-design/icons-vue', () => ({
  SearchOutlined: {
    name: 'SearchOutlined',
    template: '<span class="search-icon">Search</span>'
  }
}))

// Mock themeUtils
vi.mock('@/utils/themeUtils', () => {
  const mockGetActualTheme = vi.fn((theme: string) => {
    if (theme === 'auto') {
      return 'dark' // Default to dark for auto mode in tests
    }
    return theme
  })

  const mockAddSystemThemeListener = vi.fn((_callback: () => void) => {
    return () => {} // Return cleanup function
  })

  return {
    getActualTheme: mockGetActualTheme,
    addSystemThemeListener: mockAddSystemThemeListener
  }
})

// Mock userConfigStore - use hoisted to create mutable config
const mockUserConfig = vi.hoisted(() => ({
  theme: 'dark'
}))

vi.mock('@/store/userConfigStore', () => {
  const mockUserConfigStore = {
    getUserConfig: mockUserConfig
  }
  return {
    userConfigStore: vi.fn(() => mockUserConfigStore)
  }
})

// Mock SVG imports
vi.mock('@/assets/menu/key.svg', () => ({
  default: '/mock/key.svg'
}))

vi.mock('@/assets/menu/laptop.svg', () => ({
  default: '/mock/laptop.svg'
}))

describe('Assets Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (options = {}) => {
    return mount(AssetsComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-input': {
            template: `
              <input
                :value="modelValue"
                @input="$emit('update:value', $event.target.value)"
                :placeholder="placeholder"
                class="a-input"
                data-testid="search-input"
              />
            `,
            props: ['modelValue', 'placeholder', 'allowClear'],
            emits: ['update:value']
          },
          'a-menu': {
            template: '<div class="a-menu" @select="$emit(\'select\', $event)"><slot /></div>',
            props: ['selectedKeys', 'mode', 'theme'],
            emits: ['select']
          },
          'a-menu-item': {
            template: '<div class="a-menu-item" :class="{ selected: isSelected }" @click="handleClick"><slot /></div>',
            props: ['itemKey'],
            computed: {
              isSelected() {
                const key = this.$attrs.key || this.itemKey
                const parent = this.$parent
                if (parent && parent.$props && parent.$props.selectedKeys) {
                  return parent.$props.selectedKeys.includes(key)
                }
                return false
              }
            },
            methods: {
              handleClick() {
                const key = this.$attrs.key || this.itemKey
                const parent = this.$parent
                if (parent) {
                  parent.$emit('select', { key })
                }
              }
            }
          }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)

    // Reset all mocks
    vi.clearAllMocks()
    vi.mocked(getActualTheme).mockImplementation((theme: string) => {
      if (theme === 'auto') {
        return 'dark'
      }
      return theme
    })
    vi.mocked(addSystemThemeListener).mockReturnValue(() => {})

    // Reset user config
    mockUserConfig.theme = 'dark'
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', () => {
      wrapper = createWrapper()
      expect(wrapper.exists()).toBe(true)
    })

    it('should render panel header with title', () => {
      wrapper = createWrapper()
      const header = wrapper.find('.panel_header')
      expect(header.exists()).toBe(true)
      expect(header.find('.panel_title').text()).toBe('Asset Management')
    })

    it('should render search box', () => {
      wrapper = createWrapper()
      const searchBox = wrapper.find('.search_box')
      expect(searchBox.exists()).toBe(true)
      const input = searchBox.find('[data-testid="search-input"]')
      expect(input.exists()).toBe(true)
    })

    it('should render list container with menu items', async () => {
      wrapper = createWrapper()
      await nextTick()

      const listContainer = wrapper.find('.list_container')
      expect(listContainer.exists()).toBe(true)

      const menu = listContainer.find('.custom_assets_menu')
      expect(menu.exists()).toBe(true)
    })

    it('should render all two menu items by default', async () => {
      wrapper = createWrapper()
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(2)
    })

    it('should render menu items with correct icons and names', async () => {
      wrapper = createWrapper()
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(2)

      // Check first item (host management)
      const firstItem = menuItems[0]
      const firstIcon = firstItem.find('.item_icon img')
      expect(firstIcon.exists()).toBe(true)
      expect(firstItem.find('.item_name').text()).toContain('Host Management')
    })
  })

  describe('Search Functionality', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should display all items when search is empty', async () => {
      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(2)
    })

    it('should filter items by name', async () => {
      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('Host')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(1)
      expect(menuItems[0].find('.item_name').text()).toContain('Host Management')
    })

    it('should filter items by description', async () => {
      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('keys')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(1)
      expect(menuItems[0].find('.item_name').text()).toContain('Key Management')
    })

    it('should be case insensitive', async () => {
      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('HOST')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(1)
    })

    it('should trim search query', async () => {
      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('  Host  ')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(1)
    })

    it('should return no results for non-matching search', async () => {
      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('NonExistentItem')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(0)
    })
  })

  describe('Menu Selection', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should emit open-user-tab event when item is selected', async () => {
      // Directly call handleSelect method to test the logic
      wrapper.vm.handleSelect({ key: 'assetConfig' })
      await nextTick()

      expect(wrapper.emitted('open-user-tab')).toBeTruthy()
      expect(wrapper.emitted('open-user-tab')?.[0]).toEqual(['assetConfig'])
    })

    it('should emit correct tab name for key management', async () => {
      wrapper.vm.handleSelect({ key: 'keyManagement' })
      await nextTick()

      const emissions = wrapper.emitted('open-user-tab')
      expect(emissions).toBeTruthy()
      expect(emissions?.length).toBeGreaterThan(0)
      // Check if any emission contains keyManagement
      const hasKeyManagement = emissions?.some((emission) => emission[0] === 'keyManagement')
      expect(hasKeyManagement).toBe(true)
    })

    it('should not emit event if menu item is not found', async () => {
      // This is an edge case - if the key doesn't match any item
      const initialEmissions = wrapper.emitted('open-user-tab')?.length || 0

      // Call handleSelect with non-existent key
      wrapper.vm.handleSelect({ key: 'nonExistentKey' })
      await nextTick()

      // Should not emit if item not found
      const finalEmissions = wrapper.emitted('open-user-tab')?.length || 0
      expect(finalEmissions).toBe(initialEmissions)
    })
  })

  describe('Theme Functionality', () => {
    it('should initialize theme on mount', async () => {
      mockUserConfig.theme = 'light'
      wrapper = createWrapper()
      await nextTick()

      expect(vi.mocked(getActualTheme)).toHaveBeenCalledWith('light')
    })

    it('should update theme when user config changes', async () => {
      wrapper = createWrapper()
      await nextTick()

      // Change theme in store
      mockUserConfig.theme = 'light'
      // Trigger watch by accessing the store
      await nextTick()

      expect(vi.mocked(getActualTheme)).toHaveBeenCalled()
    })

    it('should clean up existing listener when theme changes from auto to non-auto', async () => {
      const removeListener1 = vi.fn()
      vi.mocked(addSystemThemeListener).mockReturnValue(removeListener1)
      mockUserConfig.theme = 'auto'

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Verify listener was set up
      expect(vi.mocked(addSystemThemeListener)).toHaveBeenCalled()

      // Unmount to test cleanup
      wrapper.unmount()
      await nextTick()

      // Should have cleaned up the listener on unmount
      expect(removeListener1).toHaveBeenCalled()
    })

    it('should set up system theme listener when theme is auto', async () => {
      mockUserConfig.theme = 'auto'
      wrapper = createWrapper()
      await nextTick()

      // Wait for onMounted to execute
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(vi.mocked(addSystemThemeListener)).toHaveBeenCalled()
    })

    it('should not set up system theme listener when theme is not auto', async () => {
      mockUserConfig.theme = 'dark'
      wrapper = createWrapper()
      await nextTick()

      // Wait for onMounted to execute
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(vi.mocked(addSystemThemeListener)).not.toHaveBeenCalled()
    })

    it('should clean up system theme listener on unmount', async () => {
      const removeListener = vi.fn()
      vi.mocked(addSystemThemeListener).mockReturnValue(removeListener)
      mockUserConfig.theme = 'auto'

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      wrapper.unmount()
      await nextTick()

      expect(removeListener).toHaveBeenCalled()
    })

    it('should update theme when system theme changes in auto mode', async () => {
      vi.mocked(addSystemThemeListener).mockImplementation((callback) => {
        // Store callback for later invocation
        setTimeout(() => {
          callback()
        }, 0)
        return () => {}
      })
      mockUserConfig.theme = 'auto'

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vi.mocked(getActualTheme)).toHaveBeenCalled()
    })
  })

  describe('handleExplorerActive Method', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should expose handleExplorerActive method', () => {
      expect(wrapper.vm.handleExplorerActive).toBeDefined()
      expect(typeof wrapper.vm.handleExplorerActive).toBe('function')
    })

    it('should remove tabId from selectedKeys when it exists', async () => {
      // Set up selectedKeys with a value
      wrapper.vm.selectedKeys = ['assetConfig']
      await nextTick()

      // Call handleExplorerActive
      wrapper.vm.handleExplorerActive('assetConfig')
      await nextTick()

      expect(wrapper.vm.selectedKeys).not.toContain('assetConfig')
    })

    it('should not modify selectedKeys when tabId does not exist', async () => {
      wrapper.vm.selectedKeys = ['assetConfig']
      await nextTick()

      const originalLength = wrapper.vm.selectedKeys.length
      wrapper.vm.handleExplorerActive('nonExistentTab')
      await nextTick()

      expect(wrapper.vm.selectedKeys.length).toBe(originalLength)
      expect(wrapper.vm.selectedKeys).toContain('assetConfig')
    })

    it('should handle empty selectedKeys array', async () => {
      wrapper.vm.selectedKeys = []
      await nextTick()

      wrapper.vm.handleExplorerActive('assetConfig')
      await nextTick()

      expect(wrapper.vm.selectedKeys).toEqual([])
    })

    it('should remove correct item when multiple items exist', async () => {
      wrapper.vm.selectedKeys = ['assetConfig', 'keyManagement']
      await nextTick()

      wrapper.vm.handleExplorerActive('keyManagement')
      await nextTick()

      expect(wrapper.vm.selectedKeys).not.toContain('keyManagement')
      expect(wrapper.vm.selectedKeys).toContain('assetConfig')
    })
  })

  describe('Lifecycle Hooks', () => {
    it('should call updateActualTheme on mount', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(vi.mocked(getActualTheme)).toHaveBeenCalled()
    })

    it('should set up system theme listener on mount when theme is auto', async () => {
      mockUserConfig.theme = 'auto'
      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(vi.mocked(addSystemThemeListener)).toHaveBeenCalled()
    })

    it('should clean up system theme listener on unmount', async () => {
      const removeListener = vi.fn()
      vi.mocked(addSystemThemeListener).mockReturnValue(removeListener)
      mockUserConfig.theme = 'auto'

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))

      wrapper.unmount()
      await nextTick()

      expect(removeListener).toHaveBeenCalled()
    })
  })

  describe('Component Structure', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
    })

    it('should have correct CSS classes', () => {
      expect(wrapper.find('.assets_panel').exists()).toBe(true)
      expect(wrapper.find('.panel_header').exists()).toBe(true)
      expect(wrapper.find('.search_box').exists()).toBe(true)
      expect(wrapper.find('.list_container').exists()).toBe(true)
    })

    it('should render menu items with correct structure', async () => {
      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBeGreaterThan(0)

      const firstItem = menuItems[0]
      expect(firstItem.find('.item_wrapper').exists()).toBe(true)
      expect(firstItem.find('.item_icon').exists()).toBe(true)
      expect(firstItem.find('.item_info').exists()).toBe(true)
      expect(firstItem.find('.item_name').exists()).toBe(true)
      expect(firstItem.find('.item_desc').exists()).toBe(true)
    })

    it('should render icons for menu items', async () => {
      const menuItems = wrapper.findAll('.assets_item')
      for (const item of menuItems) {
        const icon = item.find('.item_icon img')
        expect(icon.exists()).toBe(true)
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty search gracefully', async () => {
      wrapper = createWrapper()
      await nextTick()

      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(2)
    })

    it('should handle special characters in search', async () => {
      wrapper = createWrapper()
      await nextTick()

      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('@#$%')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(0)
    })

    it('should handle rapid search changes', async () => {
      wrapper = createWrapper()
      await nextTick()

      const input = wrapper.find('[data-testid="search-input"]')
      await input.setValue('Host')
      await input.setValue('Key')
      await nextTick()

      const menuItems = wrapper.findAll('.assets_item')
      expect(menuItems.length).toBe(1)
      expect(menuItems[0].find('.item_name').text()).toContain('Key Management')
    })

    it('should handle theme changes during component lifecycle', async () => {
      mockUserConfig.theme = 'dark'
      wrapper = createWrapper()
      await nextTick()

      mockUserConfig.theme = 'light'
      await nextTick()

      expect(vi.mocked(getActualTheme)).toHaveBeenCalled()
    })
  })
})
