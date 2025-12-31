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
