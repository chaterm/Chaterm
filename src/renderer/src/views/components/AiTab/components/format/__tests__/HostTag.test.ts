import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HostTag from '../HostTag.vue'

describe('HostTag', () => {
  it('renders nothing without a host', () => {
    const wrapper = mount(HostTag)
    expect(wrapper.find('.host-tag').exists()).toBe(false)
  })

  it('shows the host name with its color tag', () => {
    const wrapper = mount(HostTag, { props: { hostId: '10.0.0.1', hostName: 'api', colorTag: '#3B82F6' } })
    expect(wrapper.find('.host-name').text()).toBe('api')
    expect(wrapper.find('.host-color-dot').attributes('style')).toContain('background-color: rgb(59, 130, 246)')
  })

  it('falls back to the host id and a neutral color', () => {
    const wrapper = mount(HostTag, { props: { hostId: '10.0.0.1' } })
    expect(wrapper.find('.host-name').text()).toBe('10.0.0.1')
    expect(wrapper.find('.host-color-dot').attributes('style')).toContain('background-color: rgb(136, 136, 136)')
  })
})
