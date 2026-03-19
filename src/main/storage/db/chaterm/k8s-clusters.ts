//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
const logger = createLogger('db')

/**
 * K8S Cluster interface
 */
export interface K8sClusterRecord {
  id: string
  name: string
  kubeconfig_path: string | null
  kubeconfig_content: string | null
  context_name: string
  server_url: string
  auth_type: string
  is_active: number
  connection_status: string
  auto_connect: number
  default_namespace: string
  created_at: string
  updated_at: string
}

/**
 * K8S Terminal Session interface
 */
export interface K8sTerminalSessionRecord {
  id: string
  cluster_id: string
  name: string | null
  namespace: string
  created_at: string
  updated_at: string
}

/**
 * List all saved K8S clusters
 */
export function listK8sClustersLogic(db: Database.Database): K8sClusterRecord[] {
  try {
    const stmt = db.prepare(`
      SELECT id, name, kubeconfig_path, kubeconfig_content, context_name, server_url,
             auth_type, is_active, connection_status, auto_connect, default_namespace,
             created_at, updated_at
      FROM k8s_clusters
      ORDER BY created_at DESC
    `)
    return stmt.all() as K8sClusterRecord[]
  } catch (error) {
    logger.error('Failed to list K8S clusters', { error: error })
    throw error
  }
}

/**
 * Get a single K8S cluster by ID
 */
export function getK8sClusterLogic(db: Database.Database, id: string): K8sClusterRecord | null {
  try {
    const stmt = db.prepare(`
      SELECT id, name, kubeconfig_path, kubeconfig_content, context_name, server_url,
             auth_type, is_active, connection_status, auto_connect, default_namespace,
             created_at, updated_at
      FROM k8s_clusters
      WHERE id = ?
    `)
    return (stmt.get(id) as K8sClusterRecord) || null
  } catch (error) {
    logger.error('Failed to get K8S cluster', { error: error })
    throw error
  }
}

/**
 * Add a new K8S cluster
 */
export function addK8sClusterLogic(
  db: Database.Database,
  params: {
    name: string
    kubeconfigPath?: string
    kubeconfigContent?: string
    contextName: string
    serverUrl: string
    authType?: string
    autoConnect?: boolean
    defaultNamespace?: string
  }
): { success: boolean; id?: string; error?: string } {
  try {
    const id = randomUUID()
    const stmt = db.prepare(`
      INSERT INTO k8s_clusters (
        id, name, kubeconfig_path, kubeconfig_content, context_name, server_url,
        auth_type, is_active, connection_status, auto_connect, default_namespace
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'disconnected', ?, ?)
    `)

    stmt.run(
      id,
      params.name,
      params.kubeconfigPath || null,
      params.kubeconfigContent || null,
      params.contextName,
      params.serverUrl,
      params.authType || 'kubeconfig',
      params.autoConnect ? 1 : 0,
      params.defaultNamespace || 'default'
    )

    logger.info('K8S cluster added', { id, name: params.name })
    return { success: true, id }
  } catch (error) {
    logger.error('Failed to add K8S cluster', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Update an existing K8S cluster
 */
export function updateK8sClusterLogic(
  db: Database.Database,
  id: string,
  params: {
    name?: string
    kubeconfigPath?: string
    kubeconfigContent?: string
    contextName?: string
    serverUrl?: string
    authType?: string
    isActive?: boolean
    connectionStatus?: string
    autoConnect?: boolean
    defaultNamespace?: string
  }
): { success: boolean; error?: string } {
  try {
    const updates: string[] = []
    const values: (string | number | null)[] = []

    if (params.name !== undefined) {
      updates.push('name = ?')
      values.push(params.name)
    }
    if (params.kubeconfigPath !== undefined) {
      updates.push('kubeconfig_path = ?')
      values.push(params.kubeconfigPath || null)
    }
    if (params.kubeconfigContent !== undefined) {
      updates.push('kubeconfig_content = ?')
      values.push(params.kubeconfigContent || null)
    }
    if (params.contextName !== undefined) {
      updates.push('context_name = ?')
      values.push(params.contextName)
    }
    if (params.serverUrl !== undefined) {
      updates.push('server_url = ?')
      values.push(params.serverUrl)
    }
    if (params.authType !== undefined) {
      updates.push('auth_type = ?')
      values.push(params.authType)
    }
    if (params.isActive !== undefined) {
      updates.push('is_active = ?')
      values.push(params.isActive ? 1 : 0)
    }
    if (params.connectionStatus !== undefined) {
      updates.push('connection_status = ?')
      values.push(params.connectionStatus)
    }
    if (params.autoConnect !== undefined) {
      updates.push('auto_connect = ?')
      values.push(params.autoConnect ? 1 : 0)
    }
    if (params.defaultNamespace !== undefined) {
      updates.push('default_namespace = ?')
      values.push(params.defaultNamespace)
    }

    if (updates.length === 0) {
      return { success: true }
    }

    updates.push("updated_at = datetime('now')")
    values.push(id)

    const sql = `UPDATE k8s_clusters SET ${updates.join(', ')} WHERE id = ?`
    const stmt = db.prepare(sql)
    const result = stmt.run(...values)

    if (result.changes > 0) {
      logger.info('K8S cluster updated', { id })
      return { success: true }
    }

    return { success: false, error: 'Cluster not found' }
  } catch (error) {
    logger.error('Failed to update K8S cluster', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Remove a K8S cluster
 */
export function removeK8sClusterLogic(db: Database.Database, id: string): { success: boolean; error?: string } {
  try {
    const stmt = db.prepare('DELETE FROM k8s_clusters WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes > 0) {
      logger.info('K8S cluster removed', { id })
      return { success: true }
    }

    return { success: false, error: 'Cluster not found' }
  } catch (error) {
    logger.error('Failed to remove K8S cluster', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Set active cluster (only one can be active at a time)
 */
export function setActiveK8sClusterLogic(db: Database.Database, id: string): { success: boolean; error?: string } {
  try {
    db.transaction(() => {
      // Deactivate all clusters
      db.prepare('UPDATE k8s_clusters SET is_active = 0').run()
      // Activate the specified cluster
      db.prepare('UPDATE k8s_clusters SET is_active = 1 WHERE id = ?').run(id)
    })()

    logger.info('K8S active cluster set', { id })
    return { success: true }
  } catch (error) {
    logger.error('Failed to set active K8S cluster', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Update cluster connection status
 */
export function updateK8sClusterStatusLogic(
  db: Database.Database,
  id: string,
  status: 'connected' | 'disconnected' | 'error'
): { success: boolean; error?: string } {
  try {
    const stmt = db.prepare(`
      UPDATE k8s_clusters
      SET connection_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
    const result = stmt.run(status, id)

    if (result.changes > 0) {
      return { success: true }
    }

    return { success: false, error: 'Cluster not found' }
  } catch (error) {
    logger.error('Failed to update K8S cluster status', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * List terminal sessions for a cluster
 */
export function listK8sTerminalSessionsLogic(db: Database.Database, clusterId: string): K8sTerminalSessionRecord[] {
  try {
    const stmt = db.prepare(`
      SELECT id, cluster_id, name, namespace, created_at, updated_at
      FROM k8s_terminal_sessions
      WHERE cluster_id = ?
      ORDER BY created_at DESC
    `)
    return stmt.all(clusterId) as K8sTerminalSessionRecord[]
  } catch (error) {
    logger.error('Failed to list K8S terminal sessions', { error: error })
    throw error
  }
}

/**
 * Add a terminal session
 */
export function addK8sTerminalSessionLogic(
  db: Database.Database,
  params: {
    clusterId: string
    name?: string
    namespace?: string
  }
): { success: boolean; id?: string; error?: string } {
  try {
    const id = randomUUID()
    const stmt = db.prepare(`
      INSERT INTO k8s_terminal_sessions (id, cluster_id, name, namespace)
      VALUES (?, ?, ?, ?)
    `)

    stmt.run(id, params.clusterId, params.name || null, params.namespace || 'default')

    logger.info('K8S terminal session added', { id, clusterId: params.clusterId })
    return { success: true, id }
  } catch (error) {
    logger.error('Failed to add K8S terminal session', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Remove a terminal session
 */
export function removeK8sTerminalSessionLogic(db: Database.Database, id: string): { success: boolean; error?: string } {
  try {
    const stmt = db.prepare('DELETE FROM k8s_terminal_sessions WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes > 0) {
      logger.info('K8S terminal session removed', { id })
      return { success: true }
    }

    return { success: false, error: 'Session not found' }
  } catch (error) {
    logger.error('Failed to remove K8S terminal session', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Remove all terminal sessions for a cluster
 */
export function removeAllK8sTerminalSessionsLogic(db: Database.Database, clusterId: string): { success: boolean; error?: string } {
  try {
    const stmt = db.prepare('DELETE FROM k8s_terminal_sessions WHERE cluster_id = ?')
    stmt.run(clusterId)

    logger.info('All K8S terminal sessions removed for cluster', { clusterId })
    return { success: true }
  } catch (error) {
    logger.error('Failed to remove K8S terminal sessions', { error: error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
