import { expect, test } from '@playwright/test'

test('core learning flow is available', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Добрый вечер, Антон' })).toBeVisible()
  await page.getByRole('link', { name: 'Модули', exact: true }).click()
  await page.getByRole('link', { name: /Linux: права, пользователи и группы/ }).click()
  await expect(page.getByRole('heading', { name: 'Linux: права, пользователи и группы' })).toBeVisible()
  await page.getByRole('link', { name: 'Открыть лабораторию' }).click()
  await expect(page.getByLabel('Интерактивный безопасный терминал')).toBeVisible()
})
