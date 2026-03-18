<template>
  <div class="asset-edit-panel">
    <div class="panel-header">
      <h3 class="panel-title">
        {{ isEdit ? t('common.edit') : t('personal.addAsset') }}
      </h3>
      <CloseOutlined
        class="panel-close-icon"
        @click="handleCancel"
      />
    </div>

    <div class="panel-body">
      <a-form
        ref="formRef"
        :model="formState"
        :rules="formRules"
        layout="vertical"
        class="asset-edit-form"
      >
        <a-form-item
          :label="t('personal.hostname')"
          name="hostname"
        >
          <a-input
            v-model:value="formState.hostname"
            :disabled="isCommentOnlyMode"
            allow-clear
          />
        </a-form-item>

        <a-form-item
          :label="t('personal.hostIp')"
          name="host"
        >
          <a-input
            v-model:value="formState.host"
            :disabled="isCommentOnlyMode"
            allow-clear
          />
        </a-form-item>

        <a-form-item
          :label="t('personal.comment')"
          name="comment"
        >
          <a-input
            v-model:value="formState.comment"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </div>

    <div class="panel-footer">
      <a-button @click="handleCancel">
        {{ t('common.cancel') }}
      </a-button>
      <a-button
        type="primary"
        @click="handleSave"
      >
        {{ t('common.save') }}
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import i18n from '@/locales'

const { t } = i18n.global

interface Props {
  isEdit: boolean
  commentOnly?: boolean
  editData?: {
    uuid?: string
    hostname?: string
    host?: string
    comment?: string
  } | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  cancel: []
  save: [data: { hostname: string; host: string; comment: string; uuid?: string }]
}>()

const formRef = ref<FormInstance>()

const formState = reactive({
  hostname: '',
  host: '',
  comment: ''
})

const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/

const isCommentOnlyMode = computed(() => props.isEdit && !!props.commentOnly)

const formRules = computed(() => {
  if (isCommentOnlyMode.value) {
    return {}
  }
  return {
    hostname: [{ required: true, message: t('personal.hostname'), trigger: 'blur' }],
    host: [
      { required: true, message: t('personal.hostIp'), trigger: 'blur' },
      { pattern: ipPattern, message: 'Invalid IP or hostname format', trigger: 'blur' }
    ]
  }
})

const syncFormFromProps = () => {
  if (props.isEdit && props.editData) {
    formState.hostname = props.editData.hostname || ''
    formState.host = props.editData.host || ''
    formState.comment = props.editData.comment || ''
    return
  }
  formState.hostname = ''
  formState.host = ''
  formState.comment = ''
}

watch(
  () => [props.isEdit, props.editData],
  () => {
    syncFormFromProps()
  },
  { immediate: true, deep: true }
)

const handleSave = async () => {
  try {
    await formRef.value?.validate()
    emit('save', {
      hostname: formState.hostname.trim(),
      host: formState.host.trim(),
      comment: formState.comment.trim(),
      uuid: props.editData?.uuid
    })
  } catch {
    // validation failed
  }
}

const handleCancel = () => {
  formRef.value?.resetFields()
  emit('cancel')
}
</script>

<style lang="less" scoped>
.asset-edit-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  line-height: 1;
  font-weight: 600;
  color: var(--text-color);
}

.panel-close-icon {
  font-size: 18px;
  color: var(--text-color-tertiary);
  cursor: pointer;
  transition: color 0.2s ease;
}

.panel-close-icon:hover {
  color: var(--text-color);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.asset-edit-form {
  padding-top: 4px;
}

:deep(.asset-edit-form .ant-form-item) {
  margin-bottom: 14px;
}

:deep(.asset-edit-form .ant-form-item-label > label) {
  justify-content: flex-start;
  color: var(--text-color) !important;
}

:deep(.asset-edit-form .ant-input),
:deep(.asset-edit-form .ant-input-affix-wrapper) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

:deep(.asset-edit-form .ant-input-affix-wrapper input) {
  color: var(--text-color) !important;
  -webkit-text-fill-color: var(--text-color) !important;
}

:deep(.asset-edit-form .ant-input::placeholder),
:deep(.asset-edit-form .ant-input-affix-wrapper input::placeholder) {
  color: var(--text-color-tertiary) !important;
}

:deep(.asset-edit-form .ant-input:hover),
:deep(.asset-edit-form .ant-input:focus),
:deep(.asset-edit-form .ant-input-affix-wrapper:hover),
:deep(.asset-edit-form .ant-input-affix-wrapper-focused) {
  border-color: var(--primary-color, #1677ff) !important;
  box-shadow: none !important;
}

:deep(.asset-edit-form .ant-input-affix-wrapper .ant-input-clear-icon) {
  color: var(--text-color-tertiary) !important;
}

:deep(.asset-edit-form .ant-input[disabled]),
:deep(.asset-edit-form .ant-input-affix-wrapper-disabled),
:deep(.asset-edit-form .ant-input-affix-wrapper-disabled input),
:deep(.asset-edit-form .ant-input-affix-wrapper input[disabled]) {
  background-color: var(--bg-color-tertiary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-secondary) !important;
  -webkit-text-fill-color: var(--text-color-secondary) !important;
  opacity: 1 !important;
}

:deep(.panel-footer .ant-btn-default) {
  background-color: var(--bg-color-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color) !important;
}

:deep(.panel-footer .ant-btn-default:hover),
:deep(.panel-footer .ant-btn-default:focus) {
  border-color: var(--primary-color, #1677ff) !important;
  color: var(--primary-color, #1677ff) !important;
}
</style>
