<template>
  <div class="term_tab">
    <div
      class="term_tab_Info"
      :style="{ marginRight: platform.includes('darwin') ? '0px' : '140px' }"
    >
      <div
        class="toggle-right-btn"
        @click="toggleSidebarLeft('left')"
      >
        <img
          v-if="isLeftSidebarCollapsed"
          src="@/assets/menu/left_bar_open.svg"
          alt=""
          :class="platform.includes('darwin') ? 'sidebar-toggle-icon_mac' : 'sidebar-toggle-icon'"
        />
        <img
          v-else
          src="@/assets/menu/left_bar_close.svg"
          alt=""
          :class="platform.includes('darwin') ? 'sidebar-toggle-icon_mac' : 'sidebar-toggle-icon'"
        />
      </div>
      <div
        class="toggle-right-btn"
        @click="toggleSidebarRight('right')"
      >
        <img
          v-if="isRightSidebarCollapsed"
          src="@/assets/menu/right_bar_open.svg"
          alt=""
          :class="platform.includes('darwin') ? 'sidebar-toggle-icon_mac' : 'sidebar-toggle-icon'"
        />
        <img
          v-else
          src="@/assets/menu/right_bar_close.svg"
          alt=""
          :class="platform.includes('darwin') ? 'sidebar-toggle-icon_mac' : 'sidebar-toggle-icon'"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, defineEmits, getCurrentInstance } from 'vue'
import { useDeviceStore } from '@/store/useDeviceStore'
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'

const platform = ref<string>('')
const deviceStore = useDeviceStore()
const instance = getCurrentInstance()!
const { appContext } = instance

const isLeftSidebarCollapsed = ref(true)
const isRightSidebarCollapsed = ref(false)

const emit = defineEmits(['toggle-sidebar'])
const toggleSidebarRight = (params) => {
  emit('toggle-sidebar', params)
  isRightSidebarCollapsed.value = !isRightSidebarCollapsed.value
}

const toggleSidebarLeft = (params: 'left' | 'right') => {
  emit('toggle-sidebar', params)
  isLeftSidebarCollapsed.value = !isLeftSidebarCollapsed.value
}
const switchIcon = (dir, value) => {
  dir == 'left' ? (isLeftSidebarCollapsed.value = value) : ''
  dir == 'right' ? (isRightSidebarCollapsed.value = value) : ''
}
defineExpose({
  switchIcon
})

onMounted(async () => {
  const api = window.api as any
  platform.value = await api.getPlatform()
  try {
    const localIP = await api.getLocalIP()
    deviceStore.setDeviceIp(localIP)
  } catch (error) {
    console.error('获取IP失败:', error)
  }
  try {
    const macAddress = await api.getMacAddress()
    deviceStore.setMacAddress(macAddress)
  } catch (error) {
    console.error('获取MacAddress失败:', error)
  }
  const userConfig = await userConfigStore.getConfig()
  console.log('[onMounted]', userConfig)
  appContext.config.globalProperties.$i18n.locale = userConfig.language
  eventBus.on('updateRightIcon', (value: boolean) => {
    isRightSidebarCollapsed.value = value
  })
})
</script>
<style lang="less">
.term_tab {
  height: 28px;
  width: 100%;
  display: flex;
  align-items: center;
  /* 垂直居中 */
  border-bottom: 1px solid var(--border-color);

  justify-content: space-between;
  -webkit-app-region: drag;
  .term_logo_content {
    width: 18px;
    height: 18px;
    margin-left: 8px;

    .term_logo {
      width: 100%;
      height: 100%;
    }
  }
}

.term_tab_Info {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  position: relative;
  justify-content: flex-end;

  .toggle-right-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
    border-radius: 4px;
    margin-right: 4px;
    -webkit-app-region: no-drag;
    &:hover {
      background: var(--hover-bg-color);
    }

    &:active {
      background: var(--active-bg-color);
    }
  }

  .sidebar-toggle-icon,
  .sidebar-toggle-icon_mac {
    width: 16px;
    height: 16px;
    display: block;
    opacity: 0.45;
    transition: opacity 0.2s ease;
    filter: var(--icon-filter);
  }

  .toggle-right-btn:hover {
    .sidebar-toggle-icon,
    .sidebar-toggle-icon_mac {
      opacity: 0.6;
    }
  }

  .ip-display {
    color: #4caf50;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    margin-right: 18px;
  }

  .logout {
    color: var(--text-color);
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    cursor: pointer;
    line-height: 34px;
    margin: 0;
    margin-right: 18px;
  }
}
</style>
