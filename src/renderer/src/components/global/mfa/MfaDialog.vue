<template>
  <a-modal
    v-model:visible="showOtpDialog"
    title="二次验证"
    width="30%"
    :mask-closable="false"
    :keyboard="false"
  >
    <div style="margin-bottom: 16px">
      <p style="margin-bottom: 8px">{{ otpPrompt }}</p>
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
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span style="color: #666; font-size: 12px"> 剩余时间: {{ Math.ceil(otpTimeRemaining / 1000) }}s </span>
        <div>
          <a-button @click="cancelOtp">取消</a-button>
          <a-button
            type="primary"
            style="margin-left: 8px"
            @click="submitOtpCode"
            >确认</a-button
          >
        </div>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { showOtpDialog, showOtpDialogErr, showOtpDialogCheckErr, otpPrompt, otpCode, otpTimeRemaining, submitOtpCode, cancelOtp } from './mfaState'
</script>
