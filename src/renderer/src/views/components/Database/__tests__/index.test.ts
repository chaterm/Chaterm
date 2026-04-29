import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DatabaseWorkspace from '../index.vue'
import { useDatabaseWorkspaceStore } from '@/store/databaseWorkspaceStore'

vi.mock('@ant-design/icons-vue', () => {
  const make = (name: string) => ({
    name,
    template: `<span class="${name.toLowerCase()}" />`
  })
  return {
    AlignLeftOutlined: make('AlignLeftOutlined'),
    CaretDownOutlined: make('CaretDownOutlined'),
    CaretUpOutlined: make('CaretUpOutlined'),
    CloseOutlined: make('CloseOutlined'),
    DatabaseOutlined: make('DatabaseOutlined'),
    DownOutlined: make('DownOutlined'),
    FilterOutlined: make('FilterOutlined'),
    FolderOpenOutlined: make('FolderOpenOutlined'),
    FolderOutlined: make('FolderOutlined'),
    LinkOutlined: make('LinkOutlined'),
    PauseCircleOutlined: make('PauseCircleOutlined'),
    PlayCircleOutlined: make('PlayCircleOutlined'),
    PlusOutlined: make('PlusOutlined'),
    RightOutlined: make('RightOutlined'),
    SearchOutlined: make('SearchOutlined'),
    SettingOutlined: make('SettingOutlined'),
    SwapOutlined: make('SwapOutlined'),
    TableOutlined: make('TableOutlined'),
    TeamOutlined: make('TeamOutlined'),
    DisconnectOutlined: make('DisconnectOutlined'),
    ThunderboltOutlined: make('ThunderboltOutlined')
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, args?: Record<string, unknown>) => {
      if (args && args.count !== undefined) return `${key}:${args.count}`
      return key
    }
  })
}))

const mountWorkspace = () =>
  mount(DatabaseWorkspace, {
    global: {
      stubs: {
        'a-input': {
          props: ['value'],
          emits: ['update:value'],
          template: '<input class="a-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
        },
        'a-input-password': {
          props: ['value'],
          emits: ['update:value'],
          template: '<input class="a-input-password" type="password" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
        },
        'a-input-number': {
          props: ['value'],
          emits: ['update:value'],
          template: '<input class="a-input-number" type="number" :value="value" @input="$emit(\'update:value\', Number($event.target.value))" />'
        },
        'a-select': {
          props: ['value'],
          emits: ['update:value'],
          template: '<div class="a-select"><slot /></div>'
        },
        'a-select-option': {
          template: '<div class="a-select-option"><slot /></div>'
        },
        'a-button': {
          template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>',
          emits: ['click']
        },
        'a-modal': {
          props: ['open'],
          template: '<div v-if="open" class="a-modal"><slot /></div>'
        }
      },
      mocks: {
        $t: (key: string, args?: Record<string, unknown>) => {
          if (args && args.count !== undefined) return `${key}:${args.count}`
          return key
        }
      }
    }
  })

describe('Database workspace shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the overview tab by default', () => {
    const wrapper = mountWorkspace()
    expect(wrapper.text()).toContain('database.title')
    expect(wrapper.text()).toContain('database.overview')
  })

  it('renders the sidebar search input', () => {
    const wrapper = mountWorkspace()
    const input = wrapper.find('.db-sidebar__search .a-input')
    expect(input.exists()).toBe(true)
  })

  it('renders seeded explorer nodes', () => {
    const wrapper = mountWorkspace()
    const labels = wrapper.findAll('.db-tree-node__label').map((el) => el.text())
    expect(labels).toContain('Default Group')
    expect(labels).toContain('local-mysql')
    expect(labels).toContain('drms')
  })

  it('renders a SQL tab with result columns when a table tab becomes active', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()
    store.openSqlTab('table-drms')
    await wrapper.vm.$nextTick()

    const tabTitles = wrapper.findAll('.db-tabs__title').map((n) => n.text())
    expect(tabTitles).toContain('drms')

    const headerLabels = wrapper.findAll('.db-result__th-label').map((n) => n.text())
    expect(headerLabels).toEqual(['id', 'resource', 'owner', 'updated_at'])
    expect(wrapper.find('.db-editor__textarea').exists()).toBe(true)
  })

  it('opens connection modal when add-connection button is clicked', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()
    await wrapper.find('.db-sidebar__add-btn').trigger('click')
    expect(store.connectionModalVisible).toBe(true)
    expect(wrapper.find('.a-modal').exists()).toBe(true)
  })

  it('saves a connection from the modal and inserts it into the tree', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()
    store.openConnectionModal({
      id: 'conn-modal-test',
      name: 'modal-conn',
      host: '10.0.0.5',
      port: 3306,
      user: 'root'
    })
    await wrapper.vm.$nextTick()
    const buttons = wrapper.findAll('.a-button')
    const saveButton = buttons.find((btn) => btn.text() === 'common.save')
    expect(saveButton).toBeDefined()
    await saveButton!.trigger('click')

    expect(store.connectionModalVisible).toBe(false)
    const group = store.tree.find((n) => n.id === 'group-default')
    expect(group?.children?.some((c) => c.id === 'conn-modal-test')).toBe(true)
  })

  it('rejects save when required fields are missing and shows feedback', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()
    store.openConnectionModal()
    await wrapper.vm.$nextTick()
    const buttons = wrapper.findAll('.a-button')
    const saveButton = buttons.find((btn) => btn.text() === 'common.save')
    await saveButton!.trigger('click')
    expect(store.connectionModalVisible).toBe(true)
    expect(wrapper.text()).toContain('database.fixRequiredFields')
  })
})
