import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DatabaseOverview from '../components/DatabaseOverview.vue'
import { DATABASE_TYPE_OPTIONS } from '../constants/databaseTypes'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('DatabaseOverview', () => {
  it('renders a database capability card for every supported database type option', () => {
    const wrapper = mount(DatabaseOverview, {
      global: {
        mocks: {
          $t: (key: string) => key
        }
      }
    })

    expect(wrapper.text()).toContain('database.overviewLead')

    const cards = wrapper.findAll('.db-overview__engine-card')
    expect(cards).toHaveLength(DATABASE_TYPE_OPTIONS.length)

    const enabledCards = cards.filter((card) => card.classes().includes('db-overview__engine-card--enabled'))
    expect(enabledCards.length).toBeGreaterThan(0)

    const disabledBadge = wrapper.find('.db-overview__engine-badge')
    expect(disabledBadge.exists()).toBe(true)
    expect(disabledBadge.text()).toContain('database.comingSoon')
  })
})
