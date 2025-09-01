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
}

.timer-section {
  display: flex;
  justify-content: center;
  width: 100%;
}

.timer-text {
  color: #8c8c8c;
  font-size: 13px;
  font-weight: normal;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .mfa-content {
    padding: 16px 0 24px 0;
    gap: 20px;
  }

  .timer-text {
    font-size: 12px;
  }
}
</style>
