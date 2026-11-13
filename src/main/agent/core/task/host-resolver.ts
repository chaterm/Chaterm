// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

// Resolves the `ip` a tool call names against the assets Chaterm manages, for hosts the
// user did not @-select.

import type { Host } from '@shared/WebviewMessage'
import type { McpTarget } from '../../../../shared/external-mcp'

export const LIST_HOSTS_DEFAULT_LIMIT = 50
export const LIST_HOSTS_MAX_LIMIT = 200

/** The named host cannot be mapped to exactly one managed asset. Not a connection failure. */
export class HostResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HostResolutionError'
  }
}

const describeTarget = (target: McpTarget): string => `${target.name} (port ${target.port}${target.group ? `, group: ${target.group}` : ''})`

/** Pick the single managed asset whose address is `host`. */
export function pickManagedTarget(host: string, targets: McpTarget[]): McpTarget {
  if (targets.length === 0) {
    throw new HostResolutionError(
      `Host "${host}" is not selected in this conversation and is not a host managed by Chaterm. Use list_hosts to find a managed host.`
    )
  }
  if (targets.length > 1) {
    throw new HostResolutionError(
      `Host "${host}" matches ${targets.length} managed hosts (${targets.map(describeTarget).join('; ')}). Ask the user to select the intended one with @host.`
    )
  }
  return targets[0]
}

export function targetToHost(target: McpTarget): Host {
  return { host: target.host, uuid: target.target_id, connection: target.connection_type }
}

/** Clamp a model-supplied numeric argument; non-numeric input falls back to `fallback`. */
export function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (Number.isNaN(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/** Compact listing for the model. `host` is the value to pass as `ip` to other tools. */
export function formatManagedHosts(targets: McpTarget[], limit: number, offset: number): string {
  if (targets.length === 0) {
    return offset > 0 ? 'No more managed hosts.' : 'No managed hosts found.'
  }
  const lines = targets.map(
    (t) => `- host: ${t.host} | name: ${t.name} | port: ${t.port} | type: ${t.connection_type}${t.group ? ` | group: ${t.group}` : ''}`
  )
  const more = targets.length === limit ? `\nResults may continue; call list_hosts again with offset ${offset + limit}.` : ''
  return `Managed hosts (use the host value as ip in other tools):\n${lines.join('\n')}${more}`
}
