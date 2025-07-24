import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { QueryResult } from '../types'

export function getLocalAssetRouteLogic(db: Database.Database, searchType: string, params: any[] = []): any {
  try {
    const result: QueryResult = {
      code: 200,
      data: {
        routers: []
      },
      ts: new Date().toString()
    }
    if (searchType !== 'assetConfig') {
      const favoritesStmt = db.prepare(`
        SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id
        FROM t_assets
        WHERE favorite = 1
        ORDER BY created_at
      `)
      const favorites = favoritesStmt.all() || []

      if (favorites && favorites.length > 0) {
        result.data.routers.push({
          key: 'favorite',
          title: '收藏栏',
          children: favorites.map((item: any) => ({
            key: `favorite_${item.asset_ip || ''}`,
            title: item.label || item.asset_ip || '',
            favorite: true,
            ip: item.asset_ip || '',
            uuid: item.uuid || '',
            group_name: item.group_name || '',
            label: item.label || '',
            authType: item.auth_type || '',
            port: item.port || 22,
            username: item.username || '',
            password: item.password || '',
            key_chain_id: item.key_chain_id || 0,
            organizationId: 'personal'
          }))
        })
      }
    }

    const groupsStmt = db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL
        ORDER BY group_name
      `)
    const groups = groupsStmt.all() || []

    for (const group of groups) {
      if (!group || !group.group_name) continue
      const assetsStmt = db.prepare(`
          SELECT label, asset_ip, uuid, favorite,group_name,label,auth_type,port,username,password,key_chain_id
          FROM t_assets
          WHERE group_name = ?
          ORDER BY created_at
        `)
      const assets = assetsStmt.all(group.group_name) || []

      if (assets && assets.length > 0) {
        result.data.routers.push({
          key: group.group_name,
          title: group.group_name,
          children: assets.map((item: any) => ({
            key: `${group.group_name}_${item.asset_ip || ''}`,
            title: item.label || item.asset_ip || '',
            favorite: item.favorite === 1,
            ip: item.asset_ip || '',
            uuid: item.uuid || '',
            group_name: item.group_name || '',
            label: item.label || '',
            auth_type: item.auth_type || '',
            port: item.port || 22,
            username: item.username || '',
            password: item.password || '',
            key_chain_id: item.key_chain_id || 0,
            organizationId: 'personal'
          }))
        })
      }
    }

    return result
  } catch (error) {
    console.error('Chaterm database query error:', error)
    throw error
  }
}

export function updateLocalAssetLabelLogic(db: Database.Database, uuid: string, label: string): any {
  try {
    const stmt = db.prepare(`
        UPDATE t_assets
        SET label = ?
        WHERE uuid = ?
      `)
    const result = stmt.run(label, uuid)
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
    const stmt = db.prepare(`
        UPDATE t_assets
        SET favorite = ?
        WHERE uuid = ?
      `)
    const result = stmt.run(status, uuid)
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
          favorite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      2
    )

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
    const stmt = db.prepare(`
        DELETE FROM t_assets
        WHERE uuid = ?
      `)
    const result = stmt.run(uuid)
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

    const stmt = db.prepare(`
        UPDATE t_assets
        SET label = ?,
            asset_ip = ?,
            auth_type = ?,
            port = ?,
            username = ?,
            password = ?,
            key_chain_id = ?,
            group_name = ?
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
      form.uuid
    )

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

export function connectAssetInfoLogic(db: Database.Database, uuid: string): any {
  try {
    const stmt = db.prepare(`
        SELECT asset_ip, auth_type, port, username, password, key_chain_id
        FROM t_assets
        WHERE uuid = ?
      `)
    const result = stmt.get(uuid)
    if (result && result.auth_type === 'keyBased') {
      const keyChainStmt = db.prepare(`
          SELECT chain_private_key as privateKey, passphrase
          FROM t_asset_chains
          WHERE key_chain_id = ?
        `)
      result.key_chain_id
      const keyChainResult = keyChainStmt.get(result.key_chain_id)
      if (keyChainResult) {
        result.privateKey = keyChainResult.privateKey
        result.passphrase = keyChainResult.passphrase
      }
    }
    result.host = result.asset_ip
    return result
  } catch (error) {
    console.error('Chaterm database get asset error:', error)
    throw error
  }
}
// @Get user host list
export function getUserHostsLogic(db: Database.Database, search: string): any {
  try {
    const safeSearch = search ?? ''
    const stmt = db.prepare(`
        SELECT asset_ip, uuid
        FROM t_assets
        WHERE asset_ip LIKE '%${safeSearch}%'
        GROUP BY asset_ip
        LIMIT 10
      `)
    const results = stmt.all() || []
    return results.map((item: any) => ({
      host: item.asset_ip,
      uuid: item.uuid
    }))
  } catch (error) {
    console.error('Chaterm database get user hosts error:', error)
    throw error
  }
}
