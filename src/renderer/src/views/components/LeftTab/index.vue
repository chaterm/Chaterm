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

  .bottom-menu {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .term_menu {
    // background-color: #fff;
    width: 100%;
    height: 35px;
    display: flex;
    cursor: pointer;
    flex-direction: column;

    // background-color: #fff;
    img {
      width: 26px;
      height: 26px;
      margin: 0 auto;
    }

    span {
      font-size: 10px;
      text-align: center;
      display: inline-block;
    }
  }

  .setting_menu {
    width: 100%;
    display: flex;
    cursor: pointer;
    flex-direction: column;

    img {
      width: 26px;
      height: 26px;
      margin: 0 auto;
    }

    span {
      font-size: 10px;
      text-align: center;
      display: inline-block;
    }
  }

  .user-menu {
    position: absolute;
    bottom: 80px;
    left: 50px;
    background: #2a2a2a;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;

    .menu-item {
      padding: 8px 16px;
      color: #fff;
      cursor: pointer;

      &:hover {
        background: #3a3a3a;
      }
    }
  }
}
</style>
