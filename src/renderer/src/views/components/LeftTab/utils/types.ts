// Asset type definition: person (server), organization (jumpserver), organization-* (plugin bastions), person-switch-* (network switches)
// Note: Plugin-based bastions use 'organization-${type}' pattern (e.g., 'organization-qizhi', 'organization-tencent')
export type AssetType =
  | 'person' // Personal server
  | 'organization' // Bastion host (built-in = JumpServer)
  | `organization-${string}` // Plugin-based bastion hosts (dynamic)
  | 'person-switch-cisco'
  | 'person-switch-huawei'

export type BastionAuthPolicy = 'password' | 'keyBased'

export interface BastionDefinitionSummary {
  type: string
  authPolicy: BastionAuthPolicy[]
  displayNameKey?: string
  assetTypePrefix?: string
}

// Helper function to check if asset type is an organization asset (bastion host)
// Supports both built-in JumpServer ('organization') and plugin-based bastions ('organization-*')
export function isOrganizationAsset(assetType: string | undefined): boolean {
  if (!assetType) return false
  return assetType === 'organization' || assetType.startsWith('organization-')
}

// Helper function to get bastion host type from asset type
// Returns 'jumpserver' for built-in, or the plugin type name for plugin-based bastions
export function getBastionHostType(assetType: string | undefined): string | null {
  if (!assetType) return null
  if (assetType === 'organization') return 'jumpserver' // Built-in JumpServer
  if (assetType.startsWith('organization-')) {
    // Extract plugin type: 'organization-qizhi' -> 'qizhi'
    return assetType.substring('organization-'.length)
  }
  return null
}

// Helper function to get asset type from bastion type
export function getAssetTypeFromBastionType(bastionType: string): AssetType {
  if (bastionType === 'jumpserver') return 'organization'
  return `organization-${bastionType}` as AssetType
}

// Resolve auth type for bastion assets based on available definitions and current selection
export function resolveBastionAuthType(
  assetType: string | undefined,
  definitions: BastionDefinitionSummary[],
  currentAuthType?: string
): BastionAuthPolicy {
  const normalizedAuthType: BastionAuthPolicy | undefined =
    currentAuthType === 'password' || currentAuthType === 'keyBased' ? currentAuthType : undefined

  if (assetType === 'organization') return 'keyBased'

  if (isOrganizationAsset(assetType)) {
    const bastionType = getBastionHostType(assetType)
    const definition = bastionType ? definitions.find((d) => d.type === bastionType) : undefined

    if (normalizedAuthType) {
      if (!definition) return normalizedAuthType
      if (definition.authPolicy.includes(normalizedAuthType)) return normalizedAuthType
    }

    if (definition?.authPolicy?.length) {
      return definition.authPolicy[0]
    }

    return 'password'
  }

  return 'password'
}

// Helper function to check if asset type is a switch device
export function isSwitch(assetType: string | undefined): boolean {
  return assetType?.startsWith('person-switch-') ?? false
}

// Helper function to get switch brand from asset type
export function getSwitchBrand(assetType: string | undefined): 'cisco' | 'huawei' | null {
  if (assetType === 'person-switch-cisco') return 'cisco'
  if (assetType === 'person-switch-huawei') return 'huawei'
  return null
}

export interface AssetNode {
  key: string
  title: string
  favorite?: boolean
  ip?: string
  uuid?: string
  username?: string
  asset_type?: AssetType
  children?: AssetNode[]
  group_name?: string
  label?: string
  auth_type?: string
  port?: number
  key_chain_id?: number
  organization_id?: string
  [key: string]: any
}

export interface AssetFormData {
  username: string
  password: string
  ip: string
  label: string
  group_name: string
  auth_type: string
  keyChain?: number
  port: number
  asset_type: AssetType
  needProxy: boolean
  proxyName: string
}

export interface sshProxyConfig {
  type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
  host?: string
  port?: number
  enableProxyIdentity?: boolean
  username?: string
  password?: string
}

export interface SshProxyConfigItem {
  key: string
  label: string
}
export interface KeyChainItem {
  key: number
  label: string
}

export interface Position {
  x: number
  y: number
}

export interface RouterNode {
  key: string
  title: string
  children: AssetNode[]
}
