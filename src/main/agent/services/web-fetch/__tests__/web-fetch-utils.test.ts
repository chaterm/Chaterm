import { describe, expect, it } from 'vitest'

import { htmlToMarkdown } from '../web-fetch-utils'

describe('web-fetch-utils', () => {
  it('removes non-content elements before converting html', () => {
    const rendered = htmlToMarkdown(`
      <html>
        <head>
          <title>Example</title>
          <style>body { color: red; }</style>
          <script>window.alert('xss')</script>
        </head>
        <body>
          <noscript>fallback only</noscript>
          <p>Visible text</p>
        </body>
      </html>
    `)

    expect(rendered.title).toBe('Example')
    expect(rendered.text).toContain('Visible text')
    expect(rendered.text).not.toContain('fallback only')
    expect(rendered.text).not.toContain('window.alert')
    expect(rendered.text).not.toContain('color: red')
  })
})
