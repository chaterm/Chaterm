/**
 * AiChatSearchBar - Browser Mode Layout Tests
 *
 * Runs in a real browser because jsdom does not compute layout.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import AiChatSearchBar from '../components/AiChatSearchBar.vue'
// The app-wide box-sizing reset the bar is laid out against.
import '@/assets/base.css'

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

// Narrowest width the AI sidebar can be dragged to.
const MIN_AI_SIDEBAR_WIDTH_PX = 320

describe('AiChatSearchBar layout', () => {
  afterEach(() => cleanup())

  const renderInSidebar = async (width: number) => {
    const { container } = await render(AiChatSearchBar, {
      props: { searchTerm: 'foo', matchCount: 12, currentMatchIndex: 3, focusToken: 0 },
      global: { plugins: [i18n] }
    })
    // The bar is absolutely positioned, so the container stands in for the sidebar.
    container.style.cssText = `position: relative; width: ${width}px; height: 200px;`
    // offset metrics ignore the scale transform of the slide-in animation
    const bar = container.querySelector('.ai-chat-search-bar') as HTMLElement
    return {
      hostWidth: container.clientWidth,
      left: bar.offsetLeft,
      right: bar.offsetLeft + bar.offsetWidth,
      width: bar.offsetWidth,
      overflows: bar.scrollWidth > bar.clientWidth
    }
  }

  it('keeps the same margin on both sides in a sidebar dragged to its minimum width', async () => {
    const { hostWidth, left, right, overflows } = await renderInSidebar(MIN_AI_SIDEBAR_WIDTH_PX)

    expect(left).toBeGreaterThanOrEqual(12)
    expect(right).toBeLessThanOrEqual(hostWidth - 12)
    expect(overflows).toBe(false)
  })

  it('keeps its preferred width in a wide sidebar', async () => {
    const { width } = await renderInSidebar(600)

    expect(width).toBeGreaterThanOrEqual(340)
  })
})
