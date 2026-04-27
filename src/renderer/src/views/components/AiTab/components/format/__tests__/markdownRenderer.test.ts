import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import MarkdownRenderer from '../markdownRenderer.vue'
;(globalThis as any).self = globalThis

const { eventBusMocks } = vi.hoisted(() => ({
  eventBusMocks: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emitAsync: vi.fn()
  }
}))

vi.mock('monaco-editor', () => ({
  Selection: class {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
  editor: {
    defineTheme: vi.fn(),
    create: vi.fn(() => ({
      setSelection: vi.fn(),
      onDidChangeModelContent: vi.fn(),
      onDidContentSizeChange: vi.fn(),
      getModel: vi.fn(() => ({
        getLineCount: vi.fn(() => 1)
      })),
      getContentHeight: vi.fn(() => 40),
      layout: vi.fn(),
      dispose: vi.fn(),
      getValue: vi.fn(() => ''),
      setValue: vi.fn(),
      updateOptions: vi.fn(),
      getContainerDomNode: vi.fn(() => document.createElement('div'))
    })),
    getEditors: vi.fn(() => []),
    setTheme: vi.fn(),
    setModelLanguage: vi.fn()
  }
}))

vi.mock('monaco-editor/esm/vs/editor/editor.all.js', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/shell/shell.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/python/python.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/go/go.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/java/java.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/php/php.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/rust/rust.contribution', () => ({}))
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}))

vi.mock('@/utils/eventBus', () => ({
  default: eventBusMocks
}))

vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn().mockResolvedValue({})
  }
}))

vi.mock('@/utils/themeUtils', () => ({
  getCustomTheme: vi.fn(() => 'custom-dark'),
  isDarkTheme: vi.fn(() => true)
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => key
    }
  }
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@ant-design/icons-vue', () => ({
  LoadingOutlined: { template: '<span />' },
  CaretDownOutlined: { template: '<span />' },
  CaretRightOutlined: { template: '<span />' },
  CodeOutlined: { template: '<span />' },
  QuestionCircleOutlined: { template: '<span />' }
}))

const clipboardWriteText = vi.fn().mockResolvedValue(undefined)

const globalMountOptions = {
  global: {
    stubs: {
      TerminalOutputRenderer: { template: '<div class="terminal-output-renderer" />' },
      'a-button': { template: '<button><slot /></button>' },
      'a-collapse': { template: '<div><slot /></div>' },
      'a-collapse-panel': { template: '<div><slot /><slot name="header" /></div>' },
      'a-tooltip': { template: '<div><slot /></div>' }
    }
  }
}

describe('markdownRenderer kb search results', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.className = ''
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true
    })
    window.getSelection()?.removeAllRanges()
  })

  it('renders structured kb search results as clickable links', async () => {
    const wrapper = mount(MarkdownRenderer, {
      ...globalMountOptions,
      props: {
        content: '知识库检索:\n  rss2.md L1-3\n',
        say: 'text',
        messageContentParts: [
          { type: 'text', text: '知识库检索:' },
          {
            type: 'chip',
            chipType: 'doc',
            ref: {
              absPath: '/mock/knowledgebase/rss2.md',
              relPath: 'rss2.md',
              name: 'rss2.md',
              type: 'file',
              startLine: 1,
              endLine: 3
            }
          }
        ]
      }
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text.match(/知识库检索:/g)).toHaveLength(1)
    expect(text.match(/rss2\.md L1-3/g)).toHaveLength(1)

    const button = wrapper.find('.kb-search-result-link')
    expect(button.text()).toBe('rss2.md L1-3')

    await button.trigger('click')

    expect(eventBusMocks.emit).toHaveBeenCalledWith(
      'openUserTab',
      expect.objectContaining({
        key: 'KnowledgeCenterEditor',
        title: 'rss2.md',
        props: expect.objectContaining({
          relPath: 'rss2.md',
          startLine: 1,
          endLine: 3,
          jumpToken: expect.any(String)
        })
      })
    )
  })

  it('keeps plain text messages on the normal markdown path', async () => {
    const wrapper = mount(MarkdownRenderer, {
      ...globalMountOptions,
      props: {
        content: 'Plain text message',
        say: 'text'
      }
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.find('.kb-search-result-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('Plain text message')
  })

  it('copies selected markdown text with keyboard shortcut', async () => {
    const content = 'Copy this text'
    const wrapper = mount(MarkdownRenderer, {
      ...globalMountOptions,
      attachTo: document.body,
      props: {
        content,
        say: 'text'
      }
    })

    await flushPromises()
    await nextTick()

    const paragraph = wrapper.find('.markdown-content p')
    expect(paragraph.exists()).toBe(true)

    const textNode = paragraph.element.firstChild
    expect(textNode).not.toBeNull()

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode!, 0)
    range.setEnd(textNode!, content.length)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const event = new KeyboardEvent('keydown', {
      key: 'c',
      metaKey: true,
      bubbles: true,
      cancelable: true
    })
    document.dispatchEvent(event)
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(clipboardWriteText).toHaveBeenCalledWith(content)

    wrapper.unmount()
  })
})
