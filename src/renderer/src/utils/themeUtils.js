// Theme utility functions for consistent theme detection across components

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

  // Fallback: check localStorage and determine actual theme
  const savedTheme = localStorage.getItem('theme') || 'auto'
  if (savedTheme === 'auto') {
    const hour = new Date().getHours()
    // Use light theme from 7:00 AM to 7:00 PM (19:00), dark theme otherwise
    return hour >= 7 && hour < 19 ? 'light' : 'dark'
  }

  return savedTheme
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
