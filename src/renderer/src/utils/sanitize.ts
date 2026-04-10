import DOMPurify from 'dompurify'

// Configure DOMPurify to strip dangerous content while preserving safe markdown HTML
const purifyConfig = {
  ALLOWED_TAGS: [
    // Text formatting
    'p',
    'br',
    'hr',
    'b',
    'i',
    'em',
    'strong',
    'u',
    's',
    'del',
    'sub',
    'sup',
    'mark',
    'small',
    'abbr',
    // Headings
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    // Lists
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    // Block elements
    'div',
    'span',
    'blockquote',
    'pre',
    'code',
    // Tables
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'colgroup',
    'col',
    // Links and media (src restricted by ALLOWED_URI_REGEXP)
    'a',
    'img',
    // Details/summary
    'details',
    'summary',
    // Input (for task lists)
    'input',
    // Keyboard shortcuts
    'kbd'
  ],
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'title',
    'alt',
    'src',
    'class',
    'id',
    'style',
    'width',
    'height',
    'colspan',
    'rowspan',
    'align',
    'valign',
    'type',
    'checked',
    'disabled',
    'open',
    'data-cmd'
  ],
  // Only allow safe URL schemes
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  // Strip all event handlers (onerror, onclick, etc.)
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  // Block javascript: and data: URIs in href/src
  ALLOW_DATA_ATTR: false
}

/**
 * Sanitize HTML string to prevent XSS attacks.
 * Use this whenever rendering untrusted content via v-html.
 */
export function sanitizeHtml(dirty: string | Promise<string>): string {
  if (!dirty) return ''
  // marked() returns string in sync mode but TS types include Promise<string>
  if (typeof dirty !== 'string') return ''
  return DOMPurify.sanitize(dirty, purifyConfig) as string
}
