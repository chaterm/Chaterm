//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { ConnectionManager } from './connection-manager'
import { MysqlDriverAdapter } from './drivers/mysql-driver'
import { PostgresDriverAdapter } from './drivers/postgres-driver'
import { getCredentialStore } from './credential-store'
import { ChatermDatabaseService } from '../../storage/db/chaterm.service'

export { ConnectionManager } from './connection-manager'
export { getCredentialStore, createCredentialStore } from './credential-store'
export type { CredentialStore } from './credential-store'
export type { ConnectionTestResult, DatabaseDriverAdapter, ResolvedDbCredential, RuntimeDbConnection, DbTreeDatabase, DbTreeTable } from './types'

let singleton: ConnectionManager | null = null

/**
 * Resolve the process-wide connection manager. Credential store and asset
 * service are looked up lazily so tests that only touch storage don't force
 * the full runtime service graph to load.
 */
export async function getConnectionManager(): Promise<ConnectionManager> {
  if (singleton) return singleton
  const credential = getCredentialStore()
  const assetService = await ChatermDatabaseService.getInstance()
  singleton = new ConnectionManager({
    adapters: {
      mysql: new MysqlDriverAdapter(),
      postgresql: new PostgresDriverAdapter()
    },
    credentialResolver: { decryptSecret: (c: string) => credential.decryptSecret(c) },
    statusUpdater: {
      updateDbAssetStatus: assetService.updateDbAssetStatus.bind(assetService)
    }
  })
  return singleton
}

/**
 * Test-only: inject a pre-built manager (or null to reset).
 */
export function __setConnectionManagerForTests(mgr: ConnectionManager | null): void {
  singleton = mgr
}
