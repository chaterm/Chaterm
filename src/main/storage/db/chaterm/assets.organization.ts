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

export function getUserHostsLogic(db: Database.Database, search: string, limit: number = 50): any {
  try {
    const safeSearch = search ?? ''
    const searchPattern = safeSearch ? `%${safeSearch}%` : '%'
    const maxItems = Math.max(1, Math.floor(limit) || 50)

    // Auto cleanup orphaned organization assets
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

    // Step 1: Query personal assets (asset_type='person')
    const personalStmt = db.prepare(`
        SELECT asset_ip as host, uuid
        FROM t_assets
        WHERE asset_ip LIKE ? AND asset_type = 'person'
        GROUP BY asset_ip, uuid
      `)
    const personalResults = personalStmt.all(searchPattern) || []

    // Step 2: Query jumpserver nodes (asset_type='organization')
    const jumpserverStmt = db.prepare(`
        SELECT uuid, asset_ip as host
        FROM t_assets
        WHERE asset_type = 'organization'
      `)
    const jumpserverResults = jumpserverStmt.all() || []

    // Step 3: Query jumpserver child assets with optional search filter
    const orgAssetsStmt = db.prepare(`
        SELECT
          oa.uuid as asset_uuid,
          oa.host,
          oa.organization_uuid,
          oa.jump_server_type as connection_type
        FROM t_organization_assets oa
        JOIN t_assets a ON oa.organization_uuid = a.uuid
        WHERE oa.host LIKE ?
      `)
    const orgAssetResults = orgAssetsStmt.all(searchPattern) || []

    // Step 4: Build tree structure

    // Format personal assets
    const personalData = personalResults.map((item: any) => ({
      key: `personal_${item.uuid}`,
      label: item.host,
      type: 'personal',
      selectable: true,
      uuid: item.uuid,
      connection: 'person'
    }))

    // Group org assets by organization_uuid
    const orgAssetsMap = new Map<string, any[]>()
    for (const asset of orgAssetResults) {
      const orgUuid = (asset as any).organization_uuid
      if (!orgAssetsMap.has(orgUuid)) {
        orgAssetsMap.set(orgUuid, [])
      }
      orgAssetsMap.get(orgUuid)!.push(asset)
    }

    // Build jumpserver tree nodes
    const jumpserverData = (jumpserverResults as any[])
      .filter((js: any) => {
        // Include jumpserver if it has matching children or no search term
        return !safeSearch || orgAssetsMap.has(js.uuid)
      })
      .map((js: any) => ({
        key: `jumpserver_${js.uuid}`,
        label: js.host,
        type: 'jumpserver',
        selectable: false,
        uuid: js.uuid,
        connection: 'organization',
        children: (orgAssetsMap.get(js.uuid) || []).map((child: any) => ({
          key: `jumpserver_${js.uuid}_${child.asset_uuid}`,
          label: child.host,
          type: 'jumpserver_child',
          selectable: true,
          uuid: child.asset_uuid,
          connection: child.connection_type || 'jumpserver',
          organizationUuid: js.uuid
        }))
      }))
      .filter((js: any) => js.children.length > 0) // Only include jumpservers with children

    // Calculate total count
    const childrenCount = jumpserverData.reduce((sum: number, js: any) => sum + js.children.length, 0)
    const total = personalData.length + jumpserverData.length + childrenCount

    // Step 5: Apply maxItems limit while keeping tree integrity
    const trimmedPersonal: any[] = []
    let remaining = maxItems

    for (const p of personalData) {
      if (remaining <= 0) break
      trimmedPersonal.push(p)
      remaining -= 1
    }

    const trimmedJumpservers: any[] = []

    for (const js of jumpserverData) {
      if (remaining <= 1) break // need at least space for parent + one child

      const availableForChildren = remaining - 1
      const children: any[] = []
      for (const child of js.children) {
        if (children.length >= availableForChildren) break
        children.push(child)
      }

      if (children.length === 0) {
        continue
      }

      trimmedJumpservers.push({
        ...js,
        children
      })

      remaining -= 1 + children.length
      if (remaining <= 0) break
    }

    return {
      data: {
        personal: trimmedPersonal,
        jumpservers: trimmedJumpservers
      },
      total: total > maxItems ? maxItems : total,
      hasMore: false // No pagination; rely on search to narrow results
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
    console.log('Starting to refresh organization assets, organization UUID:', organizationUuid)

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
        throw new Error('Keychain not found')
      }
    } else if (jumpServerConfig.password) {
      finalConfig.password = jumpServerConfig.password
    } else {
      throw new Error('Missing authentication information: private key or password required')
    }

    console.log('Final configuration:', { ...finalConfig, privateKey: finalConfig.privateKey ? '[HIDDEN]' : undefined })

    console.log('Creating JumpServerClient instance...')
    const client = new JumpServerClient(finalConfig, keyboardInteractiveHandler, authResultCallback)

    console.log('Starting to call getAllAssets()...')
    const assets = await client.getAllAssets()

    console.log('getAllAssets() call completed, number of assets retrieved:', assets.length)
    if (assets.length > 0) {
      console.log('First few asset examples:', assets.slice(0, 3))
    }

    console.log('Querying existing organization assets...')
    const existingAssetsStmt = db.prepare(`
      SELECT host, hostname, uuid, favorite
      FROM t_organization_assets
      WHERE organization_uuid = ?
    `)
    const existingAssets = existingAssetsStmt.all(organizationUuid) || []
    console.log('Number of existing organization assets:', existingAssets.length)
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
    console.log('Starting to process assets retrieved from JumpServer...')
    for (const asset of assets) {
      currentAssetHosts.add(asset.address)
      if (existingAssetsByHost.has(asset.address)) {
        console.log(`Updating existing asset: ${asset.name} (${asset.address})`)
        updateStmt.run(asset.name, organizationUuid, asset.address)
      } else {
        const assetUuid = uuidv4()
        console.log(`Inserting new asset: ${asset.name} (${asset.address})`)
        insertStmt.run(organizationUuid, asset.name, asset.address, assetUuid, 'jumpserver')
      }
    }
    console.log('Asset processing completed')

    const deleteStmt = db.prepare(`
      DELETE FROM t_organization_assets
      WHERE organization_uuid = ? AND host = ?
    `)

    for (const existingAsset of existingAssets) {
      if (!currentAssetHosts.has(existingAsset.host)) {
        deleteStmt.run(organizationUuid, existingAsset.host)
      }
    }

    console.log('Closing JumpServer client connection')
    client.close()

    console.log('Organization asset refresh completed, returning success result')
    return {
      data: {
        message: 'success',
        totalAssets: assets.length
      }
    }
  } catch (error) {
    console.error('Failed to refresh organization assets, error details:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
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
          error: 'No matching record found'
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
    console.error('updateOrganizationAssetFavoriteLogic error:', error)
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
          error: 'No matching record found'
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
    console.error('updateOrganizationAssetCommentLogic error:', error)
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
    console.error('createCustomFolderLogic error:', error)
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
    console.error('getCustomFoldersLogic error:', error)
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
    console.error('updateCustomFolderLogic error:', error)
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
    console.error('deleteCustomFolderLogic error:', error)
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
          error: 'Specified asset not found'
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
          error: 'Specified folder not found'
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
    console.error('moveAssetToFolderLogic error:', error)
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
    console.error('removeAssetFromFolderLogic error:', error)
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
    console.error('getAssetsInFolderLogic error:', error)
    throw error
  }
}
