<template>
  <div class="asset-search-container">
    <div class="search-wrapper">
      <a-input
        v-model:value="searchValue"
        :placeholder="placeholderText"
        class="search-input"
        @input="handleSearch"
        @change="handleSearch"
      >
        <template #suffix>
          <search-outlined />
        </template>
      </a-input>

      <div
        v-if="showNewButton"
        class="new-button-wrapper"
      >
        <a-button
          type="primary"
          size="small"
          class="new-asset-button"
          @click="handleNewAsset"
        >
          <template #icon><DatabaseOutlined /></template>
          {{ buttonText }}
        </a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { SearchOutlined, DatabaseOutlined } from '@ant-design/icons-vue'
import i18n from '@/locales'

const { t } = i18n.global

// Props
interface Props {
  modelValue?: string
  placeholder?: string
  showNewButton?: boolean
  newButtonText?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  showNewButton: true,
  newButtonText: ''
})

// Computed props with i18n fallbacks
const placeholderText = computed(() => props.placeholder || t('common.search'))
const buttonText = computed(() => props.newButtonText || t('personal.newHost'))

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [value: string]
  'new-asset': []
}>()

// State
const searchValue = ref(props.modelValue)

// Watch for external changes
watch(
  () => props.modelValue,
  (newValue) => {
    searchValue.value = newValue
  }
)

// Watch for internal changes
watch(searchValue, (newValue) => {
  emit('update:modelValue', newValue)
})

// Methods
const handleSearch = () => {
  emit('search', searchValue.value)
}

const handleNewAsset = () => {
  emit('new-asset')
}
</script>

<style lang="less" scoped>
.asset-search-container {
  width: 100%;
  margin-bottom: 12px;
}

.search-wrapper {
  display: flex;
  width: 60%;
  gap: 8px;

  @media (max-width: 768px) {
    width: 100%;
  }
}

.search-input {
  flex: 1;
  background-color: var(--bg-color-secondary);
  border-color: var(--border-color);
  color: var(--text-color);

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary);
    color: var(--text-color);
    height: 20px;

    &::placeholder {
      color: var(--text-color-tertiary);
    }
  }

  :deep(.ant-input-suffix) {
    color: var(--text-color-secondary);
  }
}

.new-button-wrapper {
  flex-shrink: 0;
}

.new-asset-button {
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
</style>
