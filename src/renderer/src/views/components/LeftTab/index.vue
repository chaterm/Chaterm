<template>
  <div class="term_left_tab">
    <div class="main-menu">
      <a-tooltip
        v-for="i in menuTabsData.slice(0, -2)"
        :key="i.key"
        :title="i.name"
        placement="right"
        :mouse-enter-delay="1"
      >
        <p
          v-if="i.key === 'files'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="files"
        >
          <img
            :src="i.icon"
            alt=""
          />
        </p>
        <p
          v-else-if="i.key === 'assets'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="menuClick(i.key)"
        >
          <img
            :src="i.icon"
            alt=""
          />
        </p>
        <p
          v-else-if="i.key === 'snippets'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="menuClick(i.key)"
        >
          <img
            :src="i.icon"
            alt=""
          />
        </p>
        <p
          v-else-if="i.key === 'kubernetes'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="kubernetes"
        >
          <img
            :src="i.icon"
            alt=""
          />
        </p>
        <p
          v-else
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="menuClick(i.key)"
        >
          <img
            :src="i.icon"
            alt=""
          />
        </p>
      </a-tooltip>

      <a-tooltip
        v-for="view in pluginViews"
        :key="view.id"
        :title="view.name"
        placement="right"
        :mouse-enter-delay="1"
      >
        <p
          class="term_menu"
          :class="{ active: activeKey === view.id }"
          @click="pluginMenuClick(view.id)"
        >
          <img
            v-if="view.icon.includes('/')"
            :src="view.icon"
            alt=""
          />
          <i
            v-else
            :class="view.icon"
            class="plugin-icon"
          ></i>
        </p>
      </a-tooltip>
    </div>

    <div class="bottom-menu">
      <a-tooltip
        v-for="i in menuTabsData.slice(-2)"
        :key="i.key"
        :title="i.name"
        :mouse-enter-delay="1"
      >
        <div v-if="i.key === 'user'">
          <p
            class="setting_menu"
            :class="{ active: activeKey === i.key }"
            @click="showUserMenu = !showUserMenu"
          >
            <img
              :src="i.icon"
              alt=""
            />
          </p>
        </div>
        <div v-else-if="i.key === 'setting'">
          <p
            class="setting_menu"
            :class="{ active: activeKey === i.key }"
            @click="userConfig"
          >
            <img
              :src="i.icon"
              alt=""
            />
          </p>
        </div>
        <div v-else>
          <p
            class="setting_menu"
            :class="{ active: activeKey === i.key }"
            @click="menuClick(i.key)"
          >
            <img
              :src="i.icon"
              alt=""
            />
          </p>
        </div>
      </a-tooltip>
    </div>

    <div
      v-if="showUserMenu"
      class="user-menu"
    >
      <div
        v-if="isSkippedLogin"
        class="menu-item"
        @click="goToLogin"
        >{{ $t('common.login') }}</div
      >
      <div
        v-if="!isSkippedLogin"
        class="menu-item"
        @click="userInfo"
        >{{ $t('common.userInfo') }}</div
      >
      <div
        v-if="!isSkippedLogin"
        class="menu-item"
        @click="logout"
        >{{ $t('common.logout') }}</div
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { removeToken } from '@/utils/permission'
const emit = defineEmits(['toggle-menu', 'open-user-tab'])
import { menuTabsData } from './constants/data'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { userLogOut } from '@/api/user/user'
import { userInfoStore } from '@/store/index'
import { pinia } from '@/main'
import eventBus from '@/utils/eventBus'
import { shortcutService } from '@/services/shortcutService'
import { dataSyncService } from '@/services/dataSyncService'
let storageEventHandler: ((e: StorageEvent) => void) | null = null
const pluginViews = ref<any[]>([])
const userStore = userInfoStore(pinia)
const activeKey = ref('workspace')
const showUserMenu = ref<boolean>(false)
const isSkippedLogin = ref<boolean>(localStorage.getItem('login-skipped') === 'true')
const router = useRouter()

const goToLogin = () => {
  showUserMenu.value = false
  router.push('/login')
}

const menuClick = (key) => {
  let type = ''
  let beforeActive = ''
  if (activeKey.value == key) {
    type = 'same'
    if (key == 'ai') {
      beforeActive = userStore.stashMenu
    }
  } else {
    beforeActive = activeKey.value
    type = 'dif'
    userStore.updateStashMenu(activeKey.value)
    activeKey.value = key
  }

  emit('toggle-menu', {
    menu: activeKey.value,
    type,
    beforeActive,
    isPlugin: false
  })
}

const pluginMenuClick = (viewId: string) => {
  let type = ''
  let beforeActive = activeKey.value

  if (activeKey.value === viewId) {
    type = 'same'
  } else {
    type = 'dif'
    userStore.updateStashMenu(activeKey.value)
    activeKey.value = viewId
  }

  emit('toggle-menu', {
    menu: viewId,
    type,
    beforeActive,
    isPlugin: true
  })
}
const openAiRight = () => {
  let type = ''
  let beforeActive = ''
  if (activeKey.value == 'ai') {
    type = 'same'
    beforeActive = userStore.stashMenu
  } else {
    beforeActive = activeKey.value
    type = 'dif'
    userStore.updateStashMenu(activeKey.value)
    activeKey.value = 'ai'
  }

  emit('toggle-menu', {
    menu: 'openAiRight',
    type,
    beforeActive
  })
}
const userInfo = () => {
  emit('open-user-tab', 'userInfo')
  showUserMenu.value = false
}

const userConfig = () => {
  emit('open-user-tab', 'userConfig')
  showUserMenu.value = false
}

const files = () => {
  emit('open-user-tab', 'files')
  showUserMenu.value = false
}

const kubernetes = () => {
  // K8s feature is under development, no action on click
}
const logout = async () => {
  const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
  try {
    if (dataSyncService.getInitializationStatus()) {
      console.log('Data sync is enabled during logout, stopping...')
      await dataSyncService.disableDataSync()
      dataSyncService.reset()
      console.log('Data sync has been stopped')
    }
  } catch (error) {
    console.error('Failed to stop data sync during logout:', error)
  }

  if (isSkippedLogin) {
    localStorage.removeItem('login-skipped')
    removeToken()
    shortcutService.init()
    router.push('/login')
    showUserMenu.value = false
    return
  }

  userLogOut()
    .then((res) => {
      console.log(res, 'logout')
      removeToken()
      shortcutService.init()
      router.push('/login')
    })
    .catch((err) => {
      console.log(err, 'err')
      removeToken()
      shortcutService.init()
      router.push('/login')
    })

  showUserMenu.value = false
}
const api = (window as any).api

const refreshPluginViews = async () => {
  const views = await api.getPluginViews()
  pluginViews.value = views
}

onMounted(async () => {
  eventBus.on('openAiRight', openAiRight)
  eventBus.on('openUserTab', (tab) => {
    emit('open-user-tab', tab)
  })
  try {
    const views = await api.getPluginViews()
    pluginViews.value = views
  } catch (e) {
    console.error('Get View Error', e)
  }
  api.onPluginMetadataChanged(async () => {
    await refreshPluginViews()
  })
  storageEventHandler = (e: StorageEvent) => {
    if (e.key === 'login-skipped') {
      isSkippedLogin.value = e.newValue === 'true'
    }
  }
  window.addEventListener('storage', storageEventHandler)
})

onUnmounted(() => {
  eventBus.off('openAiRight')
  eventBus.off('openUserTab')
  if (storageEventHandler) {
    window.removeEventListener('storage', storageEventHandler)
    storageEventHandler = null
  }
})
</script>
<style lang="less">
.term_left_tab {
  width: 100%;
  height: 100%;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: var(--bg-color-secondary);

  .main-menu,
  .bottom-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 4px;
  }

  .term_menu,
  .setting_menu {
    width: 100%;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.3s ease;

    &:hover {
      background-color: var(--hover-bg-color);
    }

    &:active {
      transform: scale(0.95);
    }

    img {
      width: 20px;
      height: 20px;
      transition: all 0.3s ease;
      opacity: 0.45;
      filter: var(--icon-filter);
    }

    &:hover img,
    &.active img {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  .user-menu {
    position: absolute;
    bottom: 120px;
    left: 40px;
    background: var(--bg-color-secondary);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    min-width: 120px;
    border: 1px solid var(--border-color);

    .menu-item {
      padding: 4px 12px;
      color: var(--text-color);
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 14px;

      &:hover {
        background: var(--hover-bg-color);
      }

      &:active {
        background: var(--active-bg-color);
      }
    }
  }
}
</style>
