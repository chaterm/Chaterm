<template>
  <div>
    <div class="section-header">
      <div class="title-container">
        <h3>{{ $t('user.billing') }}</h3>
      </div>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <div
        v-if="isSkippedLogin"
        class="login-prompt-container"
      >
        <div class="login-prompt-content">
          <p class="login-prompt-text">{{ $t('user.billingLoginPrompt') }}</p>
          <a-button
            type="primary"
            @click="goToLogin"
          >
            {{ $t('common.login') }}
          </a-button>
        </div>
      </div>
      <div
        v-else
        class="setting-item"
      >
        <div class="info-row lr-row">
          <span class="info-label">{{ $t('user.email') }}</span>
          <span class="info-value">{{ userInfo.email || '-' }}</span>
        </div>
        <div class="info-row lr-row">
          <span class="info-label">{{ $t('user.subscription') }}</span>
          <span class="info-value subscription-type">{{
            userInfo.subscription ? userInfo.subscription.charAt(0).toUpperCase() + userInfo.subscription.slice(1) : '-'
          }}</span>
        </div>
        <div class="info-row lr-row">
          <span class="info-label">{{ $t('user.budgetResetAt') }}</span>
          <span class="info-value">{{ userInfo.budgetResetAt || '-' }}</span>
        </div>
        <div class="info-row lr-row">
          <span class="info-label">{{ $t('user.ratio') }}</span>
          <div class="progress-wrapper">
            <div class="progress-container">
              <a-progress
                :percent="getRatioPercent"
                :stroke-color="getProgressColor"
                :show-info="false"
                size="small"
                :track-color="'rgba(0, 0, 0, 0.06)'"
              />
              <span class="ratio-value">{{ getRatioPercent }}%</span>
            </div>
          </div>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getUser } from '@/api/user/user'
import { useRouter } from 'vue-router'

const router = useRouter()
const isSkippedLogin = ref(localStorage.getItem('login-skipped') === 'true')
const userInfo = ref<any>({})
const getRatioPercent = computed(() => {
  const ratio = userInfo.value.ratio
  if (ratio === undefined || ratio === null) return 0
  return Math.round(ratio * 100)
})

const getProgressColor = computed(() => {
  const percent = getRatioPercent.value
  if (percent >= 90) return '#f5222d' // Red, close to running out
  if (percent >= 70) return '#fa8c16' // Orange, warning
  return '#52c41a' // Green, normal
})

const goToLogin = () => {
  router.push('/login')
}

onMounted(() => {
  if (!isSkippedLogin.value) {
    getUserInfo()
  }

  // Listen for login status changes
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'login-skipped') {
      isSkippedLogin.value = e.newValue === 'true'
      if (!isSkippedLogin.value) {
        getUserInfo()
      }
    }
  }
  window.addEventListener('storage', handleStorageChange)

  // Also check on mount
  const currentSkippedStatus = localStorage.getItem('login-skipped') === 'true'
  if (currentSkippedStatus !== isSkippedLogin.value) {
    isSkippedLogin.value = currentSkippedStatus
    if (!isSkippedLogin.value) {
      getUserInfo()
    }
  }
})

const getUserInfo = () => {
  getUser({}).then((res: any) => {
    userInfo.value = res.data
  })
}
</script>

<style lang="less" scoped>
.settings-section {
  background-color: var(--bg-color);
  box-shadow: none;

  :deep(.ant-card-body) {
    padding: 16px;
  }
}

.section-header {
  margin-top: 8px;
  margin-left: 16px;

  .title-container {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h3 {
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    color: var(--text-color);
  }
}

.setting-item {
  margin-bottom: 8px;
}

.info-row {
  display: flex;
  margin-bottom: 20px;
  flex-direction: column;
}

.lr-row {
  flex-direction: row;
  align-items: center;
}

.info-label {
  color: var(--text-color);
  min-width: 100px;
  margin-right: 15px;
}

.info-value {
  color: var(--text-color-secondary);
}

.subscription-type {
  background-color: rgba(42, 130, 228, 0.15);
  color: #1890ff;
  border: 1px solid rgba(42, 130, 228, 0.3);
  font-weight: bolder;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  display: inline-block;
  min-width: 60px;
  text-align: center;
  border: none;
  box-shadow: none;
  text-shadow: none;
}

.progress-wrapper {
  flex: 1;
  display: flex;
}

.progress-container {
  width: 60%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ratio-value {
  color: var(--text-color-secondary);
  min-width: 40px;
}

:deep(.ant-progress) {
  flex: 1;

  .ant-progress-bg {
    height: 8px !important;
    border-radius: 4px;
  }

  .ant-progress-outer {
    margin-right: 0;
    padding-right: 0;
  }
}

:deep(.ant-progress-line) {
  margin: 0 !important;
  line-height: 1 !important;
}

.login-prompt-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  padding: 40px 20px;
}

.login-prompt-content {
  text-align: center;
}

.login-prompt-text {
  color: var(--text-color-secondary);
  font-size: 14px;
  margin-bottom: 20px;
}
</style>
