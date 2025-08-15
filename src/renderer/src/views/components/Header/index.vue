<template>
  <div class="term_tab">
    <div
      class="term_tab_Info"
      :style="{ marginRight: platform.includes('darwin') ? '0px' : '140px' }"
    >
      <div
        v-if="isAvailable"
        class="update-badge"
        @click="toInstall"
      >
        <div class="update-icon">
          <ArrowDownOutlined />
        </div>
        <span class="update-text">{{ t('update.clickUpdate') }}</span>
        <div class="update-arrow">
          <RightOutlined />
        </div>
      </div>
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
import { useI18n } from 'vue-i18n'
import { ArrowDownOutlined, RightOutlined } from '@ant-design/icons-vue'
import { useDeviceStore } from '@/store/useDeviceStore'
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'
const api = window.api as any
const { t } = useI18n()

const platform = ref<string>('')
const deviceStore = useDeviceStore()
const instance = getCurrentInstance()!
const { appContext } = instance

const isLeftSidebarCollapsed = ref(true)
const isRightSidebarCollapsed = ref(false)
const isAvailable = ref(false)
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
const checkVersion = async () => {
  const info = await api.checkUpdate()
  if (info?.isUpdateAvailable) {
    api.download()
    api.autoUpdate((params) => {
      if (params.status == 4) {
        isAvailable.value = true
      }
    })
  }
}

const toInstall = () => {
  api.quitAndInstall()
}

defineExpose({
  switchIcon
})

onMounted(async () => {
  platform.value = await api.getPlatform()
  try {
    const localIP = await api.getLocalIP()
    deviceStore.setDeviceIp(localIP)
  } catch (error) {
    console.error('Failed to obtain IP address:', error)
  }
  try {
    const macAddress = await api.getMacAddress()
    deviceStore.setMacAddress(macAddress)
  } catch (error) {
    console.error('Failed to obtain the MAC Address:', error)
  }
  const userConfig = await userConfigStore.getConfig()
  console.log('[onMounted]', userConfig)
  appContext.config.globalProperties.$i18n.locale = userConfig.language
  eventBus.on('updateRightIcon', (value: boolean) => {
    isRightSidebarCollapsed.value = value
  })
  checkVersion()
})
</script>
<style lang="less">
.term_tab {
  height: 28px;
  width: 100%;
  display: flex;
  align-items: center;
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

  .update-badge {
    -webkit-app-region: no-drag;
    margin-right: 20px;
    padding: 2px 5px;
    background: var(--hover-bg-color);
    border-radius: 9px;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-color);
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;

    .update-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      border: 2px solid #1890ff;
      font-size: 7px;
      flex-shrink: 0;
    }

    .update-text {
      font-size: 11px;
      white-space: nowrap;
    }

    .update-arrow {
      display: flex;
      align-items: center;
      color: #999999;
      font-size: 10px;
    }
  }
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
