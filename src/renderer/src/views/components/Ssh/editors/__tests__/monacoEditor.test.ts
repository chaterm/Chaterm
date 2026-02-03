import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
    getModel: vi.fn(() => ({})),
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

// Import after mocks
import MonacoEditor from '../monacoEditor.vue'

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
