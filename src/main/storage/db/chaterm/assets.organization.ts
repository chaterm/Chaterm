import Database from 'better-sqlite3'
import JumpServerClient from '../../../ssh/jumpserver/asset'
import { v4 as uuidv4 } from 'uuid'
import { capabilityRegistry } from '../../../ssh/capabilityRegistry'
import { getOrganizationAssetTypesWithExisting } from './assets.routes'

/**
 * Extract bastion type from asset_type.
 * Examples:
 *   'organization' -> 'jumpserver' (built-in)
 *   'organization-qizhi' -> 'qizhi'
 *   'organization-tencent' -> 'tencent'
 */
function extractBastionType(assetType: string): string {
  if (assetType === 'organization') {
    return 'jumpserver'
  }
  if (assetType.startsWith('organization-')) {
    return assetType.replace('organization-', '')
  }
  return 'jumpserver'
}

/**
 * Check if asset type is a plugin-based bastion (not built-in JumpServer).
 */
function isPluginBastion(assetType: string): boolean {
  return assetType.startsWith('organization-')
}

export function connectAssetInfoLogic(db: Database.Database, uuid: string): any {
  try {
    const stmt = db.prepare(`
        SELECT uuid, asset_ip, asset_type, auth_type, port, username, password, key_chain_id, need_proxy, proxy_name
        FROM t_assets
        WHERE uuid = ?
      `)
    let result = stmt.get(uuid)
    let sshType = 'ssh'

    if (!result) {
      const orgAssetStmt = db.prepare(`
        SELECT oa.hostname, oa.host, oa.comment, a.asset_ip, oa.organization_uuid, oa.uuid, oa.jump_server_type,
              a.asset_type, a.auth_type, a.port, a.username, a.password, a.key_chain_id, a.need_proxy, a.proxy_name
        FROM t_organization_assets oa
        JOIN t_assets a ON oa.organization_uuid = a.uuid
        WHERE oa.uuid = ?
      `)
      result = orgAssetStmt.get(uuid)
      if (result) {
        // Determine sshType based on jump_server_type or parent asset_type
        // Priority: jump_server_type field > extracted from asset_type
        if (result.jump_server_type) {
          sshType = result.jump_server_type
        } else {
          // Extract bastion type from asset_type (e.g., 'organization-qizhi' -> 'qizhi')
          sshType = extractBastionType(result.asset_type || 'organization')
        }
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

    // Get available organization types dynamically, INCLUDING existing DB types
    // This prevents accidental deletion of assets when plugins are not loaded
    const orgTypes = getOrganizationAssetTypesWithExisting(db)
    const orgTypePlaceholders = orgTypes.map(() => '?').join(', ')

    // Auto cleanup orphaned organization assets
    const deleteOrphanedStmt = db.prepare(`
      DELETE FROM t_organization_assets
      WHERE uuid IN (
        SELECT oa.uuid
        FROM t_organization_assets oa
        LEFT JOIN t_assets a ON oa.organization_uuid = a.uuid AND a.asset_type IN (${orgTypePlaceholders})
        WHERE a.uuid IS NULL
      )
    `)
    deleteOrphanedStmt.run(...orgTypes)

    // Step 1: Query personal assets (asset_type='person' or switch types)
    const personalStmt = db.prepare(`
        SELECT asset_ip as host, uuid, asset_type
        FROM t_assets
        WHERE asset_ip LIKE ? AND asset_type IN ('person', 'person-switch-cisco', 'person-switch-huawei')
        GROUP BY asset_ip, uuid, asset_type
      `)
    const personalResults = personalStmt.all(searchPattern) || []

    // Step 2: Query bastion host nodes (organization types - dynamically)
    const jumpserverStmt = db.prepare(`
        SELECT uuid, asset_ip as host, asset_type
        FROM t_assets
        WHERE asset_type IN (${orgTypePlaceholders})
      `)
    const jumpserverResults = jumpserverStmt.all(...orgTypes) || []

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
      connection: 'person',
      assetType: item.asset_type
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

    // Build bastion host tree nodes
    const bastionData = (jumpserverResults as any[])
      .filter((js: any) => {
        // Include bastion host if it has matching children or no search term
        return !safeSearch || orgAssetsMap.has(js.uuid)
      })
      .map((js: any) => {
        // Determine connection type based on asset_type (generalized)
        const connectionType = extractBastionType(js.asset_type)
        return {
          key: `bastion_${js.uuid}`,
          label: js.host,
          type: 'bastion',
          selectable: false,
          uuid: js.uuid,
          connection: js.asset_type, // Keep original asset_type as connection identifier
          assetType: js.asset_type,
          children: (orgAssetsMap.get(js.uuid) || []).map((child: any) => ({
            key: `bastion_${js.uuid}_${child.asset_uuid}`,
            label: child.host,
            type: 'bastion_child',
            selectable: true,
            uuid: child.asset_uuid,
            connection: child.connection_type || connectionType,
            organizationUuid: js.uuid
          }))
        }
      })
      .filter((js: any) => js.children.length > 0) // Only include bastion hosts with children

    // Calculate total count
    const childrenCount = bastionData.reduce((sum: number, js: any) => sum + js.children.length, 0)
    const total = personalData.length + bastionData.length + childrenCount

    // Step 5: Apply maxItems limit while keeping tree integrity
    const trimmedPersonal: any[] = []
    let remaining = maxItems

    for (const p of personalData) {
      if (remaining <= 0) break
      trimmedPersonal.push(p)
      remaining -= 1
    }

    const trimmedBastions: any[] = []

    for (const js of bastionData) {
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

      trimmedBastions.push({
        ...js,
        children
      })

      remaining -= 1 + children.length
      if (remaining <= 0) break
    }

    return {
      data: {
        personal: trimmedPersonal,
        jumpservers: trimmedBastions
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

    // Query asset_type to determine which client to use
    const assetTypeStmt = db.prepare(`
      SELECT asset_type FROM t_assets WHERE uuid = ?
    `)
    const assetTypeResult = assetTypeStmt.get(organizationUuid)
    const assetType = assetTypeResult?.asset_type || 'organization'

    // Extract bastion type and check if it's plugin-based
    const bastionType = extractBastionType(assetType)
    const isPluginBased = isPluginBastion(assetType)

    console.log(`Organization type: ${assetType}, bastionType: ${bastionType}, isPluginBased: ${isPluginBased}`)

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

    // Route to different client based on asset type
    let assets: Array<{ name: string; address: string; description?: string }>
    if (isPluginBased) {
      // Use plugin-based bastion asset refresh via capability registry
      const bastionCapability = capabilityRegistry.getBastion(bastionType)

      if (!bastionCapability || !bastionCapability.refreshAssets) {
        throw new Error(`Bastion plugin '${bastionType}' not installed or does not support asset refresh`)
      }

      console.log(`Using ${bastionType} asset refresh via capability registry...`)
      const capabilityResult = await bastionCapability.refreshAssets({
        organizationUuid,
        host: finalConfig.host,
        port: finalConfig.port,
        username: finalConfig.username,
        password: finalConfig.password || undefined,
        privateKey: finalConfig.privateKey || undefined,
        passphrase: finalConfig.passphrase || undefined,
        onProgress: (message, current, total) => {
          console.log(`[${bastionType} Refresh] ${message}${current !== undefined ? ` (${current}/${total})` : ''}`)
        },
        onMfaRequired: keyboardInteractiveHandler
          ? async (promptFromPlugin?: string) => {
              const prompt = (promptFromPlugin && promptFromPlugin.trim()) || 'MFA Token:'

              return new Promise((resolve) => {
                keyboardInteractiveHandler([{ prompt }], (responses: string[]) => {
                  resolve(responses?.[0] || null)
                }).catch((error) => {
                  console.warn(`${bastionType} MFA handler error:`, error)
                  resolve(null)
                })
              })
            }
          : undefined,
        onMfaResult: authResultCallback
          ? (success: boolean, message?: string) => {
              authResultCallback(success, message)
            }
          : undefined
      })

      if (!capabilityResult.success) {
        throw new Error(capabilityResult.error || `Failed to refresh ${bastionType} assets via capability`)
      }

      assets = (capabilityResult.assets || []).map((a: any) => ({
        name: a.hostname || a.name,
        address: a.host || a.address,
        description: a.comment || a.description
      }))
      console.log(`${bastionType} assets retrieved via capability: ${assets.length}`)
    } else {
      // Use JumpServer client
      console.log('Using JumpServer client...')
      const client = new JumpServerClient(finalConfig, keyboardInteractiveHandler, authResultCallback)
      assets = await client.getAllAssets()
      client.close()
    }

    console.log('Assets retrieved, count:', assets.length)
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
    const makeKey = (x: { address?: string; hostname?: string; name?: string; host?: string }) =>
      `${x.host ?? x.address ?? ''}||${x.hostname ?? x.name ?? ''}`
    const existingAssetsByHost = new Map(existingAssets.map((asset) => [makeKey(asset), asset]))

    // Use different update statement for plugin-based bastions (includes jump_server_type)
    const updateStmt = isPluginBased
      ? db.prepare(`
      UPDATE t_organization_assets
      SET hostname = ?, comment = ?, jump_server_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE organization_uuid = ? AND host = ? AND hostname = ?
    `)
      : db.prepare(`
      UPDATE t_organization_assets
      SET hostname = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE organization_uuid = ? AND host = ? AND hostname = ?
    `)

    const insertStmt = isPluginBased
      ? db.prepare(`
      INSERT INTO t_organization_assets (
        organization_uuid, hostname, host, comment, uuid, jump_server_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
      : db.prepare(`
      INSERT INTO t_organization_assets (
        organization_uuid, hostname, host, comment, uuid, jump_server_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)

    const currentAssetHosts = new Set<string>()
    // Note: jump_server_type field stores the bastion type (historical field name, see design doc)
    const jumpServerType = bastionType
    console.log(`Starting to process assets retrieved from ${bastionType}...`)
    for (const asset of assets) {
      currentAssetHosts.add(asset.address)
      if (existingAssetsByHost.has(makeKey(asset))) {
        console.log(`Updating existing asset: ${asset.name} (${asset.address})`)
        if (isPluginBased) {
          updateStmt.run(asset.name, asset.description || '', jumpServerType, organizationUuid, asset.address, asset.name)
        } else {
          updateStmt.run(asset.name, asset.description || '', organizationUuid, asset.address, asset.name)
        }
      } else {
        const assetUuid = uuidv4()
        console.log(`Inserting new asset: ${asset.name} (${asset.address})`)
        if (isPluginBased) {
          insertStmt.run(organizationUuid, asset.name, asset.address, asset.description || '', assetUuid, jumpServerType)
        } else {
          insertStmt.run(organizationUuid, asset.name, asset.address, asset.description || '', assetUuid, jumpServerType)
        }
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
