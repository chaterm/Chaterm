// Web fetch service - fetches and extracts readable content from URLs
// Ported and simplified from openclaw/src/agents/tools/web-fetch.ts

import axios from 'axios'
import { CacheEntry, DEFAULT_CACHE_TTL_MS, normalizeCacheKey, readCache, writeCache } from './cache'
import { extractBasicHtmlContent, extractReadableContent, htmlToMarkdown, markdownToText, truncateText, type ExtractMode } from './web-fetch-utils'
import { stripInvisibleUnicode } from './web-fetch-visibility'

const DEFAULT_MAX_CHARS = 50_000
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

interface WebFetchResult {
  url: string
  finalUrl: string
  status: number
  contentType: string
  title?: string
  extractMode: ExtractMode
  extractor: string
  truncated: boolean
  length: number
  text: string
}

const FETCH_CACHE = new Map<string, CacheEntry<WebFetchResult>>()

function normalizeContentType(value: string | undefined): string {
  if (!value) {
    return 'application/octet-stream'
  }
  const [raw] = value.split(';')
  const trimmed = raw?.trim()
  return trimmed || 'application/octet-stream'
}

function resolveMaxChars(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_CHARS
  }
  return Math.max(100, Math.min(Math.floor(value), DEFAULT_MAX_CHARS))
}

function formatResult(result: WebFetchResult): string {
  const lines: string[] = []
  lines.push(`URL: ${result.url}`)
  if (result.finalUrl !== result.url) {
    lines.push(`Final URL: ${result.finalUrl}`)
  }
  lines.push(`Status: ${result.status}`)
  lines.push(`Content-Type: ${result.contentType}`)
  if (result.title) {
    lines.push(`Title: ${result.title}`)
  }
  lines.push(`Extractor: ${result.extractor}`)
  lines.push(`Extract Mode: ${result.extractMode}`)
  lines.push('')
  lines.push(result.text)
  if (result.truncated) {
    lines.push('')
    lines.push(`[Truncated after ${result.length} characters]`)
  }
  return lines.join('\n')
}

export async function webFetch(params: { url: string; extractMode?: ExtractMode; maxChars?: number }): Promise<string> {
  const url = params.url
  const extractMode: ExtractMode = params.extractMode === 'text' ? 'text' : 'markdown'
  const maxChars = resolveMaxChars(params.maxChars)

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Invalid URL: must be a valid http or https URL')
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Invalid URL: must be http or https')
  }

  // Check cache
  const cacheKey = normalizeCacheKey(`fetch:${url}:${extractMode}:${maxChars}`)
  const cached = readCache(FETCH_CACHE, cacheKey)
  if (cached) {
    return formatResult(cached.value)
  }

  // Fetch the URL
  const response = await axios.get(url, {
    timeout: DEFAULT_TIMEOUT_MS,
    maxRedirects: DEFAULT_MAX_REDIRECTS,
    maxContentLength: DEFAULT_MAX_RESPONSE_BYTES,
    responseType: 'text',
    headers: {
      Accept: 'text/markdown, text/html;q=0.9, */*;q=0.1',
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9'
    },
    // Ensure we always get text, not parsed JSON
    transformResponse: [(data: string) => data],
    validateStatus: (status: number) => status >= 200 && status < 400
  })

  const body: string = typeof response.data === 'string' ? response.data : String(response.data)
  const contentType = normalizeContentType(response.headers['content-type'] as string | undefined)
  const finalUrl = response.request?.res?.responseUrl || url

  let title: string | undefined
  let extractor = 'raw'
  let text = body

  if (contentType.includes('text/markdown')) {
    // Cloudflare Markdown for Agents: server returned pre-rendered markdown
    extractor = 'cf-markdown'
    if (extractMode === 'text') {
      text = markdownToText(body)
    }
  } else if (contentType.includes('text/html')) {
    // Try Readability first, then fall back to basic HTML extraction
    const readable = await extractReadableContent({
      html: body,
      url: finalUrl,
      extractMode
    })
    if (readable?.text) {
      text = readable.text
      title = readable.title
      extractor = 'readability'
    } else {
      const basic = await extractBasicHtmlContent({
        html: body,
        extractMode
      })
      if (basic?.text) {
        text = basic.text
        title = basic.title
        extractor = 'raw-html'
      } else {
        // Last resort: basic tag stripping
        const rendered = htmlToMarkdown(body)
        text = extractMode === 'text' ? markdownToText(rendered.text) : rendered.text
        title = rendered.title
        extractor = 'raw-html'
      }
    }
  } else if (contentType.includes('application/json')) {
    try {
      text = JSON.stringify(JSON.parse(body), null, 2)
      extractor = 'json'
    } catch {
      text = body
      extractor = 'raw'
    }
  }

  // Clean up and truncate
  text = stripInvisibleUnicode(text)
  const truncated = truncateText(text, maxChars)

  const result: WebFetchResult = {
    url,
    finalUrl,
    status: response.status,
    contentType,
    title,
    extractMode,
    extractor,
    truncated: truncated.truncated,
    length: truncated.text.length,
    text: truncated.text
  }

  // Write to cache
  writeCache(FETCH_CACHE, cacheKey, result, DEFAULT_CACHE_TTL_MS)

  return formatResult(result)
}
