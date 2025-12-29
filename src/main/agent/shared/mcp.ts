export const DEFAULT_MCP_TIMEOUT_SECONDS = 60 // matches Anthropic's default timeout in their MCP SDK
export const MIN_MCP_TIMEOUT_SECONDS = 1

export type McpServer = {
  name: string
  config: string
  status: 'connected' | 'connecting' | 'disconnected'
  error?: string
  tools?: McpTool[]
  resources?: McpResource[]
  resourceTemplates?: McpResourceTemplate[]
  disabled?: boolean
  timeout?: number
  type?: 'stdio' | 'http'
  autoApprove?: string[]
}

export type McpToolInputSchema = {
  properties?: Record<
    string,
    {
      description?: string
      type?: string

      [key: string]: any
    }
  >
  required?: string[]

  [key: string]: any
}

export type McpTool = {
  name: string
  description?: string
  inputSchema?: McpToolInputSchema
  autoApprove?: boolean
}

export type McpResource = {
  uri: string
  name: string
  mimeType?: string
  description?: string
}

export type McpResourceTemplate = {
  uriTemplate: string
  name: string
  description?: string
  mimeType?: string
}

export type McpResourceResponse = {
  _meta?: Record<string, any>
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>
}

export type McpToolCallResponse = {
  _meta?: Record<string, any>
  content: Array<
    | {
        type: 'text'
        text: string
      }
    | {
        type: 'image'
        data: string
        mimeType: string
      }
    | {
        type: 'audio'
        data: string
        mimeType: string
      }
    | {
        type: 'resource'
        resource: {
          uri: string
          mimeType?: string
          text?: string
          blob?: string
        }
      }
  >
  isError?: boolean
}
