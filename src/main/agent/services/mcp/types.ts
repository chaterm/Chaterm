//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@shared/mcp'
import { z } from 'zod'
import { ServerConfigSchema } from './schemas'

export type Transport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport

/**
 * Reconnection state for HTTP-based MCP servers.
 * Tracks the number of reconnection attempts and related metadata.
 */
export type ReconnectState = {
  /** Number of reconnection attempts made since last successful connection */
  attempts: number
  /** Timeout ID for the pending reconnection attempt, if any */
  timeoutId?: NodeJS.Timeout
  /** Timestamp of the last successful connection (used to reset attempt counter) */
  lastSuccessfulConnection?: number
  /** Whether a reconnection is currently in progress */
  isReconnecting: boolean
}

export type McpConnection = {
  server: McpServer
  client: Client
  transport: Transport
  /** Reconnection state (only used for HTTP-based connections) */
  reconnectState?: ReconnectState
}

export type McpTransportType = 'stdio' | 'http'

export type McpServerConfig = z.infer<typeof ServerConfigSchema>
