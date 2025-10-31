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
}
