import { it, type TestFunction } from 'vitest'

const ID_RE = /^[A-Z]+-\d{3}(?:-\d{2})?$/

function validate(ids: string[]): void {
  for (const id of ids) {
    if (!ID_RE.test(id)) {
      throw new Error(`itReq: invalid requirement ID: "${id}". Expected DOMAIN-NNN or DOMAIN-NNN-NN.`)
    }
  }
}

function prefix(ids: string[]): string {
  return `[${ids.join(',')}]`
}

type TestFn = TestFunction

function normalize(reqId: string | string[]): string[] {
  return Array.isArray(reqId) ? reqId : [reqId]
}

export function itReq(reqId: string | string[], name: string, fn?: TestFn): void {
  const ids = normalize(reqId)
  // Validate before delegating to it(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  it(`${prefix(ids)} ${name}`, fn)
}

itReq.skip = (reqId: string | string[], name: string, fn?: TestFn): void => {
  const ids = normalize(reqId)
  // Validate before delegating to it(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  it.skip(`${prefix(ids)} ${name}`, fn)
}

itReq.only = (reqId: string | string[], name: string, fn?: TestFn): void => {
  const ids = normalize(reqId)
  // Validate before delegating to it(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  it.only(`${prefix(ids)} ${name}`, fn)
}

itReq.todo = (reqId: string | string[], name: string): void => {
  const ids = normalize(reqId)
  // Validate before delegating to it(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  it.todo(`${prefix(ids)} ${name}`)
}
