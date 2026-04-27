import { describe, it, expect } from 'vitest'

describe('frontend vitest setup', () => {
  it('runs in jsdom environment', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })

  it('can create DOM elements', () => {
    const el = document.createElement('div')
    el.textContent = 'hello'
    expect(el.textContent).toBe('hello')
  })
})
