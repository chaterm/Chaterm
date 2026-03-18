<template>
  <div class="asset-manage-page">
    <div class="asset-toolbar">
      <a-input-search
        v-model:value="searchValue"
        :placeholder="t('common.search')"
        class="asset-search-input"
        allow-clear
        @search="handleSearch"
        @change="handleSearchChange"
      />
      <div class="asset-toolbar-actions">
        <a-button
          size="small"
          class="asset-add-button"
          @click="handleAdd"
        >
          <template #icon><DatabaseOutlined /></template>
          {{ t('personal.addAsset') }}
        </a-button>
        <a-button
          danger
          :disabled="selectedRowKeys.length === 0"
          @click="handleBatchDelete"
        >
          {{ t('personal.batchDelete') }}
        </a-button>
      </div>
    </div>

    <div class="asset-content">
      <div class="asset-main">
        <div
          ref="tableContainerRef"
          class="asset-table-container"
        >
          <a-table
            :columns="columns"
            :data-source="assets"
            :loading="loading"
            :pagination="false"
            :row-selection="rowSelection"
            row-key="uuid"
            size="small"
            :scroll="{ y: tableHeight }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'data_source'">
                <a-tag
                  v-if="record.data_source === 'manual'"
                  class="data-source-tag manual-tag"
                >
                  {{ t('personal.dataSourceManual') }}
                </a-tag>
                <a-tag
                  v-else
                  class="data-source-tag refresh-tag"
                >
                  {{ t('personal.dataSourceRefresh') }}
                </a-tag>
              </template>
              <template v-if="column.key === 'action'">
                <a-button
                  type="link"
                  size="small"
                  @click="handleEdit(record)"
                >
                  {{ t('common.edit') }}
                </a-button>
                <a-popconfirm
                  :title="t('personal.deleteAssetConfirm')"
                  :ok-text="t('common.delete')"
                  :cancel-text="t('common.cancel')"
                  ok-type="danger"
                  @confirm="handleDelete(record)"
                >
                  <a-button
                    type="link"
                    size="small"
                    danger
                  >
                    {{ t('common.remove') }}
                  </a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>
        </div>

        <div class="asset-footer">
          <a-pagination
            v-model:current="currentPage"
            v-model:page-size="pageSize"
            :total="totalCount"
            :show-total="(total: number) => `${total}`"
            :show-size-changer="true"
            :page-size-options="['50', '100', '200']"
            size="small"
            @change="handlePageChange"
            @show-size-change="handleSizeChange"
          />
        </div>
      </div>

      <div
        class="asset-editor"
        :class="{ collapsed: !editFormVisible }"
      >
        <AssetEditForm
          v-if="editFormVisible"
          :is-edit="isEditMode"
          :comment-only="isCommentOnlyEdit"
          :edit-data="editingAsset"
          @cancel="handleCloseEditForm"
          @save="handleSaveAsset"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { DatabaseOutlined } from '@ant-design/icons-vue'
import AssetEditForm from '../components/AssetEditForm.vue'
import i18n from '@/locales'

const { t } = i18n.global

interface Props {
  organizationUuid: string
}

interface AssetItem {
  uuid: string
  hostname: string
  host: string
  comment?: string
  data_source: string
}

interface AssetEditPayload {
  hostname: string
  host: string
  comment: string
  uuid?: string
}

const props = defineProps<Props>()

const searchValue = ref('')
const loading = ref(false)
const assets = ref<AssetItem[]>([])
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const selectedRowKeys = ref<string[]>([])
const tableHeight = ref<number | undefined>(undefined)

const tableContainerRef = ref<HTMLElement | null>(null)

const editFormVisible = ref(false)
const isEditMode = ref(false)
const isCommentOnlyEdit = ref(false)
const editingAsset = ref<AssetEditPayload | null>(null)

const handleCloseEditForm = () => {
  editFormVisible.value = false
  isEditMode.value = false
  isCommentOnlyEdit.value = false
  editingAsset.value = null
}

const calcTableHeight = () => {
  if (!tableContainerRef.value) return
  // Get the available height of the table container minus the table header (~39px)
  const containerHeight = tableContainerRef.value.clientHeight
  tableHeight.value = Math.max(100, containerHeight - 39)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => {
    calcTableHeight()
    if (tableContainerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        calcTableHeight()
      })
      resizeObserver.observe(tableContainerRef.value)
    }
  })
  fetchAssets()
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

const columns = computed(() => [
  {
    title: t('personal.hostname'),
    dataIndex: 'hostname',
    key: 'hostname',
    ellipsis: true
  },
  {
    title: t('personal.hostIp'),
    dataIndex: 'host',
    key: 'host',
    width: 150
  },
  {
    title: t('personal.dataSource'),
    dataIndex: 'data_source',
    key: 'data_source',
    width: 90
  },
  {
    title: t('personal.comment'),
    dataIndex: 'comment',
    key: 'comment',
    ellipsis: true
  },
  {
    title: t('extensions.action'),
    key: 'action',
    width: 130
  }
])

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => {
    selectedRowKeys.value = keys
  }
}))

const showApiError = (result: any) => {
  message.error(result?.data?.error || 'Failed')
}

const isApiSuccess = (result: any) => result?.data?.message === 'success'

const refreshListAfterMutation = () => {
  selectedRowKeys.value = []
  fetchAssets()
}

const handleMutationResult = (result: any, successMessage: string) => {
  if (isApiSuccess(result)) {
    message.success(successMessage)
    handleCloseEditForm()
    refreshListAfterMutation()
    return true
  }
  showApiError(result)
  return false
}

const fetchAssets = async () => {
  if (!props.organizationUuid) return
  loading.value = true
  try {
    const result = await window.api.getOrganizationAssets({
      organizationUuid: props.organizationUuid,
      search: searchValue.value || undefined,
      page: currentPage.value,
      pageSize: pageSize.value
    })
    if (result?.data?.message === 'success') {
      const allAssets = result.data.assets || []
      assets.value = allAssets.slice(0, pageSize.value)
      totalCount.value = result.data.total || 0
    }
  } catch (error) {
    // silent
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  selectedRowKeys.value = []
  fetchAssets()
}

const handleSearchChange = () => {
  if (!searchValue.value) {
    handleSearch()
  }
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchAssets()
}

const handleSizeChange = (_current: number, size: number) => {
  currentPage.value = 1
  pageSize.value = size
  fetchAssets()
}

const handleAdd = () => {
  isEditMode.value = false
  isCommentOnlyEdit.value = false
  editingAsset.value = null
  editFormVisible.value = true
}

const handleEdit = (record: AssetItem) => {
  isEditMode.value = true
  isCommentOnlyEdit.value = record.data_source !== 'manual'
  editingAsset.value = {
    uuid: record.uuid,
    hostname: record.hostname,
    host: record.host,
    comment: record.comment || ''
  }
  editFormVisible.value = true
}

const handleSaveAsset = async (data: AssetEditPayload) => {
  try {
    let result: any = null
    if (isEditMode.value && data.uuid) {
      result = isCommentOnlyEdit.value
        ? await window.api.updateOrganizationAsset({
            uuid: data.uuid,
            comment: data.comment
          })
        : await window.api.updateOrganizationAsset({
            uuid: data.uuid,
            hostname: data.hostname,
            host: data.host,
            comment: data.comment
          })
      handleMutationResult(result, t('personal.updateAssetSuccess'))
    } else {
      result = await window.api.createOrganizationAsset({
        organizationUuid: props.organizationUuid,
        hostname: data.hostname,
        host: data.host,
        comment: data.comment
      })
      handleMutationResult(result, t('personal.addAssetSuccess'))
    }
  } catch (error) {
    message.error(String(error))
  }
}

const handleDelete = async (record: AssetItem) => {
  try {
    const result = await window.api.deleteOrganizationAsset({ uuid: record.uuid })
    handleMutationResult(result, t('personal.deleteAssetSuccess'))
  } catch (error) {
    message.error(String(error))
  }
}

const handleBatchDelete = () => {
  const uuids = selectedRowKeys.value.map((uuid) => String(uuid))
  if (uuids.length === 0) {
    return
  }

  Modal.confirm({
    title: t('personal.batchDeleteConfirm'),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    maskClosable: true,
    onOk: async () => {
      try {
        const result = await window.api.batchDeleteOrganizationAssets({ uuids })
        handleMutationResult(result, t('personal.batchDeleteSuccess'))
      } catch (error) {
        message.error(String(error))
      }
    }
  })
}
</script>

<style lang="less" scoped>
.asset-manage-page {
  height: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
  color: var(--text-color);
  min-height: 0;
}

.asset-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex: 0 0 auto;
  gap: 12px;
}

.asset-search-input {
  width: 240px;
  min-width: 180px;
}

.asset-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.asset-content {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.asset-main {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.asset-editor {
  flex: 0 0 280px;
  width: 280px;
  max-width: 280px;
  min-width: 280px;
  border-left: 1px solid var(--border-color);
  background-color: var(--bg-color);
  transition: all 0.25s ease;
  overflow: hidden;
}

.asset-editor.collapsed {
  flex: 0 0 0 !important;
  width: 0 !important;
  max-width: 0 !important;
  min-width: 0 !important;
  border-left: 0 !important;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.asset-table-container {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.asset-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 8px;
  flex: 0 0 auto;
}

// Search input theme
:deep(.asset-search-input.ant-input-group-wrapper) {
  background-color: transparent !important;
}

:deep(.asset-search-input .ant-input-wrapper),
:deep(.asset-search-input .ant-input-group) {
  background-color: transparent !important;
}

:deep(.asset-search-input .ant-input-group .ant-input),
:deep(.asset-search-input .ant-input-affix-wrapper) {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  border-color: var(--border-color) !important;
}

:deep(.asset-search-input .ant-input-group .ant-input::placeholder),
:deep(.asset-search-input .ant-input-affix-wrapper input::placeholder) {
  color: var(--text-color-tertiary) !important;
}

:deep(.asset-search-input .ant-input-group-addon) {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  border-left: 0 !important;
  padding: 0 !important;
}

:deep(.asset-search-input .ant-input-group-addon .ant-input-search-button) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  border-left: 0 !important;
  color: var(--text-color) !important;
  box-shadow: none !important;
}

:deep(.asset-search-input .ant-input-group .ant-input:hover),
:deep(.asset-search-input .ant-input-group .ant-input:focus),
:deep(.asset-search-input .ant-input-affix-wrapper:hover),
:deep(.asset-search-input .ant-input-affix-wrapper-focused) {
  border-color: var(--primary-color, #1677ff) !important;
  box-shadow: none !important;
}

:deep(.asset-toolbar-actions .asset-add-button) {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  background: var(--bg-color) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  transition: all 0.3s ease;
}

:deep(.asset-toolbar-actions .asset-add-button:hover) {
  background: var(--hover-bg-color) !important;
  border-color: var(--primary-color, #1677ff) !important;
  color: var(--primary-color, #1677ff) !important;
}

:deep(.asset-toolbar-actions .asset-add-button:active) {
  background: var(--active-bg-color) !important;
}

:deep(.asset-toolbar-actions .ant-btn-dangerous.ant-btn-default) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--error-color, #ff4d4f) !important;
}

:deep(.asset-toolbar-actions .ant-btn-dangerous.ant-btn-default.ant-btn-disabled),
:deep(.asset-toolbar-actions .ant-btn-dangerous.ant-btn-default[disabled]) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-tertiary) !important;
  opacity: 1;
}

// Table theme
:deep(.ant-table-wrapper) {
  height: 100%;

  .ant-spin-nested-loading,
  .ant-spin-container {
    height: 100%;
    min-height: 0;
  }
}

:deep(.ant-table) {
  background-color: var(--bg-color) !important;
  color: var(--text-color) !important;

  .ant-table-header {
    background: var(--bg-color) !important;
  }

  .ant-table-thead > tr > th {
    background: var(--bg-color-secondary) !important;
    color: var(--text-color) !important;
    border-bottom: 1px solid var(--border-color) !important;
    padding: 8px !important;

    &::before {
      background-color: var(--border-color) !important;
    }
  }

  .ant-table-tbody > tr > td {
    background: var(--bg-color) !important;
    color: var(--text-color) !important;
    border-bottom: 1px solid var(--border-color) !important;
    padding: 6px 8px !important;
  }

  .ant-table-tbody > tr:hover > td {
    background-color: var(--hover-bg-color) !important;
  }

  .ant-table-tbody > tr.ant-table-row-selected > td {
    background-color: var(--active-bg-color) !important;
  }

  .ant-table-container {
    border-color: var(--border-color) !important;
  }

  .ant-table-cell-fix-left,
  .ant-table-cell-fix-right {
    background-color: var(--bg-color) !important;
  }

  .ant-table-placeholder {
    background-color: var(--bg-color) !important;
    color: var(--text-color-tertiary) !important;

    .ant-empty-description {
      color: var(--text-color-tertiary) !important;
    }
  }

  .ant-table-body {
    scrollbar-width: thin;
    scrollbar-color: var(--border-color-light) transparent;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--border-color-light);
      border-radius: 3px;
    }
  }
}

// Checkbox theme
:deep(.ant-checkbox-wrapper) {
  color: var(--text-color) !important;
}

// Pagination theme
:deep(.ant-pagination) {
  .ant-pagination-item {
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color) !important;

    a {
      color: var(--text-color) !important;
    }

    &-active {
      border-color: #1890ff !important;

      a {
        color: #1890ff !important;
      }
    }
  }

  .ant-pagination-prev,
  .ant-pagination-next {
    .ant-pagination-item-link {
      background-color: var(--bg-color-secondary) !important;
      border-color: var(--border-color) !important;
      color: var(--text-color) !important;
    }
  }

  .ant-pagination-disabled {
    .ant-pagination-item-link {
      color: var(--text-color-tertiary) !important;
    }
  }

  .ant-pagination-total-text {
    color: var(--text-color-secondary) !important;
  }

  .ant-pagination-options {
    .ant-select-selector {
      background-color: var(--bg-color-secondary) !important;
      border-color: var(--border-color) !important;
      color: var(--text-color) !important;
    }

    .ant-select-arrow {
      color: var(--text-color-tertiary) !important;
    }
  }
}

:deep(.ant-tag) {
  border-color: transparent !important;
}

:deep(.data-source-tag) {
  margin-inline-end: 0 !important;
  border-width: 1px !important;
  border-style: solid !important;
  font-weight: 500;
}

:deep(.data-source-tag.manual-tag) {
  background-color: rgba(82, 196, 26, 0.12) !important;
  border-color: rgba(82, 196, 26, 0.24) !important;
  color: #6ea73f !important;
}

:deep(.data-source-tag.refresh-tag) {
  background-color: rgba(24, 144, 255, 0.12) !important;
  border-color: rgba(24, 144, 255, 0.24) !important;
  color: #4f92d8 !important;
}

@media (max-width: 960px) {
  .asset-toolbar {
    flex-wrap: wrap;
  }

  .asset-search-input {
    width: 100%;
    min-width: 0;
  }

  .asset-content {
    flex-direction: column;
  }

  .asset-editor,
  .asset-editor.collapsed {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
    border-left: 0 !important;
  }
}
</style>
