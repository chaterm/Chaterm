/**
 * Kubernetes service type definitions
 */

/**
 * Represents a Kubernetes context (cluster connection configuration)
 */
export interface K8sContext {
  name: string
  cluster: string
  user: string
  namespace?: string
  clusterInfo?: {
    server: string
    certificateAuthority?: string
    skipTLSVerify?: boolean
  }
  userInfo?: {
    clientCertificate?: string
    clientKey?: string
    token?: string
    username?: string
    password?: string
  }
}

/**
 * Represents a simplified context for frontend display
 */
export interface K8sContextInfo {
  name: string
  cluster: string
  namespace: string
  server: string
  isActive: boolean
}

/**
 * KubeConfig file structure
 */
export interface KubeConfig {
  contexts: K8sContext[]
  currentContext: string
  clusters: Array<{
    name: string
    cluster: {
      server: string
      certificateAuthority?: string
      skipTLSVerify?: boolean
    }
  }>
  users: Array<{
    name: string
    user: {
      clientCertificate?: string
      clientKey?: string
      token?: string
      username?: string
      password?: string
    }
  }>
}

/**
 * Configuration loading options
 */
export interface LoadConfigOptions {
  configPath?: string
  validateConnection?: boolean
}

/**
 * Result of config loading operation
 */
export interface LoadConfigResult {
  success: boolean
  contexts: K8sContextInfo[]
  currentContext?: string
  error?: string
}

/**
 * K8s Manager state
 */
export interface K8sManagerState {
  initialized: boolean
  contexts: Map<string, K8sContext>
  currentContext?: string
}

/**
 * Kubernetes resource event types
 */
export enum K8sEventType {
  ADDED = 'ADDED',
  MODIFIED = 'MODIFIED',
  DELETED = 'DELETED',
  ERROR = 'ERROR'
}

/**
 * Generic K8s resource interface
 */
export interface K8sResource {
  apiVersion?: string
  kind?: string
  metadata: {
    uid: string
    name: string
    namespace?: string
    resourceVersion?: string
    creationTimestamp?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    [key: string]: any
  }
  spec?: any
  status?: any
  [key: string]: any
}

/**
 * K8s resource event
 */
export interface K8sResourceEvent {
  type: K8sEventType
  resource: K8sResource
  contextName: string
}

/**
 * Informer configuration options
 */
export interface InformerOptions {
  contextName: string
  namespace?: string
  labelSelector?: string
  fieldSelector?: string
  resyncPeriod?: number
}

/**
 * Informer state
 */
export interface InformerState {
  contextName: string
  resourceType: string
  running: boolean
  connected: boolean
  lastSyncTime?: Date
  resourceCount: number
  errorCount: number
  lastError?: string
}

/**
 * Resource cache snapshot
 */
export interface ResourceSnapshot {
  uid: string
  resource: K8sResource
  lastUpdated: Date
}

/**
 * Delta operation types for incremental updates
 */
export enum DeltaOperationType {
  ADD = 'ADD',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

/**
 * Delta patch for a single resource
 */
export interface ResourceDelta {
  type: DeltaOperationType
  uid: string
  contextName: string
  resourceType: string
  name: string
  namespace?: string
  patches?: any[]
  fullResource?: K8sResource
}

/**
 * Batched delta update
 */
export interface DeltaBatch {
  timestamp: Date
  deltas: ResourceDelta[]
  totalChanges: number
}
