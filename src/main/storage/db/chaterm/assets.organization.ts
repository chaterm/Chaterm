import Database from 'better-sqlite3'
import JumpServerClient from '../../../ssh/jumpserver/asset'
import { v4 as uuidv4 } from 'uuid'

export function connectAssetInfoLogic(db: Database.Database, uuid: string): any {
  try {
    const stmt = db.prepare(`
        SELECT uuid, asset_ip, auth_type, port, username, password, key_chain_id, need_proxy, proxy_name
        FROM t_assets
        WHERE uuid = ?
      `)
    let result = stmt.get(uuid)
    let sshType = 'ssh'

    if (!result) {
      const orgAssetStmt = db.prepare(`
        SELECT oa.hostname, oa.host, a.asset_ip, oa.organization_uuid, oa.uuid, oa.jump_server_type,
              a.auth_type, a.port, a.username, a.password, a.key_chain_id, a.need_proxy, a.proxy_name
        FROM t_organization_assets oa
        JOIN t_assets a ON oa.organization_uuid = a.uuid
        WHERE oa.uuid = ?
      `)
      result = orgAssetStmt.get(uuid)
      if (result) {
        sshType = result.jump_server_type || 'jumpserver'
      }
    } else {
      ;(result as any).host = (result as any).asset_ip
    }

    if (!result) {
      return null
    }

    if (result && (result as any).auth_type === 'keyBased') {
      const keyChainStmt = db.prepare(`
          SELECT chain_private_key as privateKey, passphrase
          FROM t_asset_chains
          WHERE key_chain_id = ?
        `)
      const keyChainResult = keyChainStmt.get((result as any).key_chain_id)
      if (keyChainResult) {
        ;(result as any).privateKey = keyChainResult.privateKey
        ;(result as any).passphrase = keyChainResult.passphrase
      }
    }
    ;(result as any).sshType = sshType
    ;(result as any).needProxy = !!(result as any).need_proxy
    ;(result as any).proxyName = (result as any).proxy_name
    const organizationUuid = (result as any).organization_uuid
    ;(result as any).assetUuid = organizationUuid || (result as any).uuid
    return result
  } catch (error) {
    console.error('Chaterm database get asset error:', error)
    throw error
  }
}

export function getUserHostsLogic(db: Database.Database, search: string, limit: number = 50, offset: number = 0): any {
  try {
    const safeSearch = search ?? ''
    const searchPattern = safeSearch ? `%${safeSearch}%` : '%'

    // 自动清理孤立的组织资产
    const deleteOrphanedStmt = db.prepare(`
      DELETE FROM t_organization_assets
      WHERE uuid IN (
        SELECT oa.uuid
        FROM t_organization_assets oa
        LEFT JOIN t_assets a ON oa.organization_uuid = a.uuid AND a.asset_type = 'organization'
        WHERE a.uuid IS NULL
      )
    `)
    deleteOrphanedStmt.run()

    // 查询个人资产
    const personalStmt = db.prepare(`
        SELECT asset_ip as host, uuid, 'person' as asset_type
        FROM t_assets
        WHERE asset_ip LIKE ? AND asset_type = 'person'
        GROUP BY asset_ip
      `)
    const personalResults = personalStmt.all(searchPattern) || []

    // Query organization assets (jump server resources) with parameterized query
    const orgStmt = db.prepare(`
        SELECT host, uuid, jump_server_type as asset_type
        FROM t_organization_assets
        WHERE host LIKE ?
        GROUP BY host
      `)
    const orgResults = orgStmt.all(searchPattern) || []

    // Merge results: prioritize personal assets, but ensure organization assets are also included
    const allResults = [...personalResults, ...orgResults]

    // Remove duplicates by host (keep first occurrence)
    const uniqueResults = Array.from(new Map(allResults.map((item) => [item.host, item])).values())

    // Apply pagination
    const total = uniqueResults.length
    const paginatedResults = uniqueResults.slice(offset, offset + limit)

    return {
      data: paginatedResults.map((item: any) => ({
        host: item.host,
        uuid: item.uuid,
        asset_type: item.asset_type
      })),
      total,
      hasMore: offset + limit < total
    }
  } catch (error) {
    console.error('Chaterm database get user hosts error:', error)
    throw error
  }
}

export async function refreshOrganizationAssetsLogic(
  db: Database.Database,
  organizationUuid: string,
  jumpServerConfig: any,
  keyboardInteractiveHandler?: any,
  authResultCallback?: any
): Promise<any> {
  try {
    console.log('开始刷新企业资产，组织UUID:', organizationUuid)

    let finalConfig = {
      host: jumpServerConfig.host,
      port: jumpServerConfig.port || 22,
      username: jumpServerConfig.username,
      privateKey: '',
      passphrase: '',
      password: '',
      connIdentToken: jumpServerConfig.connIdentToken
    }

    if (jumpServerConfig.keyChain && jumpServerConfig.keyChain > 0) {
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

    console.log('创建 JumpServerClient 实例...')
    const client = new JumpServerClient(finalConfig, keyboardInteractiveHandler, authResultCallback)

    console.log('开始调用 getAllAssets()...')
    const assets = await client.getAllAssets()

    console.log('getAllAssets() 调用完成，获取到资产数量:', assets.length)
    if (assets.length > 0) {
      console.log('前几个资产示例:', assets.slice(0, 3))
    }

    console.log('查询现有的组织资产...')
    const existingAssetsStmt = db.prepare(`
      SELECT host, hostname, uuid, favorite
      FROM t_organization_assets
      WHERE organization_uuid = ?
    `)
    const existingAssets = existingAssetsStmt.all(organizationUuid) || []
    console.log('现有组织资产数量:', existingAssets.length)
    const existingAssetsByHost = new Map(existingAssets.map((asset) => [asset.host, asset]))

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

    const currentAssetHosts = new Set<string>()
    console.log('开始处理从 JumpServer 获取的资产...')
    for (const asset of assets) {
      currentAssetHosts.add(asset.address)
      if (existingAssetsByHost.has(asset.address)) {
        console.log(`更新现有资产: ${asset.name} (${asset.address})`)
        updateStmt.run(asset.name, organizationUuid, asset.address)
      } else {
        const assetUuid = uuidv4()
        console.log(`插入新资产: ${asset.name} (${asset.address})`)
        insertStmt.run(organizationUuid, asset.name, asset.address, assetUuid, 'jumpserver')
      }
    }
    console.log('资产处理完成')

    const deleteStmt = db.prepare(`
      DELETE FROM t_organization_assets
      WHERE organization_uuid = ? AND host = ?
    `)

    for (const existingAsset of existingAssets) {
      if (!currentAssetHosts.has(existingAsset.host)) {
        deleteStmt.run(organizationUuid, existingAsset.host)
      }
    }

    console.log('关闭 JumpServer 客户端连接')
    client.close()

    console.log('资产刷新完成，返回成功结果')
    return {
      data: {
        message: 'success',
        totalAssets: assets.length
      }
    }
  } catch (error) {
    console.error('刷新企业资产失败，错误详情:', error)
    console.error('错误堆栈:', error instanceof Error ? error.stack : 'No stack trace')
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

export function updateOrganizationAssetCommentLogic(db: Database.Database, organizationUuid: string, host: string, comment: string): any {
  try {
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

    const updateStmt = db.prepare(`
      UPDATE t_organization_assets
      SET comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE organization_uuid = ? AND host = ?
    `)
    const result = updateStmt.run(comment, organizationUuid, host)

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('updateOrganizationAssetCommentLogic 错误:', error)
    throw error
  }
}

export function createCustomFolderLogic(db: Database.Database, name: string, description?: string): any {
  try {
    const folderUuid = uuidv4()

    const insertStmt = db.prepare(`
      INSERT INTO t_custom_folders (uuid, name, description)
      VALUES (?, ?, ?)
    `)
    const result = insertStmt.run(folderUuid, name, description || '')

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        folderUuid: folderUuid,
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('createCustomFolderLogic 错误:', error)
    throw error
  }
}

export function getCustomFoldersLogic(db: Database.Database): any {
  try {
    const selectStmt = db.prepare(`
      SELECT uuid, name, description, created_at, updated_at
      FROM t_custom_folders
      ORDER BY created_at DESC
    `)
    const folders = selectStmt.all()

    return {
      data: {
        message: 'success',
        folders: folders
      }
    }
  } catch (error) {
    console.error('getCustomFoldersLogic 错误:', error)
    throw error
  }
}

export function updateCustomFolderLogic(db: Database.Database, folderUuid: string, name: string, description?: string): any {
  try {
    const updateStmt = db.prepare(`
      UPDATE t_custom_folders
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE uuid = ?
    `)
    const result = updateStmt.run(name, description || '', folderUuid)

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('updateCustomFolderLogic 错误:', error)
    throw error
  }
}

export function deleteCustomFolderLogic(db: Database.Database, folderUuid: string): any {
  try {
    const deleteMappingStmt = db.prepare(`
      DELETE FROM t_asset_folder_mapping
      WHERE folder_uuid = ?
    `)
    deleteMappingStmt.run(folderUuid)

    const deleteFolderStmt = db.prepare(`
      DELETE FROM t_custom_folders
      WHERE uuid = ?
    `)
    const result = deleteFolderStmt.run(folderUuid)

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('deleteCustomFolderLogic 错误:', error)
    throw error
  }
}

export function moveAssetToFolderLogic(db: Database.Database, folderUuid: string, organizationUuid: string, assetHost: string): any {
  try {
    const assetStmt = db.prepare(`
      SELECT * FROM t_organization_assets
      WHERE organization_uuid = ? AND host = ?
    `)
    const asset = assetStmt.get(organizationUuid, assetHost)

    if (!asset) {
      return {
        data: {
          message: 'failed',
          error: '未找到指定的资产'
        }
      }
    }

    const folderStmt = db.prepare(`
      SELECT * FROM t_custom_folders
      WHERE uuid = ?
    `)
    const folder = folderStmt.get(folderUuid)

    if (!folder) {
      return {
        data: {
          message: 'failed',
          error: '未找到指定的文件夹'
        }
      }
    }

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO t_asset_folder_mapping (folder_uuid, organization_uuid, asset_host)
      VALUES (?, ?, ?)
    `)
    const result = insertStmt.run(folderUuid, organizationUuid, assetHost)

    return {
      data: {
        message: 'success',
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('moveAssetToFolderLogic 错误:', error)
    throw error
  }
}

export function removeAssetFromFolderLogic(db: Database.Database, folderUuid: string, organizationUuid: string, assetHost: string): any {
  try {
    const deleteStmt = db.prepare(`
      DELETE FROM t_asset_folder_mapping
      WHERE folder_uuid = ? AND organization_uuid = ? AND asset_host = ?
    `)
    const result = deleteStmt.run(folderUuid, organizationUuid, assetHost)

    return {
      data: {
        message: result.changes > 0 ? 'success' : 'failed',
        changes: result.changes
      }
    }
  } catch (error) {
    console.error('removeAssetFromFolderLogic 错误:', error)
    throw error
  }
}

export function getAssetsInFolderLogic(db: Database.Database, folderUuid: string): any {
  try {
    const selectStmt = db.prepare(`
      SELECT
        afm.folder_uuid,
        afm.organization_uuid,
        afm.asset_host,
        oa.hostname,
        oa.favorite,
        oa.comment,
        a.label as org_label
      FROM t_asset_folder_mapping afm
      JOIN t_organization_assets oa ON afm.organization_uuid = oa.organization_uuid AND afm.asset_host = oa.host
      JOIN t_assets a ON afm.organization_uuid = a.uuid
      WHERE afm.folder_uuid = ?
      ORDER BY oa.hostname
    `)
    const assets = selectStmt.all(folderUuid)

    return {
      data: {
        message: 'success',
        assets: assets
      }
    }
  } catch (error) {
    console.error('getAssetsInFolderLogic 错误:', error)
    throw error
  }
}
