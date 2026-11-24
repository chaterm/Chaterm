//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

export const DSML_MESSAGE_MARKER = '<!--chaterm-dsml-tool-->'
export const DSML_PARAM_PREFIX = '__chaterm_dsml_b64__'

export function encodeDsmlParam(value: string): string {
  return `${DSML_PARAM_PREFIX}${Buffer.from(value, 'utf8').toString('base64')}`
}

export function decodeDsmlParam(value: string): string {
  if (!value.startsWith(DSML_PARAM_PREFIX)) return value
  try {
    return Buffer.from(value.slice(DSML_PARAM_PREFIX.length), 'base64').toString('utf8')
  } catch {
    return value
  }
}

/**
 * Text-mode port of DeepSeek's official `OutputParser` DSML state machine
 * (`deepseek-ai/deepseek-recipe`, `src/stream/output_parser.rs`).
 *
 * The official parser normally receives token IDs so it can distinguish a DSML
 * special token from ordinary text that merely spells the same characters.
 * Chaterm only receives text chunks, so this port matches markers by spelling,
 * which is the official parser's documented `ChunkKind::Text` behaviour.
 *
 * It recognizes the tool-call block grammar and emits Chaterm XML:
 *
 *   <｜DSML｜tool_calls>
 *     <｜DSML｜invoke name="execute_command">
 *       <｜DSML｜parameter name="command" string="true">ls -la</｜DSML｜parameter>
 *     </｜DSML｜invoke>
 *   </｜DSML｜tool_calls>
 *
 * Parameter values are base64-framed because DSML values can contain XML-like
 * text; the assistant-message parser decodes them before dispatch.
 */

export interface DsmlConversionResult {
  text: string
  converted: boolean
}

interface ParsedParam {
  name: string
  value: string
}

interface ParsedTool {
  name: string
  params: ParsedParam[]
}

interface BlockResult {
  tools: ParsedTool[]
  end: number
}

const DSML = '(?:[｜|‖]\\s*)+DSML\\s*(?:[｜|‖]\\s*)+'

const TOOL_CALLS_OPEN = new RegExp(`\\n*<${DSML}(?:tool_calls|calls)>`, 'i')
const TOOL_CALLS_CLOSE = new RegExp(`^</${DSML}(?:tool_calls|calls)>`, 'i')
const INVOKE_CLOSE = new RegExp(`^</${DSML}invoke>`, 'i')
const PARAM_CLOSE = new RegExp(`^</${DSML}parameter>`, 'i')
const STRING_ATTR = /^\s*string="(?:true|false)">/i
const INVOKE_OPEN = 'invoke name="'
const PARAM_OPEN = 'parameter name='

function parseBlock(message: string, start: number): BlockResult | null {
  let cursor = start
  let currentTool: ParsedTool | undefined
  let currentParam: ParsedParam | undefined
  const tools: ParsedTool[] = []

  const finishTool = () => {
    if (currentTool) {
      if (currentParam) currentTool.params.push(currentParam)
      tools.push(currentTool)
    }
    currentTool = undefined
    currentParam = undefined
  }

  while (cursor < message.length) {
    const rest = message.slice(cursor)

    const close = TOOL_CALLS_CLOSE.exec(rest)
    if (close) {
      finishTool()
      return { tools, end: cursor + close[0].length }
    }

    if (message.startsWith(INVOKE_OPEN, cursor)) {
      finishTool()
      const nameStart = cursor + INVOKE_OPEN.length
      const nameEnd = message.indexOf('"', nameStart)
      if (nameEnd === -1) return null
      currentTool = { name: message.slice(nameStart, nameEnd), params: [] }
      cursor = nameEnd + 1
      continue
    }

    const invokeClose = INVOKE_CLOSE.exec(rest)
    if (invokeClose) {
      finishTool()
      cursor += invokeClose[0].length
      continue
    }

    if (currentTool && message.startsWith(PARAM_OPEN, cursor)) {
      const nameStart = cursor + PARAM_OPEN.length
      if (message[nameStart] !== '"') return null
      const nameEnd = message.indexOf('"', nameStart + 1)
      if (nameEnd === -1) return null
      const paramName = message.slice(nameStart + 1, nameEnd)
      const attrStart = nameEnd + 1
      const attr = STRING_ATTR.exec(message.slice(attrStart))
      if (!attr) return null
      currentParam = { name: paramName, value: '' }
      cursor = attrStart + attr[0].length
      continue
    }

    // The official parser only treats a parameter closer as a marker while a
    // parameter value is open; otherwise the bytes belong to the tool block and
    // are discarded.
    if (currentParam) {
      const paramClose = PARAM_CLOSE.exec(rest)
      if (paramClose) {
        currentTool?.params.push(currentParam)
        currentParam = undefined
        cursor += paramClose[0].length
        continue
      }
      currentParam.value += message[cursor]
      cursor += 1
      continue
    }

    // Inside a tool-call block, unmatched bytes (including the leading
    // "<｜DSML｜" spelling before `invoke name="`) are skipped.
    cursor += 1
  }

  return null
}

function toolToXml(tool: ParsedTool, toolNames: readonly string[], paramNames: readonly string[]): string {
  if (!toolNames.includes(tool.name)) return ''
  const params = tool.params
    .filter((param) => paramNames.includes(param.name))
    .map((param) => `<${param.name}>${encodeDsmlParam(param.value)}</${param.name}>`)
    .join('')
  return `${DSML_MESSAGE_MARKER}<${tool.name}>${params}</${tool.name}>`
}

export function convertDsmlToolCalls(message: string, toolNames: readonly string[], paramNames: readonly string[]): DsmlConversionResult {
  // Fast path: no DSML marker spelling.
  if (!/DSML/i.test(message)) return { text: message, converted: false }

  let cursor = 0
  let output = ''
  let converted = false

  while (cursor < message.length) {
    const relative = message.slice(cursor).search(TOOL_CALLS_OPEN)
    if (relative === -1) {
      output += message.slice(cursor)
      break
    }

    const blockStart = cursor + relative
    const openMatch = TOOL_CALLS_OPEN.exec(message.slice(blockStart))
    if (!openMatch) {
      output += message.slice(cursor)
      break
    }

    output += message.slice(cursor, blockStart)
    const parsed = parseBlock(message, blockStart + openMatch[0].length)

    if (!parsed) {
      // Keep Chaterm's existing lenient DSML/mangled-opener compatibility for
      // variants the official grammar rejects. The generic parser handles them
      // and the recovery layer protects against residue.
      return { text: message, converted: false }
    }

    let blockXml = ''
    for (const tool of parsed.tools) {
      blockXml += toolToXml(tool, toolNames, paramNames)
    }
    if (!blockXml) {
      // No registered tool in this block; leave it to Chaterm's existing
      // parser, which preserves unregistered DSML as ordinary text.
      return { text: message, converted: false }
    }
    output += blockXml
    converted = true
    cursor = parsed.end
  }

  return { text: output, converted }
}
