import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import AssetCard from '../AssetCard.vue'
import type { AssetNode } from '../../utils/types'

vi.mock('@/locales', () => ({
  default: { global: { t: (key: string) => key } }
}))

const asset: AssetNode = { key: 'host-key', uuid: 'host-uuid', title: 'Host', asset_type: 'person' }

const createWrapper = (props = {}) =>
  shallowMount(AssetCard, {
    props: { asset, ...props },
    global: { renderStubDefaultSlot: true }
  })

describe('AssetCard batch selection', () => {
  it('selects a host without triggering its normal click, connect or context menu actions', async () => {
    const wrapper = createWrapper({ selectionMode: true })
    const card = wrapper.find('.asset-card')
    await card.trigger('click')
    await card.trigger('dblclick')
    await card.trigger('contextmenu')
    expect(wrapper.emitted('select')).toEqual([[asset]])
    expect(wrapper.emitted('click')).toBeUndefined()
    expect(wrapper.emitted('double-click')).toBeUndefined()
    expect(wrapper.emitted('context-menu')).toBeUndefined()
    expect(wrapper.find('.action-buttons').exists()).toBe(false)
  })

  it('cannot select while deletion is pending', async () => {
    const wrapper = createWrapper({ selectionMode: true, selectionDisabled: true })
    await wrapper.find('.asset-card').trigger('click')
    wrapper.findComponent({ name: 'ACheckbox' }).vm.$emit('change')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('preserves ordinary card actions outside selection mode', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.asset-card').trigger('click')
    await wrapper.find('.asset-card').trigger('dblclick')
    expect(wrapper.emitted('click')).toEqual([[asset]])
    expect(wrapper.emitted('double-click')).toEqual([[asset]])
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.find('.action-buttons').exists()).toBe(true)
  })
})
