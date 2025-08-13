export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface Asset {
  id?: number
  uuid: string
  label: string
  asset_ip: string
  group_name: string
  auth_type: string
  port: number
  username: string
  password: string
  key_chain_id?: number
  favorite: boolean
  asset_type?: string
  created_at: string | Date
  updated_at: string | Date
  version?: number
  sync_status?: 'pending' | 'synced' | 'conflict'
  last_sync_time?: string | Date
  operation_type?: OperationType
}

export interface AssetChain {
  key_chain_id: number
  uuid: string
  chain_name: string
  chain_type: string
  chain_private_key: string
  chain_public_key: string
  passphrase: string
  created_at: string | Date
  updated_at: string | Date
  version?: number
  sync_status?: 'pending' | 'synced' | 'conflict'
  last_sync_time?: string | Date
  operation_type?: OperationType
}

export interface ChangeRecord {
  id: string
  table_name: string
  record_uuid: string
  operation_type: OperationType
  change_data: any // can include version
  before_data?: any
  created_at: string | Date
  sync_status: 'pending' | 'synced' | 'failed'
  retry_count: number
  error_message?: string
}

export interface SyncRequest {
  table_name: string
  data?: any[]
}

export interface SyncResponse {
  success: boolean
  message: string
  synced_count?: number
  failed_count?: number
  data?: any[]
  conflicts?: Array<{ table_name: string; uuid: string; reason: string; server_data?: any; client_data?: any }>
}

export interface BackupInitResponse {
  success: boolean
  message: string
  table_mappings: Record<string, string>
}

export interface ServerChangeLog {
  id?: number
  sequence_id: number
  target_table: string
  record_id: string
  operation_type: OperationType
  change_data: string // JSON string from server
  before_data?: string // JSON string
  device_id: string
  batch_id?: string
  created_at: string
}

export interface GetChangesResponse {
  changes: ServerChangeLog[]
  count: number
  lastSequenceId: number
  hasMore: boolean
  serverTime: string | number
}
