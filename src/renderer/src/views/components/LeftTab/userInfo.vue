<template>
  <div class="userInfo">
    <a-card
      :bordered="false"
      class="userInfo-container"
    >
      <div class="user_avatar">
        <img :src="userInfo.avatar" />
      </div>
      <div class="registration_type">
        {{ userInfo.registrationType === 1 ? $t('user.enterprise') : $t('user.personal') }}
      </div>
      <div class="divider-container">
        <a-divider style="border-color: #4a4a4a; margin-bottom: 40px" />
      </div>
      <a-form
        :label-col="{ span: 10, offset: 2 }"
        :wrapper-col="{ span: 12 }"
        class="custom-form"
      >
        <a-form-item
          label="UID"
          class="user_my-ant-form-item"
        >
          {{ userInfo.uid }}
        </a-form-item>
        <a-form-item
          :label="$t('user.name')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.name }}
        </a-form-item>
        <a-form-item
          :label="$t('user.email')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.email }}
        </a-form-item>
        <a-form-item
          :label="$t('user.mobile')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.mobile }}
        </a-form-item>
        <a-form-item
          v-if="userInfo.secondaryOrganization"
          :label="$t('user.organization')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.secondaryOrganization }}/{{ userInfo.tertiaryOrganization }}/{{
            userInfo.team
          }}
        </a-form-item>
        <a-form-item
          :label="$t('user.ip')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.localIp }}
        </a-form-item>
        <a-form-item
          :label="$t('user.macAddress')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.macAddress }}
        </a-form-item>
      </a-form>
      <p></p>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import 'xterm/css/xterm.css'
import { getUser } from '@api/user/user'
import { useDeviceStore } from '@/store/useDeviceStore'

const deviceStore = useDeviceStore()
const userInfo = ref({})
const getUserInfo = () => {
  getUser().then((res) => {
    userInfo.value = res.data
    userInfo.value.localIp = deviceStore.getDeviceIp
    userInfo.value.macAddress = deviceStore.getMacAddress
  })
}

// 初始化终端
onMounted(() => {
  getUserInfo()
})

// 销毁时清理资源
onBeforeUnmount(() => {})
</script>

<style scoped>
.userInfo {
  width: 100%;
  height: 100%;
}

.userInfo-container {
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  color: #f8f8f8;
}

:deep(.ant-card) {
  height: 100%;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 设置整个表单的字体颜色 */
.custom-form {
  color: #ffffff;
  align-content: center;
  width: 100%;
}

.custom-form :deep(.ant-form-item-label) {
  padding-right: 1px; /* 增加右侧间距 */
}

/* 设置表单标签(label)的字体颜色 */
.custom-form :deep(.ant-form-item-label > label) {
  color: #ffffff;
}

/* 设置表单输入框的字体颜色 */
.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-password input) {
  color: #ffffff;
}

/* 设置错误提示文字的颜色 */
.custom-form :deep(.ant-form-item-explain-error) {
  color: #ff4d4f;
}

/* 设置必填星号的颜色 */
.custom-form :deep(.ant-form-item-required::before) {
  color: #ff4d4f;
}

.user_my-ant-form-item {
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: rgba(0, 0, 0, 0.65);
  font-size: 30px;
  font-variant: tabular-nums;
  line-height: 1.5;
  list-style: none;
  -webkit-font-feature-settings: 'tnum';
  font-feature-settings: 'tnum';
  margin-bottom: 14px;
  margin-bottom: 14px;
  vertical-align: top;
  color: #ffffff;
  width: 100%;
}

.user_avatar {
  width: 18vmin; /* 使用视口较小边的百分比 */
  height: 18vmin; /* 保持宽高一致 */
  margin: 0 auto 20px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  flex-shrink: 0; /* 防止flex布局压缩 */
}

.user_avatar img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%); /* 确保图片绝对居中 */
}

/* 添加媒体查询应对小屏幕 */
@media (max-width: 768px) {
  .user_avatar {
    width: 20vmin;
    height: 20vmin;
  }
}

.registration_type {
  text-align: center;
  font-weight: bold;
}

.divider-container {
  width: 70%;
  margin: 0 auto;
  text-align: center; /* 确保内部元素居中 */
}
</style>
