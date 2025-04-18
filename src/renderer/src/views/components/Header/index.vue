<template>
  <div class="term_tab" @mousedown="mousedown">
    <div
      class="term_tab_Info"
      :style="{ marginRight: platform.includes('darwin') ? '0px' : '140px' }"
    >
      <div class="toggle-right-btn" @click="toggleSidebarLeft('left')">
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
      <div class="toggle-right-btn" @click="toggleSidebarRight('right')">
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
import { userConfigStore } from '@/store/userConfigStore'
import { getUserTermConfig } from '@/api/user/user'
const platform = ref<string>('')
const deviceStore = useDeviceStore()
const configStore = userConfigStore()
const instance = getCurrentInstance()!
const { appContext } = instance

// declare global {
//   interface Window {
//     api: {
//       invokeCustomAdsorption: (data: { appX: number; appY: number }) => void;
//       getLocalIP: () => Promise<string>;
//       getMacAddress: () => Promise<string>;
//     }
//   }
// }

const isKeyDown = ref(false)
const dinatesX = ref(0)
const dinatesY = ref(0)

const mousedown = (e: MouseEvent) => {
  isKeyDown.value = true
  dinatesX.value = e.x
  dinatesY.value = e.y
  document.onmousemove = (ev) => {
    if (isKeyDown.value) {
      const x = ev.screenX - dinatesX.value
      const y = ev.screenY - dinatesY.value
      const data = {
        appX: x,
        appY: y
      }
      window.api.invokeCustomAdsorption(data)
    }
  }
  document.onmouseup = () => {
    isKeyDown.value = false
  }
}

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
  platform.value = await window.api.getPlatform()
  try {
    const localIP = await window.api.getLocalIP()
    deviceStore.setDeviceIp(localIP)
  } catch (error) {
    console.error('获取IP失败:', error)
  }
  try {
    const macAddress = await window.api.getMacAddress()
    deviceStore.setMacAddress(macAddress)
  } catch (error) {
    console.error('获取MacAddress失败:', error)
  }
  getUserTermConfig({}).then((res) => {
    configStore.setUserConfig(res.data)
    appContext.config.globalProperties.$i18n.locale = configStore.getUserConfig.language
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
  border-bottom: 1px solid rgb(65, 65, 65);

  justify-content: space-between;

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
  // margin-right: 140px;
  width: 100%;
  display: flex;
  align-items: center;
  position: relative;
  justify-content: flex-end;

  .ip-display {
    color: #4caf50;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    margin-right: 18px;
  }

  .logout {
    color: #fff;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    cursor: pointer;
    line-height: 34px;
    margin: 0;
    margin-right: 18px;
  }

  .sidebar-toggle-icon {
    width: 20px;
    height: 20px;
    display: block;
    margin-right: 18px;
  }
  .sidebar-toggle-icon_mac {
    width: 20px;
    height: 20px;
    display: block;
    margin-right: 8px;
  }

  // .toggle-right-btn {
  //   position: absolute;
  //   right: 70px;
  //   top: 10px;
  //   width: 20px;
  //   height: 20px;
  //   background: #252525;
  //   border: 1px solid #404040;
  //   border-left: none;
  //   color: #4caf50;
  //   display: flex;
  //   align-items: center;
  //   justify-content: center;
  //   cursor: pointer;
  //   border-radius: 0 4px 4px 0;
  //   transition: background 0.2s;
  // }
}
</style>
