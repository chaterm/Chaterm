import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as k8sApi from '@/api/k8s'

const logger = createRendererLogger('store.k8s')

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
      logger.info('Already initialized')
      return
    }

    loading.value = true
    error.value = null

    try {
      logger.info('Initializing...')
      const result = await k8sApi.initialize()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        initialized.value = true
        logger.info('Initialized with contexts', { count: result.data.length })
      } else {
        error.value = result.error || 'Failed to initialize'
        logger.warn('Initialization failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Initialization error', { error: err })
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
      logger.info('Loading contexts...')
      const result = await k8sApi.getContexts()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        logger.info('Loaded contexts', { count: result.data.length })
      } else {
        error.value = result.error || 'Failed to load contexts'
        logger.warn('Load failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Load error', { error: err })
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
      logger.info('Switching to context', { context: contextName })
      const result = await k8sApi.switchContext(contextName)

      if (result.success) {
        currentContext.value = result.currentContext || contextName
        // Update isActive flag
        contexts.value.forEach((ctx) => {
          ctx.isActive = ctx.name === contextName
        })
        logger.info('Switched to context', { context: contextName })
      } else {
        error.value = result.error || 'Failed to switch context'
        logger.warn('Switch failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Switch error', { error: err })
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
      logger.info('Reloading configuration...')
      const result = await k8sApi.reloadConfig()

      if (result.success && result.data) {
        contexts.value = result.data
        currentContext.value = result.currentContext || ''
        logger.info('Reloaded contexts', { count: result.data.length })
      } else {
        error.value = result.error || 'Failed to reload config'
        logger.warn('Reload failed', { error: error.value })
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Reload error', { error: err })
    } finally {
      loading.value = false
    }
  }

  /**
   * Validate a context connection
   */
  async function validateContext(contextName: string): Promise<boolean> {
    try {
      logger.info('Validating context', { context: contextName })
      const result = await k8sApi.validateContext(contextName)

      if (result.success) {
        logger.info('Context validation result', { valid: result.data })
        return result.data || false
      } else {
        logger.warn('Validation failed', { error: result.error })
        return false
      }
    } catch (err) {
      logger.error('Validation error', { error: err })
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
