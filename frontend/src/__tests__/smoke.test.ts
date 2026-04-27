import { describe, it, expect } from 'vitest'
import { itReq } from './helpers/itReq.js'

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

describe('frontend itReq', () => {
  // todo — placeholder для этапа 1, см. backend smoke notes в Task 6.
  itReq.todo('NAV-001-02', 'reserved for stage 5 — frontend itReq registers valid ID')

  it('rejects invalid format', () => {
    expect(() => itReq('bad-id', 'x', () => {})).toThrow(/invalid requirement ID/)
  })
})
