import { computed, watch, onUnmounted } from 'vue'
import { userConfigStore } from '@/store/userConfigStore'

/**
 * Manage application background image and related styles
 * Including background image, brightness, opacity, etc.
 */
export function useBackgroundManager() {
  const configStore = userConfigStore()

  // Calculate background style
  const backgroundStyle = computed(() => {
    if (configStore.getUserConfig.background.image) {
      const brightness = configStore.getUserConfig.background.brightness ?? 1.0
      return {
        backgroundImage: `url('${configStore.getUserConfig.background.image}')`,
        opacity: 1, // Background layer itself is fully opaque, opacity is applied to content layer via CSS variable
        filter: `brightness(${brightness})`
      }
    }
    return {}
  })

  // Watch background image and opacity changes, update CSS variables and body class
  watch(
    () => [configStore.getUserConfig.background.image, configStore.getUserConfig.background.opacity],
    ([bgImage, opacity]) => {
      if (bgImage) {
        document.body.classList.add('has-custom-bg')
        document.documentElement.style.setProperty('--custom-opacity', opacity as string)
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
