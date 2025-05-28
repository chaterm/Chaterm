<template>
  <div class="term_left_tab">
    <div class="main-menu">
      <a-tooltip
        v-for="i in menuTabsData.slice(0, -3)"
        :key="i.key"
        :title="i.name"
        placement="right"
      >
        <p
          v-if="i.key === 'files'"
          class="term_menu"
          @click="files"
        >
          <img
            v-if="activeKey !== i.key"
            :src="i.icon"
            alt=""
          />
          <img
            v-else
            :src="i.activeIcon"
            alt=""
          />
        </p>
        <p
          v-else-if="i.key === 'keychain'"
          class="term_menu"
          @click="menuClick('keychain')"
        >
          <img
            v-if="activeKey !== i.key"
            :src="i.icon"
            alt=""
          />
          <img
            v-else
            :src="i.activeIcon"
            alt=""
          />
        </p>
        <p
          v-else
          class="term_menu"
          @click="menuClick(i.key)"
        >
          <img
            v-if="activeKey !== i.key"
            :src="i.icon"
            alt=""
          />
          <img
            v-else
            :src="i.activeIcon"
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
      >
        <div v-if="i.key === 'user'">
          <p
            class="setting_menu"
            @click="showUserMenu = !showUserMenu"
          >
            <img
              v-if="activeKey !== i.key"
              :src="i.icon"
              alt=""
            />
            <img
              v-else
              :src="i.activeIcon"
              alt=""
            />
          </p>
        </div>
        <div v-else-if="i.key === 'setting'">
          <p
            class="setting_menu"
            @click="userConfig"
          >
            <img
              v-if="activeKey !== i.key"
              :src="i.icon"
              alt=""
            />
            <img
              v-else
              :src="i.activeIcon"
              alt=""
            />
          </p>
        </div>
        <div v-else>
          <p
            class="setting_menu"
            @click="menuClick(i.key)"
          >
            <img
              v-if="activeKey !== i.key"
              :src="i.icon"
              alt=""
            />
            <img
              v-else
              :src="i.activeIcon"
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
        class="menu-item"
        @click="userInfo"
        >{{ $t('common.userInfo') }}</div
      >
      <div
        class="menu-item"
        @click="logout"
        >{{ $t('common.logout') }}</div
      >
    </div>
  </div>
</template>
<script setup lang="ts">
const emit = defineEmits(['toggle-menu', 'open-user-tab'])
import { menuTabsData } from './data'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { userLogOut } from '@/api/user/user'
import { userInfoStore } from '@/store/index'
import { pinia } from '@/main'

const userStore = userInfoStore(pinia)
const activeKey = ref('workspace')
const showUserMenu = ref<boolean>(false)
const router = useRouter()
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
const logout = () => {
  userLogOut()
    .then((res) => {
      console.log(res, 'logout')
      localStorage.removeItem('ctm-token')
      router.push('/login')
    })
    .catch((err) => {
      console.log(err, 'err')
    })

  showUserMenu.value = false
}
</script>
<style lang="less">
.term_left_tab {
  width: 100%;
  height: 100%;
  border-right: 1px solid rgb(65, 65, 65);
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: #1e1e1e;

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
      background-color: rgba(255, 255, 255, 0.1);
    }

    &:active {
      transform: scale(0.95);
    }

    img {
      width: 20px;
      height: 20px;
      transition: all 0.3s ease;
      opacity: 0.7;
    }

    &:hover img {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  .user-menu {
    position: absolute;
    bottom: 80px;
    left: 40px;
    background: #2a2a2a;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    min-width: 120px;
    border: 1px solid rgba(255, 255, 255, 0.1);

    .menu-item {
      padding: 4px 12px;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 14px;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      &:active {
        background: rgba(255, 255, 255, 0.15);
      }
    }
  }
}
</style>
