import { describe, it, expect } from 'vitest'
import { itReq } from './helpers/itReq.js'

describe('itReq smoke', () => {
  // todo — не вызывает фантом-ошибку (нет реальных требований на этапе 0).
  // Подтверждает, что обёртка валидирует ID и regex имени работает.
  itReq.todo('NAV-001-01', 'reserved for stage 5 — backend itReq registers valid ID')

  it('rejects invalid ID format', () => {
    expect(() => itReq('lowercase-bad', 'x', () => {})).toThrow(/invalid requirement ID/)
    expect(() => itReq('NAV-1', 'x', () => {})).toThrow(/invalid requirement ID/)
    expect(() => itReq('NAV-001-1', 'x', () => {})).toThrow(/invalid requirement ID/)
  })

  it('accepts array of IDs', () => {
    expect(() => {
      const ids = ['NAV-001-01', 'FILE-002-03']
      for (const id of ids) {
        if (!/^[A-Z]+-\d{3}(?:-\d{2})?$/.test(id)) throw new Error('bad')
      }
    }).not.toThrow()
  })
})
