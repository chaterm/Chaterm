import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

// 使用动态导入的增量同步触发器，保持与原实现一致
function triggerIncrementalSync(): void {
  setImmediate(async () => {
    try {
      const { SyncController } = await import('../../data_sync/core/SyncController')
      await SyncController.triggerIncrementalSync()
    } catch (error) {
      console.warn('触发增量同步失败:', error)
    }
  })
}

export function updateLocalAssetLabelLogic(db: Database.Database, uuid: string, label: string): any {
  try {
    const now = new Date().toISOString()
    const stmt = db.prepare(`
        UPDATE t_assets
        SET label = ?, updated_at = ?
        WHERE uuid = ?
      `)
    const result = stmt.run(label, now, uuid)

    if (result.changes > 0) {
      triggerIncrementalSync()
    }

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed'
      }
    }
  } catch (error) {
    console.error('Chaterm database get error:', error)
    throw error
  }
}

export function updateLocalAsseFavoriteLogic(db: Database.Database, uuid: string, status: number): any {
  try {
    const now = new Date().toISOString()
    const stmt = db.prepare(`
        UPDATE t_assets
        SET favorite = ?, updated_at = ?
        WHERE uuid = ?
      `)
    const result = stmt.run(status, now, uuid)

    if (result.changes > 0) {
      triggerIncrementalSync()
    }

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed'
      }
    }
  } catch (error) {
    console.error('Chaterm database get error:', error)
    throw error
  }
}

export function getAssetGroupLogic(db: Database.Database): any {
  try {
    const stmt = db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL
        ORDER BY group_name
      `)
    const results = stmt.all() || []

    return {
      data: {
        groups: results.map((item: any) => item.group_name)
      }
    }
  } catch (error) {
    console.error('Chaterm database get error:', error)
    throw error
  }
}

export function createAssetLogic(db: Database.Database, params: any): any {
  try {
    const form = params
    if (!form) {
      throw new Error('No asset data provided')
    }

    const uuid = uuidv4()
    const now = new Date().toISOString()

    const insertStmt = db.prepare(`
        INSERT INTO t_assets (
          label,
          asset_ip,
          uuid,
          auth_type,
          port,
          username,
          password,
          key_chain_id,
          group_name,
          favorite,
          asset_type,
          created_at,
          updated_at,
          version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

    const result = insertStmt.run(
      form.label || form.ip,
      form.ip,
      uuid,
      form.auth_type,
      form.port,
      form.username,
      form.password,
      form.keyChain,
      form.group_name,
      2,
      form.asset_type || 'person',
      now,
      now,
      1
    )

    if (result.changes > 0) {
      triggerIncrementalSync()
    }

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        uuid: uuid
      }
    }
  } catch (error) {
    console.error('Chaterm database create asset error:', error)
    throw error
  }
}

export function deleteAssetLogic(db: Database.Database, uuid: string): any {
  try {
    const checkStmt = db.prepare(`
      SELECT asset_type FROM t_assets WHERE uuid = ?
    `)
    const asset = checkStmt.get(uuid)

    if (asset && asset.asset_type === 'organization') {
      const deleteOrgAssetsStmt = db.prepare(`
        DELETE FROM t_organization_assets 
        WHERE organization_uuid = ?
      `)
      deleteOrgAssetsStmt.run(uuid)
    }

    const stmt = db.prepare(`
        DELETE FROM t_assets
        WHERE uuid = ?
      `)
    const result = stmt.run(uuid)

    if (result.changes > 0) {
      triggerIncrementalSync()
    }

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed'
      }
    }
  } catch (error) {
    console.error('Chaterm database delete asset error:', error)
    throw error
  }
}

export function updateAssetLogic(db: Database.Database, params: any): any {
  try {
    const form = params
    if (!form || !form.uuid) {
      throw new Error('No asset data or UUID provided')
    }

    const now = new Date().toISOString()

    const stmt = db.prepare(`
        UPDATE t_assets
        SET label = ?,
            asset_ip = ?,
            auth_type = ?,
            port = ?,
            username = ?,
            password = ?,
            key_chain_id = ?,
            group_name = ?,
            updated_at = ?
        WHERE uuid = ?
      `)

    const result = stmt.run(
      form.label || form.ip,
      form.ip,
      form.auth_type,
      form.port,
      form.username,
      form.password,
      form.keyChain,
      form.group_name,
      now,
      form.uuid
    )

    if (result.changes > 0) {
      triggerIncrementalSync()
    }

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed'
      }
    }
  } catch (error) {
    console.error('Chaterm database update asset error:', error)
    throw error
  }
}
