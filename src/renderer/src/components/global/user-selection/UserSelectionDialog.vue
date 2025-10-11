<template>
  <a-modal
    v-model:visible="showUserSelectionDialog"
    :title="$t('userSelection.title')"
    width="520px"
    :mask-closable="false"
    :keyboard="false"
    :closable="false"
    :footer="null"
    class="user-selection-modal"
  >
    <div class="user-selection-content">
      <div class="table-section">
        <a-table
          :columns="columns"
          :data-source="userList"
          :row-key="(record) => record.id"
          :pagination="false"
          :row-selection="{
            type: 'radio',
            selectedRowKeys: selectedUserId !== null ? [selectedUserId] : [],
            onChange: handleSelectionChange,
            columnWidth: 48
          }"
          :custom-row="customRow"
          :scroll="{ y: 240 }"
          size="small"
          class="user-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'id'">
              <span class="user-id">{{ record.id }}</span>
            </template>
            <template v-else-if="column.key === 'name'">
              <span class="user-name">{{ record.name }}</span>
            </template>
            <template v-else-if="column.key === 'username'">
              <span class="user-username">{{ record.username }}</span>
            </template>
          </template>
        </a-table>
      </div>

      <div class="footer-section">
        <div class="timer-section">
          <span class="timer-text"> {{ $t('userSelection.remainingTime') }}: {{ Math.ceil(userSelectionTimeRemaining / 1000) }}s </span>
        </div>

        <div class="action-section">
          <a-button
            class="action-btn cancel-btn"
            @click="cancelUserSelection"
          >
            {{ $t('userSelection.cancel') }}
          </a-button>
          <a-button
            type="primary"
            class="action-btn confirm-btn"
            :loading="isSubmitting"
            :disabled="selectedUserId === null"
            @click="submitUserSelection"
          >
            {{ $t('userSelection.confirm') }}
          </a-button>
        </div>
      </div>

      <div
        v-if="userSelectionError"
        class="error-section"
      >
        <span class="error-text">{{ $t('userSelection.pleaseSelectUser') }}</span>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  showUserSelectionDialog,
  userSelectionError,
  userList,
  selectedUserId,
  userSelectionTimeRemaining,
  isSubmitting,
  handleUserSelect,
  submitUserSelection,
  cancelUserSelection
} from './userSelectionState'

const { t } = useI18n()

// Table columns definition
const columns = computed(() => [
  {
    title: t('userSelection.tableHeaders.id'),
    dataIndex: 'id',
    key: 'id',
    width: 70,
    align: 'center' as const
  },
  {
    title: t('userSelection.tableHeaders.name'),
    dataIndex: 'name',
    key: 'name',
    ellipsis: true
  },
  {
    title: t('userSelection.tableHeaders.username'),
    dataIndex: 'username',
    key: 'username',
    ellipsis: true
  }
])

// Handle row selection change
const handleSelectionChange = (selectedRowKeys: any[]) => {
  if (selectedRowKeys.length > 0) {
    handleUserSelect(selectedRowKeys[0])
  }
}

// Custom row props for click selection
const customRow = (record: any) => {
  return {
    onClick: () => {
      handleUserSelect(record.id)
    },
    style: {
      cursor: 'pointer'
    }
  }
}

// Handle keyboard events (Enter key to submit)
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && selectedUserId.value !== null && !isSubmitting.value) {
    event.preventDefault()
    submitUserSelection()
  }
}

// Add/remove keyboard event listener when dialog visibility changes
watch(showUserSelectionDialog, (visible) => {
  if (visible) {
    document.addEventListener('keydown', handleKeyDown)
  } else {
    document.removeEventListener('keydown', handleKeyDown)
  }
})

// Cleanup on component unmount
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.user-selection-content {
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 16px;
}

.table-section {
  width: 100%;
}

.user-id {
  font-weight: 500;
  color: var(--text-color);
}

.user-name {
  color: var(--text-color);
}

.user-username {
  color: var(--text-color-secondary);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

.footer-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timer-section {
  display: flex;
  justify-content: center;
}

.timer-text {
  color: var(--text-color-secondary-light);
  font-size: 12px;
}

.action-section {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 0 8px;
}

.action-btn {
  flex: 1;
  max-width: 120px;
  min-width: 100px;
  height: 36px;
  font-size: 14px;
  font-weight: 500;
}

.error-section {
  display: flex;
  justify-content: center;
  min-height: 18px;
  margin-top: -8px;
}

.error-text {
  color: var(--color-error, #ff4d4f);
  font-size: 12px;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .user-selection-content {
    gap: 14px;
  }

  .timer-text {
    font-size: 11px;
  }
}
</style>

<style>
/* Global styles for AntD modal theming */
.user-selection-modal .ant-modal-content {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  border: 1px solid var(--border-color-light) !important;
}

.user-selection-modal .ant-modal-header {
  background-color: var(--bg-color-secondary) !important;
  border-bottom: 1px solid var(--border-color-light) !important;
  padding: 6px 6px;
}

.user-selection-modal .ant-modal-title {
  color: var(--text-color) !important;
  font-size: 15px;
  font-weight: 500;
}

.user-selection-modal .ant-modal-body {
  background-color: var(--bg-color-secondary) !important;
  padding: 8px;
}

/* Table theming */
.user-selection-modal .user-table.ant-table-wrapper .ant-table {
  background-color: transparent;
}

.user-selection-modal .user-table .ant-table-thead > tr > th {
  background-color: var(--bg-color-tertiary, #fafafa) !important;
  color: var(--text-color) !important;
  border-bottom: 1px solid var(--border-color-light) !important;
  font-weight: 500;
  font-size: 13px;
  padding: 10px 12px;
}

.user-selection-modal .user-table .ant-table-tbody > tr > td {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  border-bottom: 1px solid var(--border-color-light) !important;
  padding: 10px 12px;
  font-size: 13px;
}

.user-selection-modal .user-table .ant-table-tbody > tr:hover > td {
  background-color: var(--bg-color-hover, rgba(0, 0, 0, 0.04)) !important;
}

.user-selection-modal .user-table .ant-table-tbody > tr.ant-table-row-selected > td {
  background-color: var(--bg-color-active, rgba(24, 144, 255, 0.08)) !important;
}

.user-selection-modal .user-table .ant-table-tbody > tr.ant-table-row-selected:hover > td {
  background-color: var(--bg-color-active-hover, rgba(24, 144, 255, 0.12)) !important;
}

.user-selection-modal .user-table .ant-radio-wrapper {
  color: var(--text-color) !important;
}

.user-selection-modal .user-table .ant-radio-inner {
  border-color: var(--border-color, #d9d9d9) !important;
  background-color: var(--bg-color-secondary) !important;
}

.user-selection-modal .user-table .ant-radio-checked .ant-radio-inner {
  border-color: var(--color-primary, #1890ff) !important;
}

.user-selection-modal .user-table .ant-radio-inner::after {
  background-color: var(--color-primary, #1890ff) !important;
}

/* Button theming */
.user-selection-modal .ant-btn {
  border-radius: 6px;
  transition: all 0.3s ease;
}

.user-selection-modal .ant-btn-default {
  background-color: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: rgba(0, 0, 0, 0.88) !important;
}

.user-selection-modal .ant-btn-default:hover {
  background-color: rgba(0, 0, 0, 0.06) !important;
  border-color: var(--color-primary, #1890ff) !important;
  color: var(--color-primary, #1890ff) !important;
}

/* Dark theme support for cancel button */
.theme-dark .user-selection-modal .ant-btn-default {
  background-color: #4a4a4a !important;
  border-color: #6a6a6a !important;
  color: #f0f0f0 !important;
  font-weight: 500 !important;
}

.theme-dark .user-selection-modal .ant-btn-default:hover {
  background-color: #5a5a5a !important;
  border-color: var(--color-primary, #40a9ff) !important;
  color: var(--color-primary, #69c0ff) !important;
}

.user-selection-modal .ant-btn-primary {
  background-color: var(--color-primary, #1890ff) !important;
  border-color: var(--color-primary, #1890ff) !important;
}

.user-selection-modal .ant-btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

/* Hide scrollbar completely */
.user-selection-modal .user-table .ant-table-body {
  overflow-y: auto !important;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.user-selection-modal .user-table .ant-table-body::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}
</style>
