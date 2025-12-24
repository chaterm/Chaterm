<template>
  <div class="dashboard-container">
    <div class="shortcuts-content">
      <img
        class="logo"
        :src="logoSrc"
        alt="logo"
      />
      <div class="shortcuts-list">
        <div
          v-for="shortcut in shortcuts"
          :key="shortcut.id"
          class="shortcut-item"
          @click="handleShortcutClick(shortcut.id)"
        >
          <div class="shortcut-description">
            {{ shortcut.description }}
          </div>

          <div class="shortcut-key">
            <kbd
              v-for="key in shortcut.keys"
              :key="key"
              class="key"
              >{{ key }}</kbd
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { shortcutActions, shortcutHintKeys } from '@/config/shortcutActions'
import { shortcutService } from '@/services/shortcutService'
import type { ShortcutConfig } from '@/services/userConfigStoreService'
import { useI18n } from 'vue-i18n'
import logoDark from '@/assets/img/logo-dark.svg'
import logoLight from '@/assets/img/logo-light.svg'

// Reactive theme tracking
const isDark = ref(document.documentElement.className.includes('theme-dark'))

const logoSrc = computed(() => (isDark.value ? logoDark : logoLight))

const { t } = useI18n()

// Store current shortcuts configuration
const currentShortcuts = ref<ShortcutConfig | null>(null)

// Detect if it's Mac system
const isMac = computed(() => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
})

// Load shortcuts configuration
const loadShortcuts = async () => {
  try {
    currentShortcuts.value = shortcutService.getShortcuts()
  } catch (error) {
    console.error('Failed to load shortcuts:', error)
  }
}

// Get current shortcut for an action
const getCurrentShortcut = (actionId: string): string => {
  return currentShortcuts.value?.[actionId] || ''
}

// Get shortcuts to display
const shortcuts = computed(() => {
  const targetIds = ['sendOrToggleAi', 'toggleLeftSidebar', 'openSettings', 'openCommandDialog', 'toggleLayout']
  return targetIds
    .map((id) => {
      const action = shortcutActions.find((a) => a.id === id)
      if (!action) return null

      // Get user-configured shortcut or fallback to default
      const userShortcut = getCurrentShortcut(id)
      const shortcutKey = userShortcut || (isMac.value ? action.defaultKey.mac : action.defaultKey.other)

      // Use shortcutService to format the shortcut consistently with settings page
      const formattedShortcut = shortcutService.formatShortcut(shortcutKey, id)
      const keys = formattedShortcut.split('+').map((k) => k.trim())
      // Get i18n key for this shortcut hint
      const hintKey = shortcutHintKeys[id as keyof typeof shortcutHintKeys]
      const description = hintKey ? t(`shortcuts.hints.${hintKey}`) : ''

      return {
        id,
        keys,
        description
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
})

// Handle shortcut click event
const handleShortcutClick = (actionId: string) => {
  const action = shortcutActions.find((a) => a.id === actionId)
  if (action && action.handler) {
    action.handler()
  }
}

// Load shortcuts on component mount
onMounted(() => {
  loadShortcuts()

  // Observe theme changes on document.documentElement
  const observer = new MutationObserver(() => {
    isDark.value = document.documentElement.className.includes('theme-dark')
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })

  // Listen for window focus to refresh shortcuts when user returns from settings
  const handleWindowFocus = () => {
    loadShortcuts()
  }

  window.addEventListener('focus', handleWindowFocus)

  // Cleanup listeners on unmount
  onUnmounted(() => {
    observer.disconnect()
    window.removeEventListener('focus', handleWindowFocus)
  })
})
</script>

<style lang="less" scoped>
.dashboard-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  padding-top: 20vh;
}

.shortcuts-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 32px 40px;
  @media (max-width: 600px) {
    padding: 20px 10px;
    gap: 20px;
  }
}

.logo {
  width: 100px;
  height: 100px;
  margin-bottom: 8px;
  &:hover {
    transform: scale(1.05);
  }
}

.shortcuts-title {
  font-size: 20px;
  font-weight: bold;
  background: linear-gradient(90deg, #00eaff 0%, #1677ff 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
  letter-spacing: 1px;
  text-align: center;
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 0px;
  width: 100%;
  max-width: 400px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateX(4px);
  }

  &:active {
    transform: translateX(2px);
    background: rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 600px) {
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }
}

.shortcut-key {
  display: flex;
  gap: 4px;
  align-items: center;
}

.key {
  display: inline-block;
  padding: 1px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: 12px;
  font-weight: 500;
  color: #a0a0a0;
  min-width: 24px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.shortcut-description {
  font-size: 14px;
  color: #888888;
  font-weight: 500;
  margin-right: 80px;

  @media (max-width: 600px) {
    font-size: 13px;
    margin-right: 0;
  }
}
</style>
