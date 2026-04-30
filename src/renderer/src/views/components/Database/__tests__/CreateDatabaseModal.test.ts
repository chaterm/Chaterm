import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import CreateDatabaseModal from '../components/CreateDatabaseModal.vue'

// Stub the Monaco-backed SQL editor so we don't boot Monaco in jsdom. Mirror
// the real editor's contract: `modelValue` prop + `update:modelValue` event.
// The component under test detects "user edited" state by diffing incoming
// SQL values against the last template it rendered, so no extra user-edit
// event is required here.
vi.mock('../components/SqlMonacoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'SqlMonacoEditor',
      props: { modelValue: { type: String, default: '' } },
      emits: ['update:modelValue', 'run'],
      setup(props, { emit }) {
        return () =>
          h('textarea', {
            class: 'fake-monaco',
            value: (props as { modelValue?: string }).modelValue ?? '',
            onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
          })
      }
    })
  }
})

// vue-i18n: return the key so assertions stay deterministic.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

// Stub Ant Design message to avoid teleporting and DOM noise.
vi.mock('ant-design-vue', async () => {
  return {
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn()
    }
  }
})

describe('CreateDatabaseModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const mountModal = (dbType: 'mysql' | 'postgresql' = 'postgresql') =>
    mount(CreateDatabaseModal, {
      props: { open: true, connectionId: 'a1', dbType, connectionName: 'demo' },
      global: {
        stubs: {
          // Flatten a-modal so body + footer slots render inline and the
          // Name input becomes reachable via `wrapper.find('input')`.
          AModal: {
            template: '<div class="a-modal"><slot /><slot name="footer" /></div>'
          },
          // Minimal a-input stub that emits `update:value` on native input.
          AInput: {
            props: ['value'],
            emits: ['update:value'],
            template: '<input class="a-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
          }
        }
      }
    })

  it('defaults SQL template to double-quoted CREATE DATABASE for postgres', async () => {
    const w = mountModal('postgresql')
    await w.find('input').setValue('my_db')
    await nextTick()
    expect((w.vm as unknown as { sql: string }).sql).toContain('CREATE DATABASE "my_db";')
  })

  it('defaults SQL template to backtick-quoted CREATE DATABASE for mysql', async () => {
    const w = mountModal('mysql')
    await w.find('input').setValue('my_db')
    await nextTick()
    expect((w.vm as unknown as { sql: string }).sql).toContain('CREATE DATABASE `my_db`;')
  })

  it('stops syncing SQL after the user edits the editor', async () => {
    const w = mountModal('postgresql')
    await w.find('input').setValue('a')
    await nextTick()
    // Simulate a user editing the SQL directly in the editor.
    await w.find('textarea').setValue('CREATE DATABASE "custom";')
    await nextTick()
    // After a user edit, changing Name must NOT overwrite the SQL.
    await w.find('input').setValue('b')
    await nextTick()
    expect((w.vm as unknown as { sql: string }).sql).toBe('CREATE DATABASE "custom";')
    expect((w.vm as unknown as { userEditedSql: boolean }).userEditedSql).toBe(true)
  })

  it('disables OK when Name is empty or contains invalid chars', async () => {
    const w = mountModal('postgresql')
    expect((w.vm as unknown as { canSubmit: boolean }).canSubmit).toBe(false)
    await w.find('input').setValue('ok_name')
    await nextTick()
    expect((w.vm as unknown as { canSubmit: boolean }).canSubmit).toBe(true)
    await w.find('input').setValue('bad name')
    await nextTick()
    expect((w.vm as unknown as { canSubmit: boolean }).canSubmit).toBe(false)
  })
})
