<template>
  <a-modal
    v-model:visible="showOtpDialog"
    :title="$t('mfa.title')"
    width="400px"
    :mask-closable="false"
    :keyboard="false"
    :footer="null"
    class="mfa-modal"
    @cancel="cancelOtp"
  >
    <div class="mfa-content">
      <div class="otp-section">
        <div
          v-if="otpPrompt"
          class="prompt-section"
        >
          <span class="prompt-text">{{ otpPrompt }}</span>
        </div>
        <OtpInput
          v-model="otpCode"
          :has-error="showOtpDialogErr || showOtpDialogCheckErr"
          :error-message="getErrorMessage()"
          @complete="handleOtpComplete"
          @change="handleOtpChange"
        />
      </div>
      <div class="timer-section">
        <span class="timer-text"> {{ $t('mfa.remainingTime') }}: {{ Math.ceil(otpTimeRemaining / 1000) }}s </span>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import OtpInput from './OtpInput.vue'
import {
  showOtpDialog,
  showOtpDialogErr,
  showOtpDialogCheckErr,
  otpPrompt,
  otpCode,
  otpTimeRemaining,
  cancelOtp,
  handleOtpChange,
  handleOtpComplete
} from './mfaState'

const { t } = useI18n()

// Error message helper
const getErrorMessage = () => {
  if (showOtpDialogCheckErr.value) {
    return t('mfa.pleaseInputVerificationCode')
  }
  if (showOtpDialogErr.value) {
    return t('mfa.verificationCodeError')
  }
  return ''
}
</script>

<style scoped>
.mfa-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0 32px 0;
  gap: 24px;
}

.otp-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 16px;
}

.prompt-section {
  width: 100%;
  display: flex;
  justify-content: center;
}

.prompt-text {
  color: var(--text-color-secondary-light);
  font-size: 14px;
  text-align: center;
  white-space: pre-wrap;
}

.timer-section {
  display: flex;
  justify-content: center;
  width: 100%;
}

.timer-text {
  color: var(--text-color-secondary-light);
  font-size: 13px;
  font-weight: normal;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .mfa-content {
    padding: 16px 0 24px 0;
    gap: 20px;
  }

  .prompt-text {
    font-size: 13px;
  }

  .timer-text {
    font-size: 12px;
  }
}
</style>

<style>
/* Use global style so it works with teleported AntD modal */
.mfa-modal .ant-modal-content {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  border: 1px solid var(--border-color-light) !important;
}

.mfa-modal .ant-modal-header {
  background-color: var(--bg-color-secondary) !important;
  border-bottom: 1px solid var(--border-color-light) !important;
}

.mfa-modal .ant-modal-title {
  color: var(--text-color) !important;
}

.mfa-modal .ant-modal-close,
.mfa-modal .ant-modal-close-x,
.mfa-modal .ant-modal-close .ant-modal-close-icon {
  color: var(--text-color-secondary-light) !important;
}

.mfa-modal .ant-modal-body {
  background-color: var(--bg-color-secondary) !important;
}
</style>
