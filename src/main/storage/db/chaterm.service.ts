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
  // @Get user host list
  getUserHosts(search: string): any {
    return getUserHostsLogic(this.db, search)
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
      console.error('ChatermDatabaseService.updateOrganizationAssetFavorite 错误:', error)
      throw error
    }
  }

  updateOrganizationAssetComment(organizationUuid: string, host: string, comment: string): any {
    try {
      const result = updateOrganizationAssetCommentLogic(this.db, organizationUuid, host, comment)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.updateOrganizationAssetComment 错误:', error)
      throw error
    }
  }

  // 自定义文件夹管理方法
  createCustomFolder(name: string, description?: string): any {
    try {
      const result = createCustomFolderLogic(this.db, name, description)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.createCustomFolder 错误:', error)
      throw error
    }
  }

  getCustomFolders(): any {
    try {
      const result = getCustomFoldersLogic(this.db)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getCustomFolders 错误:', error)
      throw error
    }
  }

  updateCustomFolder(folderUuid: string, name: string, description?: string): any {
    try {
      const result = updateCustomFolderLogic(this.db, folderUuid, name, description)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.updateCustomFolder 错误:', error)
      throw error
    }
  }

  deleteCustomFolder(folderUuid: string): any {
    try {
      const result = deleteCustomFolderLogic(this.db, folderUuid)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.deleteCustomFolder 错误:', error)
      throw error
    }
  }

  moveAssetToFolder(folderUuid: string, organizationUuid: string, assetHost: string): any {
    try {
      const result = moveAssetToFolderLogic(this.db, folderUuid, organizationUuid, assetHost)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.moveAssetToFolder 错误:', error)
      throw error
    }
  }

  removeAssetFromFolder(folderUuid: string, organizationUuid: string, assetHost: string): any {
    try {
      const result = removeAssetFromFolderLogic(this.db, folderUuid, organizationUuid, assetHost)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.removeAssetFromFolder 错误:', error)
      throw error
    }
  }

  getAssetsInFolder(folderUuid: string): any {
    try {
      const result = getAssetsInFolderLogic(this.db, folderUuid)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getAssetsInFolder 错误:', error)
      throw error
    }
  }

  // MCP工具状态管理方法
  getMcpToolState(serverName: string, toolName: string): any {
    try {
      const result = getToolStateLogic(this.db, serverName, toolName)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getMcpToolState 错误:', error)
      throw error
    }
  }

  setMcpToolState(serverName: string, toolName: string, enabled: boolean): void {
    try {
      setToolStateLogic(this.db, serverName, toolName, enabled)
    } catch (error) {
      console.error('ChatermDatabaseService.setMcpToolState 错误:', error)
      throw error
    }
  }

  getServerMcpToolStates(serverName: string): any {
    try {
      const result = getServerToolStatesLogic(this.db, serverName)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getServerMcpToolStates 错误:', error)
      throw error
    }
  }

  getAllMcpToolStates(): Record<string, boolean> {
    try {
      const result = getAllToolStatesLogic(this.db)
      return result
    } catch (error) {
      console.error('ChatermDatabaseService.getAllMcpToolStates 错误:', error)
      throw error
    }
  }

  deleteServerMcpToolStates(serverName: string): void {
    try {
      deleteServerToolStatesLogic(this.db, serverName)
    } catch (error) {
      console.error('ChatermDatabaseService.deleteServerMcpToolStates 错误:', error)
      throw error
    }
  }

  // ==================== IndexedDB 迁移状态查询方法 ====================

  /**
   * 获取迁移状态
   */
  getMigrationStatus(dataSource: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM indexdb_migration_status WHERE data_source = ?').get(dataSource)
      return row || null
    } catch (error) {
      console.error('ChatermDatabaseService.getMigrationStatus 错误:', error)
      throw error
    }
  }

  /**
   * 获取所有迁移状态
   */
  getAllMigrationStatus(): any[] {
    try {
      const rows = this.db.prepare('SELECT * FROM indexdb_migration_status').all()
      return rows
    } catch (error) {
      console.error('ChatermDatabaseService.getAllMigrationStatus 错误:', error)
      throw error
    }
  }

  // ==================== Aliases CRUD 方法（核心业务逻辑，永久保留）====================
  // 注意：这些方法不仅用于 IndexedDB 迁移，更重要的是被正常业务逻辑使用
  // 依赖方：commandStoreService.ts 通过 IPC handler 'db:aliases:query' 和 'db:aliases:mutate' 调用
  // 迁移完成后这些方法仍需保留，作为 SQLite 数据库的标准 CRUD 接口

  /**
   * 获取所有别名
   * 用途：渲染进程通过 window.api.aliasesQuery({ action: 'getAll' }) 调用
   */
  getAliases(): any[] {
    try {
      const rows = this.db.prepare('SELECT * FROM t_aliases ORDER BY created_at DESC').all()
      return rows
    } catch (error) {
      console.error('ChatermDatabaseService.getAliases 错误:', error)
      throw error
    }
  }

  /**
   * 根据别名名称获取
   * 用途：渲染进程通过 window.api.aliasesQuery({ action: 'getByAlias', alias }) 调用
   */
  getAliasByName(alias: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM t_aliases WHERE alias = ?').get(alias)
      return row || null
    } catch (error) {
      console.error('ChatermDatabaseService.getAliasByName 错误:', error)
      throw error
    }
  }

  /**
   * 搜索别名
   * 用途：渲染进程通过 window.api.aliasesQuery({ action: 'search', searchText }) 调用
   */
  searchAliases(searchText: string): any[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM t_aliases WHERE alias LIKE ? OR command LIKE ? ORDER BY created_at DESC')
        .all(`%${searchText}%`, `%${searchText}%`)
      return rows
    } catch (error) {
      console.error('ChatermDatabaseService.searchAliases 错误:', error)
      throw error
    }
  }

  /**
   * 保存别名
   * 用途：渲染进程通过 window.api.aliasesMutate({ action: 'save', data }) 调用
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
      console.error('ChatermDatabaseService.saveAlias 错误:', error)
      throw error
    }
  }

  /**
   * 删除别名
   * 用途：渲染进程通过 window.api.aliasesMutate({ action: 'delete', alias }) 调用
   */
  deleteAlias(alias: string): void {
    try {
      this.db.prepare('DELETE FROM t_aliases WHERE alias = ?').run(alias)
    } catch (error) {
      console.error('ChatermDatabaseService.deleteAlias 错误:', error)
      throw error
    }
  }

  // ==================== Key-Value Store CRUD 方法（核心业务逻辑，永久保留）====================
  // 注意：这些方法不仅用于 IndexedDB 迁移，更重要的是被正常业务逻辑使用
  // 依赖方：userConfigStoreService.ts 和 key-storage.ts 通过 IPC handler 'db:kv:get' 和 'db:kv:mutate' 调用
  // 迁移完成后这些方法仍需保留，作为 SQLite 数据库的标准 CRUD 接口

  /**
   * 获取键值对
   * 用途：渲染进程通过 window.api.kvGet({ key }) 调用
   */
  getKeyValue(key: string): any {
    try {
      const row = this.db.prepare('SELECT * FROM key_value_store WHERE key = ?').get(key)
      return row || null
    } catch (error) {
      console.error('ChatermDatabaseService.getKeyValue 错误:', error)
      throw error
    }
  }

  /**
   * 获取所有键
   * 用途：渲染进程通过 window.api.kvGet() (不传 key 参数) 调用
   */
  getAllKeys(): string[] {
    try {
      const rows = this.db.prepare('SELECT key FROM key_value_store').all() as Array<{ key: string }>
      return rows.map((row) => row.key)
    } catch (error) {
      console.error('ChatermDatabaseService.getAllKeys 错误:', error)
      throw error
    }
  }

  /**
   * 设置键值对
   * 用途：渲染进程通过 window.api.kvMutate({ action: 'set', key, value }) 调用
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
      console.error('ChatermDatabaseService.setKeyValue 错误:', error)
      throw error
    }
  }

  /**
   * 删除键值对
   * 用途：渲染进程通过 window.api.kvMutate({ action: 'delete', key }) 调用
   */
  deleteKeyValue(key: string): void {
    try {
      this.db.prepare('DELETE FROM key_value_store WHERE key = ?').run(key)
    } catch (error) {
      console.error('ChatermDatabaseService.deleteKeyValue 错误:', error)
      throw error
    }
  }
}
