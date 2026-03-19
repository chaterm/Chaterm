//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Database migration to add K8S clusters and terminal sessions support.
 * Creates:
 * - k8s_clusters table for storing saved cluster configurations
 * - k8s_terminal_sessions table for tracking terminal sessions per cluster
 */
export async function upgradeK8sClustersSupport(db: Database.Database): Promise<void> {
  try {
    // Check if k8s_clusters table exists
    const clustersTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='k8s_clusters'").get()

    if (!clustersTableExists) {
      logger.info('[Migration] Creating k8s_clusters table...')

      db.exec(`
        CREATE TABLE k8s_clusters (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kubeconfig_path TEXT,
          kubeconfig_content TEXT,
          context_name TEXT NOT NULL,
          server_url TEXT NOT NULL,
          auth_type TEXT DEFAULT 'kubeconfig',
          is_active INTEGER DEFAULT 0,
          connection_status TEXT DEFAULT 'disconnected',
          auto_connect INTEGER DEFAULT 0,
          default_namespace TEXT DEFAULT 'default',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)

      // Create indexes for faster lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_k8s_clusters_context_name
        ON k8s_clusters(context_name)
      `)

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_k8s_clusters_is_active
        ON k8s_clusters(is_active)
      `)

      logger.info('[Migration] k8s_clusters table created successfully')
    } else {
      logger.info('[Migration] k8s_clusters table already exists')
    }

    // Check if k8s_terminal_sessions table exists
    const sessionsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='k8s_terminal_sessions'").get()

    if (!sessionsTableExists) {
      logger.info('[Migration] Creating k8s_terminal_sessions table...')

      db.exec(`
        CREATE TABLE k8s_terminal_sessions (
          id TEXT PRIMARY KEY,
          cluster_id TEXT NOT NULL,
          name TEXT,
          namespace TEXT DEFAULT 'default',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (cluster_id) REFERENCES k8s_clusters(id) ON DELETE CASCADE
        )
      `)

      // Create index for faster lookups by cluster_id
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_k8s_terminal_sessions_cluster_id
        ON k8s_terminal_sessions(cluster_id)
      `)

      logger.info('[Migration] k8s_terminal_sessions table created successfully')
    } else {
      logger.info('[Migration] k8s_terminal_sessions table already exists')
    }
  } catch (error) {
    logger.error('[Migration] Failed to upgrade K8S clusters support', { error: error })
    throw error
  }
}
