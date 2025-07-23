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

    // 如果是 assetConfig 页面，获取所有资产类型
    if (searchType === 'assetConfig') {
      // assetConfig 页面不显示收藏栏

      // 获取所有分组（所有类型）
      const groupsStmt = db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL
        ORDER BY group_name
      `)
      const groups = groupsStmt.all() || []

      for (const group of groups) {
        const assetsStmt = db.prepare(`
          SELECT label, asset_ip, uuid, group_name, auth_type, port, username, password, key_chain_id, asset_type, favorite
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
              organizationId: item.asset_type === 'organization' ? item.uuid : 'personal'
            }))
          })
        }
      }

      return result
    }

    // 原有的按 asset_type 过滤逻辑（用于 Workspace）
    const assetType = params[0] || 'person'

    if (assetType === 'person') {
      // 个人资产逻辑保持不变
      if (searchType !== 'assetConfig') {
        const favoritesStmt = db.prepare(`
          SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id,asset_type
          FROM t_assets
          WHERE favorite = 1 AND asset_type = 'person'
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
        WHERE group_name IS NOT NULL AND asset_type = 'person'
        ORDER BY group_name
      `)
      const groups = groupsStmt.all() || []

      for (const group of groups) {
        const assetsStmt = db.prepare(`
          SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id,asset_type,favorite
          FROM t_assets
          WHERE group_name = ? AND asset_type = 'person'
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
    } else if (assetType === 'organization') {
      // 企业资产逻辑 - 添加收藏栏支持
      // 1. 首先添加收藏栏（如果不是 assetConfig 页面）
      if (searchType !== 'assetConfig') {
        // 查询所有收藏的企业资产（包括组织本身和组织下的子资产）
        const favoriteAssets = []

        // 查询收藏的组织本身
        const favoriteOrgsStmt = db.prepare(`
          SELECT uuid, label, asset_ip, port, username, password, key_chain_id, auth_type, favorite
          FROM t_assets
          WHERE asset_type = 'organization' AND favorite = 1
          ORDER BY created_at
        `)
        const favoriteOrgs = favoriteOrgsStmt.all() || []

        // 添加收藏的组织本身到收藏列表
        for (const org of favoriteOrgs) {
          favoriteAssets.push({
            key: `favorite_${org.uuid}`,
            title: org.label || org.asset_ip,
            favorite: true,
            ip: org.asset_ip,
            uuid: org.uuid,
            port: org.port || 22,
            username: org.username,
            password: org.password,
            key_chain_id: org.key_chain_id || 0,
            auth_type: org.auth_type,
            asset_type: 'organization',
            organizationId: org.uuid
          })
        }

        // 查询收藏的组织子资产
        const favoriteSubAssetsStmt = db.prepare(`
          SELECT oa.hostname as asset_name, oa.host as asset_ip, oa.organization_uuid, oa.uuid, oa.favorite,
                 a.label as org_label, a.asset_ip as org_ip
          FROM t_organization_assets oa
          JOIN t_assets a ON oa.organization_uuid = a.uuid
          WHERE oa.favorite = 1 AND a.asset_type = 'organization'
          ORDER BY oa.hostname
        `)
        const favoriteSubAssets = favoriteSubAssetsStmt.all() || []

        // 添加收藏的子资产到收藏列表
        for (const subAsset of favoriteSubAssets) {
          favoriteAssets.push({
            key: `favorite_${subAsset.organization_uuid}_${subAsset.asset_ip}`,
            title: subAsset.asset_name || subAsset.asset_ip,
            favorite: true,
            ip: subAsset.asset_ip,
            uuid: subAsset.uuid,
            asset_type: 'organization',
            organizationId: subAsset.organization_uuid
          })
        }

        // 如果有收藏的资产，添加收藏栏
        if (favoriteAssets.length > 0) {
          result.data.routers.push({
            key: 'favorite',
            title: '收藏栏',
            children: favoriteAssets
          })
        }
      }

      // 2. 然后显示所有组织及其子资产
      const organizationAssetsStmt = db.prepare(`
        SELECT uuid, label, asset_ip, port, username, password, key_chain_id, auth_type, favorite
        FROM t_assets
        WHERE asset_type = 'organization'
        ORDER BY created_at
      `)
      const organizationAssets = organizationAssetsStmt.all() || []

      for (const orgAsset of organizationAssets) {
        const nodesStmt = db.prepare(`
          SELECT hostname as asset_name, host as asset_ip, organization_uuid, uuid, created_at, favorite
          FROM t_organization_assets
          WHERE organization_uuid = ?
          ORDER BY hostname
        `)
        const nodes = nodesStmt.all(orgAsset.uuid) || []

        const children = nodes.map((node: any) => {
          const childNode = {
            key: `${orgAsset.uuid}_${node.asset_ip}`,
            title: node.asset_name || node.asset_ip,
            favorite: node.favorite === 1,
            ip: node.asset_ip,
            uuid: node.uuid,
            asset_type: 'organization',
            organizationId: orgAsset.uuid
          }
          return childNode
        })

        result.data.routers.push({
          key: orgAsset.uuid,
          title: orgAsset.label || orgAsset.asset_ip,
          favorite: orgAsset.favorite === 1,
          ip: orgAsset.asset_ip,
          uuid: orgAsset.uuid,
          port: orgAsset.port || 22,
          username: orgAsset.username,
          password: orgAsset.password,
          key_chain_id: orgAsset.key_chain_id || 0,
          auth_type: orgAsset.auth_type,
          asset_type: 'organization',
          organizationId: orgAsset.uuid,
          children: children
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
    // 首先检查是否为组织类型资产
    const checkStmt = db.prepare(`
      SELECT asset_type FROM t_assets WHERE uuid = ?
    `)
    const asset = checkStmt.get(uuid)

    if (asset && asset.asset_type === 'organization') {
      // 如果是组织资产，先删除相关的组织子资产
      const deleteOrgAssetsStmt = db.prepare(`
        DELETE FROM t_organization_assets 
        WHERE organization_uuid = ?
      `)
      deleteOrgAssetsStmt.run(uuid)
    }

    // 删除主资产记录
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
    // 首先在 t_assets 表中查找
    const stmt = db.prepare(`
        SELECT asset_ip, auth_type, port, username, password, key_chain_id
        FROM t_assets
        WHERE uuid = ?
      `)
    let result = stmt.get(uuid)
    let sshType = 'ssh' // 默认为 ssh

    // 如果在 t_assets 中没找到，尝试在 t_organization_assets 中查找
    if (!result) {
      const orgAssetStmt = db.prepare(`
        SELECT oa.hostname, oa.host, a.asset_ip, oa.organization_uuid, oa.uuid, oa.jump_server_type,
              a.auth_type, a.port, a.username, a.password, a.key_chain_id
        FROM t_organization_assets oa
        JOIN t_assets a ON oa.organization_uuid = a.uuid
        WHERE oa.uuid = ?
      `)
      result = orgAssetStmt.get(uuid)
      if (result) {
        sshType = result.jump_server_type || 'jumpserver'
      }
    } else {
      result.host = result.asset_ip
    }

    if (!result) {
      return null
    }

    if (result && result.auth_type === 'keyBased') {
      const keyChainStmt = db.prepare(`
          SELECT chain_private_key as privateKey, passphrase
          FROM t_asset_chains
          WHERE key_chain_id = ?
        `)
      const keyChainResult = keyChainStmt.get(result.key_chain_id)
      if (keyChainResult) {
        result.privateKey = keyChainResult.privateKey
        result.passphrase = keyChainResult.passphrase
      }
    }
    result.sshType = sshType
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

    // 查询个人资产
    const personalStmt = db.prepare(`
        SELECT asset_ip as host, uuid, 'person' as asset_type
        FROM t_assets
        WHERE asset_ip LIKE '${safeSearch}%' AND asset_type = 'person'
        GROUP BY asset_ip
      `)
    const personalResults = personalStmt.all() || []

    // 查询组织资产
    const orgStmt = db.prepare(`
        SELECT host, uuid, jump_server_type as asset_type
        FROM t_organization_assets
        WHERE host LIKE '${safeSearch}%'
        GROUP BY host
      `)
    const orgResults = orgStmt.all() || []

    // 合并结果并去重
    const allResults = [...personalResults, ...orgResults]
    const uniqueResults = Array.from(new Map(allResults.map((item) => [item.host, item])).values()).slice(0, 10)

    return uniqueResults.map((item: any) => ({
      host: item.host,
      uuid: item.uuid,
      asset_type: item.asset_type
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

    // 获取现有的组织资产
    const existingAssetsStmt = db.prepare(`
      SELECT host, hostname, uuid, favorite 
      FROM t_organization_assets 
      WHERE organization_uuid = ?
    `)
    const existingAssets = existingAssetsStmt.all(organizationUuid) || []
    const existingAssetsByHost = new Map(existingAssets.map((asset) => [asset.host, asset]))

    // 准备SQL语句
    const updateStmt = db.prepare(`
      UPDATE t_organization_assets 
      SET hostname = ?, updated_at = CURRENT_TIMESTAMP
      WHERE organization_uuid = ? AND host = ?
    `)

    const insertStmt = db.prepare(`
      INSERT INTO t_organization_assets (
        organization_uuid, hostname, host, uuid, jump_server_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)

    const currentAssetHosts = new Set()
    // 处理从JumpServer获取的资产
    for (const asset of assets) {
      currentAssetHosts.add(asset.address)
      if (existingAssetsByHost.has(asset.address)) {
        // 存在的资产：更新hostname和updated_at
        updateStmt.run(asset.name, organizationUuid, asset.address)
      } else {
        // 新资产：插入新记录
        const assetUuid = uuidv4()
        insertStmt.run(organizationUuid, asset.name, asset.address, assetUuid, 'jumpserver')
      }
    }

    // 删除不存在的资产
    const deleteStmt = db.prepare(`
      DELETE FROM t_organization_assets 
      WHERE organization_uuid = ? AND host = ?
    `)

    for (const existingAsset of existingAssets) {
      if (!currentAssetHosts.has(existingAsset.host)) {
        deleteStmt.run(organizationUuid, existingAsset.host)
      }
    }

    client.close()

    return {
      data: {
        message: 'success',
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

export function updateOrganizationAssetFavoriteLogic(db: Database.Database, organizationUuid: string, host: string, status: number): any {
  try {
    // 先查询当前记录
    const selectStmt = db.prepare(`
      SELECT * FROM t_organization_assets 
      WHERE organization_uuid = ? AND host = ?
    `)
    const currentRecord = selectStmt.get(organizationUuid, host)

    if (!currentRecord) {
      return {
        data: {
          message: 'failed',
          error: '未找到匹配的记录'
        }
      }
    }

    // 执行更新
    const updateStmt = db.prepare(`
      UPDATE t_organization_assets
      SET favorite = ?, updated_at = CURRENT_TIMESTAMP
      WHERE organization_uuid = ? AND host = ?
    `)
    const result = updateStmt.run(status, organizationUuid, host)

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('updateOrganizationAssetFavoriteLogic 错误:', error)
    throw error
  }
}
