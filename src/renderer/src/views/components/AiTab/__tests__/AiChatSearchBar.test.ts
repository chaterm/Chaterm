import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AiChatSearchBar from '../components/AiChatSearchBar.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      ai: {
        searchChatPlaceholder: 'Search chat',
        searchChatPrevious: 'Previous',
        searchChatNext: 'Next',
        noSearchMatches: 'No results'
      },
      common: { close: 'Close' }
    }
  }
})

const mountBar = (props: { searchTerm: string; matchCount: number; currentMatchIndex: number; focusToken?: number }, attachTo?: HTMLElement) =>
  mount(AiChatSearchBar, {
    props: { focusToken: 0, ...props },
    attachTo,
    global: { plugins: [i18n] }
  })

describe('AiChatSearchBar', () => {
  it('renders the match counter after the input container, not inside it', () => {
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 5, currentMatchIndex: 2 })

    expect(wrapper.find('.search-results .results-text').text()).toBe('2/5')
    expect(wrapper.find('.search-input-container .search-results').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders the no-match label after the input container when nothing matches', () => {
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 0, currentMatchIndex: 0 })

    const noResults = wrapper.find('.search-results.no-results')
    expect(noResults.text()).toBe('No results')
    expect(wrapper.find('.search-input-container .search-results').exists()).toBe(false)

    wrapper.unmount()
  })

  it('hides the counter while the search term is empty', () => {
    const wrapper = mountBar({ searchTerm: '', matchCount: 0, currentMatchIndex: 0 })

    expect(wrapper.find('.search-results').exists()).toBe(false)

    wrapper.unmount()
  })

  it('has no clear button', () => {
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 5, currentMatchIndex: 1 })

    expect(wrapper.find('.clear-button').exists()).toBe(false)

    wrapper.unmount()
  })

  it('emits update:searchTerm when typing', async () => {
    const wrapper = mountBar({ searchTerm: '', matchCount: 0, currentMatchIndex: 0 })

    await wrapper.find('input.search-input').setValue('bar')

    expect(wrapper.emitted('update:searchTerm')).toEqual([['bar']])

    wrapper.unmount()
  })

  it('emits findNext on Enter, findPrevious on Shift+Enter and close on Escape', async () => {
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 5, currentMatchIndex: 1 })
    const input = wrapper.find('input.search-input')

    await input.trigger('keydown.enter')
    await input.trigger('keydown.enter', { shiftKey: true })
    await input.trigger('keydown.esc')

    expect(wrapper.emitted('findNext')).toHaveLength(1)
    expect(wrapper.emitted('findPrevious')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('emits findPrevious, findNext and close from the control buttons', async () => {
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 5, currentMatchIndex: 1 })
    const buttons = wrapper.findAll('.search-controls .search-button')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')

    expect(wrapper.emitted('findPrevious')).toHaveLength(1)
    expect(wrapper.emitted('findNext')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('focuses the input and selects the term when the focus token changes', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 5, currentMatchIndex: 1 }, host)
    const input = wrapper.find('input.search-input').element as HTMLInputElement
    input.value = 'foo'
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).not.toBe(input)

    await wrapper.setProps({ focusToken: 1 })

    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])

    wrapper.unmount()
    host.remove()
  })

  it('disables previous and next when there are no matches', () => {
    const wrapper = mountBar({ searchTerm: 'foo', matchCount: 0, currentMatchIndex: 0 })
    const buttons = wrapper.findAll('.search-controls .search-button')

    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].attributes('disabled')).toBeDefined()
    expect(buttons[2].attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })
})
