<template>
  <a-modal
    v-model:visible="showOtpDialog"
    :title="$t('mfa.title')"
    width="30%"
    :mask-closable="false"
    :keyboard="false"
  >
    <div style="margin-bottom: 16px">
      <p style="margin-bottom: 8px">{{ otpPrompt }}</p>
      <a-input-password
        v-model:value="otpCode"
        :placeholder="$t('mfa.verificationCode')"
        :visibility-toggle="false"
        @press-enter="submitOtpCode"
      />
      <span
        v-show="showOtpDialogErr"
        style="color: red"
        >{{ $t('mfa.verificationCodeError') }}</span
      >
      <span
        v-show="showOtpDialogCheckErr"
        style="color: red"
        >{{ $t('mfa.pleaseInputVerificationCode') }}</span
      >
    </div>
    <template #footer>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span style="color: #666; font-size: 12px"> {{ $t('mfa.remainingTime') }}: {{ Math.ceil(otpTimeRemaining / 1000) }}s </span>
        <div>
          <a-button @click="cancelOtp">{{ $t('mfa.cancel') }}</a-button>
          <a-button
            type="primary"
            style="margin-left: 8px"
            @click="submitOtpCode"
            >{{ $t('mfa.confirm') }}</a-button
          >
        </div>
      </div>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { showOtpDialog, showOtpDialogErr, showOtpDialogCheckErr, otpPrompt, otpCode, otpTimeRemaining, submitOtpCode, cancelOtp } from './mfaState'
</script>
