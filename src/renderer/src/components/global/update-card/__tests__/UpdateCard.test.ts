import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => (params?.version ? `${key}:${params.version}` : key)
  })
}))

vi.mock('@/utils/edition', () => ({
  isEnterpriseDeployEnabled: () => false
}))

vi.mock('@ant-design/icons-vue', () => ({
  CloseOutlined: { name: 'CloseOutlined', template: '<span />' }
}))

import UpdateCard from '../UpdateCard.vue'
import { useUpdateStore } from '@/store/updateStore'
import { useVersionPromptStore } from '@/store/versionPromptStore'

const quitAndInstall = vi.fn()

describe('UpdateCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).createRendererLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
    ;(window as any).api = { quitAndInstall }
    setActivePinia(createPinia())
  })

  const mountCard = () => mount(UpdateCard, { global: { stubs: { Transition: false } } })

  it('is hidden until the update is downloaded', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="update-card"]').exists()).toBe(false)
  })

  it('shows the version, release notes link and update button', async () => {
    const store = useUpdateStore()
    store.phase = 'ready'
    store.version = '1.2.3'
    store.cardVisible = true
    const wrapper = mountCard()

    expect(wrapper.text()).toContain('update.cardTitle')
    expect(wrapper.text()).toContain('update.cardReady:1.2.3')
    expect(wrapper.find('a').attributes('href')).toBe('https://github.com/chaterm/Chaterm/releases/tag/v1.2.3')

    await wrapper.find('.update-card-action').trigger('click')
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('hides when the close button is clicked', async () => {
    const store = useUpdateStore()
    store.phase = 'ready'
    store.cardVisible = true
    const wrapper = mountCard()

    await wrapper.find('.update-card-close').trigger('click')
    expect(store.cardVisible).toBe(false)
    expect(wrapper.find('[data-testid="update-card"]').exists()).toBe(false)
  })

  it('yields to the version prompt modal', async () => {
    const store = useUpdateStore()
    const promptStore = useVersionPromptStore()
    store.phase = 'ready'
    store.cardVisible = true
    promptStore.modalVisible = true
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="update-card"]').exists()).toBe(false)

    promptStore.modalVisible = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="update-card"]').exists()).toBe(true)
  })
})
