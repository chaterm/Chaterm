<template>
  <div class="alias-config">
    <a-card
      :bordered="false"
      class="alias-config-container responsive-table"
    >
      <a-row>
        <a-col :span="10">
          <a-input
            v-model:value="searchValue"
            :placeholder="t('extensions.fuzzySearch')"
            class="search-input"
            @search="handleTableChange"
            @press-enter="handleTableChange"
          >
            <template #suffix>
              <search-outlined />
            </template>
          </a-input>
        </a-col>
        <a-col :span="2">
          <div
            style="margin-left: 10px"
            @click="handleAdd"
          >
            <a-button
              type="primary"
              size="small"
              class="workspace-button"
              :icon="h(PlusOutlined)"
            >
              {{ t('extensions.addCommand') }}
            </a-button>
          </div>
        </a-col>
      </a-row>
      <a-table
        style="margin-top: 10px"
        :columns="columns"
        :data-source="list"
        :pagination="false"
        class="alias-config-table"
        @change="handleTableChange"
      >
        <template #emptyText>{{ t('common.noData') }}</template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'alias'">
            <a-input
              v-model:value="record.alias"
              :disabled:="record.edit"
              :class="{ 'editable-input': record.edit }"
            />
          </template>
          <template v-else-if="column.key === 'command'">
            <a-textarea
              v-model:value="record.command"
              class="textarea-command"
              :auto-size="{ minRows: 1, maxRows: 5 }"
              :disabled:="record.edit"
              :class="{ 'editable-input': record.edit }"
              :spellcheck="false"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button
              v-if="!record.edit"
              type="link"
              style="width: 40px"
              :icon="h(EditOutlined)"
              @click="columnOpt('edit', record)"
            >
            </a-button>
            <a-button
              v-if="!record.edit"
              type="link"
              style="width: 40px; color: #ff4d4f"
              :icon="h(CloseOutlined)"
              @click="columnOpt('del', record)"
            >
            </a-button>
            <a-button
              v-if="record.edit"
              type="link"
              style="width: 40px"
              :icon="h(CheckOutlined)"
              @click="columnOpt('save', record)"
            />
            <a-button
              v-if="record.edit"
              style="width: 40px"
              type="link"
              :icon="h(CloseSquareOutlined)"
              @click="columnOpt('cancel', record)"
            />
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, h } from 'vue'
import { PlusOutlined, CloseOutlined, EditOutlined, CheckOutlined, CloseSquareOutlined, SearchOutlined } from '@ant-design/icons-vue'
import 'xterm/css/xterm.css'
import { cloneDeep } from 'lodash'
import i18n from '@/locales'
import { notification } from 'ant-design-vue'
import { commandStore } from '@/services/commandStoreService' // Import commandStoreService
import { aliasConfigStore } from '@/store/aliasConfigStore'
import eventBus from '@/utils/eventBus'

const searchText = ref('')
const list = ref([])
const cloneRecord = ref({
  alias: '',
  command: '',
  edit: false,
  id: ''
})
const { t } = i18n.global
const columns = computed(() => [
  {
    title: t('extensions.alias'),
    dataIndex: 'alias',
    key: 'alias',
    width: '20%'
  },
  {
    title: t('extensions.command'),
    dataIndex: 'command',
    key: 'command'
  },
  {
    title: t('extensions.action'),
    dataIndex: 'action',
    key: 'action',
    width: '15%'
  }
])
const aliasStore = aliasConfigStore()
// Use CommandStoreService to handle data
const handleTableChange = async () => {
  try {
    // Use search function to get filtered aliases
    list.value = await commandStore.search(searchText.value)
  } catch (err) {
    console.error('Error loading aliases:', err)
    notification.error({
      message: t('extensions.error'),
      placement: 'topRight',
      duration: 3
    })
    list.value = []
  }
}

const columnOpt = async (type, record) => {
  switch (type) {
    case 'edit':
      // Handle state cleanup before editing
      if (list.value.length > 0 && list.value[0]?.id === 'new') {
        list.value.splice(0, 1)
      } else if (cloneRecord.value.id && cloneRecord.value.id !== 'new') {
        const index = list.value.findIndex((item) => item.alias === cloneRecord.value.alias)
        if (index !== -1) {
          list.value[index].alias = cloneRecord.value.alias
          list.value[index].command = cloneRecord.value.command
          list.value[index].edit = false
        }
      }
      record.edit = true
      cloneRecord.value = cloneDeep(record)
      await aliasConfigRefresh()
      break

    case 'del':
      try {
        // Delete record using alias
        await commandStore.delete(record.alias)
        await handleTableChange()
        await aliasConfigRefresh()
        cloneRecordReset()
        notification.success({
          message: t('extensions.success'),
          placement: 'topRight',
          duration: 2
        })
      } catch (err) {
        console.error('Error deleting alias:', err)
        notification.error({
          message: t('extensions.error'),
          placement: 'topRight',
          duration: 3
        })
      }
      break

    case 'save':
      if (record.alias.length === 0 || record.command.length === 0) {
        notification.warning({
          message: t('extensions.warning'),
          description: t('extensions.missingAliasCommand'),
          placement: 'topRight',
          duration: 2
        })
        return
      }

      try {
        // If editing existing record and alias has changed
        if (record.id && record.id !== 'new' && record.alias !== cloneRecord.value.alias) {
          // Check if new alias exists
          const existingAlias = await commandStore.getByAlias(record.alias)
          if (existingAlias) {
            notification.warning({
              message: t('extensions.warning'),
              description: t('extensions.aliasAlreadyExists'),
              placement: 'topRight',
              duration: 2
            })
            return
          }
          const recordNew = {
            id: record.id,
            alias: record.alias,
            command: record.command
          }
          // Need to rename alias
          const success = await commandStore.renameAlias(cloneRecord.value.alias, recordNew)
          if (!success) {
            throw new Error('Failed to rename alias')
          }

          notification.success({
            message: t('extensions.success'),
            placement: 'topRight',
            duration: 2
          })
        } else if (record.id === 'new') {
          // Check if alias already exists
          const existingAlias = await commandStore.getByAlias(record.alias)
          if (existingAlias) {
            notification.warning({
              message: t('extensions.warning'),
              description: t('extensions.aliasAlreadyExists'),
              placement: 'topRight',
              duration: 2
            })
            return
          }

          // Create new alias
          const newId = Date.now().toString(36) + Math.random().toString(36).substring(2)
          await commandStore.add({
            id: newId,
            alias: record.alias,
            command: record.command
          })

          notification.success({
            message: t('extensions.success'),
            placement: 'topRight',
            duration: 2
          })
        } else {
          // Update alias content but don't change alias name
          await commandStore.update({
            id: record.id,
            alias: record.alias,
            command: record.command
          })

          notification.success({
            message: t('extensions.success'),
            placement: 'topRight',
            duration: 2
          })
        }

        record.edit = false
        await handleTableChange()
        await aliasConfigRefresh()
        cloneRecordReset()
      } catch (err) {
        console.error('Error saving alias:', err)
        notification.error({
          message: t('extensions.error'),
          description: err,
          placement: 'topRight',
          duration: 3
        })
      }
      break

    case 'cancel':
      if (record.id === 'new') {
        // Remove newly added empty record
        list.value.splice(0, 1)
      } else {
        // Restore original value
        record.alias = cloneRecord.value.alias
        record.command = cloneRecord.value.command
      }
      record.edit = false
      cloneRecordReset()
      break
  }
}

// Listen to alias status change events
onMounted(() => {
  // Initial data load
  handleTableChange()
  // Use eventBus to listen
  eventBus.on('aliasStatusChanged', () => {
    // Reload data
    handleTableChange()
      .then(() => {})
      .catch((err) => {
        console.error(t('common.reloadAliasDataFailed'), err)
      })
  })
})

// Remove event listener
onBeforeUnmount(() => {
  eventBus.off('aliasStatusChanged')
})

const cloneRecordReset = () => {
  cloneRecord.value = {
    alias: '',
    command: '',
    edit: false,
    id: ''
  }
}

const handleAdd = () => {
  // Check if there's already a new record being edited
  const existingNewRecord = list.value.find((item) => item.id === 'new')
  if (existingNewRecord) {
    return // If there's already a new record being edited, don't add another
  }

  // New record ID uses special identifier 'new'
  const newRecord = {
    alias: '',
    command: '',
    edit: true,
    id: 'new'
  }

  if (list.value.length) {
    list.value = [newRecord, ...list.value]
  } else {
    list.value.push(newRecord)
  }

  // If there are other records being edited, restore their state first
  if (cloneRecord.value.edit === true && cloneRecord.value.id && cloneRecord.value.id !== 'new') {
    const index = list.value.findIndex((item) => item.alias === cloneRecord.value.alias)
    if (index !== -1) {
      list.value[index].alias = cloneRecord.value.alias
      list.value[index].command = cloneRecord.value.command
      list.value[index].edit = false
    }
  }

  cloneRecord.value = {
    alias: '',
    command: '',
    edit: true,
    id: 'new'
  }
}

// Refresh alias config - in local storage environment, mainly triggers refresh of other components using aliases
const aliasConfigRefresh = async () => {
  await aliasStore.refreshAliasesFromDB()
}
</script>

<style lang="less" scoped>
.alias-config {
  width: 100%;
  height: 100%;
}

.alias-config-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-color);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0);
  color: var(--text-color);
}

.search-input {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color) !important;
    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }

  :deep(.ant-input-suffix) {
    color: var(--text-color-tertiary) !important;
  }
}

.workspace-button {
  font-size: 14px;
  height: 30px;
  display: flex;
  align-items: center;
  background-color: #1677ff;
  border-color: #1677ff;

  &:hover {
    background-color: #398bff;
    border-color: #398bff;
  }

  &:active {
    background-color: rgb(130, 134, 155);
    border-color: rgb(130, 134, 155);
  }
}

:deep(.ant-card) {
  height: 100%;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.alias-config-table :deep(.ant-table-tbody) {
  background-color: var(--bg-color);
}

.alias-config-table :deep(.ant-table-thead > tr > th) {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  padding: 8px;
  border-radius: 0;
  border: none !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.alias-config-table :deep(.ant-table-tbody > tr:nth-child(even) > td) {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 8px;
  border: none !important;
}

.alias-config-table :deep(.ant-table-tbody > tr:nth-child(odd) > td) {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  padding: 8px;
  border: none !important;
}

.alias-config-table :deep(.ant-input) {
  background-color: transparent;
  border: none;
  box-shadow: none;
  color: var(--text-color);
}

.alias-config-table :deep(.ant-table-container table > thead > tr:first-child > *:last-child) {
  border-start-end-radius: 0 !important;
  border-end-end-radius: 0 !important;
}

.alias-config-table :deep(.ant-table-container table > thead > tr:first-child > *:first-child) {
  border-start-start-radius: 0 !important;
  border-end-start-radius: 0 !important;
}

.alias-config-table {
  .editable-input {
    background-color: var(--bg-color-secondary) !important;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .textarea-command {
    white-space: pre-wrap;
  }
}

/* 处理滚动条轨道和滑块 */
.alias-config-table .textarea-command::-webkit-scrollbar-track,
.alias-config-table .textarea-command::-webkit-scrollbar-thumb,
.alias-config-table .textarea-command :deep(.ant-input::-webkit-scrollbar-track),
.alias-config-table .textarea-command :deep(.ant-input::-webkit-scrollbar-thumb),
.alias-config-table :deep(.textarea-command .ant-input::-webkit-scrollbar-track),
.alias-config-table :deep(.textarea-command .ant-input::-webkit-scrollbar-thumb) {
  display: none !important;
  background: transparent !important;
}

.responsive-table {
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.alias-config-table:deep(.ant-table-tbody > tr:hover > td) {
  background-color: var(--hover-bg-color) !important;
}
</style>
