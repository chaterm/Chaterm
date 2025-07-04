import { ref, watch } from 'vue'
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

watch(
  () => componentInstances.value.length,
  (len) => {
    if (len == 0) isGlobalInput.value = false
  },
  { deep: true }
)

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
    } else {
      console.warn(`无法注销，未找到 key "${key}"`)
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
