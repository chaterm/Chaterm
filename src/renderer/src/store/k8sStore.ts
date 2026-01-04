import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as k8sApi from '@/api/k8s'

export interface K8sContextInfo {
  name: string
  cluster: string
  namespace: string
  server: string
  isActive: boolean
}

/**
 * K8s Store for managing Kubernetes contexts and state
 */
export const useK8sStore = defineStore('k8s', () => {
  // State
  const contexts = ref<K8sContextInfo[]>([])
  const currentContext = ref<string>('')
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)
  const initialized = ref<boolean>(false)

  // Getters
  const activeContext = computed(() => {
    return contexts.value.find((ctx) => ctx.isActive)
  })

  const contextCount = computed(() => contexts.value.length)

  const hasContexts = computed(() => contexts.value.length > 0)

  // Actions

  /**
   * Initialize K8s store by loading contexts
   */
  async function initialize() {
    if (initialized.value) {
      console.log('[K8s Store] Already initialized')
      return
    }

    loading.value = true
    error.value = null

    try {
      console.log('[K8s Store] Initializing...')
      const result = await k8sApi.initialize()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        initialized.value = true
        console.log('[K8s Store] Initialized with', result.data.length, 'contexts')
      } else {
        error.value = result.error || 'Failed to initialize'
        console.warn('[K8s Store] Initialization failed:', error.value)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('[K8s Store] Initialization error:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Load or refresh contexts
   */
  async function loadContexts() {
    loading.value = true
    error.value = null

    try {
      console.log('[K8s Store] Loading contexts...')
      const result = await k8sApi.getContexts()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        console.log('[K8s Store] Loaded', result.data.length, 'contexts')
      } else {
        error.value = result.error || 'Failed to load contexts'
        console.warn('[K8s Store] Load failed:', error.value)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('[K8s Store] Load error:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Switch to a different context
   */
  async function switchContext(contextName: string) {
    loading.value = true
    error.value = null

    try {
      console.log('[K8s Store] Switching to context:', contextName)
      const result = await k8sApi.switchContext(contextName)

      if (result.success) {
        currentContext.value = result.currentContext || contextName
        // Update isActive flag
        contexts.value.forEach((ctx) => {
          ctx.isActive = ctx.name === contextName
        })
        console.log('[K8s Store] Switched to context:', contextName)
      } else {
        error.value = result.error || 'Failed to switch context'
        console.warn('[K8s Store] Switch failed:', error.value)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('[K8s Store] Switch error:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Reload configurations from file
   */
  async function reloadConfig() {
    loading.value = true
    error.value = null

    try {
      console.log('[K8s Store] Reloading configuration...')
      const result = await k8sApi.reloadConfig()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        console.log('[K8s Store] Reloaded', result.data.length, 'contexts')
      } else {
        error.value = result.error || 'Failed to reload config'
        console.warn('[K8s Store] Reload failed:', error.value)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('[K8s Store] Reload error:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Validate a context connection
   */
  async function validateContext(contextName: string): Promise<boolean> {
    try {
      console.log('[K8s Store] Validating context:', contextName)
      const result = await k8sApi.validateContext(contextName)

      if (result.success) {
        console.log('[K8s Store] Context validation result:', result.data)
        return result.data || false
      } else {
        console.warn('[K8s Store] Validation failed:', result.error)
        return false
      }
    } catch (err) {
      console.error('[K8s Store] Validation error:', err)
      return false
    }
  }

  /**
   * Clear error message
   */
  function clearError() {
    error.value = null
  }

  /**
   * Reset store to initial state
   */
  function reset() {
    contexts.value = []
    currentContext.value = ''
    loading.value = false
    error.value = null
    initialized.value = false
  }

  return {
    // State
    contexts,
    currentContext,
    loading,
    error,
    initialized,

    // Getters
    activeContext,
    contextCount,
    hasContexts,

    // Actions
    initialize,
    loadContexts,
    switchContext,
    reloadConfig,
    validateContext,
    clearError,
    reset
  }
})
