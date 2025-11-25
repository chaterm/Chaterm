import { computed, watch, onUnmounted } from 'vue'
import { userConfigStore } from '@/store/userConfigStore'

/**
 * 管理应用背景图片和相关样式
 * 包括背景图片、亮度、透明度等
 */
export function useBackgroundManager() {
  const configStore = userConfigStore()

  // 计算背景样式
  const backgroundStyle = computed(() => {
    if (configStore.getUserConfig.background.image) {
      const brightness = configStore.getUserConfig.background.brightness ?? 1.0
      return {
        backgroundImage: `url('${configStore.getUserConfig.background.image}')`,
        opacity: 1, // 背景层本身完全不透明，透明度通过 CSS 变量应用到内容层
        filter: `brightness(${brightness})`
      }
    }
    return {}
  })

  // 监听背景图片和透明度变化，更新 CSS 变量和 body 类
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

  // 清理函数：移除 CSS 变量和类
  const cleanup = () => {
    document.body.classList.remove('has-custom-bg')
    document.documentElement.style.removeProperty('--custom-opacity')
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    cleanup()
  })

  return {
    backgroundStyle,
    cleanup
  }
}
