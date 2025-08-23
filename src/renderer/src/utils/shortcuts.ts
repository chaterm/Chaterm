import { ref } from 'vue'

// Get current platform
const platform = ref<string>('')

// Initialize platform information
const initPlatform = async () => {
  if (platform.value) return platform.value

  try {
    const api = window.api as any
    platform.value = await api.getPlatform()
  } catch (error) {
    console.error('Failed to get platform:', error)
    // Fallback detection
    platform.value = navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32'
  }
  return platform.value
}

// Get copy shortcut
export const getCopyShortcut = async (): Promise<string> => {
  const currentPlatform = await initPlatform()

  switch (currentPlatform) {
    case 'darwin':
      return '⌘C'
    case 'win32':
    case 'linux':
    default:
      return 'Ctrl+C'
  }
}

// Get paste shortcut
export const getPasteShortcut = async (): Promise<string> => {
  const currentPlatform = await initPlatform()

  switch (currentPlatform) {
    case 'darwin':
      return '⌘V'
    case 'win32':
    case 'linux':
    default:
      return 'Ctrl+V'
  }
}

// Get shortcut combination (for display)
export const getShortcutDisplay = async (action: 'copy' | 'paste'): Promise<string> => {
  const currentPlatform = await initPlatform()

  switch (action) {
    case 'copy':
      return currentPlatform === 'darwin' ? '⌘C' : 'Ctrl+C'
    case 'paste':
      return currentPlatform === 'darwin' ? '⌘V' : 'Ctrl+V'
    default:
      return ''
  }
}

// Get close shortcut
export const getCloseShortcut = async (): Promise<string> => {
  const currentPlatform = await initPlatform()

  switch (currentPlatform) {
    case 'darwin':
      return '⌘D'
    case 'win32':
    case 'linux':
    default:
      return 'Ctrl+D'
  }
}

// Get search shortcut
export const getSearchShortcut = async (): Promise<string> => {
  const currentPlatform = await initPlatform()

  switch (currentPlatform) {
    case 'darwin':
      return '⌘F'
    case 'win32':
    case 'linux':
    default:
      return 'Ctrl+F'
  }
}
