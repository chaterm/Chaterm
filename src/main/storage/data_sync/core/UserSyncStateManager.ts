/**
 * 用户同步状态管理器
 * 负责管理不同用户的同步设置和状态
 */

import { logger } from '../utils/logger'

export interface UserSyncState {
  userId: number
  enabled: boolean
  lastSyncTime?: string
  lastSyncVersion?: number
  syncStatus: 'idle' | 'running' | 'error' | 'disabled'
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export class UserSyncStateManager {
  private userStates: Map<number, UserSyncState> = new Map()
  private readonly storageKey = 'user_sync_states'

  constructor() {
    this.loadUserStates()
  }

  /**
   * 获取用户的同步状态
   */
  getUserSyncState(userId: number): UserSyncState | null {
    return this.userStates.get(userId) || null
  }

  /**
   * 设置用户的同步状态
   */
  setUserSyncState(userId: number, state: Partial<UserSyncState>): void {
    const existingState = this.userStates.get(userId)
    const now = new Date().toISOString()

    const newState: UserSyncState = {
      userId,
      enabled: state.enabled ?? existingState?.enabled ?? false,
      lastSyncTime: state.lastSyncTime ?? existingState?.lastSyncTime,
      lastSyncVersion: state.lastSyncVersion ?? existingState?.lastSyncVersion,
      syncStatus: state.syncStatus ?? existingState?.syncStatus ?? 'idle',
      errorMessage: state.errorMessage ?? existingState?.errorMessage,
      createdAt: existingState?.createdAt ?? now,
      updatedAt: now
    }

    this.userStates.set(userId, newState)
    this.saveUserStates()

    logger.info(`用户 ${userId} 同步状态已更新: ${newState.syncStatus}`)
  }

  /**
   * 启用用户的同步
   */
  enableUserSync(userId: number): void {
    this.setUserSyncState(userId, {
      enabled: true,
      syncStatus: 'idle'
    })
  }

  /**
   * 禁用用户的同步
   */
  disableUserSync(userId: number): void {
    this.setUserSyncState(userId, {
      enabled: false,
      syncStatus: 'disabled'
    })
  }

  /**
   * 检查用户是否启用了同步
   */
  isUserSyncEnabled(userId: number): boolean {
    const state = this.getUserSyncState(userId)
    return state?.enabled ?? false
  }

  /**
   * 更新同步状态为运行中
   */
  setSyncRunning(userId: number): void {
    this.setUserSyncState(userId, {
      syncStatus: 'running'
    })
  }

  /**
   * 更新同步状态为完成
   */
  setSyncCompleted(userId: number, lastSyncTime?: string, lastSyncVersion?: number): void {
    this.setUserSyncState(userId, {
      syncStatus: 'idle',
      lastSyncTime: lastSyncTime ?? new Date().toISOString(),
      lastSyncVersion
    })
  }

  /**
   * 更新同步状态为错误
   */
  setSyncError(userId: number, errorMessage: string): void {
    this.setUserSyncState(userId, {
      syncStatus: 'error',
      errorMessage
    })
  }

  /**
   * 清理用户的同步状态
   */
  clearUserSyncState(userId: number): void {
    this.userStates.delete(userId)
    this.saveUserStates()
    logger.info(`用户 ${userId} 的同步状态已清理`)
  }

  /**
   * 获取所有用户的同步状态
   */
  getAllUserStates(): UserSyncState[] {
    return Array.from(this.userStates.values())
  }

  /**
   * 从本地存储加载用户状态
   */
  private loadUserStates(): void {
    try {
      // 这里可以从本地存储或数据库加载用户状态
      // 目前使用内存存储，可以根据需要扩展
      logger.debug('用户同步状态管理器已初始化')
    } catch (error) {
      logger.error('加载用户同步状态失败:', error)
    }
  }

  /**
   * 保存用户状态到本地存储
   */
  private saveUserStates(): void {
    try {
      // 这里可以保存到本地存储或数据库
      // 目前使用内存存储，可以根据需要扩展
      logger.debug('用户同步状态已保存')
    } catch (error) {
      logger.error('保存用户同步状态失败:', error)
    }
  }
}
