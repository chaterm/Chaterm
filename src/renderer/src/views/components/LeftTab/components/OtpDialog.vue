<template>
  <!-- 二次验证弹窗 -->
  <a-modal
    v-model:visible="showOtpDialog"
    title="二次验证"
    width="30%"
    :mask-closable="false"
    :keyboard="false"
  >
    <div>
      <p>{{ otpPrompt || '请输入验证码' }}</p>
      <a-input-password
        v-model:value="otpCode"
        placeholder="验证码"
        :visibility-toggle="false"
        @press-enter="submitOtpCode"
      />
      <span
        v-show="showOtpDialogErr"
        style="color: red"
        >验证码错误</span
      >
      <span
        v-show="showOtpDialogCheckErr"
        style="color: red"
        >请输入验证码</span
      >
    </div>
    <template #footer>
      <a-button
        key="submit"
        @click="cancelOtp"
        >取消</a-button
      >
      <a-button
        type="primary"
        @click="submitOtpCode"
        >确认
      </a-button>
    </template>
  </a-modal>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { showOtpDialog, showOtpDialogErr, showOtpDialogCheckErr, otpPrompt, otpCode, submitOtpCode, cancelOtp } from './refreshOrganizationAssets'

export default defineComponent({
  name: 'OtpDialog',
  setup() {
    return {
      showOtpDialog,
      showOtpDialogErr,
      showOtpDialogCheckErr,
      otpPrompt,
      otpCode,
      submitOtpCode,
      cancelOtp
    }
  }
})
</script>

<style scoped>
/* 可以在这里添加特定的样式 */
</style>
