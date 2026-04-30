import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DatabaseWorkspace from '../index.vue'
import { useDatabaseWorkspaceStore } from '@/store/databaseWorkspaceStore'

// Replace the real Monaco-backed SQL editor with a textarea stub so we don't
// have to boot Monaco inside jsdom. The wrapper is exposed with the methods
// SqlWorkspace.vue reads to build the executed SQL string.
vi.mock('../components/SqlMonacoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { modelValue: { type: String, default: '' } },
      emits: ['update:modelValue', 'run'],
      setup(props, { emit, expose }) {
        const getText = () => (props as { modelValue?: string }).modelValue ?? ''
        expose({
          getText,
          getSelectedText: () => '',
          getTextUntilCursor: () => getText(),
          focus: () => {}
        })
        return () =>
          h('textarea', {
            class: 'fake-monaco',
            value: (props as { modelValue?: string }).modelValue,
            onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
          })
      }
    })
  }
})

vi.mock('@ant-design/icons-vue', () => {
  const make = (name: string) => ({
    name,
    template: `<span class="${name.toLowerCase()}" />`
  })
  return {
    AlignLeftOutlined: make('AlignLeftOutlined'),
    BulbOutlined: make('BulbOutlined'),
    CaretDownOutlined: make('CaretDownOutlined'),
    CaretRightOutlined: make('CaretRightOutlined'),
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
    SaveOutlined: make('SaveOutlined'),
    SearchOutlined: make('SearchOutlined'),
    SettingOutlined: make('SettingOutlined'),
    StepForwardOutlined: make('StepForwardOutlined'),
    SwapOutlined: make('SwapOutlined'),
    TableOutlined: make('TableOutlined'),
    TeamOutlined: make('TeamOutlined'),
    DisconnectOutlined: make('DisconnectOutlined'),
    ThunderboltOutlined: make('ThunderboltOutlined'),
    VerticalAlignBottomOutlined: make('VerticalAlignBottomOutlined')
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
      // Teleport-disable so the connection panel (which teleports to body)
      // renders inline in the component tree and stays addressable via
      // wrapper.find(). We only care about the DOM, not the portal.
      stubs: {
        teleport: true,
        transition: false,
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
        },
        // Ant Design Vue overlay-based components used by DatabaseSidebar.
        // The real components teleport overlays out of the tree and gate
        // visibility on click state, so we flatten them into plain divs that
        // render default + overlay slots inline. This lets tests click menu
        // items by their db-sidebar__* class hooks directly.
        'a-dropdown': {
          template: '<div class="a-dropdown"><slot /><slot name="overlay" /></div>'
        },
        'a-menu': {
          template: '<div class="a-menu"><slot /></div>'
        },
        'a-menu-item': {
          inheritAttrs: false,
          emits: ['click'],
          props: {
            disabled: { type: Boolean, default: false }
          },
          template:
            '<div class="a-menu-item" :class="{ \'a-menu-item--disabled\': disabled }" v-bind="$attrs" @click="!disabled && $emit(\'click\', $event)"><slot /></div>'
        },
        'a-sub-menu': {
          template: '<div class="a-sub-menu"><slot name="title" /><slot /></div>'
        },
        'a-tooltip': {
          template: '<div class="a-tooltip"><slot /></div>'
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

  it('renders the SQL workspace shell when a sql tab becomes active', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()
    store.openSqlTab('table-drms')
    await wrapper.vm.$nextTick()

    const tabTitles = wrapper.findAll('.db-tabs__title').map((n) => n.text())
    expect(tabTitles).toContain('drms')

    // SqlWorkspace.vue is now the SQL host; Monaco is stubbed as a textarea.
    expect(wrapper.find('.sql-workspace').exists()).toBe(true)
    expect(wrapper.find('.fake-monaco').exists()).toBe(true)
  })

  it('renders the .db-tabs__add button', () => {
    const wrapper = mountWorkspace()
    expect(wrapper.find('.db-tabs__add').exists()).toBe(true)
  })

  it('opens add menu instead of connection modal when add button is clicked', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()
    await wrapper.find('.db-sidebar__add-btn').trigger('click')
    expect(store.connectionModalVisible).toBe(false)
    // a-dropdown overlay is rendered inside the sidebar when stubbed; the
    // "new group" entry confirms the add menu is available without the
    // connection modal opening.
    expect(wrapper.find('.db-sidebar__add-menu-item--group').exists()).toBe(true)
  })

  it('opens connection modal only after a database type is selected', async () => {
    const wrapper = mountWorkspace()
    const store = useDatabaseWorkspaceStore()

    await wrapper.find('.db-sidebar__add-btn').trigger('click')
    expect(store.connectionModalVisible).toBe(false)

    await wrapper.find('.db-sidebar__db-type-option--mysql').trigger('click')
    expect(store.connectionModalVisible).toBe(true)
    expect(store.connectionDraft?.dbType).toBe('MySQL')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.db-conn-panel').exists()).toBe(true)
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
    const buttons = wrapper.findAll('.db-conn-btn')
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
    const buttons = wrapper.findAll('.db-conn-btn')
    const saveButton = buttons.find((btn) => btn.text() === 'common.save')
    await saveButton!.trigger('click')
    expect(store.connectionModalVisible).toBe(true)
    expect(wrapper.text()).toContain('database.fixRequiredFields')
  })
})
