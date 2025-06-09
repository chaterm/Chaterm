<template>
  <div class="extension_list">
    <p style="display: inline-block; font-size: 14px">{{ $t('extensions.extensions') }}</p>
    <div style="width: 100%; margin-top: 10px">
      <a-input
        v-model:value="searchValue"
        class="transparent-Input"
        :placeholder="$t('extensions.fuzzySearch')"
        style="width: 100%"
        allow-clear
      >
        <template #suffix>
          <search-outlined />
        </template>
      </a-input>
      <a-menu
        v-model:selected-keys="selectedKeys"
        v-model:open-keys="openKeys"
        class="menu_list"
        mode="inline"
        theme="dark"
        @select="handleSelect"
      >
        <template
          v-for="item in filteredList"
          :key="item.tabName"
        >
          <a-menu-item :title="item.name">
            <template #icon>
              <img
                :src="getIconSrc(item.icon)"
                alt=""
              />
            </template>
            <div class="menu_list_item_name">
              {{ item.name }}
            </div>
            <div class="menu_list_item_description">
              {{ item.description }}
            </div>
          </a-menu-item>
        </template>
      </a-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue'
import { computed, ref, watch, onMounted } from 'vue'
import i18n from '@/locales'
import iconAlias from '@/assets/img/alias.svg'
import { userConfigStore } from '@/services/userConfigStoreService'
import { defineExpose } from 'vue'

const emit = defineEmits(['open-user-tab'])
const searchValue = ref('')
const userConfig = ref({
  aliasStatus: 2
})

const iconMap = {
  'alias.svg': iconAlias
}

const { t } = i18n.global

const handleSelect = (item) => {
  emit('open-user-tab', item.key)
}

const getIconSrc = (iconName) => {
  return iconMap[iconName] || ''
}

const selectedKeys = ref([])
const openKeys = ref([])

const handleExplorerActive = (tabId) => {
  const index = selectedKeys.value.findIndex((item) => item === tabId)
  if (index !== -1) {
    selectedKeys.value.splice(index, 1)
  }
}

defineExpose({
  handleExplorerActive
})

// 加载配置
const loadConfig = async () => {
  try {
    const config = await userConfigStore.getConfig()
    if (config) {
      userConfig.value = config
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }
}

// 监听配置变化
watch(
  () => userConfig.value.aliasStatus,
  () => {
    // 当 aliasStatus 变化时，重新加载配置
    loadConfig()
  }
)

// 初始加载配置
onMounted(() => {
  loadConfig()
})

const list = computed(() => {
  return [
    {
      name: 'Alias',
      description: t('extensions.aliasDescription'),
      icon: 'alias.svg',
      tabName: 'aliasConfig',
      show: userConfig.value.aliasStatus === 1
    }
  ]
})

const filteredList = computed(() => {
  if (!searchValue.value) {
    return list.value.filter((item) => item.show)
  }
  const query = searchValue.value.toLowerCase().trim()
  return list.value.filter((item) => item.name.toLowerCase().includes(query) && item.show)
})
</script>

<style lang="less" scoped>
.extension_list {
  padding: 10px;
}

/* 鼠标悬停时变色 */
.menu_list {
  background: #1a1a1a;

  .menu_list_item_name {
    line-height: 24px;
    font-weight: bold;
    font-size: 14px;
  }

  .menu_list_item_description {
    line-height: 24px;
    font-size: 14px;
  }

  :deep(.ant-menu-item-selected) {
    border-radius: 0;
    border: 1px solid #398bff;
    background-color: transparent;
  }

  :deep(.ant-menu-item) {
    height: 60px;
  }

  :deep(.ant-menu-item-icon) {
    align-self: center; /* 独立控制头像容器对齐 */
    flex: 0 0 auto; /* 禁止伸缩，保持原始宽度 */
    min-width: 28px; /* 设置最小宽度 */
    max-width: 32px; /* 设置最小宽度 */
  }
}
.transparent-Input {
  background-color: transparent;
  color: rgba(255, 255, 255, 1);
  :deep(.ant-input) {
    background-color: transparent;
    color: rgba(255, 255, 255, 1);
    &::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }
  }
}
</style>
