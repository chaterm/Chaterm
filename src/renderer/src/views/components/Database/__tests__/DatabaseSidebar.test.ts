import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DatabaseSidebar from '../components/DatabaseSidebar.vue'

vi.mock('@ant-design/icons-vue', () => {
  const make = (name: string) => ({
    name,
    template: `<span class="${name.toLowerCase()}" />`
  })
  return {
    PlusOutlined: make('PlusOutlined'),
    SearchOutlined: make('SearchOutlined')
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

// Stubs for Ant Design Vue components used by DatabaseSidebar. The defaults
// (dropdown / sub-menu / tooltip) teleport overlays to document.body and
// hide slots that our test selectors need, so we flatten them here into
// plain divs that render their default (and, for dropdowns, overlay) slots
// inline. `a-menu-item` is a div carrying a @click handler so we can find
// items by the same `db-sidebar__*` class hooks the component assigns.
const antStubs = {
  'a-dropdown': {
    inheritAttrs: false,
    template: '<div class="a-dropdown" :data-overlay-class-name="$attrs[\'overlay-class-name\']"><slot /><slot name="overlay" /></div>'
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
    inheritAttrs: false,
    template: '<div class="a-sub-menu" :data-popup-class-name="$attrs[\'popup-class-name\']"><slot name="title" /><slot /></div>'
  },
  'a-tooltip': {
    template: '<div class="a-tooltip"><slot /></div>'
  },
  'a-input': {
    props: ['value'],
    emits: ['update:value'],
    template: '<input class="a-input" :value="value" />'
  }
}

describe('DatabaseSidebar', () => {
  it('shows group context submenus and emits typed new-connection and move-group actions', async () => {
    const wrapper = mount(DatabaseSidebar, {
      props: {
        nodes: [
          {
            id: 'group-parent',
            type: 'group',
            name: 'Parent',
            expanded: true,
            children: [
              {
                id: 'group-child',
                type: 'group',
                name: 'Child',
                parentId: 'group-parent',
                expanded: true,
                children: []
              }
            ]
          }
        ],
        selectedId: null,
        keyword: ''
      },
      global: {
        stubs: {
          ...antStubs,
          DatabaseTree: {
            emits: ['group-context'],
            template:
              "<button class=\"tree-trigger\" @click=\"$emit('group-context', { id: 'group-child', name: 'Child', x: 10, y: 20 })\">tree</button>"
          }
        },
        mocks: {
          $t: (key: string) => key
        }
      }
    })

    await wrapper.find('.tree-trigger').trigger('click')
    await wrapper.find('.db-sidebar__context-db-type-option--postgresql').trigger('click')

    expect(wrapper.emitted('add-connection-to-group')).toEqual([['PostgreSQL', 'group-child']])

    await wrapper.find('.tree-trigger').trigger('click')
    await wrapper.find('.db-sidebar__move-target--root').trigger('click')

    expect(wrapper.emitted('move-group')).toEqual([['group-child', null]])
  })

  it('does not emit add-connection-to-group when clicking a disabled DB type', async () => {
    const wrapper = mount(DatabaseSidebar, {
      props: {
        nodes: [
          {
            id: 'group-child',
            type: 'group',
            name: 'Child',
            expanded: true,
            children: []
          }
        ],
        selectedId: null,
        keyword: ''
      },
      global: {
        stubs: {
          ...antStubs,
          DatabaseTree: {
            emits: ['group-context'],
            template:
              "<button class=\"tree-trigger\" @click=\"$emit('group-context', { id: 'group-child', name: 'Child', x: 10, y: 20 })\">tree</button>"
          }
        },
        mocks: {
          $t: (key: string) => key
        }
      }
    })

    await wrapper.find('.tree-trigger').trigger('click')
    // Oracle is disabled in DATABASE_TYPE_OPTIONS; clicking the disabled
    // a-menu-item must not produce an add-connection-to-group emission.
    const oracleItem = wrapper.find('.db-sidebar__context-db-type-option--oracle')
    expect(oracleItem.exists()).toBe(true)
    await oracleItem.trigger('click')

    expect(wrapper.emitted('add-connection-to-group')).toBeUndefined()
    expect(wrapper.emitted('add-connection')).toBeUndefined()
  })

  it('applies the dedicated submenu popup class to add and context menus', () => {
    const wrapper = mount(DatabaseSidebar, {
      props: {
        nodes: [
          {
            id: 'group-child',
            type: 'group',
            name: 'Child',
            expanded: true,
            children: []
          }
        ],
        selectedId: null,
        keyword: ''
      },
      global: {
        stubs: {
          ...antStubs,
          DatabaseTree: {
            template: '<div class="tree-stub" />'
          }
        },
        mocks: {
          $t: (key: string) => key
        }
      }
    })

    expect(wrapper.find('.a-dropdown').attributes('data-overlay-class-name')).toBe('db-sidebar__menu-overlay')

    const popupClassNames = wrapper.findAll('.a-sub-menu').map((node) => node.attributes('data-popup-class-name'))

    expect(popupClassNames).toContain('db-sidebar__menu-overlay db-sidebar__submenu-overlay')
  })
})
