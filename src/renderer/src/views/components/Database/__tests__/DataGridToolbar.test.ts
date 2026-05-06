import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataGridToolbar from '../components/DataGridToolbar.vue'

// Stub out the ant-design components used inside the toolbar so the test
// environment does not need the full ant-design runtime.
const globalStubs = {
  'a-input-number': {
    props: ['value'],
    emits: ['change'],
    template: '<input class="a-input-number" :value="value" />'
  },
  'a-select': {
    props: ['value'],
    template: '<div class="a-select"><slot /></div>'
  },
  'a-select-option': {
    template: '<div class="a-select-option"><slot /></div>'
  }
}

// Minimal useI18n mock; returns the key (or a simple key:arg formatting).
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

const mountToolbar = (
  overrides: Partial<{
    page: number
    pageSize: number
    total: number | null
    canEdit: boolean
    hasSelection: boolean
    canUndo: boolean
    isDirty: boolean
  }> = {}
) =>
  mount(DataGridToolbar, {
    props: {
      page: 1,
      pageSize: 100,
      total: 0,
      canEdit: false,
      hasSelection: false,
      canUndo: false,
      isDirty: false,
      ...overrides
    },
    global: {
      stubs: globalStubs,
      mocks: {
        $t: (key: string) => key
      }
    }
  })

const findEditBtn = (wrapper: ReturnType<typeof mountToolbar>, cls: string) => wrapper.find(`.db-toolbar__btn--${cls}`)

describe('DataGridToolbar - editing button disabled matrix', () => {
  it('disables all four edit buttons when canEdit=false (SQL/result view)', () => {
    const wrapper = mountToolbar({
      canEdit: false,
      hasSelection: true,
      canUndo: true,
      isDirty: true
    })
    expect((findEditBtn(wrapper, 'add-row').element as HTMLButtonElement).disabled).toBe(true)
    expect((findEditBtn(wrapper, 'delete-row').element as HTMLButtonElement).disabled).toBe(true)
    // Undo only depends on canUndo, not canEdit.
    expect((findEditBtn(wrapper, 'undo').element as HTMLButtonElement).disabled).toBe(false)
    expect((findEditBtn(wrapper, 'save').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables add-row when canEdit=true', () => {
    const wrapper = mountToolbar({ canEdit: true })
    expect((findEditBtn(wrapper, 'add-row').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables delete-row when no row is selected', () => {
    const wrapper = mountToolbar({ canEdit: true, hasSelection: false })
    expect((findEditBtn(wrapper, 'delete-row').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables delete-row only when canEdit AND hasSelection', () => {
    const wrapper = mountToolbar({ canEdit: true, hasSelection: true })
    expect((findEditBtn(wrapper, 'delete-row').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables undo when stack is empty', () => {
    const wrapper = mountToolbar({ canUndo: false })
    expect((findEditBtn(wrapper, 'undo').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables undo when stack is non-empty', () => {
    const wrapper = mountToolbar({ canUndo: true })
    expect((findEditBtn(wrapper, 'undo').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables save when isDirty=false', () => {
    const wrapper = mountToolbar({ canEdit: true, isDirty: false })
    expect((findEditBtn(wrapper, 'save').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables save only when canEdit AND isDirty', () => {
    const wrapper = mountToolbar({ canEdit: true, isDirty: true })
    expect((findEditBtn(wrapper, 'save').element as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('DataGridToolbar - editing button events', () => {
  it('emits add-row on add button click', async () => {
    const wrapper = mountToolbar({ canEdit: true })
    await findEditBtn(wrapper, 'add-row').trigger('click')
    expect(wrapper.emitted('add-row')).toBeTruthy()
    expect(wrapper.emitted('add-row')!.length).toBe(1)
  })

  it('emits delete-row on delete button click', async () => {
    const wrapper = mountToolbar({ canEdit: true, hasSelection: true })
    await findEditBtn(wrapper, 'delete-row').trigger('click')
    expect(wrapper.emitted('delete-row')).toBeTruthy()
  })

  it('emits undo on undo button click', async () => {
    const wrapper = mountToolbar({ canUndo: true })
    await findEditBtn(wrapper, 'undo').trigger('click')
    expect(wrapper.emitted('undo')).toBeTruthy()
  })

  it('emits save on save button click', async () => {
    const wrapper = mountToolbar({ canEdit: true, isDirty: true })
    await findEditBtn(wrapper, 'save').trigger('click')
    expect(wrapper.emitted('save')).toBeTruthy()
  })

  it('does NOT emit when the button is disabled', async () => {
    const wrapper = mountToolbar({ canEdit: false, isDirty: false })
    await findEditBtn(wrapper, 'save').trigger('click')
    // Native <button disabled> does not fire click in real DOM. We validate
    // the emit is not recorded.
    expect(wrapper.emitted('save')).toBeFalsy()
  })
})

describe('DataGridToolbar - preserves paging behaviour', () => {
  it('still renders the pagination buttons', () => {
    const wrapper = mountToolbar({ page: 2, pageSize: 50, total: 500 })
    // The "first page" button should become enabled when page > 1.
    const buttons = wrapper.findAll('.db-toolbar__btn')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
