<template>
  <div>
    <div class="section-header">
      <h3>{{ $t('user.billing') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <div class="setting-item">
        <div class="info-row">
          <span class="info-label">{{ $t('user.expires') }}:</span>
          <span class="info-value">{{ userInfo.expires || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">{{ $t('user.ratio') }}:</span>
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

const userInfo = ref<any>({})
const getRatioPercent = computed(() => {
  const ratio = userInfo.value.ratio
  if (ratio === undefined || ratio === null) return 0
  return Math.round(ratio * 100)
})

const getProgressColor = computed(() => {
  const percent = getRatioPercent.value
  if (percent >= 90) return '#f5222d' // 红色，接近用完
  if (percent >= 70) return '#fa8c16' // 橙色，警告
  return '#52c41a' // 绿色，正常
})

onMounted(() => {
  getUserInfo()
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
  border-bottom: none;

  :deep(.ant-card-body) {
    padding: 16px;
    border-bottom: none;
  }

  :deep(.ant-form-item) {
    .ant-form-item-label > label {
      color: var(--text-color);
    }
  }
}

.section-header {
  margin-top: 8px;
  margin-left: 16px;

  h3 {
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    color: var(--text-color);
  }
}

.setting-item {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.info-row {
  display: flex;
  margin-bottom: 20px;
  align-items: center;
}

.info-label {
  font-weight: 500;
  color: var(--text-color);
  min-width: 120px;
}

.info-value {
  color: var(--text-color-secondary);
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
  margin-right: 10px;

  .ant-progress-bg {
    height: 8px !important;
    border-radius: 4px;
  }

  .ant-progress-outer {
    margin-right: 0;
    padding-right: 0;
  }
}
</style>
