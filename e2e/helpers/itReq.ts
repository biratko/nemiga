import { test, type PlaywrightTestArgs, type PlaywrightTestOptions, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions, type TestInfo } from '@playwright/test'

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

function normalize(reqId: string | string[]): string[] {
  return Array.isArray(reqId) ? reqId : [reqId]
}

type TestArgs = PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions
type TestFn = (args: TestArgs, testInfo: TestInfo) => Promise<void> | void

export function itReq(reqId: string | string[], name: string, fn: TestFn): void {
  const ids = normalize(reqId)
  // Validate before delegating to test(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  test(`${prefix(ids)} ${name}`, fn)
}

itReq.skip = (reqId: string | string[], name: string, fn: TestFn): void => {
  const ids = normalize(reqId)
  // Validate before delegating to test.skip(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  test.skip(`${prefix(ids)} ${name}`, fn)
}

itReq.only = (reqId: string | string[], name: string, fn: TestFn): void => {
  const ids = normalize(reqId)
  // Validate before delegating to test.only(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  test.only(`${prefix(ids)} ${name}`, fn)
}

itReq.todo = (reqId: string | string[], name: string): void => {
  const ids = normalize(reqId)
  // Validate before delegating to test.skip(); smoke tests depend on synchronous throw before registration.
  validate(ids)
  // Playwright не имеет test.todo; используем test.skip с пустым телом.
  // Reporter видит status='skipped' + expectedStatus='skipped' → пишет 'todo' в реестр.
  test.skip(`${prefix(ids)} ${name}`, async () => {})
}
