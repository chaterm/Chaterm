import { ref, watch } from 'vue'
import { userConfigStore } from '@/services/userConfigStoreService'
interface Target {
  termOndata?: any
  syncInput?: boolean
}
interface ComponentEntry {
  key: string
  target: Target
}

export const componentInstances = ref<ComponentEntry[]>([])
export const isGlobalInput = ref(false)
export const isShowQuickCommand = ref(false)

const initQuickCommandState = async () => {
  try {
    const config = await userConfigStore.getConfig()
    isShowQuickCommand.value = config.quickComand || false
  } catch (error) {
    console.error('Failed to load quick command state:', error)
  }
}

const saveQuickCommandState = async (enabled: boolean) => {
  try {
    await userConfigStore.saveConfig({ quickComand: enabled })
  } catch (error) {
    console.error('Failed to save quick command state:', error)
  }
}

initQuickCommandState()

watch(isShowQuickCommand, (newValue) => {
  saveQuickCommandState(newValue)
})

export const isShowCommandBar = ref(false)
export const activeTermId = ref<string>('')
export const activeTermOndata = ref<any>(null)
export const commandBarHeight = ref<number>(0)
export const commandBarVisible = ref<boolean>(false)
const DEFAULT_COMMAND_BAR_HEIGHT = 30
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

watch([isGlobalInput, isShowQuickCommand], ([globalInput, quickCommand]) => {
  updateCommandBarHeight(globalInput, quickCommand)
})

const updateCommandBarHeight = (globalInput: boolean, quickCommand: boolean) => {
  if (globalInput || quickCommand) {
    commandBarVisible.value = true
    if (globalInput && quickCommand) {
      commandBarHeight.value = DEFAULT_COMMAND_BAR_HEIGHT + DEFAULT_GLOBAL_INPUT_HEIGHT
    } else if (globalInput) {
      commandBarHeight.value = DEFAULT_GLOBAL_INPUT_HEIGHT
    } else if (quickCommand) {
      commandBarHeight.value = DEFAULT_COMMAND_BAR_HEIGHT
    }
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
      console.warn(`key "${key}" 已存在，跳过注册`)
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
      console.warn(`无法注销，未找到 key "${key}"`)
    }
  },

  setActiveTerm(key: string) {
    const instance = componentInstances.value.find((item) => item.key === key)
    if (instance) {
      activeTermId.value = key
      activeTermOndata.value = instance.target.termOndata
    } else {
      console.warn(`设置失败，未找到 key "${key}"`)
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
      console.warn('没有激活的term或termOndata不可用')
    }
  },
  
  registerSyncInput(key) {
    const exists = componentInstances.value.find((item) => item.key === key)
    if (exists) exists.target.syncInput = true
  },

  unregisterSyncInput(key) {
    const exists = componentInstances.value.find((item) => item.key === key)
    if (exists) exists.target.syncInput = false
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
  },
  
  sendToOthers(excludeKey, data) {
    componentInstances.value.forEach(({ target, key }) => {
      if (key === excludeKey) return
      if (typeof target.termOndata === 'function' && target.syncInput) {
        target.termOndata(data)
      }
    })
  }
}
