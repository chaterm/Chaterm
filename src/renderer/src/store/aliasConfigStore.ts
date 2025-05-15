import { defineStore } from 'pinia'
import { commandStore } from '@/services/commandStoreService'

export const aliasConfigStore = defineStore('aliasConfig', {
  state: () => ({
    // 以 Map 形式存储别名，key 是别名名称，value 是命令
    aliasMap: new Map(),
    // 存储所有别名列表，用于显示和其他操作
    loading: false,
    initialized: false
  }),

  getters: {
    // 检查别名是否存在
    hasAlias: (state) => (name) => {
      return state.aliasMap.has(name)
    },

    // 根据别名名称获取命令
    getCommand: (state) => (name) => {
      return state.aliasMap.get(name) || null
    }
  },

  actions: {
    // 初始化 store，从 IndexedDB 加载数据
    async initialize() {
      if (this.initialized) return

      this.loading = true
      try {
        await this.refreshAliasesFromDB()
        this.initialized = true
      } catch (error) {
        console.error('Failed to initialize alias store:', error)
      } finally {
        this.loading = false
      }
    },

    // 从 IndexedDB 刷新别名数据到 Pinia
    async refreshAliasesFromDB() {
      try {
        const aliases = await commandStore.getAll()

        // 清空现有数据
        this.aliasMap.clear()

        // 重新填充数据
        aliases.forEach((alias) => {
          this.aliasMap.set(alias.alias || alias.key, alias.command)
        })
      } catch (error) {
        console.error('Failed to refresh aliases from DB:', error)
        throw error
      }
    },

    // 执行命令（如果是别名则返回实际命令，否则返回原命令）
    resolveCommand(input) {
      return this.aliasMap.get(input) || input
    }
  }
})
