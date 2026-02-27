import { computed, watch, onUnmounted } from 'vue'
import { userConfigStore } from '@/store/userConfigStore'
import { userConfigStore as userConfigService } from '@/services/userConfigStoreService'

/**
 * Manage application background image and related styles
 * Including background image, brightness, opacity, etc.
 */
export function useBackgroundManager() {
  const configStore = userConfigStore()
  const SYSTEM_BG_KEY_PREFIX = 'system-bg:'

  const resolveBackgroundImage = (imagePath: string): string => {
    if (!imagePath) {
      return imagePath
    }

    let index: number | null = null
    if (imagePath.startsWith(SYSTEM_BG_KEY_PREFIX)) {
      const parsed = Number(imagePath.slice(SYSTEM_BG_KEY_PREFIX.length))
      index = Number.isNaN(parsed) ? null : parsed
    } else {
      const match = imagePath.match(/wall-(\d+)\.jpg/)
      if (match) {
        const parsed = Number(match[1])
        index = Number.isNaN(parsed) ? null : parsed
      }
    }

    if (index !== null) {
      return new URL(`../assets/backgroup/wall-${index}.jpg`, import.meta.url).href
    }

    return imagePath
  }

  // Load background config from SQLite into Pinia Store on initialization,
  // so background displays correctly even if the settings page is never opened.
  userConfigService
    .getConfig()
    .then((savedConfig) => {
      if (savedConfig?.background) {
        const bg = savedConfig.background
        if (bg.mode === 'image' && bg.image) {
          configStore.updateBackgroundMode(bg.mode)
          configStore.updateBackgroundImage(bg.image)
          configStore.updateBackgroundOpacity(bg.opacity)
          configStore.updateBackgroundBrightness(bg.brightness)
        }
      }
    })
    .catch(() => {
      // Silently ignore - will use default empty background
    })

  // Calculate background style
  const backgroundStyle = computed(() => {
    const bgImage = resolveBackgroundImage(configStore.getUserConfig.background.image)
    if (bgImage) {
      const brightness = configStore.getUserConfig.background.brightness ?? 1.0
      return {
        backgroundImage: `url('${bgImage}')`,
        opacity: 1, // Background layer itself is fully opaque, opacity is applied to content layer via CSS variable
        filter: `brightness(${brightness})`
      }
    }
    return {}
  })

  // Watch background image and opacity to update body class and CSS variables.
  watch(
    () => [configStore.getUserConfig.background.image, configStore.getUserConfig.background.opacity],
    ([bgImage, opacity]) => {
      if (bgImage) {
        document.body.classList.add('has-custom-bg')
        if (opacity === undefined || opacity === null) {
          document.documentElement.style.removeProperty('--custom-opacity')
          return
        }
        document.documentElement.style.setProperty('--custom-opacity', String(opacity))
      } else {
        document.body.classList.remove('has-custom-bg')
        document.documentElement.style.removeProperty('--custom-opacity')
      }
    },
    { immediate: true }
  )

  // Cleanup function: remove CSS variables and classes
  const cleanup = () => {
    document.body.classList.remove('has-custom-bg')
    document.documentElement.style.removeProperty('--custom-opacity')
  }

  // Automatically cleanup when component unmounts
  onUnmounted(() => {
    cleanup()
  })

  return {
    backgroundStyle,
    cleanup
  }
}
