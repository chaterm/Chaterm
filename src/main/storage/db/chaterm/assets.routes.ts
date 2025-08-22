import Database from 'better-sqlite3'
import { QueryResult } from '../types'

/**
 * 数据库迁移函数：检查并添加comment字段和自定义文件夹表
 * 仅在路由构建时使用
 */
function migrateDatabaseIfNeeded(db: Database.Database) {
  try {
    // 检查comment字段是否存在
    const pragmaStmt = db.prepare('PRAGMA table_info(t_organization_assets)')
    const columns = pragmaStmt.all()
    const hasCommentColumn = columns.some((col: any) => col.name === 'comment')

    if (!hasCommentColumn) {
      console.log('正在添加comment字段到t_organization_assets表...')
      const alterStmt = db.prepare('ALTER TABLE t_organization_assets ADD COLUMN comment TEXT')
      alterStmt.run()
      console.log('comment字段添加成功')
    }

    // 检查并创建自定义文件夹表
    const checkCustomFoldersTable = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_custom_folders'
    `)
    const customFoldersTable = checkCustomFoldersTable.get()

    if (!customFoldersTable) {
      console.log('正在创建自定义文件夹表...')
      const createCustomFoldersTable = db.prepare(`
        CREATE TABLE IF NOT EXISTS t_custom_folders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      createCustomFoldersTable.run()
      console.log('自定义文件夹表创建成功')
    }

    // 检查并创建资产文件夹映射表
    const checkAssetFolderMappingTable = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_asset_folder_mapping'
    `)
    const assetFolderMappingTable = checkAssetFolderMappingTable.get()

    if (!assetFolderMappingTable) {
      console.log('正在创建资产文件夹映射表...')
      const createAssetFolderMappingTable = db.prepare(`
        CREATE TABLE IF NOT EXISTS t_asset_folder_mapping (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          folder_uuid TEXT NOT NULL,
          organization_uuid TEXT NOT NULL,
          asset_host TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(folder_uuid, organization_uuid, asset_host)
        )
      `)
      createAssetFolderMappingTable.run()
      console.log('资产文件夹映射表创建成功')
    }
  } catch (error) {
    console.error('数据库迁移失败:', error)
  }
}

export function getLocalAssetRouteLogic(db: Database.Database, searchType: string, params: any[] = []): any {
  try {
    // 执行数据库迁移
    migrateDatabaseIfNeeded(db)
    const result: QueryResult = {
      code: 200,
      data: {
        routers: []
      },
      ts: new Date().toString()
    }

    // 如果是 assetConfig 页面，获取所有资产类型
    if (searchType === 'assetConfig') {
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
      if (searchType !== 'assetConfig') {
        const favoriteAssets: any[] = []

        // 收藏的组织
        const favoriteOrgsStmt = db.prepare(`
          SELECT uuid, label, asset_ip, port, username, password, key_chain_id, auth_type, favorite
          FROM t_assets
          WHERE asset_type = 'organization' AND favorite = 1
          ORDER BY created_at
        `)
        const favoriteOrgs = favoriteOrgsStmt.all() || []

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

        // 收藏的组织子资产
        const favoriteSubAssetsStmt = db.prepare(`
          SELECT oa.hostname as asset_name, oa.host as asset_ip, oa.organization_uuid, oa.uuid, oa.favorite, oa.comment,
                 a.label as org_label, a.asset_ip as org_ip
          FROM t_organization_assets oa
          JOIN t_assets a ON oa.organization_uuid = a.uuid
          WHERE oa.favorite = 1 AND a.asset_type = 'organization'
          ORDER BY oa.hostname
        `)
        const favoriteSubAssets = favoriteSubAssetsStmt.all() || []

        for (const subAsset of favoriteSubAssets) {
          favoriteAssets.push({
            key: `favorite_${subAsset.organization_uuid}_${subAsset.asset_ip}`,
            title: subAsset.asset_name || subAsset.asset_ip,
            favorite: true,
            ip: subAsset.asset_ip,
            uuid: subAsset.uuid,
            comment: subAsset.comment,
            asset_type: 'organization',
            organizationId: subAsset.organization_uuid
          })
        }

        if (favoriteAssets.length > 0) {
          result.data.routers.push({
            key: 'favorites',
            title: '收藏栏',
            asset_type: 'favorites',
            children: favoriteAssets
          })
        }

        // 自定义文件夹
        const customFoldersStmt = db.prepare(`
          SELECT uuid, name, description
          FROM t_custom_folders
          ORDER BY created_at DESC
        `)
        const customFolders = customFoldersStmt.all() || []

        for (const folder of customFolders) {
          const folderAssetsStmt = db.prepare(`
            SELECT 
              afm.folder_uuid,
              afm.organization_uuid,
              afm.asset_host,
              oa.hostname,
              oa.favorite,
              oa.comment,
              oa.uuid as asset_uuid,
              a.label as org_label
            FROM t_asset_folder_mapping afm
            JOIN t_organization_assets oa ON afm.organization_uuid = oa.organization_uuid AND afm.asset_host = oa.host
            JOIN t_assets a ON afm.organization_uuid = a.uuid
            WHERE afm.folder_uuid = ?
            ORDER BY oa.hostname
          `)
          const folderAssets = folderAssetsStmt.all(folder.uuid) || []

          const children = folderAssets.map((asset: any) => ({
            key: `folder_${folder.uuid}_${asset.organization_uuid}_${asset.asset_host}`,
            title: asset.hostname || asset.asset_host,
            favorite: asset.favorite === 1,
            ip: asset.asset_host,
            uuid: asset.asset_uuid,
            comment: asset.comment,
            asset_type: 'organization',
            organizationId: asset.organization_uuid,
            folderUuid: folder.uuid
          }))

          result.data.routers.push({
            key: `folder_${folder.uuid}`,
            title: folder.name,
            description: folder.description,
            asset_type: 'custom_folder',
            folderUuid: folder.uuid,
            children: children
          })
        }
      }

      // 企业组织资产
      const organizationAssetsStmt = db.prepare(`
        SELECT uuid, label, asset_ip, port, username, password, key_chain_id, auth_type, favorite
        FROM t_assets
        WHERE asset_type = 'organization'
        ORDER BY created_at
      `)
      const organizationAssets = organizationAssetsStmt.all() || []

      for (const orgAsset of organizationAssets) {
        const nodesStmt = db.prepare(`
          SELECT hostname as asset_name, host as asset_ip, organization_uuid, uuid, created_at, favorite, comment
          FROM t_organization_assets
          WHERE organization_uuid = ?
          ORDER BY hostname
        `)
        const nodes = nodesStmt.all(orgAsset.uuid) || []

        const children = nodes.map((node: any) => ({
          key: `${orgAsset.uuid}_${node.asset_ip}`,
          title: node.asset_name || node.asset_ip,
          favorite: node.favorite === 1,
          ip: node.asset_ip,
          uuid: node.uuid,
          comment: node.comment,
          asset_type: 'organization',
          organizationId: orgAsset.uuid
        }))

        result.data.routers.push({
          key: orgAsset.uuid,
          title: orgAsset.label || orgAsset.asset_ip,
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
