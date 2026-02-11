import Database from 'better-sqlite3'
import { getUserConfig } from '../../../agent/core/storage/state'
import { capabilityRegistry } from '../../../ssh/capabilityRegistry'

import { createLogger } from '@logging'

const logger = createLogger('db')

/**
 * Get available organization asset types dynamically based on capability registry.
 * JumpServer ('organization') is always available as a built-in type.
 * Plugin-based bastion hosts are available if their capability is registered.
 *
 * Returns asset type prefixes like: ['organization', 'organization-qizhi', 'organization-tencent']
 */
export function getOrganizationAssetTypes(): string[] {
  const types = ['organization'] // JumpServer is always built-in

  // Add plugin-based bastion types from definitions
  const definitions = capabilityRegistry.listBastionDefinitions()
  for (const def of definitions) {
    // Use assetTypePrefix from definition, or fallback to 'organization-${type}'
    const assetType = def.assetTypePrefix || `organization-${def.type}`
    if (!types.includes(assetType)) {
      types.push(assetType)
    }
  }

  return types
}

/**
 * Get all organization asset types including both registered definitions AND
 * existing types from the database. This prevents accidental data deletion when
 * plugins are not yet loaded or definitions are missing.
 *
 * Use this for cleanup/query operations that should preserve existing data.
 */
export function getOrganizationAssetTypesWithExisting(db: Database.Database): string[] {
  const types = getOrganizationAssetTypes()

  // Also include any organization-* types that exist in the database
  // This prevents orphaned assets when plugins are not loaded
  try {
    const existingTypesStmt = db.prepare(`
      SELECT DISTINCT asset_type FROM t_assets
      WHERE asset_type LIKE 'organization%'
    `)
    const existingTypes = existingTypesStmt.all() as { asset_type: string }[]
    for (const row of existingTypes) {
      if (row.asset_type && !types.includes(row.asset_type)) {
        types.push(row.asset_type)
      }
    }
  } catch (error) {
    logger.warn('[getOrganizationAssetTypesWithExisting] Failed to query existing types', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return types
}

// Helper function to check if asset type is an organization type
const isOrganizationType = (assetType: string): boolean => {
  // Dynamic check: starts with 'organization' prefix
  return assetType === 'organization' || assetType.startsWith('organization-')
}

// Import language translations
const translations = {
  'zh-CN': {
    favoriteBar: '收藏栏'
  },
  'zh-TW': {
    favoriteBar: '收藏欄'
  },
  'en-US': {
    favoriteBar: 'Favorites'
  },
  'ja-JP': {
    favoriteBar: 'お気に入り'
  },
  'ko-KR': {
    favoriteBar: '즐겨찾기'
  },
  'de-DE': {
    favoriteBar: 'Favoriten'
  },
  'fr-FR': {
    favoriteBar: 'Favoris'
  },
  'it-IT': {
    favoriteBar: 'Preferiti'
  },
  'pt-PT': {
    favoriteBar: 'Favoritos'
  },
  'ru-RU': {
    favoriteBar: 'Избранное'
  }
}

// Function to get user's language preference
const getUserLanguage = async (): Promise<string> => {
  try {
    const userConfig = await getUserConfig()
    return userConfig?.language || 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

// Function to get translated text
const getTranslation = async (key: string, lang?: string): Promise<string> => {
  const language = lang || (await getUserLanguage())
  return translations[language]?.[key] || translations['zh-CN'][key] || key
}

// interface IRouter {
//   handle: (req: any, res: any) => any
// }

/**
 * Database migration function: Check and add comment field and custom folder tables
 * Only used during route construction
 */
function migrateDatabaseIfNeeded(db: Database.Database) {
  try {
    // Check if comment field exists
    const pragmaStmt = db.prepare('PRAGMA table_info(t_organization_assets)')
    const columns = pragmaStmt.all()
    const hasCommentColumn = columns.some((col: any) => col.name === 'comment')

    if (!hasCommentColumn) {
      logger.info('Adding comment field to t_organization_assets table...')
      const alterStmt = db.prepare('ALTER TABLE t_organization_assets ADD COLUMN comment TEXT')
      alterStmt.run()
      logger.info('Comment field added successfully')
    }

    // Check and create custom folders table
    const checkCustomFoldersTable = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_custom_folders'
    `)
    const customFoldersTable = checkCustomFoldersTable.get()

    if (!customFoldersTable) {
      logger.info('Creating custom folders table...')
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
      logger.info('Custom folders table created successfully')
    }

    // Check and create asset folder mapping table
    const checkAssetFolderMappingTable = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_asset_folder_mapping'
    `)
    const assetFolderMappingTable = checkAssetFolderMappingTable.get()

    if (!assetFolderMappingTable) {
      logger.info('Creating asset folder mapping table...')
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
      logger.info('Asset folder mapping table created successfully')
    }
  } catch (error) {
    logger.error('Database migration failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

export async function getLocalAssetRouteLogic(db: Database, searchType: string, params: any[] = []): Promise<any> {
  try {
    // Execute database migration
    migrateDatabaseIfNeeded(db)
    const result: any = {
      code: 200,
      data: {
        routers: []
      },
      ts: new Date().toString()
    }

    // If assetConfig page, get all asset types
    if (searchType === 'assetConfig') {
      // Get all groups (all types)
      const groupsStmt = db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL
        ORDER BY group_name
      `)
      const groups = groupsStmt.all() || []

      for (const group of groups) {
        const assetsStmt = db.prepare(`
          SELECT label, asset_ip, uuid, group_name, auth_type, port, username, password, key_chain_id, asset_type, favorite, need_proxy, proxy_name
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
              organizationId: isOrganizationType(item.asset_type) ? item.uuid : 'personal',
              needProxy: item.need_proxy === 1,
              proxyName: item.proxy_name
            }))
          })
        }
      }

      return result
    }

    // Original asset_type filtering logic (for Workspace)
    const assetType = params[0] || 'person'

    if (assetType === 'person') {
      if (searchType !== 'assetConfig') {
        const favoritesStmt = db.prepare(`
          SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id,asset_type
          FROM t_assets
          WHERE favorite = 1 AND asset_type IN ('person', 'person-switch-cisco', 'person-switch-huawei')
          ORDER BY created_at
        `)
        const favorites = favoritesStmt.all() || []

        if (favorites && favorites.length > 0) {
          result.data.routers.push({
            key: 'favorite',
            title: await getTranslation('favoriteBar'),
            children: favorites.map((item: any) => ({
              key: `favorite_${item.asset_ip || ''}_${item.username || 'no_user'}_${item.label || 'no_label'}_${item.uuid || ''}`,
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
              organizationId: 'personal',
              needProxy: item.need_proxy === 1,
              proxyName: item.proxy_name
            }))
          })
        }
      }

      const groupsStmt = db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL AND asset_type IN ('person', 'person-switch-cisco', 'person-switch-huawei')
        ORDER BY group_name
      `)
      const groups = groupsStmt.all() || []

      for (const group of groups) {
        const assetsStmt = db.prepare(`
          SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id,asset_type,favorite
          FROM t_assets
          WHERE group_name = ? AND asset_type IN ('person', 'person-switch-cisco', 'person-switch-huawei')
          ORDER BY created_at
        `)
        const assets = assetsStmt.all(group.group_name) || []

        if (assets && assets.length > 0) {
          result.data.routers.push({
            key: group.group_name,
            title: group.group_name,
            children: assets.map((item: any) => ({
              key: `${group.group_name}_${item.asset_ip || ''}_${item.username || 'no_user'}_${item.label || 'no_label'}`,
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
              organizationId: 'personal',
              needProxy: item.need_proxy === 1,
              proxyName: item.proxy_name
            }))
          })
        }
      }
    } else if (isOrganizationType(assetType)) {
      // Get available organization types based on capability registry
      const availableOrgTypes = getOrganizationAssetTypes()
      const orgTypePlaceholders = availableOrgTypes.map(() => '?').join(', ')

      // Organization asset logic (JumpServer and Qizhi) - add favorites bar support
      if (searchType !== 'assetConfig') {
        const favoriteAssets: any[] = []

        // Favorite organizations (based on available types)
        const favoriteOrgsStmt = db.prepare(`
          SELECT uuid, label, asset_ip, port, username, password, key_chain_id, auth_type, favorite, asset_type
          FROM t_assets
          WHERE asset_type IN (${orgTypePlaceholders}) AND favorite = 1
          ORDER BY created_at
        `)
        const favoriteOrgs = favoriteOrgsStmt.all(...availableOrgTypes) || []

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
            asset_type: org.asset_type || 'organization',
            organizationId: org.uuid
          })
        }

        // Favorite organization sub-assets (based on available types)
        const favoriteSubAssetsStmt = db.prepare(`
          SELECT oa.hostname as asset_name, oa.host as asset_ip, oa.organization_uuid, oa.uuid, oa.favorite, oa.comment,
                 a.label as org_label, a.asset_ip as org_ip, a.asset_type
          FROM t_organization_assets oa
          JOIN t_assets a ON oa.organization_uuid = a.uuid
          WHERE oa.favorite = 1 AND a.asset_type IN (${orgTypePlaceholders})
          ORDER BY oa.hostname
        `)
        const favoriteSubAssets = favoriteSubAssetsStmt.all(...availableOrgTypes) || []

        for (const subAsset of favoriteSubAssets) {
          favoriteAssets.push({
            key: `favorite_${subAsset.organization_uuid}_${subAsset.asset_ip}`,
            title: subAsset.asset_name || subAsset.asset_ip,
            favorite: true,
            ip: subAsset.asset_ip,
            uuid: subAsset.uuid,
            comment: subAsset.comment,
            asset_type: subAsset.asset_type || 'organization',
            organizationId: subAsset.organization_uuid
          })
        }

        if (favoriteAssets.length > 0) {
          result.data.routers.push({
            key: 'favorites',
            title: await getTranslation('favoriteBar'),
            asset_type: 'favorites',
            children: favoriteAssets
          })
        }

        // Custom folders
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
              a.label as org_label,
              a.asset_type as org_asset_type
            FROM t_asset_folder_mapping afm
            JOIN t_organization_assets oa ON afm.organization_uuid = oa.organization_uuid AND afm.asset_host = oa.host
            JOIN t_assets a ON afm.organization_uuid = a.uuid
            WHERE afm.folder_uuid = ?
            ORDER BY oa.hostname
          `)
          const folderAssets = folderAssetsStmt.all(folder.uuid) || []

          const children = folderAssets.map((asset: any) => ({
            key: `folder_${folder.uuid}_${asset.organization_uuid}_${asset.asset_host}_${asset.hostname || 'no_name'}`,
            title: asset.hostname || asset.asset_host,
            favorite: asset.favorite === 1,
            ip: asset.asset_host,
            uuid: asset.asset_uuid,
            comment: asset.comment,
            asset_type: asset.org_asset_type || 'organization',
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

      // Organization assets (based on available types)
      const organizationAssetsStmt = db.prepare(`
        SELECT uuid, label, asset_ip, port, username, password, key_chain_id, auth_type, favorite, asset_type
        FROM t_assets
        WHERE asset_type IN (${orgTypePlaceholders})
        ORDER BY created_at
      `)
      const organizationAssets = organizationAssetsStmt.all(...availableOrgTypes) || []

      for (const orgAsset of organizationAssets) {
        const nodesStmt = db.prepare(`
          SELECT hostname as asset_name, host as asset_ip, organization_uuid, uuid, created_at, favorite, comment
          FROM t_organization_assets
          WHERE organization_uuid = ?
          ORDER BY hostname
        `)
        const nodes = nodesStmt.all(orgAsset.uuid) || []

        const children = nodes.map((node: any) => ({
          key: `${orgAsset.uuid}_${node.asset_ip}_${node.asset_name || 'no_name'}`,
          title: node.asset_name || node.asset_ip,
          favorite: node.favorite === 1,
          ip: node.asset_ip,
          uuid: node.uuid,
          comment: node.comment,
          asset_type: orgAsset.asset_type || 'organization',
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
    logger.error('Chaterm database query error', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
