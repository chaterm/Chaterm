export interface McpTarget {
  target_id: string
  name: string
  host: string
  port: number
  connection_type: string
  group: string | null
}

export interface ExternalMcpStatus {
  enabled: boolean
  endpoint: string | null
}

export interface RemoteCommandResult {
  status: 'executed' | 'execution_failed' | 'execution_unknown'
  stdout: string
  stderr: string
  exit_code: number | null
  signal: string | null
  truncated: boolean
  output_mode: 'separate' | 'combined'
  reason?: string
}
