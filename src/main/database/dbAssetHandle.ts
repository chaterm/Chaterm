//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { ipcMain } from 'electron'
import { ChatermDatabaseService } from '../storage/db/chaterm.service'
import type { DbAssetCreateInput, DbAssetGroupRecord, DbAssetRecord, DbAssetUpdateInput } from '../storage/db/chaterm/db-assets'
import { getConnectionManager } from '../services/database'
import { getCredentialStore } from '../services/database/credential-store'
import type { ConnectionTestResult, DbObjectKind, MutationStatement } from '../services/database/types'
import { buildTableQuery, type ColumnFilter, type ColumnSort } from '../services/database/query-builder'
import { fetchPostgresTableDdl } from '../services/database/drivers/postgres-driver'
import { fetchMysqlTableDdl } from '../services/database/drivers/mysql-driver'

const logger = createLogger('db')

/**
 * Shape of payloads accepted from the renderer.
 * - password stays plaintext only in transit; it is encrypted before
 *   hitting SQLite and never sent back to the renderer.
 * - empty-string password means "leave existing credential untouched" on update.
 */
interface RendererDbAssetPayload {
  name: string
  db_type: 'mysql' | 'postgresql'
  host: string
  port: number
  group_id?: string | null
  username?: string | null
  password?: string | null
  database_name?: string | null
  schema_name?: string | null
  environment?: string | null
  group_name?: string | null
  ssl_mode?: string | null
  jdbc_url?: string | null
  options_json?: string | null
  tags_json?: string | null
  sort_order?: number
}

interface RendererDbAssetGroupPayload {
  name: string
  parent_id?: string | null
  sort_order?: number
}

/**
 * Safe projection: the renderer never sees the raw ciphertext.
 * `hasPassword` signals whether a credential is currently stored.
 */
export interface DbAssetDto {
  id: string
  name: string
  group_id: string | null
  group_name: string | null
  db_type: 'mysql' | 'postgresql'
  environment: string | null
  host: string
  port: number
  database_name: string | null
  schema_name: string | null
  auth_type: string
  username: string | null
  hasPassword: boolean
  ssl_mode: string | null
  status: string
  last_connected_at: string | null
  last_tested_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbAssetGroupDto {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function toDto(record: DbAssetRecord): DbAssetDto {
  return {
    id: record.id,
    name: record.name,
    group_id: record.group_id,
    group_name: record.group_name,
    db_type: record.db_type,
    environment: record.environment,
    host: record.host,
    port: record.port,
    database_name: record.database_name,
    schema_name: record.schema_name,
    auth_type: record.auth_type,
    username: record.username,
    hasPassword: !!record.password_ciphertext,
    ssl_mode: record.ssl_mode,
    status: record.status,
    last_connected_at: record.last_connected_at,
    last_tested_at: record.last_tested_at,
    last_error_code: record.last_error_code,
    last_error_message: record.last_error_message,
    sort_order: record.sort_order,
    created_at: record.created_at,
    updated_at: record.updated_at
  }
}

function toGroupDto(record: DbAssetGroupRecord): DbAssetGroupDto {
  return {
    id: record.id,
    name: record.name,
    parent_id: record.parent_id,
    sort_order: record.sort_order,
    created_at: record.created_at,
    updated_at: record.updated_at
  }
}

/**
 * Translate renderer payload into a storage-level create input, encrypting
 * the plaintext password along the way.
 */
async function toCreateInput(payload: RendererDbAssetPayload): Promise<DbAssetCreateInput> {
  const credential = getCredentialStore()
  const cipher = payload.password ? await credential.encryptSecret(payload.password) : null
  return {
    name: payload.name,
    db_type: payload.db_type,
    host: payload.host,
    port: payload.port,
    group_id: payload.group_id ?? null,
    username: payload.username ?? null,
    password_ciphertext: cipher,
    auth_type: 'password',
    group_name: payload.group_name ?? null,
    environment: payload.environment ?? null,
    database_name: payload.database_name ?? null,
    schema_name: payload.schema_name ?? null,
    ssl_mode: payload.ssl_mode ?? null,
    jdbc_url: payload.jdbc_url ?? null,
    options_json: payload.options_json ?? null,
    tags_json: payload.tags_json ?? null,
    sort_order: payload.sort_order ?? 0
  }
}

/**
 * Translate renderer payload into a storage-level update patch. Password
 * field handling:
 *  - undefined / null   -> do not touch existing ciphertext
 *  - empty string ''    -> do not touch existing ciphertext
 *  - non-empty string   -> encrypt and replace
 */
async function toUpdatePatch(payload: Partial<RendererDbAssetPayload>): Promise<DbAssetUpdateInput> {
  const patch: DbAssetUpdateInput = {}
  if (payload.name !== undefined) patch.name = payload.name
  if (payload.db_type !== undefined) patch.db_type = payload.db_type
  if (payload.host !== undefined) patch.host = payload.host
  if (payload.port !== undefined) patch.port = payload.port
  if (payload.group_id !== undefined) patch.group_id = payload.group_id
  if (payload.username !== undefined) patch.username = payload.username
  if (payload.group_name !== undefined) patch.group_name = payload.group_name
  if (payload.environment !== undefined) patch.environment = payload.environment
  if (payload.database_name !== undefined) patch.database_name = payload.database_name
  if (payload.schema_name !== undefined) patch.schema_name = payload.schema_name
  if (payload.ssl_mode !== undefined) patch.ssl_mode = payload.ssl_mode
  if (payload.jdbc_url !== undefined) patch.jdbc_url = payload.jdbc_url
  if (payload.options_json !== undefined) patch.options_json = payload.options_json
  if (payload.tags_json !== undefined) patch.tags_json = payload.tags_json
  if (payload.sort_order !== undefined) patch.sort_order = payload.sort_order
  if (typeof payload.password === 'string' && payload.password.length > 0) {
    const credential = getCredentialStore()
    patch.password_ciphertext = await credential.encryptSecret(payload.password)
  }
  return patch
}

async function resolveAssetService(): Promise<ChatermDatabaseService> {
  return ChatermDatabaseService.getInstance()
}

export function registerDbAssetHandlers(): void {
  ipcMain.handle('db-asset-group-list', async () => {
    try {
      const service = await resolveAssetService()
      return service.listDbAssetGroups().map(toGroupDto)
    } catch (error) {
      logger.error('db-asset-group-list failed', { event: 'db-asset-group.list.error', error })
      return []
    }
  })

  ipcMain.handle('db-asset-group-create', async (_, payload: RendererDbAssetGroupPayload) => {
    try {
      const service = await resolveAssetService()
      const row = service.createDbAssetGroup({
        name: payload.name,
        parent_id: payload.parent_id ?? null,
        sort_order: payload.sort_order ?? 0
      })
      return { ok: true, group: toGroupDto(row) }
    } catch (error) {
      logger.error('db-asset-group-create failed', { event: 'db-asset-group.create.error', name: payload?.name, error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-group-update', async (_, payload: { id: string; patch: Partial<RendererDbAssetGroupPayload> }) => {
    try {
      const service = await resolveAssetService()
      const row = service.updateDbAssetGroup(payload.id, payload.patch)
      return { ok: true, group: toGroupDto(row) }
    } catch (error) {
      logger.error('db-asset-group-update failed', { event: 'db-asset-group.update.error', id: payload?.id, error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-group-delete', async (_, id: string) => {
    try {
      const service = await resolveAssetService()
      const ok = service.deleteDbAssetGroup(id)
      return { ok }
    } catch (error) {
      logger.error('db-asset-group-delete failed', { event: 'db-asset-group.delete.error', id, error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-list', async () => {
    try {
      const service = await resolveAssetService()
      return service.listDbAssets().map(toDto)
    } catch (error) {
      logger.error('db-asset-list failed', { event: 'db-asset.list.error', error })
      return []
    }
  })

  ipcMain.handle('db-asset-get', async (_, id: string) => {
    try {
      const service = await resolveAssetService()
      const row = service.getDbAsset(id)
      return row ? toDto(row) : null
    } catch (error) {
      logger.error('db-asset-get failed', { event: 'db-asset.get.error', id, error })
      return null
    }
  })

  ipcMain.handle('db-asset-create', async (_, payload: RendererDbAssetPayload) => {
    try {
      const service = await resolveAssetService()
      const input = await toCreateInput(payload)
      const row = service.createDbAsset(input)
      return { ok: true, asset: toDto(row) }
    } catch (error) {
      logger.error('db-asset-create failed', {
        event: 'db-asset.create.error',
        name: payload?.name,
        db_type: payload?.db_type,
        error
      })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-update', async (_, payload: { id: string; patch: Partial<RendererDbAssetPayload> }) => {
    try {
      const service = await resolveAssetService()
      const patch = await toUpdatePatch(payload.patch)
      const row = service.updateDbAsset(payload.id, patch)
      return { ok: true, asset: toDto(row) }
    } catch (error) {
      logger.error('db-asset-update failed', { event: 'db-asset.update.error', id: payload?.id, error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-delete', async (_, id: string) => {
    try {
      const service = await resolveAssetService()
      const mgr = await getConnectionManager()
      await mgr.disconnect(id)
      const ok = service.deleteDbAsset(id)
      return { ok }
    } catch (error) {
      logger.error('db-asset-delete failed', { event: 'db-asset.delete.error', id, error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-test-connection', async (_, payload: RendererDbAssetPayload) => {
    try {
      // For the modal "Test" flow we never persist. Encrypt -> build a throwaway
      // DbAssetRecord shape -> let the manager run the adapter -> surface result.
      const credential = getCredentialStore()
      const cipher = payload.password ? await credential.encryptSecret(payload.password) : null
      const mgr = await getConnectionManager()
      const stubAsset: DbAssetRecord = {
        id: 'ephemeral-test',
        user_id: 0,
        name: payload.name ?? '',
        group_id: payload.group_id ?? null,
        group_name: null,
        db_type: payload.db_type,
        environment: null,
        host: payload.host,
        port: payload.port,
        database_name: payload.database_name ?? null,
        schema_name: null,
        auth_type: 'password',
        username: payload.username ?? null,
        password_ciphertext: cipher,
        ssl_mode: payload.ssl_mode ?? null,
        jdbc_url: null,
        driver_name: null,
        driver_class_name: null,
        ssh_tunnel_enabled: 0,
        ssh_tunnel_asset_uuid: null,
        options_json: null,
        tags_json: null,
        status: 'testing',
        last_connected_at: null,
        last_tested_at: null,
        last_error_code: null,
        last_error_message: null,
        sort_order: 0,
        deleted_at: null,
        created_at: '',
        updated_at: ''
      }
      const result: ConnectionTestResult = await mgr.testConnection(stubAsset)
      return result
    } catch (error) {
      logger.error('db-asset-test-connection failed', { event: 'db-asset.test.error', error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-connect', async (_, id: string) => {
    try {
      const service = await resolveAssetService()
      const row = service.getDbAsset(id)
      if (!row) return { ok: false, errorMessage: 'asset not found' }
      const mgr = await getConnectionManager()
      await mgr.connect(row)
      const refreshed = service.getDbAsset(id)
      logger.info('db-asset-connect ok', { event: 'db-asset.connect.ok', id, dbType: row.db_type })
      return { ok: true, asset: refreshed ? toDto(refreshed) : null }
    } catch (error) {
      logger.error('db-asset-connect failed', { event: 'db-asset.connect.error', id, error })
      const refreshed = (await resolveAssetService()).getDbAsset(id)
      return {
        ok: false,
        errorMessage: (error as Error).message,
        asset: refreshed ? toDto(refreshed) : null
      }
    }
  })

  ipcMain.handle('db-asset-disconnect', async (_, id: string) => {
    try {
      const mgr = await getConnectionManager()
      await mgr.disconnect(id)
      const service = await resolveAssetService()
      const refreshed = service.getDbAsset(id)
      return { ok: true, asset: refreshed ? toDto(refreshed) : null }
    } catch (error) {
      logger.error('db-asset-disconnect failed', { event: 'db-asset.disconnect.error', id, error })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle(
    'db-asset-list-children',
    async (_, payload: { id: string; databaseName?: string; schemaName?: string; objectKind?: DbObjectKind; tableName?: string }) => {
      try {
        const mgr = await getConnectionManager()
        if (!mgr.isConnected(payload.id)) return { ok: false, errorMessage: 'not connected' }
        // Column leaves: table name (+ optional schema for PG) triggers column lookup.
        if (payload.databaseName && payload.tableName) {
          const columns = await mgr.listColumns(payload.id, payload.databaseName, payload.tableName, payload.schemaName)
          return { ok: true, columns }
        }
        // Object folder leaves: schemaName + objectKind returns the list for
        // that kind (tables/views/functions/procedures). PG only — MySQL
        // drivers don't implement listObjects and will return [].
        if (payload.databaseName && payload.schemaName && payload.objectKind) {
          const objects = await mgr.listObjects(payload.id, payload.databaseName, payload.schemaName, payload.objectKind)
          return { ok: true, objects }
        }
        // Legacy MySQL path: database -> tables. Left intact for backward
        // compatibility and because MySQL has no schema layer.
        if (payload.databaseName && !payload.schemaName) {
          const tables = await mgr.listTables(payload.id, payload.databaseName)
          return { ok: true, tables }
        }
        const databases = await mgr.listDatabases(payload.id)
        return { ok: true, databases }
      } catch (error) {
        logger.error('db-asset-list-children failed', {
          event: 'db-asset.list-children.error',
          id: payload?.id,
          error
        })
        return { ok: false, errorMessage: (error as Error).message }
      }
    }
  )

  ipcMain.handle('db-asset-list-schemas', async (_, payload: { id: string; databaseName: string }) => {
    try {
      const mgr = await getConnectionManager()
      if (!mgr.isConnected(payload.id)) return { ok: false, errorMessage: 'not connected' }
      const schemas = await mgr.listSchemas(payload.id, payload.databaseName)
      return { ok: true, schemas }
    } catch (error) {
      logger.error('db-asset-list-schemas failed', {
        event: 'db-asset.list-schemas.error',
        id: payload?.id,
        error
      })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset-execute-query', async (_, payload: { id: string; sql: string; databaseName?: string; schemaName?: string }) => {
    try {
      const mgr = await getConnectionManager()
      if (!mgr.isConnected(payload.id)) return { ok: false, errorMessage: 'not connected' }
      const service = await resolveAssetService()
      const asset = service.getDbAsset(payload.id)
      if (payload.databaseName && asset?.db_type === 'mysql') {
        const safe = payload.databaseName.replace(/`/g, '')
        await mgr.executeQuery(payload.id, `USE \`${safe}\``)
      }
      // For Postgres, set the session search_path so unqualified references
      // in the user SQL resolve against the schema selected in the toolbar.
      // Run as a separate statement because the pg driver uses the extended
      // query protocol (params are always passed), which rejects multi-
      // statement strings.
      if (payload.schemaName && asset?.db_type === 'postgresql') {
        const safeSchema = String(payload.schemaName).replace(/"/g, '""')
        await mgr.executeQuery(payload.id, `SET search_path TO "${safeSchema}", public`)
      }
      const result = await mgr.executeQuery(payload.id, payload.sql)
      return { ok: true, ...result }
    } catch (error) {
      logger.error('db-asset-execute-query failed', {
        event: 'db-asset.execute.error',
        id: payload?.id,
        error
      })
      return { ok: false, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle(
    'db-asset-query-table',
    async (
      _,
      payload: {
        id: string
        database: string
        schema?: string
        table: string
        filters?: ColumnFilter[]
        sort?: ColumnSort | null
        whereRaw?: string | null
        orderByRaw?: string | null
        page: number
        pageSize: number
        /** Only run COUNT(*) when the user asks for it. */
        withTotal?: boolean
      }
    ) => {
      try {
        // eslint-disable-next-line no-console
        console.log('[DB-DEBUG] ipc db-asset-query-table entry', {
          id: payload.id,
          database: payload.database,
          schema: payload.schema,
          table: payload.table,
          page: payload.page,
          pageSize: payload.pageSize,
          withTotal: payload.withTotal,
          filtersCount: payload.filters?.length ?? 0,
          hasWhereRaw: !!payload.whereRaw,
          hasOrderByRaw: !!payload.orderByRaw
        })
        const mgr = await getConnectionManager()
        if (!mgr.isConnected(payload.id)) {
          // eslint-disable-next-line no-console
          console.warn('[DB-DEBUG] ipc query-table not connected', { id: payload.id })
          return { ok: false, errorMessage: 'not connected' }
        }
        const service = await resolveAssetService()
        const asset = service.getDbAsset(payload.id)
        if (!asset) return { ok: false, errorMessage: 'asset not found' }

        const listColumnsStart = Date.now()
        const columns = await mgr.listColumns(payload.id, payload.database, payload.table, payload.schema)
        // eslint-disable-next-line no-console
        console.log('[DB-DEBUG] ipc listColumns done', {
          ms: Date.now() - listColumnsStart,
          columnsCount: columns.length
        })
        if (columns.length === 0) {
          return { ok: false, errorMessage: 'failed to resolve columns for table' }
        }

        if (asset.db_type === 'mysql' && payload.database) {
          const safe = payload.database.replace(/`/g, '')
          const useStart = Date.now()
          await mgr.executeQuery(payload.id, `USE \`${safe}\``)
          // eslint-disable-next-line no-console
          console.log('[DB-DEBUG] ipc USE database done', { ms: Date.now() - useStart })
        }

        const built = buildTableQuery({
          dbType: asset.db_type,
          database: payload.database,
          schema: payload.schema,
          table: payload.table,
          knownColumns: columns,
          filters: payload.filters ?? [],
          sort: payload.sort ?? null,
          whereRaw: payload.whereRaw ?? null,
          orderByRaw: payload.orderByRaw ?? null,
          page: payload.page,
          pageSize: payload.pageSize
        })
        // eslint-disable-next-line no-console
        console.log('[DB-DEBUG] ipc built SQL', {
          sql: built.sql,
          paramCount: built.params.length,
          countSql: built.countSql
        })

        const pageStart = Date.now()
        const page = await mgr.executeQuery(payload.id, built.sql, built.params)
        // eslint-disable-next-line no-console
        console.log('[DB-DEBUG] ipc page query done', {
          ms: Date.now() - pageStart,
          rowCount: page.rowCount,
          columnCount: page.columns.length
        })

        let total: number | null = null
        if (payload.withTotal) {
          const countRes = await mgr.executeQuery(payload.id, built.countSql, built.countParams)
          const row = countRes.rows?.[0] as Record<string, unknown> | undefined
          if (row) {
            const raw = Object.values(row)[0]
            total = typeof raw === 'number' ? raw : Number(raw ?? 0)
          }
        }

        return {
          ok: true,
          columns: page.columns,
          rows: page.rows,
          rowCount: page.rowCount,
          durationMs: page.durationMs,
          total,
          knownColumns: columns
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DB-DEBUG] ipc query-table threw', {
          id: payload?.id,
          table: payload?.table,
          message: (error as Error)?.message,
          stack: (error as Error)?.stack
        })
        logger.error('db-asset-query-table failed', {
          event: 'db-asset.query-table.error',
          id: payload?.id,
          table: payload?.table,
          error
        })
        return { ok: false, errorMessage: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'db-asset-count-table',
    async (
      _,
      payload: {
        id: string
        database: string
        schema?: string
        table: string
        filters?: ColumnFilter[]
        whereRaw?: string | null
      }
    ) => {
      try {
        const mgr = await getConnectionManager()
        if (!mgr.isConnected(payload.id)) return { ok: false, errorMessage: 'not connected' }
        const service = await resolveAssetService()
        const asset = service.getDbAsset(payload.id)
        if (!asset) return { ok: false, errorMessage: 'asset not found' }

        const columns = await mgr.listColumns(payload.id, payload.database, payload.table, payload.schema)
        if (columns.length === 0) return { ok: false, errorMessage: 'failed to resolve columns for table' }

        if (asset.db_type === 'mysql' && payload.database) {
          const safe = payload.database.replace(/`/g, '')
          await mgr.executeQuery(payload.id, `USE \`${safe}\``)
        }

        const built = buildTableQuery({
          dbType: asset.db_type,
          database: payload.database,
          schema: payload.schema,
          table: payload.table,
          knownColumns: columns,
          filters: payload.filters ?? [],
          sort: null,
          whereRaw: payload.whereRaw ?? null,
          orderByRaw: null,
          page: 1,
          pageSize: 1
        })

        const start = Date.now()
        const countRes = await mgr.executeQuery(payload.id, built.countSql, built.countParams)
        const row = countRes.rows?.[0] as Record<string, unknown> | undefined
        let total = 0
        if (row) {
          const raw = Object.values(row)[0]
          total = typeof raw === 'number' ? raw : Number(raw ?? 0)
        }
        return { ok: true, total, durationMs: Date.now() - start }
      } catch (error) {
        logger.error('db-asset-count-table failed', {
          event: 'db-asset.count-table.error',
          id: payload?.id,
          table: payload?.table,
          error
        })
        return { ok: false, errorMessage: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'db-asset-column-distinct',
    async (
      _,
      payload: {
        id: string
        database: string
        schema?: string
        table: string
        column: string
        limit?: number
      }
    ) => {
      try {
        const mgr = await getConnectionManager()
        if (!mgr.isConnected(payload.id)) return { ok: false, errorMessage: 'not connected' }
        const service = await resolveAssetService()
        const asset = service.getDbAsset(payload.id)
        if (!asset) return { ok: false, errorMessage: 'asset not found' }

        // Validate column against the real schema to prevent injection.
        const columns = await mgr.listColumns(payload.id, payload.database, payload.table, payload.schema)
        if (!columns.includes(payload.column)) {
          return { ok: false, errorMessage: `unknown column: ${payload.column}` }
        }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload.column)) {
          return { ok: false, errorMessage: 'unsafe column name' }
        }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload.table)) {
          return { ok: false, errorMessage: 'unsafe table name' }
        }
        if (payload.schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload.schema)) {
          return { ok: false, errorMessage: 'unsafe schema name' }
        }

        const limit = Math.max(1, Math.min(Math.floor(payload.limit ?? 1000), 10000))
        if (asset.db_type === 'mysql') {
          if (payload.database && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload.database)) {
            return { ok: false, errorMessage: 'unsafe database name' }
          }
          if (payload.database) {
            await mgr.executeQuery(payload.id, `USE \`${payload.database}\``)
          }
          const sql = `SELECT DISTINCT \`${payload.column}\` AS v FROM \`${payload.table}\` ORDER BY 1 LIMIT ${limit}`
          const res = await mgr.executeQuery(payload.id, sql)
          const values = (res.rows ?? []).map((r) => r.v ?? null)
          return { ok: true, values }
        }
        // postgres: schema-qualify when known so non-public tables resolve.
        const qualified = payload.schema ? `"${payload.schema}"."${payload.table}"` : `"${payload.table}"`
        const sql = `SELECT DISTINCT "${payload.column}" AS v FROM ${qualified} ORDER BY 1 LIMIT ${limit}`
        const res = await mgr.executeQuery(payload.id, sql)
        const values = (res.rows ?? []).map((r) => r.v ?? null)
        return { ok: true, values }
      } catch (error) {
        logger.error('db-asset-column-distinct failed', {
          event: 'db-asset.column-distinct.error',
          id: payload?.id,
          table: payload?.table,
          column: payload?.column,
          error
        })
        return { ok: false, errorMessage: (error as Error).message }
      }
    }
  )

  ipcMain.handle('db-asset:detect-primary-key', async (_, payload: { id: string; database: string; schema?: string; table: string }) => {
    try {
      if (!payload || typeof payload.id !== 'string') {
        return { ok: false, primaryKey: null, errorMessage: 'invalid payload' }
      }
      const mgr = await getConnectionManager()
      if (!mgr.isConnected(payload.id)) {
        return { ok: false, primaryKey: null, errorMessage: 'not connected' }
      }
      const primaryKey = await mgr.detectPrimaryKey(payload.id, payload.database, payload.table, payload.schema)
      return { ok: true, primaryKey }
    } catch (error) {
      logger.error('db-asset.detect-primary-key failed', {
        event: 'db-asset.detect-primary-key.error',
        id: payload?.id,
        table: payload?.table,
        error
      })
      return { ok: false, primaryKey: null, errorMessage: (error as Error).message }
    }
  })

  ipcMain.handle('db-asset:execute-mutations', async (_, payload: { id: string; database?: string; statements: MutationStatement[] }) => {
    try {
      if (!payload || typeof payload.id !== 'string' || !Array.isArray(payload.statements)) {
        return { ok: false, errorMessage: 'invalid payload', durationMs: 0 }
      }
      const mgr = await getConnectionManager()
      if (!mgr.isConnected(payload.id)) {
        return { ok: false, errorMessage: 'not connected', durationMs: 0 }
      }
      const service = await resolveAssetService()
      const asset = service.getDbAsset(payload.id)
      if (!asset) return { ok: false, errorMessage: 'asset not found', durationMs: 0 }

      // Scope MySQL sessions to the requested database before mutating.
      if (payload.database && asset.db_type === 'mysql') {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload.database)) {
          return { ok: false, errorMessage: 'unsafe database name', durationMs: 0 }
        }
        await mgr.executeQuery(payload.id, `USE \`${payload.database}\``)
      }

      const result = await mgr.executeMutations(payload.id, payload.statements)
      // Sanitized telemetry: never log statement params, only aggregate counts.
      const affectedTotal = Array.isArray(result.affected) ? result.affected.reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0) : 0
      logger.info('db-asset.execute-mutations done', {
        event: 'db-asset.execute-mutations.done',
        id: payload.id,
        stmtCount: payload.statements.length,
        ok: result.ok,
        affectedTotal,
        durationMs: result.durationMs
      })
      return result
    } catch (error) {
      logger.error('db-asset.execute-mutations failed', {
        event: 'db-asset.execute-mutations.error',
        id: payload?.id,
        stmtCount: Array.isArray(payload?.statements) ? payload.statements.length : 0,
        error
      })
      return { ok: false, errorMessage: (error as Error).message, durationMs: 0 }
    }
  })

  ipcMain.handle('db-asset-table-ddl', async (_, payload: { id: string; database: string; schema?: string; table: string }) => {
    try {
      if (!payload || typeof payload.id !== 'string' || typeof payload.table !== 'string' || typeof payload.database !== 'string') {
        return { ok: false, errorCode: 'other', errorMessage: 'invalid payload' }
      }
      const mgr = await getConnectionManager()
      if (!mgr.isConnected(payload.id)) {
        return { ok: false, errorCode: 'other', errorMessage: 'not connected' }
      }
      const service = await resolveAssetService()
      const asset = service.getDbAsset(payload.id)
      if (!asset) return { ok: false, errorCode: 'other', errorMessage: 'asset not found' }

      const session = mgr.getSession(payload.id)
      if (!session) return { ok: false, errorCode: 'other', errorMessage: 'not connected' }

      logger.info('db-asset-table-ddl start', {
        event: 'db-asset.table-ddl.start',
        id: payload.id,
        dbType: asset.db_type,
        hasSchema: !!payload.schema,
        tableLen: payload.table.length
      })

      let ddl = ''
      if (asset.db_type === 'postgresql') {
        const schema = payload.schema ?? asset.schema_name ?? 'public'
        ddl = await fetchPostgresTableDdl(session.handle, payload.database, schema, payload.table)
      } else if (asset.db_type === 'mysql') {
        ddl = await fetchMysqlTableDdl(session.handle, payload.database, payload.table)
      } else {
        return { ok: false, errorCode: 'other', errorMessage: `unsupported db_type: ${asset.db_type}` }
      }

      logger.info('db-asset-table-ddl ok', {
        event: 'db-asset.table-ddl.ok',
        id: payload.id,
        dbType: asset.db_type,
        hasSchema: !!payload.schema,
        tableLen: payload.table.length,
        ddlLen: ddl.length
      })
      return { ok: true, ddl }
    } catch (error) {
      const code = (error as { code?: 'permission' | 'other' })?.code === 'permission' ? 'permission' : 'other'
      logger.error('db-asset-table-ddl failed', {
        event: 'db-asset.table-ddl.error',
        id: payload?.id,
        hasSchema: !!payload?.schema,
        tableLen: typeof payload?.table === 'string' ? payload.table.length : 0,
        errorCode: code
      })
      return {
        ok: false,
        errorCode: code,
        errorMessage: (error as Error)?.message ?? 'unknown error'
      }
    }
  })
}
