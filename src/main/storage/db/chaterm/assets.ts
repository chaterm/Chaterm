import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { QueryResult } from '../types'
import JumpServerClient from '../../../ssh/jumpserver/asset'

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
        SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id,asset_type
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
            asset_type: item.asset_type || 'person',
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
          SELECT label, asset_ip, uuid, favorite,group_name,label,auth_type,port,username,password,key_chain_id,asset_type
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
            asset_type: item.asset_type || 'person',
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
          favorite,
          asset_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      form.asset_type || 'person'
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
// @获取用户主机列表
export function getUserHostsLogic(db: Database.Database, search: string): any {
  try {
    const safeSearch = search ?? ''
    const stmt = db.prepare(`
        SELECT asset_ip, uuid
        FROM t_assets
        WHERE asset_ip LIKE '${safeSearch}%'
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

export async function refreshOrganizationAssetsLogic(db: Database.Database, organizationUuid: string, jumpServerConfig: any): Promise<any> {
  try {
    console.log('开始刷新企业资产，组织UUID:', organizationUuid)

    // 处理密钥链配置
    let finalConfig = {
      host: jumpServerConfig.host,
      port: jumpServerConfig.port || 22,
      username: jumpServerConfig.username,
      privateKey: '',
      passphrase: '',
      password: ''
    }

    if (jumpServerConfig.keyChain && jumpServerConfig.keyChain > 0) {
      // 从数据库获取私钥
      const keyChainStmt = db.prepare(`
        SELECT chain_private_key as privateKey, passphrase
        FROM t_asset_chains
        WHERE key_chain_id = ?
      `)
      const keyChainResult = keyChainStmt.get(jumpServerConfig.keyChain)

      if (keyChainResult && keyChainResult.privateKey) {
        finalConfig.privateKey = keyChainResult.privateKey
        if (keyChainResult.passphrase) {
          finalConfig.passphrase = keyChainResult.passphrase
        }
      } else {
        throw new Error('未找到对应的密钥链')
      }
    } else if (jumpServerConfig.password) {
      finalConfig.password = jumpServerConfig.password
    } else {
      throw new Error('缺少认证信息：需要私钥或密码')
    }

    console.log('最终配置:', { ...finalConfig, privateKey: finalConfig.privateKey ? '[HIDDEN]' : undefined })

    const client = new JumpServerClient(finalConfig)
    const assets = await client.getAllAssets()

    console.log('获取到资产数量:', assets.length)

    // 确保表存在
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_organization_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_uuid TEXT,
        hostname TEXT,
        host TEXT,
        jump_server_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 清空现有的组织资产
    const deleteStmt = db.prepare(`
      DELETE FROM t_organization_assets 
      WHERE organization_uuid = ?
    `)
    const deleteResult = deleteStmt.run(organizationUuid)
    console.log('删除旧资产记录数:', deleteResult.changes)

    // 插入新的资产数据
    const insertStmt = db.prepare(`
      INSERT INTO t_organization_assets (
        organization_uuid, hostname, host, jump_server_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)

    let insertedCount = 0
    for (const asset of assets) {
      const result = insertStmt.run(organizationUuid, asset.name, asset.address, 'jumpserver')
      if (result.changes > 0) insertedCount++
    }

    console.log('成功插入资产数量:', insertedCount)
    client.close()

    return {
      data: {
        message: 'success',
        insertedCount,
        totalAssets: assets.length
      }
    }
  } catch (error) {
    console.error('刷新企业资产失败:', error)
    return {
      data: {
        message: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
