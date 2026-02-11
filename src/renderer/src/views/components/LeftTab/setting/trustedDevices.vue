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
                  <div class="device-info-row device-info-row--main">
                    <span class="device-name">{{ item.deviceName || $t('user.trustedDevicesUnknownDevice') }}</span>
                    <span
                      v-if="item.lastLoginUserAgent"
                      class="device-sep"
                    >
                      ·
                    </span>
                    <span
                      v-if="item.lastLoginUserAgent"
                      class="device-ua"
                      :title="item.lastLoginUserAgent"
                      >{{ shortenUserAgent(item.lastLoginUserAgent) }}</span
                    >
                    <a-tag
                      v-if="isCurrentDevice(item)"
                      color="blue"
                      class="current-tag"
                    >
                      {{ $t('user.trustedDevicesCurrentDevice') }}
                    </a-tag>
                  </div>
                  <div class="device-info-row device-info-row--sub">
                    <template v-if="item.lastLoginIp || item.location || item.macAddress || item.lastLoginAt">
                      <span
                        v-if="item.lastLoginIp"
                        class="device-ip"
                        >IP: {{ item.lastLoginIp }}</span
                      >
                      <span
                        v-if="item.lastLoginIp && (item.location || item.macAddress || item.lastLoginAt)"
                        class="device-sep"
                        >,
                      </span>
                      <span
                        v-if="item.location"
                        class="device-location"
                        >{{ item.location }}</span
                      >
                      <span
                        v-if="item.location && (item.macAddress || item.lastLoginAt)"
                        class="device-sep"
                        >,
                      </span>
                      <span
                        v-if="item.macAddress"
                        class="device-mac"
                        >{{ maskMac(item.macAddress) }}</span
                      >
                      <!--                      <span v-if="item.macAddress && item.lastLoginAt" class="device-sep">, </span>-->
                      <!--                      <span v-if="item.lastLoginAt" class="device-time">{{ item.lastLoginAt }}</span>-->
                    </template>
                  </div>
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

const logger = createRendererLogger('settings.trustedDevices')

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
    logger.error('Failed to read user info', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
})

interface TrustedDeviceItem {
  id: number
  deviceName: string
  macAddress: string
  lastLoginAt: string
  location?: string
  lastLoginUserAgent?: string
  lastLoginIp?: string
}

const devices = ref<TrustedDeviceItem[]>([])
const maxAllowed = ref<number | null>(null)
const currentCount = ref<number>(0)
const loading = ref(false)
const revokeModalVisible = ref(false)
const revokeTarget = ref<TrustedDeviceItem | null>(null)

// Show first 4 and last 4 hex digits of MAC (e.g. aa:bb:**:**:ee:ff)
function maskMac(mac: string): string {
  if (!mac || mac.length < 4) return mac ?? ''
  const hex = mac.replace(/[-:]/g, '').toLowerCase()
  if (hex.length < 8) return hex.slice(0, 4) + '****'
  const first4 = hex.slice(0, 4)
  const last4 = hex.slice(-4)
  return first4.slice(0, 2) + ':' + first4.slice(2) + ':**:**:' + last4.slice(0, 2) + ':' + last4.slice(2)
}

function isCurrentDevice(item: TrustedDeviceItem): boolean {
  const current = deviceStore.getMacAddress ?? ''
  if (!current || !item.macAddress) return false
  return item.macAddress.toUpperCase().replace(/[-:]/g, '') === current.toUpperCase().replace(/[-:]/g, '')
}

// Shorten user-agent for display. For mobile: show only text after first semicolon inside parentheses (e.g. "vivo V2405A").
function shortenUserAgent(ua: string): string {
  if (!ua || !ua.trim()) return ''
  const s = ua.trim()
  const maxLen = 56
  // Mobile: e.g. "Mobile (Android 16; vivo V2405A) 1.0.5" -> "vivo V2405A"
  const mobileMatch = s.match(/Mobile\s*\(([^)]+)\)/)
  if (mobileMatch) {
    const inside = mobileMatch[1]
    const afterSemicolon = inside.indexOf(';') >= 0 ? inside.split(';').slice(1).join(';').trim() : inside.trim()
    if (afterSemicolon) return afterSemicolon
  }
  if (s.length <= maxLen) return s
  const chrome = s.match(/Chrome\/[\d.]+/)?.[0]
  const firefox = s.match(/Firefox\/[\d.]+/)?.[0]
  const safari = s.match(/Version\/[\d.]+.*Safari/)?.[0]
  const part = chrome || firefox || safari
  if (part) return part
  return s.slice(0, maxLen) + '…'
}

async function loadDevices() {
  if (!isUserLoggedIn.value) return
  loading.value = true
  try {
    const res = (await getTrustedDevices()) as any
    const data = res?.data ?? res
    devices.value = (data?.devices ?? []).map((d: any) => ({
      id: d.id,
      deviceName: d.deviceName ?? '',
      macAddress: d.macAddress ?? '',
      lastLoginAt: d.lastLoginAt ?? '',
      location: d.location ?? '',
      lastLoginUserAgent: d.lastLoginUserAgent ?? '',
      lastLoginIp: d.lastLoginIp ?? ''
    }))
    maxAllowed.value = data?.maxAllowed ?? 3
    currentCount.value = data?.currentCount ?? devices.value.length
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
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    .device-info-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      &.device-info-row--main {
        .device-name {
          font-weight: 500;
          color: var(--text-color);
        }
        .current-tag {
          margin-left: 4px;
        }
      }
      &.device-info-row--sub,
      &.device-info-row--ua {
        font-size: 13px;
        color: var(--text-color-secondary);
      }
      .device-location {
        color: var(--text-color-secondary);
      }
      .device-sep {
        color: var(--text-color-secondary);
      }
      .device-time {
        color: var(--text-color-secondary);
      }
      .device-mac {
        font-size: 13px;
        color: var(--text-color-secondary);
      }
      .device-ip {
        font-size: 13px;
        color: var(--text-color-secondary);
      }
      .device-ua {
        font-size: 12px;
        color: var(--text-color-tertiary, var(--text-color-secondary));
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
}
</style>
