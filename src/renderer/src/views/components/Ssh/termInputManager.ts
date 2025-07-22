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

// 初始化快捷命令状态
const initQuickCommandState = async () => {
  try {
    const config = await userConfigStore.getConfig()
    isShowQuickCommand.value = config.quickComand || false
  } catch (error) {
    console.error('Failed to load quick command state:', error)
  }
}

// 保存快捷命令状态
const saveQuickCommandState = async (enabled: boolean) => {
  try {
    await userConfigStore.saveConfig({ quickComand: enabled })
  } catch (error) {
    console.error('Failed to save quick command state:', error)
  }
}

// 初始化状态
initQuickCommandState()

// 监听快捷命令状态变化并保存
watch(isShowQuickCommand, (newValue) => {
  saveQuickCommandState(newValue)
})

export const isShowCommandBar = ref(false)
// 激活状态管理
export const activeTermId = ref<string>('')
export const activeTermOndata = ref<any>(null)

// commandBar高度管理
export const commandBarHeight = ref<number>(0)
export const commandBarVisible = ref<boolean>(false)

// 默认高度配置
const DEFAULT_COMMAND_BAR_HEIGHT = 30
const DEFAULT_GLOBAL_INPUT_HEIGHT = 30

watch(
  () => componentInstances.value.length,
  (len) => {
    if (len == 0) {
      isShowCommandBar.value = false

      activeTermId.value = ''
      activeTermOndata.value = null
      // 重置commandBar状态
      commandBarVisible.value = false
    }
  },
  { deep: true }
)

// 监听commandBar显示状态变化
watch([isGlobalInput, isShowQuickCommand], ([globalInput, quickCommand]) => {
  updateCommandBarHeight(globalInput, quickCommand)
})

// 更新commandBar高度
const updateCommandBarHeight = (globalInput: boolean, quickCommand: boolean) => {
  if (globalInput || quickCommand) {
    commandBarVisible.value = true
    if (globalInput && quickCommand) {
      // 同时显示全局输入和快速命令栏
      commandBarHeight.value = DEFAULT_COMMAND_BAR_HEIGHT + DEFAULT_GLOBAL_INPUT_HEIGHT
    } else if (globalInput) {
      // 只显示全局输入
      commandBarHeight.value = DEFAULT_GLOBAL_INPUT_HEIGHT
    } else if (quickCommand) {
      // 只显示快速命令栏
      commandBarHeight.value = DEFAULT_COMMAND_BAR_HEIGHT
    }
  } else {
    commandBarVisible.value = false
    commandBarHeight.value = 0
  }
}

export const inputManager = {
  /**
   * 注册全局实例-用于全局批量输入
   * @param {Target} target
   * @param {string} key
   */
  registerInstances(target: Target, key) {
    const exists = componentInstances.value.find((item) => item.key === key)
    if (!exists) {
      componentInstances.value.push({ target, key })
      // 如果是第一个注册的实例，自动设为激活状态
      this.setActiveTerm(key)
    } else {
      console.warn(`key "${key}" 已存在，跳过注册`)
    }
  },
  /**
   * 注销全局实例
   * @param {string} key
   */
  unregisterInstances(key) {
    const index = componentInstances.value.findIndex((item) => item.key === key)
    if (index !== -1) {
      componentInstances.value.splice(index, 1)
      // 如果注销的是当前激活的term，需要重新设置激活状态
      if (activeTermId.value === key) {
        this.updateActiveTerm()
      }
    } else {
      console.warn(`无法注销，未找到 key "${key}"`)
    }
  },
  /**
   * 设置激活的term
   * @param {string} key - term的key
   */
  setActiveTerm(key: string) {
    const instance = componentInstances.value.find((item) => item.key === key)
    if (instance) {
      activeTermId.value = key
      activeTermOndata.value = instance.target.termOndata
    } else {
      console.warn(`设置失败，未找到 key "${key}"`)
    }
  },
  /**
   * 更新激活状态（当激活的term被注销时调用）
   */
  updateActiveTerm() {
    if (componentInstances.value.length > 0) {
      // 选择最后一个注册的实例作为激活实例
      const lastInstance = componentInstances.value[componentInstances.value.length - 1]
      this.setActiveTerm(lastInstance.key)
    } else {
      // 没有实例时清空激活状态
      activeTermId.value = ''
      activeTermOndata.value = null
    }
  },
  /**
   * 获取当前激活的term信息
   * @returns {Object} 包含id和termOndata的对象
   */
  getActiveTerm() {
    return {
      id: activeTermId.value,
      termOndata: activeTermOndata.value
    }
  },
  /**
   * 向激活的term发送数据
   * @param {string} data - 要发送的数据
   */
  sendToActiveTerm(data: string) {
    if (activeTermOndata.value && typeof activeTermOndata.value === 'function') {
      activeTermOndata.value(data)
    } else {
      console.warn('没有激活的term或termOndata不可用')
    }
  },
  /**
   * 注册同步输入
   * @param {Target} target
   * @param {string} key
   */
  registerSyncInput(key) {
    const exists = componentInstances.value.find((item) => item.key === key)
    if (exists) exists.target.syncInput = true
  },

  /**
   * 注销同步输入
   * @param {string} key
   */
  unregisterSyncInput(key) {
    const exists = componentInstances.value.find((item) => item.key === key)
    if (exists) exists.target.syncInput = false
  },
  /**
   * 向所有目标发送信息
   * @param {string} data - 要发送的数据
   */
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
  /**
   * 同步输入发送信息
   * @param {string} excludeKey - 要排除的 key
   * @param {string} data - 要发送的数据
   */
  sendToOthers(excludeKey, data) {
    componentInstances.value.forEach(({ target, key }) => {
      if (key === excludeKey) return
      if (typeof target.termOndata === 'function' && target.syncInput) {
        target.termOndata(data)
      }
    })
  }
}
