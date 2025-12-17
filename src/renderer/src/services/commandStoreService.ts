interface AliasItem {
  id: string
  alias: string
  command: string
  createdAt: number
}

interface AliasItemInput extends Partial<AliasItem> {
  key?: string
}

export class CommandStoreService {
  constructor() {
    // SQLite is initialized through main process, no need to initialize here
  }

  private sanitizeForStorage(item: AliasItemInput): AliasItem {
    return {
      id: item.id || `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`,
      alias: item.alias || item.key || '',
      command: item.command || '',
      createdAt: item.createdAt || Date.now()
    }
  }

  async getAll(): Promise<AliasItem[]> {
    try {
      const result = await window.api.aliasesQuery({ action: 'getAll' })
      // Convert field name: created_at → createdAt
      return result.map((item: any) => ({
        id: item.id,
        alias: item.alias,
        command: item.command,
        createdAt: item.created_at
      }))
    } catch (error) {
      console.error('Error getting aliases from SQLite:', error)
      return []
    }
  }

  async get(id: string): Promise<AliasItem | null> {
    try {
      const allItems = await this.getAll()
      return allItems.find((item) => item.id === id) || null
    } catch (error) {
      console.error('Error getting alias by id:', error)
      return null
    }
  }

  async getByAlias(aliasName: string): Promise<AliasItem | null> {
    try {
      const result = await window.api.aliasesQuery({
        action: 'getByAlias',
        alias: aliasName
      })
      if (result && result.length > 0) {
        const item = result[0]
        return {
          id: item.id,
          alias: item.alias,
          command: item.command,
          createdAt: item.created_at
        }
      }
      return null
    } catch (error) {
      console.error('Error getting alias by name:', error)
      return null
    }
  }

  async add(item: AliasItemInput): Promise<string> {
    const sanitizedItem = this.sanitizeForStorage(item)

    try {
      await window.api.aliasesMutate({
        action: 'save',
        data: {
          id: sanitizedItem.id,
          alias: sanitizedItem.alias,
          command: sanitizedItem.command,
          created_at: sanitizedItem.createdAt
        }
      })
      return sanitizedItem.alias
    } catch (error) {
      console.error('Error adding alias to SQLite:', error)
      throw new Error('Failed to add item. Alias may already exist.')
    }
  }

  async update(item: AliasItemInput): Promise<void> {
    let existingItem: AliasItem | null = null
    try {
      existingItem = await this.getByAlias(item.alias as string)
    } catch (error) {
      console.error('Error getting existing item:', error)
    }

    const updatedItem = {
      ...this.sanitizeForStorage(item),
      createdAt: existingItem?.createdAt || item.createdAt || Date.now()
    }

    try {
      await window.api.aliasesMutate({
        action: 'save',
        data: {
          id: updatedItem.id,
          alias: updatedItem.alias,
          command: updatedItem.command,
          created_at: updatedItem.createdAt
        }
      })
    } catch (error) {
      console.error('Error updating alias in SQLite:', error)
      throw new Error('Failed to update item')
    }
  }

  async deleteById(id: string): Promise<void> {
    const item = await this.get(id)
    if (!item) {
      throw new Error(`Item with id ${id} not found`)
    }

    return this.delete(item.alias)
  }

  async delete(alias: string): Promise<void> {
    try {
      await window.api.aliasesMutate({
        action: 'delete',
        alias: alias
      })
    } catch (error) {
      console.error('Error deleting alias from SQLite:', error)
      throw new Error('Failed to delete item')
    }
  }

  async clear(): Promise<void> {
    try {
      // Get all aliases and delete them one by one
      const allItems = await this.getAll()
      for (const item of allItems) {
        await this.delete(item.alias)
      }
    } catch (error) {
      console.error('Error clearing aliases from SQLite:', error)
      throw new Error('Failed to clear store')
    }
  }

  async search(searchText: string): Promise<AliasItem[]> {
    try {
      if (!searchText) {
        return this.getAll()
      }

      const result = await window.api.aliasesQuery({
        action: 'search',
        searchText: searchText
      })

      return result.map((item: any) => ({
        id: item.id,
        alias: item.alias,
        command: item.command,
        createdAt: item.created_at
      }))
    } catch (error) {
      console.error('Error searching aliases in SQLite:', error)
      return []
    }
  }

  async renameAlias(oldAlias: string, newItem: AliasItemInput): Promise<boolean> {
    try {
      const item = await this.getByAlias(oldAlias)
      if (!item) {
        return false
      }

      const updatedItem = { ...item, alias: newItem.alias, id: '' }
      await this.add(updatedItem)
      await this.delete(oldAlias)
      await this.update(newItem)

      return true
    } catch (error) {
      console.error('Error in rename alias:', error)
      return false
    }
  }
}

export const commandStore = new CommandStoreService()
