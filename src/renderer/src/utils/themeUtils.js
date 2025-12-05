// Theme utility functions for consistent theme detection across components

/**
 * Check if system prefers dark mode
 * @returns {boolean} true if system prefers dark mode
 */
export function prefersDarkMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Initialize theme from database and apply to document
 * @returns {Promise<void>}
 */
export async function initializeThemeFromDatabase() {
  const { userConfigStore } = await import('../services/userConfigStoreService')
  const config = await userConfigStore.getConfig()
  const dbTheme = config.theme || 'auto'
  const actualTheme = getActualTheme(dbTheme)

  // Set document theme class
  document.documentElement.className = `theme-${actualTheme}`

  // Initialize main window
  window.api.mainWindowInit(dbTheme)
  window.api.mainWindowShow()
}

/**
 * Check if system prefers light mode
 * @returns {boolean} true if system prefers light mode
 */
export function prefersLightMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
}

/**
 * Get system theme preference
 * @returns {string} 'dark' or 'light' based on system preference
 */
export function getSystemTheme() {
  if (prefersDarkMode()) {
    return 'dark'
  } else if (prefersLightMode()) {
    return 'light'
  }
  // Default to light theme if no system preference is detected
  return 'light'
}

/**
 * Helper function to get actual theme based on system preference for auto mode
 * @param {string} theme - The theme setting ('auto', 'light', 'dark')
 * @returns {string} 'dark' or 'light'
 */
export function getActualTheme(theme) {
  if (theme === 'auto') {
    return getSystemTheme()
  }
  return theme
}

/**
 * Get the current actual theme, considering auto theme mode
 * @returns {string} 'dark' or 'light'
 */
export function getCurrentTheme() {
  const themeClass = document.documentElement.className
  if (themeClass.includes('theme-dark')) {
    return 'dark'
  } else if (themeClass.includes('theme-light')) {
    return 'light'
  }

  // Fallback: use system theme preference
  return getSystemTheme()
}

/**
 * Check if the current theme is dark
 * @returns {boolean}
 */
export function isDarkTheme() {
  return getCurrentTheme() === 'dark'
}

/**
 * Check if the current theme is light
 * @returns {boolean}
 */
export function isLightTheme() {
  return getCurrentTheme() === 'light'
}

/**
 * Get Monaco editor theme based on current theme
 * @returns {string} Monaco theme name
 */
export function getMonacoTheme() {
  return isDarkTheme() ? 'vs-dark' : 'vs'
}

/**
 * Get custom theme name based on current theme
 * @returns {string} Custom theme name
 */
export function getCustomTheme() {
  return isDarkTheme() ? 'custom-dark' : 'custom-light'
}

/**
 * Add system theme change listener
 * @param {Function} callback - Callback function to execute when system theme changes
 * @returns {Function} Function to remove the listener
 */
export function addSystemThemeListener(callback) {
  if (!window.matchMedia) {
    return () => {} // Return empty function if matchMedia is not supported
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const handleChange = (e) => {
    const newTheme = e.matches ? 'dark' : 'light'
    callback(newTheme)
  }

  // Add listener for modern browsers
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }
  // Fallback for older browsers
  else if (mediaQuery.addListener) {
    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }

  return () => {}
}
