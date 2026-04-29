//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
const logger = createLogger('db')

export type DbAssetType = 'mysql' | 'postgresql'
export type DbAssetStatus = 'idle' | 'testing' | 'connected' | 'failed'
export type DbAssetAuthType = 'password'

export interface DbAssetRecord {
  id: string
  user_id: number
  name: string
  group_name: string | null
  db_type: DbAssetType
  environment: string | null
  host: string
  port: number
  database_name: string | null
  schema_name: string | null
  auth_type: DbAssetAuthType
  username: string | null
  password_ciphertext: string | null
  ssl_mode: string | null
  jdbc_url: string | null
  driver_name: string | null
  driver_class_name: string | null
  ssh_tunnel_enabled: number
  ssh_tunnel_asset_uuid: string | null
  options_json: string | null
  tags_json: string | null
  status: DbAssetStatus
  last_connected_at: string | null
  last_tested_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DbAssetCreateInput {
  name: string
  db_type: DbAssetType
  host: string
  port: number
  username?: string | null
  password_ciphertext?: string | null
  auth_type?: DbAssetAuthType
  group_name?: string | null
  environment?: string | null
  database_name?: string | null
  schema_name?: string | null
  ssl_mode?: string | null
  jdbc_url?: string | null
  driver_name?: string | null
  driver_class_name?: string | null
  options_json?: string | null
  tags_json?: string | null
  sort_order?: number
}

export type DbAssetUpdateInput = Partial<DbAssetCreateInput>

const ALL_COLUMNS = `
  id, user_id, name, group_name, db_type, environment, host, port,
  database_name, schema_name, auth_type, username, password_ciphertext,
  ssl_mode, jdbc_url, driver_name, driver_class_name,
  ssh_tunnel_enabled, ssh_tunnel_asset_uuid, options_json, tags_json,
  status, last_connected_at, last_tested_at, last_error_code, last_error_message,
  sort_order, deleted_at, created_at, updated_at
`

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * List non-deleted assets for a user, newest first.
 */
export function listDbAssetsLogic(db: Database.Database, userId: number): DbAssetRecord[] {
  const stmt = db.prepare(`
    SELECT ${ALL_COLUMNS}
    FROM db_assets
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY sort_order ASC, created_at DESC
  `)
  return stmt.all(userId) as DbAssetRecord[]
}

/**
 * Get a single non-deleted asset by id for the owning user.
 */
export function getDbAssetLogic(db: Database.Database, userId: number, id: string): DbAssetRecord | null {
  const stmt = db.prepare(`
    SELECT ${ALL_COLUMNS}
    FROM db_assets
    WHERE user_id = ? AND id = ? AND deleted_at IS NULL
  `)
  return (stmt.get(userId, id) as DbAssetRecord | undefined) || null
}

/**
 * Persist a new asset and return the created row.
 * Caller must pre-encrypt password into password_ciphertext.
 */
export function createDbAssetLogic(db: Database.Database, userId: number, input: DbAssetCreateInput): DbAssetRecord {
  if (!input.name?.trim()) throw new Error('name is required')
  if (!input.db_type) throw new Error('db_type is required')
  if (!input.host?.trim()) throw new Error('host is required')
  if (!Number.isFinite(input.port) || input.port <= 0 || input.port > 65535) {
    throw new Error('port must be 1..65535')
  }

  const id = randomUUID()
  const ts = nowIso()
  const stmt = db.prepare(`
    INSERT INTO db_assets (
      id, user_id, name, group_name, db_type, environment, host, port,
      database_name, schema_name, auth_type, username, password_ciphertext,
      ssl_mode, jdbc_url, driver_name, driver_class_name,
      ssh_tunnel_enabled, ssh_tunnel_asset_uuid, options_json, tags_json,
      status, sort_order, created_at, updated_at
    ) VALUES (
      @id, @user_id, @name, @group_name, @db_type, @environment, @host, @port,
      @database_name, @schema_name, @auth_type, @username, @password_ciphertext,
      @ssl_mode, @jdbc_url, @driver_name, @driver_class_name,
      0, NULL, @options_json, @tags_json,
      'idle', @sort_order, @created_at, @updated_at
    )
  `)
  stmt.run({
    id,
    user_id: userId,
    name: input.name.trim(),
    group_name: input.group_name ?? null,
    db_type: input.db_type,
    environment: input.environment ?? null,
    host: input.host.trim(),
    port: input.port,
    database_name: input.database_name ?? null,
    schema_name: input.schema_name ?? null,
    auth_type: input.auth_type ?? 'password',
    username: input.username ?? null,
    password_ciphertext: input.password_ciphertext ?? null,
    ssl_mode: input.ssl_mode ?? null,
    jdbc_url: input.jdbc_url ?? null,
    driver_name: input.driver_name ?? null,
    driver_class_name: input.driver_class_name ?? null,
    options_json: input.options_json ?? null,
    tags_json: input.tags_json ?? null,
    sort_order: input.sort_order ?? 0,
    created_at: ts,
    updated_at: ts
  })
  const inserted = getDbAssetLogic(db, userId, id)
  if (!inserted) throw new Error('Insert succeeded but row not found')
  return inserted
}

/**
 * Apply partial update to an existing asset. Returns the updated row.
 */
export function updateDbAssetLogic(db: Database.Database, userId: number, id: string, patch: DbAssetUpdateInput): DbAssetRecord {
  const existing = getDbAssetLogic(db, userId, id)
  if (!existing) throw new Error('asset not found')

  const merged: DbAssetRecord = {
    ...existing,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  } as DbAssetRecord
  merged.updated_at = nowIso()

  const stmt = db.prepare(`
    UPDATE db_assets SET
      name = @name,
      group_name = @group_name,
      db_type = @db_type,
      environment = @environment,
      host = @host,
      port = @port,
      database_name = @database_name,
      schema_name = @schema_name,
      auth_type = @auth_type,
      username = @username,
      password_ciphertext = @password_ciphertext,
      ssl_mode = @ssl_mode,
      jdbc_url = @jdbc_url,
      driver_name = @driver_name,
      driver_class_name = @driver_class_name,
      options_json = @options_json,
      tags_json = @tags_json,
      sort_order = @sort_order,
      updated_at = @updated_at
    WHERE user_id = @user_id AND id = @id AND deleted_at IS NULL
  `)
  stmt.run({
    id,
    user_id: userId,
    name: merged.name,
    group_name: merged.group_name,
    db_type: merged.db_type,
    environment: merged.environment,
    host: merged.host,
    port: merged.port,
    database_name: merged.database_name,
    schema_name: merged.schema_name,
    auth_type: merged.auth_type,
    username: merged.username,
    password_ciphertext: merged.password_ciphertext,
    ssl_mode: merged.ssl_mode,
    jdbc_url: merged.jdbc_url,
    driver_name: merged.driver_name,
    driver_class_name: merged.driver_class_name,
    options_json: merged.options_json,
    tags_json: merged.tags_json,
    sort_order: merged.sort_order,
    updated_at: merged.updated_at
  })
  const refreshed = getDbAssetLogic(db, userId, id)
  if (!refreshed) throw new Error('update succeeded but row not found')
  return refreshed
}

/**
 * Soft-delete an asset by stamping deleted_at.
 */
export function softDeleteDbAssetLogic(db: Database.Database, userId: number, id: string): boolean {
  const stmt = db.prepare(`
    UPDATE db_assets SET deleted_at = ?, updated_at = ?
    WHERE user_id = ? AND id = ? AND deleted_at IS NULL
  `)
  const ts = nowIso()
  const info = stmt.run(ts, ts, userId, id)
  return info.changes > 0
}

/**
 * Update connection status + error metadata after test / connect / disconnect.
 */
export function updateDbAssetStatusLogic(
  db: Database.Database,
  userId: number,
  id: string,
  patch: {
    status?: DbAssetStatus
    last_connected_at?: string | null
    last_tested_at?: string | null
    last_error_code?: string | null
    last_error_message?: string | null
  }
): void {
  try {
    const existing = getDbAssetLogic(db, userId, id)
    if (!existing) return
    const stmt = db.prepare(`
      UPDATE db_assets SET
        status = @status,
        last_connected_at = @last_connected_at,
        last_tested_at = @last_tested_at,
        last_error_code = @last_error_code,
        last_error_message = @last_error_message,
        updated_at = @updated_at
      WHERE user_id = @user_id AND id = @id AND deleted_at IS NULL
    `)
    stmt.run({
      id,
      user_id: userId,
      status: patch.status ?? existing.status,
      last_connected_at: patch.last_connected_at !== undefined ? patch.last_connected_at : existing.last_connected_at,
      last_tested_at: patch.last_tested_at !== undefined ? patch.last_tested_at : existing.last_tested_at,
      last_error_code: patch.last_error_code !== undefined ? patch.last_error_code : existing.last_error_code,
      last_error_message: patch.last_error_message !== undefined ? patch.last_error_message : existing.last_error_message,
      updated_at: nowIso()
    })
  } catch (error) {
    logger.error('updateDbAssetStatus failed', { event: 'db-asset.status.update', id, error })
  }
}
