import { defineStore } from 'pinia'
import { commandStore } from '@/services/commandStoreService'

export const aliasConfigStore = defineStore('aliasConfig', {
  state: () => ({
    // Store aliases in Map format, key is alias name, value is command
    aliasMap: new Map(),
    // Store all alias list for display and other operations
    loading: false,
    initialized: false
  }),

  getters: {
    // Check if alias exists
    hasAlias: (state) => (name) => {
      return state.aliasMap.has(name)
    },

    // Get command by alias name
    getCommand: (state) => (name) => {
      return state.aliasMap.get(name) || null
    }
  },

  actions: {
    // Initialize store, load data from IndexedDB
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

    // Refresh alias data from IndexedDB to Pinia
    async refreshAliasesFromDB() {
      try {
        const aliases = await commandStore.getAll()

        // Clear existing data
        this.aliasMap.clear()

        // Refill data
        aliases.forEach((alias) => {
          this.aliasMap.set(alias.alias, alias.command)
        })
      } catch (error) {
        console.error('Failed to refresh aliases from DB:', error)
        throw error
      }
    },

    // Execute command (if it's an alias, return the actual command, otherwise return the original command)
    resolveCommand(input) {
      return this.aliasMap.get(input) || input
    }
  }
})
