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
    ReloadOutlined: make('ReloadOutlined'),
    SearchOutlined: make('SearchOutlined')
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

// Stubs for Ant Design Vue components used by DatabaseSidebar. The Sidebar
// now renders group / add / connection context menus as raw <Teleport to="body">
// blocks, not through a-dropdown overlays. We still stub a-tooltip /a-input
// and keep the remaining ant stubs (a-menu*/a-sub-menu/a-dropdown) as
// flat divs so any residual usage (e.g. DbTypeMenuItems in variant="plain"
// still uses a-tooltip for disabled items) renders inline.
//
// `teleport: true` flattens <Teleport> targets into the component tree so
// wrapper.find() can reach the menu overlays that the real component moves
// to document.body.
const antStubs = {
  teleport: true,
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

    // Open group context menu by emitting from the stubbed tree, then hover
    // the "new connection" submenu trigger to expose the DB type options.
    await wrapper.find('.tree-trigger').trigger('click')
    await wrapper.find('.db-sidebar__group-submenu-trigger--connection').trigger('mouseenter')
    await wrapper.find('.db-sidebar__context-db-type-option--postgresql').trigger('click')

    expect(wrapper.emitted('add-connection-to-group')).toEqual([['PostgreSQL', 'group-child']])

    // The context menu closes after selecting a DB type. Reopen it and hover
    // the "move to" submenu trigger to reveal the root group target.
    await wrapper.find('.tree-trigger').trigger('click')
    await wrapper.find('.db-sidebar__group-submenu-trigger--move').trigger('mouseenter')
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
    // Hover the "new connection" submenu trigger to render the DB type list.
    await wrapper.find('.db-sidebar__group-submenu-trigger--connection').trigger('mouseenter')
    // Oracle is disabled in DATABASE_TYPE_OPTIONS; clicking the disabled
    // option (rendered as a plain <li>, not an a-menu-item, under the
    // variant="plain" DbTypeMenuItems) must not emit anything.
    const oracleItem = wrapper.find('.db-sidebar__context-db-type-option--oracle')
    expect(oracleItem.exists()).toBe(true)
    await oracleItem.trigger('click')

    expect(wrapper.emitted('add-connection-to-group')).toBeUndefined()
    expect(wrapper.emitted('add-connection')).toBeUndefined()
  })

  it('applies the dedicated submenu overlay class to add and context menus', async () => {
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

    // Open the "+" add menu; it teleports to body but the teleport: true stub
    // renders it inline. Both the outer panel and the nested connection
    // sub-panel must carry the shared overlay skin class.
    await wrapper.find('.db-sidebar__add-btn').trigger('click')
    const addMenuRoots = wrapper.findAll('.db-sidebar__group-menu')
    expect(addMenuRoots.length).toBeGreaterThan(0)
    for (const root of addMenuRoots) {
      expect(root.classes()).toContain('db-sidebar__menu-overlay')
    }

    // Open the group context menu via the stubbed tree trigger.
    await wrapper.find('.tree-trigger').trigger('click')

    // Every rendered sub-popup (the per-menu <div v-show="activeSubmenu …">
    // blocks) must advertise the overlay + sub-popup class pair.
    const subPopups = wrapper.findAll('.db-sidebar__ctx-subpopup')
    expect(subPopups.length).toBeGreaterThan(0)
    for (const popup of subPopups) {
      expect(popup.classes()).toContain('db-sidebar__menu-overlay')
      expect(popup.classes()).toContain('db-sidebar__ctx-subpopup')
    }
  })
})
