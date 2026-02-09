import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// Ensure `self` exists for MonacoEnvironment assignment in component
;(globalThis as any).self = globalThis

// -----------------------------------------------------------------------------
// Mocks for Monaco + ESM contrib modules + workers
// -----------------------------------------------------------------------------
vi.mock('monaco-editor', () => {
  const editorInstance = {
    onDidChangeModelContent: vi.fn(),
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    getModel: vi.fn(() => ({ updateOptions: vi.fn() })),
    updateOptions: vi.fn(),
    layout: vi.fn(),
    dispose: vi.fn()
  }

  return {
    editor: {
      create: vi.fn(() => editorInstance),
      defineTheme: vi.fn(),
      setModelLanguage: vi.fn()
    }
  }
})

vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}))
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}))

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class EditorWorker {} }))
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class JsonWorker {} }))
vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({ default: class CssWorker {} }))
vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({ default: class HtmlWorker {} }))
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: class TsWorker {} }))

vi.mock('@/stores/editorConfig', async () => {
  const { ref } = await import('vue')
  return {
    useEditorConfigStore: () => ({
      config: ref({
        fontSize: 14,
        fontFamily: 'cascadia-mono',
        tabSize: 4,
        wordWrap: 'off',
        minimap: true,
        mouseWheelZoom: true,
        cursorBlinking: 'blink',
        lineHeight: 0
      }),
      monacoOptions: {},
      loadConfig: vi.fn(() => Promise.resolve())
    }),
    getFontFamily: (fontKey: string) => (fontKey ? `"${fontKey}", monospace` : 'monospace')
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

vi.mock('@/services/userConfigStoreService', () => ({
  userConfigStore: {
    getConfig: vi.fn().mockResolvedValue({})
  }
}))

vi.mock('@/utils/themeUtils', () => ({
  getMonacoTheme: () => 'vs-dark'
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined)
  }
}))

// Import after mocks
import MonacoEditor from '@views/components/Editors/base/monacoEditor.vue'
import KnowledgeCenterEditor from '@views/components/Editors/KnowledgeCenterEditor.vue'
import mermaid from 'mermaid'

describe('monacoEditor background mode', () => {
  const originalMutationObserver = globalThis.MutationObserver

  class MockMutationObserver {
    static lastInstance: MockMutationObserver | null = null
    private cb: MutationCallback
    constructor(cb: MutationCallback) {
      this.cb = cb
      MockMutationObserver.lastInstance = this
    }
    observe() {
      // noop for mock
    }
    disconnect() {
      // noop for mock
    }
    trigger() {
      this.cb(
        [
          {
            type: 'attributes',
            attributeName: 'class',
            target: document.body
          } as any
        ],
        this as any
      )
    }
  }

  beforeEach(() => {
    MockMutationObserver.lastInstance = null
    ;(globalThis as any).MutationObserver = MockMutationObserver as any
    document.body.className = ''
  })

  afterEach(() => {
    document.body.className = ''
    ;(globalThis as any).MutationObserver = originalMutationObserver
    vi.clearAllMocks()
  })

  it('should apply with-custom-bg when body has has-custom-bg at mount', async () => {
    document.body.classList.add('has-custom-bg')

    const wrapper = mount(MonacoEditor, {
      props: { modelValue: '' }
    })

    expect(wrapper.classes()).toContain('with-custom-bg')
  })

  it('should toggle with-custom-bg when body class changes', async () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: '' }
    })

    // Wait for onMounted async (loadConfig) to resolve and observer to be registered
    await flushPromises()

    expect(wrapper.classes()).not.toContain('with-custom-bg')

    document.body.classList.add('has-custom-bg')
    MockMutationObserver.lastInstance?.trigger()
    await nextTick()
    expect(wrapper.classes()).toContain('with-custom-bg')

    document.body.classList.remove('has-custom-bg')
    MockMutationObserver.lastInstance?.trigger()
    await nextTick()
    expect(wrapper.classes()).not.toContain('with-custom-bg')
  })
})

describe('KnowledgeCenterEditor markdown highlight', () => {
  const markdownContent = ['```python', 'def hello():', '    print("Hello, World!")', '```'].join('\n')

  const flushPromises = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  beforeEach(() => {
    ;(window as any).api = {
      kbEnsureRoot: vi.fn().mockResolvedValue(undefined),
      kbReadFile: vi.fn().mockResolvedValue({
        content: markdownContent,
        mtimeMs: 1
      }),
      kbWriteFile: vi.fn(),
      kbCreateImage: vi.fn()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render highlighted code blocks in preview', async () => {
    const wrapper = mount(KnowledgeCenterEditor, {
      props: {
        relPath: 'docs/test.md',
        mode: 'preview'
      },
      global: {
        stubs: {
          MonacoEditor: { template: '<div />' }
        }
      }
    })

    await nextTick()
    await flushPromises()

    const preview = wrapper.find('.kb-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.html()).toContain('hljs-')
  })

  it('should apply table alignment styles in preview', async () => {
    ;(window as any).api.kbReadFile.mockResolvedValueOnce({
      content: ['| a | b | c |', '| :-- | :-: | --: |', '| 1 | 2 | 3 |'].join('\n'),
      mtimeMs: 1
    })

    const wrapper = mount(KnowledgeCenterEditor, {
      props: {
        relPath: 'docs/table.md',
        mode: 'preview'
      },
      global: {
        stubs: {
          MonacoEditor: { template: '<div />' }
        }
      }
    })

    await nextTick()
    await flushPromises()

    const preview = wrapper.find('.kb-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.html()).toContain('text-align: center')
    expect(preview.html()).toContain('text-align: right')
  })

  it('should preserve safe html tags in preview', async () => {
    ;(window as any).api.kbReadFile.mockResolvedValueOnce({
      content: ['<details>', '<summary>Click to expand</summary>', 'Content', '</details>', '', '<kbd>Ctrl</kbd> + <kbd>C</kbd>'].join('\n'),
      mtimeMs: 1
    })

    const wrapper = mount(KnowledgeCenterEditor, {
      props: {
        relPath: 'docs/html.md',
        mode: 'preview'
      },
      global: {
        stubs: {
          MonacoEditor: { template: '<div />' }
        }
      }
    })

    await nextTick()
    await flushPromises()

    const preview = wrapper.find('.kb-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.html()).toContain('<details')
    expect(preview.html()).toContain('<summary>')
    expect(preview.html()).toContain('<kbd>')
  })

  it('should render mermaid diagrams in preview', async () => {
    ;(window as any).api.kbReadFile.mockResolvedValueOnce({
      content: ['```mermaid', 'sequenceDiagram', '  A->>B: Hello', '```'].join('\n'),
      mtimeMs: 1
    })

    const wrapper = mount(KnowledgeCenterEditor, {
      props: {
        relPath: 'docs/diagram.md',
        mode: 'preview'
      },
      global: {
        stubs: {
          MonacoEditor: { template: '<div />' }
        }
      }
    })

    await nextTick()
    await flushPromises()
    await nextTick()
    await flushPromises()

    const preview = wrapper.find('.kb-preview')
    expect(preview.exists()).toBe(true)
    expect(preview.html()).toContain('class="mermaid"')
    expect(mermaid.initialize).toHaveBeenCalled()
    expect(mermaid.run).toHaveBeenCalled()
  })
})
