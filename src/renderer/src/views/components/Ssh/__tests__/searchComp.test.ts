import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SearchComp from '../components/searchComp.vue'

// Minimal stand-in for @xterm/addon-search. `onDidChangeResults` is captured so
// tests can drive the event the way the addon does after a find call.
const createFakeSearchAddon = () => {
  let handler: ((event: { resultIndex: number; resultCount: number }) => void) | null = null
  const dispose = vi.fn()
  return {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    onDidChangeResults: vi.fn((cb: (event: { resultIndex: number; resultCount: number }) => void) => {
      handler = cb
      return { dispose }
    }),
    emitResults(resultIndex: number, resultCount: number) {
      handler?.({ resultIndex, resultCount })
    },
    dispose
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      term: { searchPlaceholder: 'Search', searchPrevious: 'Previous', searchNext: 'Next' },
      common: { clear: 'Clear', close: 'Close' }
    }
  }
})

const mountSearch = (searchAddon: ReturnType<typeof createFakeSearchAddon> | null) =>
  mount(SearchComp, {
    props: { searchAddon: searchAddon as any },
    global: { plugins: [i18n] }
  })

describe('searchComp', () => {
  let searchAddon: ReturnType<typeof createFakeSearchAddon>

  beforeEach(() => {
    searchAddon = createFakeSearchAddon()
  })

  it('searches incrementally with decorations as the term changes', async () => {
    const wrapper = mountSearch(searchAddon)

    await wrapper.find('input.search-input').setValue('error')

    expect(searchAddon.findNext).toHaveBeenCalledTimes(1)
    const [term, options] = searchAddon.findNext.mock.calls[0]
    expect(term).toBe('error')
    expect(options.incremental).toBe(true)
    // Decorations are what make the addon track results and fire
    // onDidChangeResults at all.
    expect(options.decorations).toBeDefined()

    wrapper.unmount()
  })

  it('renders the result counter from onDidChangeResults with a 1-based index', async () => {
    const wrapper = mountSearch(searchAddon)

    await wrapper.find('input.search-input').setValue('error')
    searchAddon.emitResults(0, 3)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.results-text').text()).toBe('1/3')

    searchAddon.emitResults(2, 3)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.results-text').text()).toBe('3/3')

    wrapper.unmount()
  })

  it('shows index 0 when the addon reports resultIndex -1', async () => {
    const wrapper = mountSearch(searchAddon)

    await wrapper.find('input.search-input').setValue('error')
    // -1 means the highlight limit was exceeded, so there is no active match.
    searchAddon.emitResults(-1, 500)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.results-text').text()).toBe('0/500')

    wrapper.unmount()
  })

  it('navigates on the first Enter before any result count has arrived', async () => {
    const wrapper = mountSearch(searchAddon)
    const input = wrapper.find('input.search-input')

    await input.setValue('error')
    searchAddon.findNext.mockClear()

    // No onDidChangeResults yet: navigation must not be gated on the count.
    await input.trigger('keydown.enter')

    expect(searchAddon.findNext).toHaveBeenCalledTimes(1)
    expect(searchAddon.findNext.mock.calls[0][0]).toBe('error')

    wrapper.unmount()
  })

  it('clears decorations and the counter when the term is emptied', async () => {
    const wrapper = mountSearch(searchAddon)
    const input = wrapper.find('input.search-input')

    await input.setValue('error')
    searchAddon.emitResults(0, 3)
    await wrapper.vm.$nextTick()

    await input.setValue('')
    await wrapper.vm.$nextTick()

    expect(searchAddon.clearDecorations).toHaveBeenCalled()
    expect(wrapper.find('.results-text').exists()).toBe(false)

    wrapper.unmount()
  })

  it('clears decorations and emits closeSearch on Escape', async () => {
    const wrapper = mountSearch(searchAddon)

    await wrapper.find('input.search-input').setValue('error')
    await wrapper.find('input.search-input').trigger('keydown.esc')

    expect(searchAddon.clearDecorations).toHaveBeenCalled()
    expect(wrapper.emitted('closeSearch')).toHaveLength(1)

    wrapper.unmount()
  })

  it('disposes the results listener on unmount', () => {
    const wrapper = mountSearch(searchAddon)
    wrapper.unmount()
    expect(searchAddon.dispose).toHaveBeenCalled()
  })

  it('mounts without a search addon', async () => {
    const wrapper = mountSearch(null)
    await wrapper.find('input.search-input').setValue('error')
    expect(wrapper.find('input.search-input').exists()).toBe(true)
    wrapper.unmount()
  })
})
