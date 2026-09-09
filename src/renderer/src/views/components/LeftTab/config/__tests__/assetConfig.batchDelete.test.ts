import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AssetConfig from '../assetConfig.vue'
import type { AssetNode } from '../../utils/types'

interface ConfirmOptions {
  onOk: () => Promise<unknown>
  onCancel?: () => void
}

const mocks = vi.hoisted(() => ({
  confirm: vi.fn<(options: ConfirmOptions) => { update: (options: unknown) => void }>(),
  success: vi.fn(),
  error: vi.fn(),
  emit: vi.fn(),
  getLocalAssetRoute: vi.fn(),
  batchDeleteAssets: vi.fn()
}))

vi.mock('ant-design-vue', () => ({
  Modal: { confirm: mocks.confirm },
  message: { success: mocks.success, error: mocks.error, warning: vi.fn() },
  notification: { error: vi.fn() }
}))

vi.mock('@/locales', () => ({
  default: { global: { t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) } }
}))

vi.mock('@/utils/eventBus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: mocks.emit }
}))

vi.mock('@/store/onboardingStore', () => ({
  useOnboardingStore: () => ({ activeTour: null })
}))

vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: { getConfig: vi.fn().mockResolvedValue({}) }
}))

vi.mock('../../components/refreshOrganizationAssets', () => ({
  handleRefreshOrganizationAssets: vi.fn()
}))

vi.mock('../../components/AssetSearch.vue', () => ({
  default: {
    name: 'AssetSearch',
    props: ['modelValue', 'selectionMode', 'selectionDisabled', 'batchDeleteDisabled'],
    emits: ['update:modelValue', 'batch-delete', 'cancel-selection'],
    template: '<div />'
  }
}))

vi.mock('../../components/AssetList.vue', () => ({
  default: {
    name: 'AssetList',
    props: ['assetGroups', 'searchValue', 'selectionMode', 'selectedUuids', 'selectionDisabled'],
    emits: ['selection-change', 'batch-delete', 'asset-click', 'asset-double-click'],
    template: '<div />'
  }
}))

vi.mock('../../components/AssetForm.vue', () => ({ default: { name: 'AssetForm', template: '<div />' } }))
vi.mock('../../components/AssetContextMenu.vue', () => ({ default: { name: 'AssetContextMenu', template: '<div />' } }))

const hosts: AssetNode[] = [
  { key: 'shared-address', uuid: 'host-1', title: 'Host One', asset_type: 'person' },
  { key: 'shared-address', uuid: 'host-2', title: 'Host Two', asset_type: 'person' },
  {
    key: 'bastion',
    uuid: 'bastion-1',
    title: 'Bastion',
    asset_type: 'organization-custom',
    children: [{ key: 'bastion-child', uuid: 'bastion-child-1', title: 'Bastion Child', asset_type: 'organization-custom' }]
  }
]

const assetGroups: AssetNode[] = [{ key: 'group', title: 'Hosts', children: hosts }]

const createWrapper = () =>
  shallowMount(AssetConfig, {
    global: {
      stubs: { 'a-modal': true, 'a-input': true, 'a-button': true, 'a-tree': true }
    }
  })

describe('host configuration batch deletion', () => {
  let wrapper: ReturnType<typeof createWrapper>

  const search = () => wrapper.findComponent({ name: 'AssetSearch' })
  const list = () => wrapper.findComponent({ name: 'AssetList' })

  const selectHosts = async (uuids = ['host-1', 'host-2']) => {
    search().vm.$emit('batch-delete')
    await nextTick()
    list().vm.$emit('selection-change', uuids)
    await nextTick()
  }

  const requestDelete = async () => {
    list().vm.$emit('batch-delete')
    await nextTick()
    return mocks.confirm.mock.calls.at(-1)![0]
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.confirm.mockReturnValue({ update: vi.fn() })
    mocks.getLocalAssetRoute.mockResolvedValue({ data: { routers: assetGroups } })
    mocks.batchDeleteAssets.mockResolvedValue({ data: { message: 'success', changes: 2, requested: 2 } })
    vi.stubGlobal('api', {
      getLocalAssetRoute: mocks.getLocalAssetRoute,
      batchDeleteAssets: mocks.batchDeleteAssets,
      getKeyChainSelect: vi.fn().mockResolvedValue({ data: { keyChain: [] } }),
      getPasswordChainSelect: vi.fn().mockResolvedValue({ data: { passwordChain: [] } }),
      log: vi.fn()
    })
    wrapper = createWrapper()
    await flushPromises()
  })

  afterEach(() => {
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('requires confirmation and preserves the selection when confirmation is canceled', async () => {
    await selectHosts()
    const confirmation = await requestDelete()

    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.batchDeleteAssets).not.toHaveBeenCalled()

    confirmation.onCancel?.()
    await nextTick()

    expect(mocks.batchDeleteAssets).not.toHaveBeenCalled()
    expect(list().props('selectedUuids')).toEqual(['host-1', 'host-2'])
  })

  it('deletes selected configurations by UUID and refreshes both host views', async () => {
    await selectHosts()
    const confirmation = await requestDelete()
    mocks.getLocalAssetRoute.mockResolvedValue({ data: { routers: [{ ...assetGroups[0], children: [hosts[2]] }] } })
    await confirmation.onOk()
    await flushPromises()

    expect(mocks.batchDeleteAssets).toHaveBeenCalledExactlyOnceWith({ uuids: ['host-1', 'host-2'] })
    expect(mocks.getLocalAssetRoute).toHaveBeenCalledTimes(2)
    expect(mocks.emit).toHaveBeenCalledWith('LocalAssetMenu')
    expect(mocks.success).toHaveBeenCalledOnce()
    expect(list().props('selectionMode')).toBe(false)
    expect(list().props('selectedUuids')).toEqual([])
  })

  it('only deletes unique host configurations, excluding unknown UUIDs and bastion child assets', async () => {
    await selectHosts(['host-1', 'host-1', 'unknown-host', 'bastion-1', 'bastion-child-1'])
    const confirmation = await requestDelete()
    await confirmation.onOk()

    expect(mocks.batchDeleteAssets).toHaveBeenCalledExactlyOnceWith({ uuids: ['host-1', 'bastion-1'] })
  })

  it('keeps failed selections available for retry', async () => {
    mocks.batchDeleteAssets.mockResolvedValueOnce({ data: { message: 'failed', changes: 0, requested: 2 } })
    await selectHosts()
    const confirmation = await requestDelete()
    await confirmation.onOk()
    await flushPromises()

    expect(mocks.error).toHaveBeenCalledOnce()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalledWith('LocalAssetMenu')
    expect(list().props('selectionMode')).toBe(true)
    expect(list().props('selectedUuids')).toEqual(['host-1', 'host-2'])
    expect(list().props('selectionDisabled')).toBe(false)

    const retry = await requestDelete()
    await retry.onOk()
    await flushPromises()

    expect(mocks.batchDeleteAssets).toHaveBeenCalledTimes(2)
    expect(list().props('selectionMode')).toBe(false)
  })

  it('clears the selection when the host search changes', async () => {
    await selectHosts()
    search().vm.$emit('update:modelValue', 'Host One')
    await nextTick()

    expect(list().props('selectedUuids')).toEqual([])
    expect(list().props('selectionMode')).toBe(true)
    list().vm.$emit('batch-delete')
    await nextTick()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.batchDeleteAssets).not.toHaveBeenCalled()
  })

  it('preserves selected hosts when the deletion request rejects', async () => {
    mocks.batchDeleteAssets.mockRejectedValueOnce(new Error('Deletion failed'))
    await selectHosts()
    const confirmation = await requestDelete()
    await confirmation.onOk()
    await flushPromises()

    expect(mocks.error).toHaveBeenCalledOnce()
    expect(mocks.getLocalAssetRoute).toHaveBeenCalledOnce()
    expect(list().props('selectedUuids')).toEqual(['host-1', 'host-2'])
    expect(list().props('selectionDisabled')).toBe(false)
  })

  it('prevents duplicate deletion requests and selection changes while deleting', async () => {
    let finishDelete: (result: unknown) => void = () => {}
    mocks.batchDeleteAssets.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = resolve
        })
    )
    await selectHosts()
    const confirmation = await requestDelete()
    const pendingDelete = confirmation.onOk()
    await nextTick()

    expect(list().props('selectionDisabled')).toBe(true)
    expect(search().props('selectionDisabled')).toBe(true)
    list().vm.$emit('selection-change', ['bastion-1'])
    list().vm.$emit('batch-delete')
    search().vm.$emit('cancel-selection')
    await confirmation.onOk()
    await nextTick()

    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.batchDeleteAssets).toHaveBeenCalledOnce()
    expect(list().props('selectedUuids')).toEqual(['host-1', 'host-2'])
    expect(list().props('selectionMode')).toBe(true)

    finishDelete({ data: { message: 'success', changes: 2, requested: 2 } })
    await pendingDelete
    await flushPromises()
    expect(list().props('selectionDisabled')).toBe(false)
  })

  it('exits selection mode without deleting any configuration', async () => {
    await selectHosts()
    search().vm.$emit('cancel-selection')
    await nextTick()

    expect(list().props('selectionMode')).toBe(false)
    expect(list().props('selectedUuids')).toEqual([])
    expect(mocks.batchDeleteAssets).not.toHaveBeenCalled()
  })

  it('does not open a host connection while selection mode is active', async () => {
    await selectHosts()
    list().vm.$emit('asset-click', hosts[0])
    list().vm.$emit('asset-double-click', hosts[0])
    await nextTick()

    expect(mocks.emit).not.toHaveBeenCalledWith('currentClickServer', expect.anything())
    expect(list().props('selectionMode')).toBe(true)
  })
})
