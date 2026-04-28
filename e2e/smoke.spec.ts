import { itReq } from './helpers/itReq.js'
import { test, expect } from './helpers/app.js'

// itReq.todo через test.skip — записывает в реестр со статусом `todo`,
// не порождает фантом для скрипта --check (todo не считается покрытием).
itReq.todo('NAV-001-03', 'reserved for stage 5 — e2e itReq registers valid ID')

// Обычный test() без itReq — не идёт в реестр; служит чтобы убедиться,
// что webServer стартанул и Playwright способен открыть страницу.
test('app boots and renders index', async ({ page }) => {
  const response = await page.goto('/')
  expect(response).not.toBeNull()
  expect(response!.status()).toBe(200)
  await expect(page).toHaveTitle(/.+/)
})

test('app fixture provides isolated tmp dir', async ({ app }) => {
  expect(app.testRoot).toMatch(/fixtures/)
})
