import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DragEditor from '../dragEditor.vue'

const themeUtilsMock = vi.hoisted(() => ({
  getMonacoTheme: vi.fn(() => 'vs-dark')
}))

vi.mock('@/utils/themeUtils', () => themeUtilsMock)

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('dragEditor', () => {
  beforeEach(() => {
    themeUtilsMock.getMonacoTheme.mockReset()
    themeUtilsMock.getMonacoTheme.mockReturnValue('vs-dark')
    document.documentElement.className = ''
  })

  it('keeps editor text in sync with Monaco updates', async () => {
    const boundaryEl = document.createElement('div')
    const editor = {
      filePath: '/tmp/demo.txt',
      visible: true,
      vimText: 'before',
      originVimText: 'before',
      action: 'editor',
      vimEditorX: 0,
      vimEditorY: 0,
      contentType: 'text',
      vimEditorHeight: 400,
      vimEditorWidth: 600,
      lastVimEditorY: 0,
      lastVimEditorHeight: 400,
      lastVimEditorWidth: 600,
      lastVimEditorX: 0,
      loading: false,
      fileChange: false,
      saved: true,
      key: 'editor-1',
      terminalId: 'term-1',
      editorType: 'vim'
    }

    const wrapper = mount(DragEditor, {
      props: {
        editor,
        isActive: true,
        boundaryEl
      },
      global: {
        stubs: {
          DraggableResizable: {
            name: 'DraggableResizable',
            template: '<div><slot /></div>'
          },
          EditorCode: {
            name: 'EditorCode',
            template: '<div />'
          },
          'a-button': {
            template: '<button><slot /></button>'
          },
          'a-tooltip': {
            template: '<div><slot /></div>'
          },
          SaveOutlined: true,
          FullscreenOutlined: true,
          FullscreenExitOutlined: true,
          CloseOutlined: true
        }
      }
    })

    await wrapper.findComponent({ name: 'EditorCode' }).vm.$emit('update:model-value', 'after')

    expect(editor.vimText).toBe('after')
    expect(editor.fileChange).toBe(true)
    expect(editor.saved).toBe(false)

    wrapper.unmount()
  })
  it('updates Monaco theme when the app theme class changes', async () => {
    const boundaryEl = document.createElement('div')
    const editor = {
      filePath: '/tmp/demo.txt',
      visible: true,
      vimText: 'before',
      originVimText: 'before',
      action: 'editor',
      vimEditorX: 0,
      vimEditorY: 0,
      contentType: 'text',
      vimEditorHeight: 400,
      vimEditorWidth: 600,
      lastVimEditorY: 0,
      lastVimEditorHeight: 400,
      lastVimEditorWidth: 600,
      lastVimEditorX: 0,
      loading: false,
      fileChange: false,
      saved: true,
      key: 'editor-1',
      terminalId: 'term-1',
      editorType: 'vim'
    }

    const wrapper = mount(DragEditor, {
      props: {
        editor,
        isActive: true,
        boundaryEl
      },
      global: {
        stubs: {
          DraggableResizable: {
            name: 'DraggableResizable',
            template: '<div><slot /></div>'
          },
          EditorCode: {
            name: 'EditorCode',
            props: ['theme'],
            template: '<div />'
          },
          'a-button': {
            template: '<button><slot /></button>'
          },
          'a-tooltip': {
            template: '<div><slot /></div>'
          },
          SaveOutlined: true,
          FullscreenOutlined: true,
          FullscreenExitOutlined: true,
          CloseOutlined: true
        }
      }
    })

    expect(wrapper.findComponent({ name: 'EditorCode' }).props('theme')).toBe('vs-dark')

    themeUtilsMock.getMonacoTheme.mockReturnValue('vs')
    document.documentElement.className = 'theme-light'
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()

    expect(wrapper.findComponent({ name: 'EditorCode' }).props('theme')).toBe('vs')

    wrapper.unmount()
  })
  it('uses boundary-local coordinates for fullscreen after dragging to the bottom-right', async () => {
    const boundaryEl = document.createElement('div')
    Object.defineProperties(boundaryEl, {
      offsetLeft: { value: 0 },
      offsetTop: { value: 0 }
    })
    boundaryEl.getBoundingClientRect = vi.fn(
      () =>
        ({
          x: 12,
          y: 34,
          top: 34,
          left: 12,
          bottom: 834,
          right: 1012,
          width: 1000,
          height: 800,
          toJSON: () => ({})
        }) as any
    )
    const editor = {
      filePath: '/tmp/demo.txt',
      visible: true,
      vimText: 'before',
      originVimText: 'before',
      action: 'editor',
      vimEditorX: 950,
      vimEditorY: 750,
      contentType: 'text',
      vimEditorHeight: 400,
      vimEditorWidth: 600,
      lastVimEditorY: 0,
      lastVimEditorHeight: 0,
      lastVimEditorWidth: 0,
      lastVimEditorX: 0,
      loading: false,
      fileChange: false,
      saved: true,
      key: 'editor-1',
      terminalId: 'term-1',
      editorType: 'vim',
      userResized: false
    }

    const wrapper = mount(DragEditor, {
      props: {
        editor,
        isActive: true,
        boundaryEl
      },
      global: {
        stubs: {
          DraggableResizable: {
            name: 'DraggableResizable',
            template: '<div><slot /></div>'
          },
          EditorCode: {
            name: 'EditorCode',
            template: '<div />'
          },
          'a-button': {
            inheritAttrs: false,
            template: '<button :class="$attrs.class" @click="handleClick"><slot /></button>',
            methods: {
              handleClick(event: Event) {
                const onClick = (this.$attrs as any).onClick
                if (Array.isArray(onClick)) {
                  onClick.forEach((fn) => fn(event))
                } else if (onClick) {
                  onClick(event)
                }
              }
            }
          },
          'a-tooltip': {
            template: '<div><slot /></div>'
          },
          SaveOutlined: true,
          FullscreenOutlined: true,
          FullscreenExitOutlined: true,
          CloseOutlined: true
        }
      }
    })

    await wrapper.find('.fullscreen-toggle').trigger('click')

    expect(editor.vimEditorX).toBe(0)
    expect(editor.vimEditorY).toBe(0)
    expect(editor.vimEditorWidth).toBe(1000)
    expect(editor.vimEditorHeight).toBe(800)
    expect(editor.userResized).toBe(true)

    await nextTick()
    await wrapper.find('.fullscreen-toggle').trigger('click')

    expect(editor.vimEditorX).toBe(950)
    expect(editor.vimEditorY).toBe(750)
    expect(editor.vimEditorWidth).toBe(600)
    expect(editor.vimEditorHeight).toBe(400)
    expect(editor.userResized).toBe(false)

    wrapper.unmount()
  })
  it('opens replace from the main process without relying on browser Ctrl+R', async () => {
    let replaceCallback: (() => void) | undefined
    const unsubscribe = vi.fn()
    const replaceAction = { run: vi.fn() }
    const monacoEditor = {
      getAction: vi.fn((id: string) => (id === 'editor.action.startFindReplaceAction' ? replaceAction : null))
    }
    ;(window as any).api = {
      onFileEditorReplace: vi.fn((callback: () => void) => {
        replaceCallback = callback
        return unsubscribe
      })
    }
    const boundaryEl = document.createElement('div')
    const editor = {
      filePath: '/tmp/demo.txt',
      visible: true,
      vimText: 'before',
      originVimText: 'before',
      action: 'editor',
      vimEditorX: 0,
      vimEditorY: 0,
      contentType: 'text',
      vimEditorHeight: 400,
      vimEditorWidth: 600,
      lastVimEditorY: 0,
      lastVimEditorHeight: 400,
      lastVimEditorWidth: 600,
      lastVimEditorX: 0,
      loading: false,
      fileChange: false,
      saved: true,
      key: 'editor-1',
      terminalId: 'term-1',
      editorType: 'vim'
    }

    const wrapper = mount(DragEditor, {
      props: { editor, isActive: true, boundaryEl },
      global: {
        stubs: {
          DraggableResizable: {
            name: 'DraggableResizable',
            template: '<div><slot /></div>'
          },
          EditorCode: {
            name: 'EditorCode',
            template: '<div />',
            methods: {
              getEditor: () => monacoEditor
            }
          },
          'a-button': { template: '<button><slot /></button>' },
          'a-tooltip': { template: '<div><slot /></div>' },
          SaveOutlined: true,
          FullscreenOutlined: true,
          FullscreenExitOutlined: true,
          CloseOutlined: true
        }
      }
    })

    await nextTick()
    expect((window as any).api.onFileEditorReplace).toHaveBeenCalled()

    replaceCallback?.()
    expect(monacoEditor.getAction).toHaveBeenCalledWith('editor.action.startFindReplaceAction')
    expect(replaceAction.run).toHaveBeenCalled()

    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalled()
    delete (window as any).api
  })
  it('notifies the main process while the file editor is focused', async () => {
    const send = vi.fn()
    ;(window as any).electron = {
      ipcRenderer: { send }
    }
    const boundaryEl = document.createElement('div')
    const editor = {
      filePath: '/tmp/demo.txt',
      visible: true,
      vimText: 'before',
      originVimText: 'before',
      action: 'editor',
      vimEditorX: 0,
      vimEditorY: 0,
      contentType: 'text',
      vimEditorHeight: 400,
      vimEditorWidth: 600,
      lastVimEditorY: 0,
      lastVimEditorHeight: 400,
      lastVimEditorWidth: 600,
      lastVimEditorX: 0,
      loading: false,
      fileChange: false,
      saved: true,
      key: 'editor-1',
      terminalId: 'term-1',
      editorType: 'vim'
    }

    const wrapper = mount(DragEditor, {
      props: { editor, isActive: true, boundaryEl },
      global: {
        stubs: {
          DraggableResizable: {
            name: 'DraggableResizable',
            template: '<div><slot /></div>'
          },
          EditorCode: { name: 'EditorCode', template: '<input class="editor-input" />' },
          'a-button': { template: '<button><slot /></button>' },
          'a-tooltip': { template: '<div><slot /></div>' },
          SaveOutlined: true,
          FullscreenOutlined: true,
          FullscreenExitOutlined: true,
          CloseOutlined: true
        }
      }
    })

    await wrapper.find('.editor-input').trigger('focusin')
    expect(send).toHaveBeenCalledWith('file-editor:focus-changed', true)

    await wrapper.find('.editor-input').trigger('focusout', { relatedTarget: null })
    expect(send).toHaveBeenCalledWith('file-editor:focus-changed', false)

    wrapper.unmount()
    delete (window as any).electron
  })
})
