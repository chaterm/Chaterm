import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DragEditor from '../dragEditor.vue'

vi.mock('@/utils/themeUtils', () => ({
  getMonacoTheme: () => 'vs-dark'
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('dragEditor', () => {
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
  })
})
