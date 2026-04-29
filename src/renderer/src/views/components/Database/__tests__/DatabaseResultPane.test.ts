import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import DatabaseResultPane from '../components/DatabaseResultPane.vue'

// Stub ant-design-vue icons that DatabaseResultPane imports.
vi.mock('@ant-design/icons-vue', () => {
  const make = (name: string) => ({ name, template: `<span class="${name.toLowerCase()}" />` })
  return {
    CaretDownOutlined: make('CaretDownOutlined'),
    CaretUpOutlined: make('CaretUpOutlined'),
    FilterOutlined: make('FilterOutlined'),
    SwapOutlined: make('SwapOutlined')
  }
})

// Stub the TableFilterPopover to keep the test focused on the grid itself.
vi.mock('../components/TableFilterPopover.vue', () => ({
  default: {
    name: 'TableFilterPopover',
    props: ['column', 'current', 'anchorLeft', 'anchorTop', 'values', 'loading'],
    template: '<div class="mock-filter-popover" />'
  }
}))

const mountPane = (overrides: Partial<Record<string, unknown>> = {}) =>
  mount(DatabaseResultPane, {
    props: {
      columns: ['id', 'name'],
      rows: [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' }
      ],
      primaryKey: ['id'],
      editable: true,
      deletedRowKeys: new Set<string>(),
      updatedCells: new Map<string, Record<string, unknown>>(),
      newRows: [],
      selectedRowKey: null,
      ...overrides
    },
    global: {
      mocks: {
        $t: (key: string) => key
      }
    }
  })

describe('DatabaseResultPane - dirty state rendering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders both data rows when nothing is dirty', () => {
    const wrapper = mountPane()
    const trs = wrapper.findAll('.db-result__tr')
    expect(trs.length).toBe(2)
    expect(trs[0].classes()).not.toContain('db-result__tr--deleted')
    expect(trs[0].classes()).not.toContain('db-result__tr--updated')
    expect(trs[0].classes()).not.toContain('db-result__tr--selected')
  })

  it('applies the deleted class when a row is in deletedRowKeys', () => {
    // rowKey for pk ['id'] with value 1 is JSON.stringify([1]) = "[1]"
    const deletedRowKeys = new Set<string>(['[1]'])
    const wrapper = mountPane({ deletedRowKeys })
    const trs = wrapper.findAll('.db-result__tr')
    expect(trs[0].classes()).toContain('db-result__tr--deleted')
    expect(trs[1].classes()).not.toContain('db-result__tr--deleted')
  })

  it('applies the updated class to the row and the cell for updated columns', () => {
    const updatedCells = new Map<string, Record<string, unknown>>([['[2]', { name: 'BOB' }]])
    const wrapper = mountPane({ updatedCells })
    const trs = wrapper.findAll('.db-result__tr')
    expect(trs[1].classes()).toContain('db-result__tr--updated')
    // second row: cells (index, id, name)
    const cells = trs[1].findAll('.db-result__td')
    // index col is at 0, id at 1, name at 2
    expect(cells[2].classes()).toContain('db-result__td--updated')
    expect(cells[1].classes()).not.toContain('db-result__td--updated')
  })

  it('renders a new row appended at the bottom with the --new class', () => {
    const wrapper = mountPane({
      newRows: [{ tmpId: 'tmp-1', values: { id: null, name: 'new-guy' } }]
    })
    const newRow = wrapper.find('.db-result__tr--new')
    expect(newRow.exists()).toBe(true)
    expect(newRow.text()).toContain('*')
    expect(newRow.text()).toContain('new-guy')
  })

  it('highlights the selected row', () => {
    const wrapper = mountPane({ selectedRowKey: '[1]' })
    const trs = wrapper.findAll('.db-result__tr')
    expect(trs[0].classes()).toContain('db-result__tr--selected')
    expect(trs[1].classes()).not.toContain('db-result__tr--selected')
  })

  it('prefers the dirty value over the original when rendering cell text', () => {
    const updatedCells = new Map<string, Record<string, unknown>>([['[1]', { name: 'ALICE-EDITED' }]])
    const wrapper = mountPane({ updatedCells })
    // The first row's "name" cell should show the edited value.
    const trs = wrapper.findAll('.db-result__tr')
    const firstRowCells = trs[0].findAll('.db-result__td')
    expect(firstRowCells[2].text()).toContain('ALICE-EDITED')
  })
})

describe('DatabaseResultPane - selection emit', () => {
  it('emits selectRow with the rowKey when an original row is clicked', async () => {
    const wrapper = mountPane()
    const trs = wrapper.findAll('.db-result__tr')
    await trs[0].trigger('click')
    const evts = wrapper.emitted('selectRow')
    expect(evts).toBeTruthy()
    expect(evts![0]).toEqual(['[1]'])
  })

  it('emits selectRow with the tmpId when a new row is clicked', async () => {
    const wrapper = mountPane({
      newRows: [{ tmpId: 'tmp-99', values: { id: null, name: 'x' } }]
    })
    const newRow = wrapper.find('.db-result__tr--new')
    await newRow.trigger('click')
    const evts = wrapper.emitted('selectRow')
    expect(evts).toBeTruthy()
    expect(evts![0]).toEqual(['tmp-99'])
  })
})

describe('DatabaseResultPane - inline editing', () => {
  it('does nothing on double click when editable=false', async () => {
    const wrapper = mountPane({ editable: false })
    const cell = wrapper.findAll('.db-result__td')[2] // first row, name cell
    await cell.trigger('dblclick')
    expect(wrapper.find('.db-result__cell-input').exists()).toBe(false)
  })

  it('does nothing on double click when primaryKey is null (no pk)', async () => {
    const wrapper = mountPane({ primaryKey: null })
    const cell = wrapper.findAll('.db-result__td')[2]
    await cell.trigger('dblclick')
    expect(wrapper.find('.db-result__cell-input').exists()).toBe(false)
  })

  it('shows an input on double click when editable and pk present', async () => {
    const wrapper = mountPane()
    // Row 0, cells: [index-td, id-td, name-td]
    const cell = wrapper.findAll('.db-result__tr')[0].findAll('.db-result__td')[2]
    await cell.trigger('dblclick')
    await nextTick()
    const input = wrapper.find('.db-result__cell-input')
    expect(input.exists()).toBe(true)
  })

  it('emits cellEdit with (rowKey, col, newVal) on Enter', async () => {
    const wrapper = mountPane()
    const cell = wrapper.findAll('.db-result__tr')[0].findAll('.db-result__td')[2]
    await cell.trigger('dblclick')
    await nextTick()
    const input = wrapper.find('.db-result__cell-input')
    await input.setValue('NEW-NAME')
    await input.trigger('keydown.enter')
    const evts = wrapper.emitted('cellEdit')
    expect(evts).toBeTruthy()
    expect(evts![0]).toEqual(['[1]', 'name', 'NEW-NAME'])
    // Input should be unmounted after commit.
    expect(wrapper.find('.db-result__cell-input').exists()).toBe(false)
  })

  it('discards the edit on Esc', async () => {
    const wrapper = mountPane()
    const cell = wrapper.findAll('.db-result__tr')[0].findAll('.db-result__td')[2]
    await cell.trigger('dblclick')
    await nextTick()
    const input = wrapper.find('.db-result__cell-input')
    await input.setValue('WILL-BE-DISCARDED')
    await input.trigger('keydown.esc')
    expect(wrapper.emitted('cellEdit')).toBeFalsy()
    expect(wrapper.find('.db-result__cell-input').exists()).toBe(false)
  })

  it('emits newRowCellEdit when a new row cell is edited', async () => {
    const wrapper = mountPane({
      newRows: [{ tmpId: 'tmp-7', values: { id: null, name: '' } }]
    })
    const newRow = wrapper.find('.db-result__tr--new')
    // On a new row, cells are [index-td, id-td, name-td]
    const cell = newRow.findAll('.db-result__td')[2]
    await cell.trigger('dblclick')
    await nextTick()
    const input = wrapper.find('.db-result__cell-input')
    await input.setValue('new-name')
    await input.trigger('keydown.enter')
    const evts = wrapper.emitted('newRowCellEdit')
    expect(evts).toBeTruthy()
    expect(evts![0]).toEqual(['tmp-7', 'name', 'new-name'])
  })

  it('does not allow editing a deleted row', async () => {
    const deletedRowKeys = new Set<string>(['[1]'])
    const wrapper = mountPane({ deletedRowKeys })
    const cell = wrapper.findAll('.db-result__tr')[0].findAll('.db-result__td')[2]
    await cell.trigger('dblclick')
    expect(wrapper.find('.db-result__cell-input').exists()).toBe(false)
  })
})

describe('DatabaseResultPane - scrollbar styling', () => {
  it('keeps webkit scrollbar selectors outside scoped styles so they can apply to the scroll container', () => {
    const sourcePath = join(process.cwd(), 'src/renderer/src/views/components/Database/components/DatabaseResultPane.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('<style lang="less">')
    expect(source).toContain('.db-result__table-wrapper::-webkit-scrollbar')
    expect(source).toContain('scrollbar-gutter: stable')
    expect(source).toContain('var(--scrollbar-thumb-color')
    expect(source).toContain('var(--scrollbar-track-color')
    expect(source).toContain('var(--scrollbar-thumb-hover-color')
  })
})
