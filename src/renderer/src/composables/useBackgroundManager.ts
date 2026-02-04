import { computed, watch, onUnmounted } from 'vue'
import { Vibrant } from 'node-vibrant/browser'
import { userConfigStore } from '@/store/userConfigStore'

/**
 * Manage application background image and related styles
 * Including background image, brightness, opacity, etc.
 */
export function useBackgroundManager() {
  const configStore = userConfigStore()

  // CSS variable for sticky message background color.
  const stickyBgVarName = '--user-message-sticky-bg-color'
  // Incrementing id to ignore stale async color results.
  let dominantColorRequestId = 0

  // Theme overlay colors that match the CSS rgba values in theme.less
  const THEME_OVERLAY = {
    dark: { r: 37, g: 37, b: 37 },
    light: { r: 241, g: 245, b: 249 }
  } as const

  type SwatchKey = 'Muted' | 'DarkMuted' | 'DarkVibrant' | 'Vibrant' | 'LightMuted' | 'LightVibrant'
  type SwatchLike = { rgb: [number, number, number] }
  type PaletteLike = Partial<Record<SwatchKey, SwatchLike | null>>

  const applyStickyBackgroundColor = (color: string | null) => {
    if (color) {
      document.documentElement.style.setProperty(stickyBgVarName, color)
      return
    }
    document.documentElement.style.removeProperty(stickyBgVarName)
  }

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

  const rgbToHsv = (r: number, g: number, b: number) => {
    const rr = r / 255
    const gg = g / 255
    const bb = b / 255
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    const delta = max - min

    let h = 0
    if (delta !== 0) {
      if (max === rr) {
        h = ((gg - bb) / delta) % 6
      } else if (max === gg) {
        h = (bb - rr) / delta + 2
      } else {
        h = (rr - gg) / delta + 4
      }
      h *= 60
      if (h < 0) h += 360
    }

    const s = max === 0 ? 0 : delta / max
    const v = max
    return { h, s, v }
  }

  const hsvToRgb = (h: number, s: number, v: number) => {
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c
    let r = 0
    let g = 0
    let b = 0

    if (h >= 0 && h < 60) {
      r = c
      g = x
      b = 0
    } else if (h >= 60 && h < 120) {
      r = x
      g = c
      b = 0
    } else if (h >= 120 && h < 180) {
      r = 0
      g = c
      b = x
    } else if (h >= 180 && h < 240) {
      r = 0
      g = x
      b = c
    } else if (h >= 240 && h < 300) {
      r = x
      g = 0
      b = c
    } else {
      r = c
      g = 0
      b = x
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    }
  }

  const reduceSaturation = (r: number, g: number, b: number, ratio: number) => {
    const { h, s, v } = rgbToHsv(r, g, b)
    const reducedS = clamp(s * (1 - ratio), 0, 1)
    return hsvToRgb(h, reducedS, v)
  }

  const extractDominantColor = async (imageUrl: string): Promise<string | null> => {
    try {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = imageUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Failed to load background image'))
      })

      const viewWidth = window.innerWidth
      const viewHeight = window.innerHeight
      if (!viewWidth || !viewHeight) return null

      const imageWidth = image.naturalWidth || image.width
      const imageHeight = image.naturalHeight || image.height
      if (!imageWidth || !imageHeight) return null

      // Match background-size: cover and background-position: center.
      const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight)
      const drawWidth = imageWidth * scale
      const drawHeight = imageHeight * scale
      const offsetX = (viewWidth - drawWidth) / 2
      const offsetY = (viewHeight - drawHeight) / 2

      const fullCanvas = document.createElement('canvas')
      fullCanvas.width = Math.round(viewWidth)
      fullCanvas.height = Math.round(viewHeight)
      const fullCtx = fullCanvas.getContext('2d')
      if (!fullCtx) return null

      // Step 1: Draw background image with brightness filter to match actual rendering
      const brightness = configStore.getUserConfig.background.brightness ?? 1.0
      fullCtx.filter = `brightness(${brightness})`
      fullCtx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
      fullCtx.filter = 'none'

      // Step 2: Apply theme overlay to simulate actual visual effect
      const isDark = document.body.classList.contains('theme-dark')
      const overlay = isDark ? THEME_OVERLAY.dark : THEME_OVERLAY.light
      const overlayOpacity = configStore.getUserConfig.background.opacity ?? 0.8
      fullCtx.fillStyle = `rgba(${overlay.r}, ${overlay.g}, ${overlay.b}, ${overlayOpacity})`
      fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height)

      const sidebar = document.querySelector('.rigth-sidebar') as HTMLElement | null
      const sidebarRect = sidebar?.getBoundingClientRect()
      let sampleRect = { x: 0, y: 0, width: fullCanvas.width, height: fullCanvas.height }
      if (sidebarRect && sidebarRect.width > 0 && sidebarRect.height > 0) {
        sampleRect = {
          x: Math.max(0, Math.round(sidebarRect.left)),
          y: Math.max(0, Math.round(sidebarRect.top)),
          width: Math.min(Math.round(sidebarRect.width), fullCanvas.width),
          height: Math.min(Math.round(sidebarRect.height), fullCanvas.height)
        }
      }

      if (!sampleRect.width || !sampleRect.height) return null

      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = sampleRect.width
      sampleCanvas.height = sampleRect.height
      const sampleCtx = sampleCanvas.getContext('2d')
      if (!sampleCtx) return null
      sampleCtx.drawImage(fullCanvas, sampleRect.x, sampleRect.y, sampleRect.width, sampleRect.height, 0, 0, sampleRect.width, sampleRect.height)

      const sampleUrl = sampleCanvas.toDataURL('image/png')
      const palette = (await Vibrant.from(sampleUrl).quality(1).getPalette()) as PaletteLike
      const swatch = palette.Muted || palette.DarkMuted || palette.DarkVibrant || palette.Vibrant || palette.LightMuted || palette.LightVibrant
      if (!swatch) return null
      const [r, g, b] = swatch.rgb
      // Reduced saturation ratio since theme overlay already dampens vibrancy
      const reduced = reduceSaturation(r, g, b, 0.3)
      return `rgb(${reduced.r}, ${reduced.g}, ${reduced.b})`
    } catch {
      return null
    }
  }

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

  // Watch background image, opacity, brightness and theme changes to update CSS variables and body class
  watch(
    () => [
      configStore.getUserConfig.background.image,
      configStore.getUserConfig.background.opacity,
      configStore.getUserConfig.background.brightness,
      configStore.getUserConfig.theme
    ],
    async ([bgImage, opacity]) => {
      const requestId = ++dominantColorRequestId
      if (bgImage) {
        const bgImageUrl = String(bgImage)
        document.body.classList.add('has-custom-bg')
        document.documentElement.style.setProperty('--custom-opacity', String(opacity))
        const stickyColor = await extractDominantColor(bgImageUrl)
        if (requestId !== dominantColorRequestId) return
        applyStickyBackgroundColor(stickyColor)
      } else {
        document.body.classList.remove('has-custom-bg')
        document.documentElement.style.removeProperty('--custom-opacity')
        applyStickyBackgroundColor(null)
      }
    },
    { immediate: true }
  )

  // Cleanup function: remove CSS variables and classes
  const cleanup = () => {
    document.body.classList.remove('has-custom-bg')
    document.documentElement.style.removeProperty('--custom-opacity')
    applyStickyBackgroundColor(null)
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
