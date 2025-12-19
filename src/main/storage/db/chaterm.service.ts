import Database from 'better-sqlite3'
import { initChatermDatabase, getCurrentUserId } from './connection'
import {
  getLocalAssetRouteLogic,
  updateLocalAssetLabelLogic,
  updateLocalAsseFavoriteLogic,
  getAssetGroupLogic,
  createAssetLogic,
  createOrUpdateAssetLogic,
  deleteAssetLogic,
  updateAssetLogic,
  connectAssetInfoLogic,
  getUserHostsLogic,
  refreshOrganizationAssetsLogic,
  updateOrganizationAssetFavoriteLogic,
  updateOrganizationAssetCommentLogic,
  createCustomFolderLogic,
  getCustomFoldersLogic,
  updateCustomFolderLogic,
  deleteCustomFolderLogic,
  moveAssetToFolderLogic,
  removeAssetFromFolderLogic,
  getAssetsInFolderLogic
} from './chaterm/assets'
import {
  deleteChatermHistoryByTaskIdLogic,
  getApiConversationHistoryLogic,
  saveApiConversationHistoryLogic,
  getSavedChatermMessagesLogic,
  saveChatermMessagesLogic,
  getTaskMetadataLogic,
  saveTaskMetadataLogic,
  getContextHistoryLogic,
  saveContextHistoryLogic
} from './chaterm/agent'
import {
  getKeyChainSelectLogic,
  createKeyChainLogic,
  deleteKeyChainLogic,
  getKeyChainInfoLogic,
  updateKeyChainLogic,
  getKeyChainListLogic
} from './chaterm/keychains'
import { userSnippetOperationLogic } from './chaterm/snippets'
import {
  getToolStateLogic,
  setToolStateLogic,
  getServerToolStatesLogic,
  getAllToolStatesLogic,
  deleteServerToolStatesLogic
} from './chaterm/mcp-tool-state'

export class ChatermDatabaseService {
  private static instances: Map<number, ChatermDatabaseService> = new Map()
  private db: Database.Database
  private userId: number

  private constructor(db: Database.Database, userId: number) {
    this.db = db
    this.userId = userId
  }

  public static async getInstance(userId?: number): Promise<ChatermDatabaseService> {
    const targetUserId = userId || getCurrentUserId()
    if (!targetUserId) {
      throw new Error('User ID is required for ChatermDatabaseService')
    }

    if (!ChatermDatabaseService.instances.has(targetUserId)) {
      console.log(`Creating new ChatermDatabaseService instance for user ${targetUserId}`)
      const db = await initChatermDatabase(targetUserId)
      const instance = new ChatermDatabaseService(db, targetUserId)
      ChatermDatabaseService.instances.set(targetUserId, instance)
    }
    return ChatermDatabaseService.instances.get(targetUserId)!
  }

  public getUserId(): number {
    return this.userId
  }

  async getLocalAssetRoute(searchType: string, params: any[] = []): Promise<any> {
    return await getLocalAssetRouteLogic(this.db, searchType, params)
  }

  updateLocalAssetLabel(uuid: string, label: string): any {
    return updateLocalAssetLabelLogic(this.db, uuid, label)
  }

  updateLocalAsseFavorite(uuid: string, status: number): any {
    return updateLocalAsseFavoriteLogic(this.db, uuid, status)
  }

  getAssetGroup(): any {
    return getAssetGroupLogic(this.db)
  }

  // Get keychain options
  getKeyChainSelect(): any {
    return getKeyChainSelectLogic(this.db)
  }
  createKeyChain(params: any): any {
    return createKeyChainLogic(this.db, params)
  }

  deleteKeyChain(id: number): any {
    return deleteKeyChainLogic(this.db, id)
  }
  getKeyChainInfo(id: number): any {
    return getKeyChainInfoLogic(this.db, id)
  }
  updateKeyChain(params: any): any {
    return updateKeyChainLogic(this.db, params)
  }

  createAsset(params: any): any {
    return createAssetLogic(this.db, params)
  }

  createOrUpdateAsset(params: any): any {
    return createOrUpdateAssetLogic(this.db, params)
  }

  deleteAsset(uuid: string): any {
    return deleteAssetLogic(this.db, uuid)
  }

  updateAsset(params: any): any {
    return updateAssetLogic(this.db, params)
  }

  getKeyChainList(): any {
    return getKeyChainListLogic(this.db)
  }
  connectAssetInfo(uuid: string): any {
    return connectAssetInfoLogic(this.db, uuid)
  }
  // @Get user host list (limited)
  getUserHosts(search: string, limit: number = 50): any {
    return getUserHostsLogic(this.db, search, limit)
  }

  // Transaction handling
  transaction(fn: () => void): any {
    return this.db.transaction(fn)()
  }

  // Agent API conversation history related methods

  async deleteChatermHistoryByTaskId(taskId: string): Promise<void> {
    return deleteChatermHistoryByTaskIdLogic(this.db, taskId)
  }

  async getApiConversationHistory(taskId: string): Promise<any[]> {
    return getApiConversationHistoryLogic(this.db, taskId)
  }

  async saveApiConversationHistory(taskId: string, apiConversationHistory: any[]): Promise<void> {
    return saveApiConversationHistoryLogic(this.db, taskId, apiConversationHistory)
  }

  // Agent UI message related methods
  async getSavedChatermMessages(taskId: string): Promise<any[]> {
    return getSavedChatermMessagesLogic(this.db, taskId)
  }

  async saveChatermMessages(taskId: string, uiMessages: any[]): Promise<void> {
    return saveChatermMessagesLogic(this.db, taskId, uiMessages)
  }

  // Agent task metadata related methods
  async getTaskMetadata(taskId: string): Promise<any> {
    return getTaskMetadataLogic(this.db, taskId)
  }

  async saveTaskMetadata(taskId: string, metadata: any): Promise<void> {
    return saveTaskMetadataLogic(this.db, taskId, metadata)
  }

  // Agent context history related methods
  async getContextHistory(taskId: string): Promise<any> {
    return getContextHistoryLogic(this.db, taskId)
  }

  async saveContextHistory(taskId: string, contextHistory: any): Promise<void> {
    return saveContextHistoryLogic(this.db, taskId, contextHistory)
  }
  // Shortcut command related methods
  userSnippetOperation(operation: 'list' | 'create' | 'delete' | 'update' | 'swap', params?: any): any {
    return userSnippetOperationLogic(this.db, operation, params)
  }

  async refreshOrganizationAssets(organizationUuid: string, jumpServerConfig: any): Promise<any> {
    return await refreshOrganizationAssetsLogic(this.db, organizationUuid, jumpServerConfig)
  }

  async refreshOrganizationAssetsWithAuth(
    organizationUuid: string,
    jumpServerConfig: any,
    keyboardInteractiveHandler?: any,
    authResultCallback?: any
  ): Promise<any> {
    return await refreshOrganizationAssetsLogic(this.db, organizationUuid, jumpServerConfig, keyboardInteractiveHandler, authResultCallback)
  }

  updateOrganizationAssetFavorite(organizationUuid: string, host: string, status: number): any {
    try {
      const result = updateOrganizationAssetFavoriteLogic(this.db, organizationUuid, host, status)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.updateOrganizationAssetFavorite error:', error)
      throw error
    }
  }

  updateOrganizationAssetComment(organizationUuid: string, host: string, comment: string): any {
    try {
      const result = updateOrganizationAssetCommentLogic(this.db, organizationUuid, host, comment)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.updateOrganizationAssetComment error:', error)
      throw error
    }
  }

  // Custom folder management methods
  createCustomFolder(name: string, description?: string): any {
    try {
      const result = createCustomFolderLogic(this.db, name, description)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.createCustomFolder error:', error)
      throw error
    }
  }

  getCustomFolders(): any {
    try {
      const result = getCustomFoldersLogic(this.db)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getCustomFolders error:', error)
      throw error
    }
  }

  updateCustomFolder(folderUuid: string, name: string, description?: string): any {
    try {
      const result = updateCustomFolderLogic(this.db, folderUuid, name, description)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.updateCustomFolder error:', error)
      throw error
    }
  }

  deleteCustomFolder(folderUuid: string): any {
    try {
      const result = deleteCustomFolderLogic(this.db, folderUuid)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.deleteCustomFolder error:', error)
      throw error
    }
  }

  moveAssetToFolder(folderUuid: string, organizationUuid: string, assetHost: string): any {
    try {
      const result = moveAssetToFolderLogic(this.db, folderUuid, organizationUuid, assetHost)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.moveAssetToFolder error:', error)
      throw error
    }
  }

  removeAssetFromFolder(folderUuid: string, organizationUuid: string, assetHost: string): any {
    try {
      const result = removeAssetFromFolderLogic(this.db, folderUuid, organizationUuid, assetHost)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.removeAssetFromFolder error:', error)
      throw error
    }
  }

  getAssetsInFolder(folderUuid: string): any {
    try {
      const result = getAssetsInFolderLogic(this.db, folderUuid)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getAssetsInFolder error:', error)
      throw error
    }
  }

  // MCP tool state management methods
  getMcpToolState(serverName: string, toolName: string): any {
    try {
      const result = getToolStateLogic(this.db, serverName, toolName)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getMcpToolState error:', error)
      throw error
    }
  }

  setMcpToolState(serverName: string, toolName: string, enabled: boolean): void {
    try {
      setToolStateLogic(this.db, serverName, toolName, enabled)
    } catch (error) {
      console.error('ChatermDatabaseService.setMcpToolState error:', error)
      throw error
    }
  }

  getServerMcpToolStates(serverName: string): any {
    try {
      const result = getServerToolStatesLogic(this.db, serverName)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getServerMcpToolStates error:', error)
      throw error
    }
  }

  getAllMcpToolStates(): Record<string, boolean> {
    try {
      const result = getAllToolStatesLogic(this.db)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getAllMcpToolStates error:', error)
      throw error
    }
  }

  deleteServerMcpToolStates(serverName: string): void {
    try {
      deleteServerToolStatesLogic(this.db, serverName)
    } catch (error) {
      console.error('ChatermDatabaseService.deleteServerMcpToolStates error:', error)
      throw error
    }
  }

  // ==================== IndexedDB Migration Status Query Methods ====================

  /**
   * Get migration status
   */
  getMigrationStatus(dataSource: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM indexdb_migration_status WHERE data_source = ?').get(dataSource)
      return row || null
    } catch (error) {
      console.error('ChatermDatabaseService.getMigrationStatus error:', error)
      throw error
    }
  }

  /**
   * Get all migration status
   */
  getAllMigrationStatus(): any[] {
    try {
      const rows = this.db.prepare('SELECT * FROM indexdb_migration_status').all()
      return rows
    } catch (error) {
      console.error('ChatermDatabaseService.getAllMigrationStatus error:', error)
      throw error
    }
  }

  // ==================== Aliases CRUD Methods (Core Business Logic, Permanently Reserved) ====================
  // Note: These methods are not only used for IndexedDB migration, but more importantly by normal business logic
  // Dependencies: commandStoreService.ts calls via IPC handlers 'db:aliases:query' and 'db:aliases:mutate'
  // These methods should remain after migration is complete, as standard CRUD interfaces for SQLite database

  /**
   * Get all aliases
   * Usage: Renderer process calls via window.api.aliasesQuery({ action: 'getAll' })
   */
  getAliases(): any[] {
    try {
      const rows = this.db.prepare('SELECT * FROM t_aliases ORDER BY created_at DESC').all()
      return rows
    } catch (error) {
      console.error('ChatermDatabaseService.getAliases error:', error)
      throw error
    }
  }

  /**
   * Get by alias name
   * Usage: Renderer process calls via window.api.aliasesQuery({ action: 'getByAlias', alias })
   */
  getAliasByName(alias: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM t_aliases WHERE alias = ?').get(alias)
      return row || null
    } catch (error) {
      console.error('ChatermDatabaseService.getAliasByName error:', error)
      throw error
    }
  }

  /**
   * Search aliases
   * Usage: Renderer process calls via window.api.aliasesQuery({ action: 'search', searchText })
   */
  searchAliases(searchText: string): any[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM t_aliases WHERE alias LIKE ? OR command LIKE ? ORDER BY created_at DESC')
        .all(`%${searchText}%`, `%${searchText}%`)
      return rows
    } catch (error) {
      console.error('ChatermDatabaseService.searchAliases error:', error)
      throw error
    }
  }

  /**
   * Save alias
   * Usage: Renderer process calls via window.api.aliasesMutate({ action: 'save', data })
   */
  saveAlias(data: any): void {
    try {
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO t_aliases (id, alias, command, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(data.id, data.alias, data.command, data.created_at || Date.now())
    } catch (error) {
      console.error('ChatermDatabaseService.saveAlias error:', error)
      throw error
    }
  }

  /**
   * Delete alias
   * Usage: Renderer process calls via window.api.aliasesMutate({ action: 'delete', alias })
   */
  deleteAlias(alias: string): void {
    try {
      this.db.prepare('DELETE FROM t_aliases WHERE alias = ?').run(alias)
    } catch (error) {
      console.error('ChatermDatabaseService.deleteAlias error:', error)
      throw error
    }
  }

  // ==================== Key-Value Store CRUD Methods (Core Business Logic, Permanently Reserved) ====================
  // Note: These methods are not only used for IndexedDB migration, but more importantly by normal business logic
  // Dependencies: userConfigStoreService.ts and key-storage.ts call via IPC handlers 'db:kv:get' and 'db:kv:mutate'
  // These methods should remain after migration is complete, as standard CRUD interfaces for SQLite database

  /**
   * Get key-value pair
   * Usage: Renderer process calls via window.api.kvGet({ key })
   */
  getKeyValue(key: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM key_value_store WHERE key = ?').get(key)
      return row || null
    } catch (error) {
      console.error('ChatermDatabaseService.getKeyValue error:', error)
      throw error
    }
  }

  /**
   * Get all keys
   * Usage: Renderer process calls via window.api.kvGet() (without key parameter)
   */
  getAllKeys(): string[] {
    try {
      const rows = this.db.prepare('SELECT key FROM key_value_store').all() as Array<{ key: string }>
      return rows.map((row) => row.key)
    } catch (error) {
      console.error('ChatermDatabaseService.getAllKeys error:', error)
      throw error
    }
  }

  /**
   * Set key-value pair
   * Usage: Renderer process calls via window.api.kvMutate({ action: 'set', key, value })
   */
  setKeyValue(data: any): void {
    try {
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
        VALUES (?, ?, ?)
      `
        )
        .run(data.key, data.value, data.updated_at || Date.now())
    } catch (error) {
      console.error('ChatermDatabaseService.setKeyValue error:', error)
      throw error
    }
  }

  /**
   * Delete key-value pair
   * Usage: Renderer process calls via window.api.kvMutate({ action: 'delete', key })
   */
  deleteKeyValue(key: string): void {
    try {
      this.db.prepare('DELETE FROM key_value_store WHERE key = ?').run(key)
    } catch (error) {
      console.error('ChatermDatabaseService.deleteKeyValue error:', error)
      throw error
    }
  }
}
