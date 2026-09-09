import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import AssetList from '../AssetList.vue'
import AssetCard from '../AssetCard.vue'
import type { AssetNode } from '../../utils/types'

vi.mock('@/locales', () => ({
  default: { global: { t: (key: string) => key } }
}))

const groups: AssetNode[] = [
  {
    key: 'production',
    title: 'Production',
    children: [
      { key: 'same-ip', uuid: 'web-1', title: 'Web 1', asset_type: 'person' },
      { key: 'same-ip', uuid: 'web-2', title: 'Web 2', asset_type: 'person' },
      { key: 'placeholder', title: 'No UUID' }
    ]
  },
  {
    key: 'bastions',
    title: 'Bastions',
    children: [
      {
        key: 'bastion',
        uuid: 'bastion-1',
        title: 'Gateway',
        asset_type: 'organization',
        children: [{ key: 'managed', uuid: 'managed-1', title: 'Managed host' }]
      }
    ]
  }
]

const createWrapper = (props = {}) =>
  shallowMount(AssetList, {
    props: { assetGroups: groups, selectionMode: true, selectedUuids: [], ...props }
  })

describe('AssetList batch selection', () => {
  it('selects only visible host configuration UUIDs, never nested bastion assets', async () => {
    const wrapper = createWrapper()
    wrapper.findAllComponents({ name: 'ACheckbox' })[0].vm.$emit('change')
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([['web-1', 'web-2', 'bastion-1']])
  })

  it('limits select all to the current search results', async () => {
    const wrapper = createWrapper({ searchValue: 'Web 1' })
    wrapper.findAllComponents({ name: 'ACheckbox' })[0].vm.$emit('change')
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([['web-1']])
    expect(wrapper.findAllComponents(AssetCard)).toHaveLength(1)
  })

  it('selects and clears one group while preserving other selections', async () => {
    const wrapper = createWrapper({ selectedUuids: ['web-1', 'bastion-1'] })
    const productionCheckbox = wrapper.findAllComponents({ name: 'ACheckbox' })[1]
    expect(productionCheckbox.props('indeterminate')).toBe(true)
    productionCheckbox.vm.$emit('change')
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([['web-1', 'bastion-1', 'web-2']])

    await wrapper.setProps({ selectedUuids: ['web-1', 'web-2', 'bastion-1'] })
    expect(productionCheckbox.props('checked')).toBe(true)
    productionCheckbox.vm.$emit('change')
    expect(wrapper.emitted('selection-change')?.[1]).toEqual([['bastion-1']])
  })

  it('keeps hosts with duplicated route keys independently selectable by UUID', async () => {
    const wrapper = createWrapper({ selectedUuids: ['web-1'] })
    const cards = wrapper.findAllComponents(AssetCard)
    expect(cards[0].props('selected')).toBe(true)
    expect(cards[1].props('selected')).toBe(false)
    cards[1].vm.$emit('select', groups[0].children![1])
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([['web-1', 'web-2']])
  })

  it('blocks selection changes while deletion is pending', async () => {
    const wrapper = createWrapper({ selectedUuids: ['web-1'], selectionDisabled: true })
    wrapper.findAllComponents({ name: 'ACheckbox' })[0].vm.$emit('change')
    wrapper.findAllComponents(AssetCard)[1].vm.$emit('select', groups[0].children![1])
    expect(wrapper.emitted('selection-change')).toBeUndefined()
    expect(wrapper.findAllComponents({ name: 'AButton' }).every((button) => button.props('disabled'))).toBe(true)
  })
})
