// 共享类型定义文件
export interface AssetNode {
  key: string
  title: string
  favorite?: boolean
  ip?: string
  uuid?: string
  username?: string
  asset_type?: string
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
  asset_type: string
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
  key: number
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
