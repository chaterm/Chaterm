// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

/**
 * Native tool-call parameter transport.
 *
 * Providers that support native function calling return tool arguments as a
 * JSON string, but Chaterm's agent loop consumes tool parameters through its
 * XML parser. To bridge the two without escaping problems (commands routinely
 * contain `<`, `>`, `&` and even the tool's own closing tag), native parameter
 * values are base64 encoded with this prefix and decoded by the parser.
 */
export const NATIVE_PARAM_PREFIX = '__chaterm_native_b64__'

/**
 * Message-level marker emitted by the native-tool bridge. The parser only
 * decodes prefixed parameters when this marker is present, so an ordinary XML
 * reply that happens to contain the prefix is preserved verbatim.
 */
export const NATIVE_MESSAGE_MARKER = '<!--chaterm-native-tool-->'

export function encodeNativeParam(value: string): string {
  return `${NATIVE_PARAM_PREFIX}${Buffer.from(value, 'utf8').toString('base64')}`
}

export function decodeNativeParam(value: string): string {
  if (!value.startsWith(NATIVE_PARAM_PREFIX)) return value
  try {
    return Buffer.from(value.slice(NATIVE_PARAM_PREFIX.length), 'base64').toString('utf8')
  } catch {
    return value
  }
}
