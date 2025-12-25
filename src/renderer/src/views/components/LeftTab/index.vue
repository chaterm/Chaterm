<template>
  <div class="term_left_tab">
    <div class="main-menu">
      <a-tooltip
        v-for="i in menuTabsData.slice(0, -3)"
        :key="i.key"
        :title="i.name"
        placement="right"
        :mouse-enter-delay="3"
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
          v-else-if="i.key === 'keychain'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="keychainConfigClick"
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
            :src="snippetsIcon"
            alt=""
          />
        </p>
        <p
          v-else-if="i.key === 'kubernetes'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
        >
          <img
            :src="i.icon"
            alt=""
          />
        </p>
        <p
          v-else-if="i.key === 'doc'"
          class="term_menu"
          :class="{ active: activeKey === i.key }"
          @click="openDocumentation"
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
    </div>
    <div class="bottom-menu">
      <a-tooltip
        v-for="i in menuTabsData.slice(-3)"
        :key="i.key"
        :title="i.name"
        :mouse-enter-delay="3"
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
const snippetsIcon = new URL('@/assets/menu/snippet.svg', import.meta.url).href
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
import { getDocsBaseUrl } from '@/utils/edition'

let storageEventHandler: ((e: StorageEvent) => void) | null = null

const keychainConfigClick = () => {
  emit('open-user-tab', 'keyChainConfig')
}

const openDocumentation = () => {
  const baseUrl = getDocsBaseUrl()
  window.open(`${baseUrl}/`, '_blank')
}
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

  if (key === 'keychain') {
    emit('open-user-tab', 'keyChainConfig')
  }

  emit('toggle-menu', {
    menu: activeKey.value,
    type,
    beforeActive
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
onMounted(() => {
  eventBus.on('openAiRight', openAiRight)
  eventBus.on('openUserTab', (tab) => {
    emit('open-user-tab', tab)
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
