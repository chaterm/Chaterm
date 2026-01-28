<template>
  <div class="userInfo">
    <a-card
      :bordered="false"
      class="userInfo-container"
    >
      <a-form
        :colon="false"
        label-align="left"
        wrapper-align="right"
        :label-col="{ span: 7, offset: 0 }"
        :wrapper-col="{ span: 17, class: 'right-aligned-wrapper' }"
        class="custom-form"
      >
        <a-form-item>
          <template #label>
            <span class="label-text">{{ $t('user.trustedDevices') }}</span>
          </template>
        </a-form-item>
        <a-form-item
          v-if="!isUserLoggedIn"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="description">
            {{ $t('user.trustedDevicesLoginRequired') }}
          </div>
        </a-form-item>
        <template v-else>
          <a-form-item
            class="description-item"
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
          >
            <div class="description">
              {{ $t('user.trustedDevicesDescription') }}
            </div>
            <div
              v-if="typeof maxAllowed === 'number' && (currentCount ?? devices.length) >= maxAllowed"
              class="trusted-max-hint"
            >
              {{ $t('user.trustedDevicesMaxReached') }}
            </div>
          </a-form-item>
          <a-form-item
            v-if="loading"
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
          >
            <a-spin />
          </a-form-item>
          <a-form-item
            v-else-if="devices.length === 0"
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
          >
            <div class="description trusted-no-data">
              {{ $t('user.trustedDevicesNoData') }}
            </div>
          </a-form-item>
          <a-form-item
            v-else
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
          >
            <div class="device-list">
              <div
                v-for="item in devices"
                :key="item.id"
                class="device-item"
              >
                <div class="device-info">
                  <span class="device-name">{{ item.deviceName || $t('user.trustedDevicesUnknownDevice') }}</span>
                  <span class="device-mac">{{ maskMac(item.macAddress) }}</span>
                  <span class="device-time">{{ item.lastLoginAt }}</span>
                  <a-tag
                    v-if="isCurrentDevice(item)"
                    color="blue"
                    class="current-tag"
                  >
                    {{ $t('user.trustedDevicesCurrentDevice') }}
                  </a-tag>
                </div>
                <a-button
                  type="link"
                  danger
                  size="small"
                  :disabled="isCurrentDevice(item)"
                  @click="onRevoke(item)"
                >
                  {{ $t('user.trustedDevicesRemove') }}
                </a-button>
              </div>
            </div>
          </a-form-item>
          <a-form-item
            v-if="typeof maxAllowed === 'number'"
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
            class="trusted-count-row"
          >
            <div class="trusted-count trusted-count--right">
              {{ $t('user.trustedDevicesCount', { current: currentCount ?? devices.length, max: maxAllowed }) }}
            </div>
          </a-form-item>
        </template>
      </a-form>
    </a-card>
    <a-modal
      v-model:open="revokeModalVisible"
      :title="$t('user.trustedDevicesRemove')"
      :ok-text="$t('common.done')"
      :cancel-text="$t('common.cancel')"
      @ok="confirmRevoke"
    >
      <p>{{ $t('user.trustedDevicesRemoveConfirm') }}</p>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { getUserInfo } from '@/utils/permission'
import { useDeviceStore } from '@/store/useDeviceStore'
import { getTrustedDevices, revokeTrustedDevice } from '@api/user/user'

const props = defineProps<{ isActive?: boolean }>()
const { t } = useI18n()
const deviceStore = useDeviceStore()

// Refetch list whenever user switches back to this tab (when pane stays mounted)
watch(
  () => props.isActive,
  (active) => {
    if (active) loadDevices()
  }
)

const isUserLoggedIn = computed(() => {
  const token = localStorage.getItem('ctm-token')
  const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
  try {
    const userInfo = getUserInfo()
    return !!(token && token !== 'guest_token' && !isSkippedLogin && userInfo?.uid)
  } catch (error) {
    console.error('Failed to read user info:', error)
    return false
  }
})

interface TrustedDeviceItem {
  id: number
  deviceName: string
  macAddress: string
  lastLoginAt: string
  isCurrentDevice?: boolean
}

const devices = ref<TrustedDeviceItem[]>([])
const maxAllowed = ref<number | null>(null)
const currentCount = ref<number>(0)
const loading = ref(false)
const revokeModalVisible = ref(false)
const revokeTarget = ref<TrustedDeviceItem | null>(null)

function maskMac(mac: string): string {
  if (!mac || mac.length < 8) return mac ?? ''
  const parts = mac.replace(/[-:]/g, ':').split(':')
  if (parts.length >= 4) {
    return (
      parts
        .slice(0, -2)
        .map(() => '**')
        .join(':') +
      ':' +
      parts.slice(-2).join(':')
    )
  }
  return '****:' + (mac.slice(-4) || '')
}

function isCurrentDevice(item: TrustedDeviceItem): boolean {
  const current = deviceStore.getMacAddress ?? ''
  if (!current || !item.macAddress) return false
  return item.macAddress.toUpperCase().replace(/[-:]/g, '') === current.toUpperCase().replace(/[-:]/g, '')
}

async function loadDevices() {
  if (!isUserLoggedIn.value) return
  loading.value = true
  try {
    const res = (await getTrustedDevices()) as any
    const data = res?.data ?? res
    devices.value = (data?.devices ?? data?.Devices ?? []).map((d: any) => ({
      id: d.id ?? d.Id,
      deviceName: d.deviceName ?? d.device_name ?? d.DeviceName ?? '',
      macAddress: d.macAddress ?? d.mac_address ?? d.MacAddress ?? '',
      lastLoginAt: d.lastLoginAt ?? d.last_login_at ?? d.LastLoginAt ?? ''
    }))
    maxAllowed.value = data?.maxAllowed ?? data?.max_allowed ?? data?.MaxAllowed ?? 3
    currentCount.value = data?.currentCount ?? data?.current_count ?? data?.CurrentCount ?? devices.value.length
  } catch (e: any) {
    message.error(e?.response?.data?.message ?? e?.message ?? t('user.trustedDevicesLoadFailed'))
  } finally {
    loading.value = false
  }
}

function onRevoke(item: TrustedDeviceItem) {
  if (isCurrentDevice(item)) return
  revokeTarget.value = item
  revokeModalVisible.value = true
}

async function confirmRevoke() {
  const item = revokeTarget.value
  if (!item) {
    revokeModalVisible.value = false
    return
  }
  try {
    await revokeTrustedDevice(item.id)
    message.success(t('common.saved') ?? 'Saved')
    revokeModalVisible.value = false
    revokeTarget.value = null
    await loadDevices()
  } catch (e: any) {
    message.error(e?.response?.data?.message ?? e?.message ?? t('user.trustedDevicesRevokeFailed'))
  }
}

// Always load when this pane mounts (first open or when tab content is created)
onMounted(() => {
  loadDevices()
})
</script>

<style lang="less" scoped>
.userInfo {
  .userInfo-container {
    background-color: var(--bg-color);
    padding-left: 4px;
    padding-top: 4px;
  }
  .label-text {
    font-size: 20px;
    font-weight: bold;
    line-height: 1.3;
    color: var(--text-color);
  }
  .description {
    color: var(--text-color-secondary);
    font-size: 14px;
  }
  .description-item {
    margin-bottom: 8px;
  }
  .trusted-count {
    font-size: 14px;
    color: var(--text-color-secondary);
  }
  .trusted-count--right {
    text-align: right;
  }
  .trusted-count-row {
    margin-top: 8px;
    margin-bottom: 0;
  }
  .trusted-max-hint {
    margin-top: 4px;
    font-size: 14px;
    color: var(--warning-color);
    font-style: italic;
  }
  .trusted-no-data {
    padding: 12px 0;
  }
  .device-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .device-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background-color: var(--hover-bg-color);
    border-radius: 6px;
    border: 1px solid var(--border-color);
  }
  .device-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    .device-name {
      font-weight: 500;
      color: var(--text-color);
    }
    .device-mac,
    .device-time {
      font-size: 14px;
      color: var(--text-color-secondary);
    }
    .current-tag {
      margin-left: 4px;
    }
  }
}
</style>
