import { ref, watch } from 'vue'

const logger = createRendererLogger('ssh.termInputManager')
interface Target {
  termOndata?: any
}
interface ComponentEntry {
  key: string
  target: Target
}

export const componentInstances = ref<ComponentEntry[]>([])
export const isGlobalInput = ref(false)

export const isShowCommandBar = ref(false)
export const activeTermId = ref<string>('')
export const activeTermOndata = ref<any>(null)
export const commandBarHeight = ref<number>(0)
export const commandBarVisible = ref<boolean>(false)
const DEFAULT_GLOBAL_INPUT_HEIGHT = 30

watch(
  () => componentInstances.value.length,
  (len) => {
    if (len == 0) {
      isShowCommandBar.value = false

      activeTermId.value = ''
      activeTermOndata.value = null
      commandBarVisible.value = false
    }
  },
  { deep: true }
)

watch(isGlobalInput, (globalInput) => {
  updateCommandBarHeight(globalInput)
})

const updateCommandBarHeight = (globalInput: boolean) => {
  if (globalInput) {
    commandBarVisible.value = true
    commandBarHeight.value = DEFAULT_GLOBAL_INPUT_HEIGHT
  } else {
    commandBarVisible.value = false
    commandBarHeight.value = 0
  }
}

export const inputManager = {
  registerInstances(target: Target, key) {
    const exists = componentInstances.value.find((item) => item.key === key)
    if (!exists) {
      componentInstances.value.push({ target, key })
      this.setActiveTerm(key)
    } else {
      logger.warn('Key already exists, skipping registration', { key })
    }
  },

  unregisterInstances(key) {
    const index = componentInstances.value.findIndex((item) => item.key === key)
    if (index !== -1) {
      componentInstances.value.splice(index, 1)
      if (activeTermId.value === key) {
        this.updateActiveTerm()
      }
    } else {
      logger.warn('Cannot unregister, key not found', { key })
    }
  },

  setActiveTerm(key: string) {
    const instance = componentInstances.value.find((item) => item.key === key)
    if (instance) {
      activeTermId.value = key
      activeTermOndata.value = instance.target.termOndata
    } else {
      logger.warn('Failed to set, key not found', { key })
    }
  },

  updateActiveTerm() {
    if (componentInstances.value.length > 0) {
      const lastInstance = componentInstances.value[componentInstances.value.length - 1]
      this.setActiveTerm(lastInstance.key)
    } else {
      activeTermId.value = ''
      activeTermOndata.value = null
    }
  },

  getActiveTerm() {
    return {
      id: activeTermId.value,
      termOndata: activeTermOndata.value
    }
  },

  sendToActiveTerm(data: string) {
    if (activeTermOndata.value && typeof activeTermOndata.value === 'function') {
      activeTermOndata.value(data)
    } else {
      logger.warn('No active term or termOndata is not available')
    }
  },

  globalSend(data) {
    if (componentInstances.value.length === 0) {
      isGlobalInput.value = false
      return
    }
    componentInstances.value.forEach(({ target }) => {
      if (typeof target.termOndata === 'function') {
        target.termOndata(data)
      }
    })
  }
}
