import type { IpcMainInvokeEvent } from 'electron'
import { createLogger } from '@logging'

const logger = createLogger('ssh')

// ============================================================================
// Bastion Error Codes
// ============================================================================

/**
 * Standardized error codes for bastion operations.
 * Used for consistent error handling across plugins and main repository.
 */
export enum BastionErrorCode {
  /** BastionDefinition not found for the specified type */
  DEFINITION_MISSING = 'BASTION_DEFINITION_MISSING',
  /** BastionCapability not found for the specified type */
  CAPABILITY_NOT_FOUND = 'BASTION_CAPABILITY_NOT_FOUND',
  /** Capability does not implement the required operation */
  UNSUPPORTED_OPERATION = 'BASTION_UNSUPPORTED_OPERATION',
  /** Connection to bastion host failed */
  CONNECT_FAILED = 'BASTION_CONNECT_FAILED',
  /** Asset refresh operation failed */
  REFRESH_FAILED = 'BASTION_REFRESH_FAILED',
  /** Agent execution strategy not available */
  AGENT_EXEC_UNAVAILABLE = 'BASTION_AGENT_EXEC_UNAVAILABLE'
}

/**
 * Standardized error response format for bastion operations.
 */
export interface BastionErrorResponse {
  status: 'error'
  code: BastionErrorCode
  message: string
}

/**
 * Build standardized bastion error response.
 * @param code The BastionErrorCode indicating the error type
 * @param message Human-readable error message
 * @returns BastionErrorResponse object
 */
export function buildBastionError(code: BastionErrorCode, message: string): BastionErrorResponse {
  return { status: 'error', code, message }
}

// ============================================================================
// Bastion Definition (Plugin Metadata)
// ============================================================================

/**
 * Authentication policy types supported by bastion hosts.
 */
export type BastionAuthPolicy = 'password' | 'keyBased'

/**
 * Agent execution strategy for command execution.
 * - 'stream': Use getShellStream for command execution (standard stream-based)
 * - 'custom': Plugin provides custom runCommand implementation
 */
export type BastionAgentExecStrategy = 'stream' | 'custom'

/**
 * BastionDefinition describes the metadata and capabilities of a plugin-based bastion host.
 * Plugins register this alongside BastionCapability to enable dynamic UI/DB/routing.
 */
export interface BastionDefinition {
  /** Unique bastion type identifier (e.g., 'qizhi', 'tencent') */
  type: string

  /** Definition version for schema evolution and compatibility */
  version: number

  /** i18n key for display name (e.g., 'bastion.qizhi.name') */
  displayNameKey: string

  /** Asset type prefix, defaults to 'organization-${type}' */
  assetTypePrefix: string

  /** Supported authentication policies */
  authPolicy: BastionAuthPolicy[]

  /** Whether this bastion supports asset refresh */
  supportsRefresh: boolean

  /** Whether this bastion provides getShellStream for agent execution */
  supportsShellStream: boolean

  /** Agent execution strategy */
  agentExec: BastionAgentExecStrategy

  /** Optional UI hints for rendering customization */
  uiHints?: Record<string, unknown>
}

// ============================================================================
// Bastion Capability Interface
// ============================================================================

/**
 * Bastion capability interface for plugin-based bastion host integrations.
 * Each plugin can register a capability implementing this interface.
 */
export interface BastionCapability {
  /** Unique bastion type identifier (e.g., 'qizhi') */
  type: string

  /** Establish SSH connection to bastion host */
  connect: (connectionInfo: BastionConnectionInfo, event?: IpcMainInvokeEvent) => Promise<BastionConnectResult>

  /** Create interactive shell session */
  shell: (event: IpcMainInvokeEvent, args: BastionShellArgs) => Promise<BastionShellResult>

  /** Write data to shell session */
  write: (args: BastionWriteArgs) => void

  /** Resize terminal */
  resize: (args: BastionResizeArgs) => Promise<void>

  /** Disconnect session */
  disconnect: (args: { id: string }) => Promise<void>

  /** Refresh organization assets (optional) */
  refreshAssets?: (options: BastionRefreshOptions) => Promise<BastionRefreshResult>

  /** Optional access to underlying shell stream (for agent command execution) */
  getShellStream?: (id: string) => unknown
}

// Connection related types
export interface BastionConnectionInfo {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  organizationUuid?: string
  [key: string]: unknown
}

export interface BastionConnectResult {
  status: 'connected' | 'error' | 'mfa_required'
  sessionId?: string
  message?: string
  [key: string]: unknown
}

// Shell related types
export interface BastionShellArgs {
  id: string
  terminalType?: string
}

export interface BastionShellResult {
  status: 'success' | 'error'
  message?: string
  [key: string]: unknown
}

// Write related types
export interface BastionWriteArgs {
  id: string
  data: string
  marker?: string
  lineCommand?: string
  isBinary?: boolean
}

// Resize related types
export interface BastionResizeArgs {
  id: string
  rows: number
  cols: number
}

// Asset refresh related types
export interface BastionRefreshOptions {
  organizationUuid: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  onProgress?: (message: string, current?: number, total?: number) => void
  onMfaRequired?: () => Promise<string | null>
  onMfaResult?: (success: boolean, message?: string) => void
  [key: string]: unknown
}

export interface BastionRefreshResult {
  success: boolean
  assets?: Array<{
    hostname: string
    host: string
    comment?: string
  }>
  error?: string
  [key: string]: unknown
}

/**
 * Central registry for bastion capabilities and definitions.
 * Plugins register their bastion implementations here.
 * JumpServer is built-in and does not participate in this registry.
 */
class CapabilityRegistry {
  private bastionCapabilities = new Map<string, BastionCapability>()
  private bastionDefinitions = new Map<string, BastionDefinition>()

  // ============================================================================
  // Bastion Definition Methods
  // ============================================================================

  /**
   * Register a bastion definition with schema validation.
   * Validates that definition fields are consistent with registered capability.
   * @param definition The bastion definition to register
   * @throws Error if required fields are missing or inconsistent with capability
   */
  registerBastionDefinition(definition: BastionDefinition): void {
    // Schema validation: required fields
    if (!definition.type || typeof definition.type !== 'string') {
      throw new Error('[CapabilityRegistry] BastionDefinition.type is required and must be a string')
    }
    if (typeof definition.version !== 'number' || definition.version < 1) {
      throw new Error('[CapabilityRegistry] BastionDefinition.version must be a positive number')
    }
    if (!definition.displayNameKey || typeof definition.displayNameKey !== 'string') {
      throw new Error('[CapabilityRegistry] BastionDefinition.displayNameKey is required')
    }
    if (!Array.isArray(definition.authPolicy) || definition.authPolicy.length === 0) {
      throw new Error('[CapabilityRegistry] BastionDefinition.authPolicy must be a non-empty array')
    }

    // Validate assetTypePrefix: must follow 'organization-${type}' pattern for consistency
    // This ensures extractBastionType() can correctly parse the asset type
    const expectedPrefix = `organization-${definition.type}`
    if (definition.assetTypePrefix && definition.assetTypePrefix !== expectedPrefix) {
      throw new Error(`[CapabilityRegistry] BastionDefinition.assetTypePrefix must be '${expectedPrefix}' for type '${definition.type}'`)
    }
    // Set default assetTypePrefix if not provided
    if (!definition.assetTypePrefix) {
      definition.assetTypePrefix = expectedPrefix
    }

    // Consistency validation with capability (if registered)
    const capability = this.bastionCapabilities.get(definition.type)
    if (capability) {
      // Validate supportsRefresh matches capability.refreshAssets existence
      if (definition.supportsRefresh && !capability.refreshAssets) {
        logger.warn(
          `Definition.supportsRefresh=true but capability.refreshAssets is not implemented for type: ${definition.type}`
        )
      }
      // Validate supportsShellStream matches capability.getShellStream existence
      if (definition.supportsShellStream && !capability.getShellStream) {
        logger.warn(
          `Definition.supportsShellStream=true but capability.getShellStream is not implemented for type: ${definition.type}`
        )
      }
    }

    if (this.bastionDefinitions.has(definition.type)) {
      logger.warn('Overwriting existing bastion definition', { bastionType: definition.type })
    }

    this.bastionDefinitions.set(definition.type, definition)
    logger.info('Bastion definition registered', { bastionType: definition.type, version: definition.version })
  }

  /**
   * Get a bastion definition by type
   * @param type The bastion type
   */
  getBastionDefinition(type: string): BastionDefinition | undefined {
    return this.bastionDefinitions.get(type)
  }

  /**
   * List all registered bastion definitions
   * @returns Array of registered BastionDefinition objects
   */
  listBastionDefinitions(): BastionDefinition[] {
    return Array.from(this.bastionDefinitions.values())
  }

  /**
   * Unregister a bastion definition
   * @param type The bastion type to unregister
   */
  unregisterBastionDefinition(type: string): boolean {
    const deleted = this.bastionDefinitions.delete(type)
    if (deleted) {
      logger.debug('Bastion definition unregistered', { bastionType: type })
    }
    return deleted
  }

  /**
   * Clear all registered bastion definitions
   */
  clearBastionDefinitions(): void {
    this.bastionDefinitions.clear()
    logger.debug('All bastion definitions cleared')
  }

  // ============================================================================
  // Bastion Capability Methods
  // ============================================================================

  /**
   * Register a bastion capability
   * @param capability The bastion capability to register
   */
  registerBastion(capability: BastionCapability): void {
    if (this.bastionCapabilities.has(capability.type)) {
      logger.warn('Overwriting existing bastion capability', { bastionType: capability.type })
    }
    this.bastionCapabilities.set(capability.type, capability)
    logger.info('Bastion capability registered', { bastionType: capability.type })
  }

  /**
   * Unregister a bastion capability
   * @param type The bastion type to unregister
   */
  unregisterBastion(type: string): boolean {
    const deleted = this.bastionCapabilities.delete(type)
    if (deleted) {
      logger.debug('Bastion capability unregistered', { bastionType: type })
    }
    return deleted
  }

  /**
   * Check if a bastion capability is registered
   * @param type The bastion type to check
   */
  hasBastion(type: string): boolean {
    return this.bastionCapabilities.has(type)
  }

  /**
   * Get a bastion capability by type
   * @param type The bastion type
   */
  getBastion(type: string): BastionCapability | undefined {
    return this.bastionCapabilities.get(type)
  }

  /**
   * List all registered bastion types
   * @returns Array of registered bastion type identifiers
   */
  listBastions(): string[] {
    return Array.from(this.bastionCapabilities.keys())
  }

  /**
   * Clear all registered bastion capabilities and definitions
   * Called during plugin reload
   */
  clearBastions(): void {
    this.bastionCapabilities.clear()
    this.bastionDefinitions.clear()
    logger.debug('All bastion capabilities and definitions cleared')
  }
}

// Singleton instance
export const capabilityRegistry = new CapabilityRegistry()
