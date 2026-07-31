import { expect, test, type Page } from '@playwright/test'

const storageKey = 'devops-interview-trainer-progress'

async function clearProgress(page: Page) {
  await page.addInitScript(() => {
    const marker = '__devops_trainer_e2e_initialized__'
    if (!sessionStorage.getItem(marker)) {
      localStorage.clear()
      sessionStorage.setItem(marker, 'true')
    }
  })
}

async function runTerminal(page: Page, commands: string[]) {
  const terminal = page.getByRole('textbox', { name: 'Terminal input' })
  await expect(terminal).toBeVisible()
  await terminal.click()
  for (const command of commands) {
    await page.keyboard.type(command)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(40)
  }
}

test.beforeEach(async ({ page }) => clearProgress(page))

test('Dashboard opens and all ten lessons are reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Продолжай обучение')
  await page.goto('/modules')
  await expect(page.locator('main a[href^="/modules/"]')).toHaveCount(10)
  await page.locator('main a[href="/modules/linux-processes"]').click()
  await expect(page.locator('h1')).toContainText('Linux: процессы и сигналы')
})

test('Guided practice advances through the Linux process lesson', async ({ page }) => {
  await page.goto('/modules/linux-processes')
  const guided = page.locator('#guided')
  await guided.getByRole('button', { name: 'Проверю процесс и нагрузку' }).click()
  await guided.locator('input').fill('top')
  await guided.getByRole('button', { name: 'Выполнить' }).click()
  await expect(guided.getByRole('button', { name: 'Следующий шаг' })).toBeVisible()
  await guided.getByRole('button', { name: 'Следующий шаг' }).click()
  await guided.getByRole('button', { name: 'PPID, STAT и команду' }).click()
  await guided.locator('input').fill('ps -o pid,ppid,stat,cmd -p 3912')
  await guided.getByRole('button', { name: 'Выполнить' }).click()
  await guided.getByRole('button', { name: 'Следующий шаг' }).click()
  await guided.getByRole('button', { name: 'SIGTERM' }).click()
  await guided.locator('input').fill('kill -15 3912')
  await guided.getByRole('button', { name: 'Выполнить' }).click()
  await expect(guided).toContainText('Практика завершена')
})

test('Quiz stores both a correct and an incorrect answer across a reload', async ({ page }) => {
  await page.goto('/quiz')
  await page.locator('input[type="radio"]').first().check()
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('main')).toContainText('Верно')
  await page.getByRole('button', { name: 'Следующий вопрос' }).click()
  await page.locator('input[type="radio"]').nth(1).check()
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('main')).toContainText('Попробуйте ещё')
  const beforeReload = await page.evaluate((key) => localStorage.getItem(key), storageKey)
  expect(beforeReload).toContain('linux-permissions-single-1')
  expect(beforeReload).toContain('linux-permissions-single-2')
  await page.reload()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(beforeReload)
})

test('Linux permissions require diagnosis, minimal repair and verification', async ({ page }) => {
  await page.goto('/labs/linux?scenario=linux-permission&mode=independent')
  await runTerminal(page, [
    'systemctl status app-worker',
    'stat /srv/app/config.yml',
    'chown app:app /srv/app/config.yml',
    'chmod 640 /srv/app/config.yml',
    'sudo -u app cat /srv/app/config.yml',
  ])
  await expect(page.locator('main')).toContainText('Сценарий решён')
})

test('Linux disk full is verified after nginx closes the deleted descriptor', async ({ page }) => {
  await page.goto('/labs/linux?scenario=linux-disk-full&mode=independent')
  await runTerminal(page, ['df -h /var', 'du -xhd1 /var', 'lsof +L1', 'systemctl restart nginx', 'df -h /var'])
  await expect(page.locator('main')).toContainText('Сценарий решён')
})

test('CrashLoopBackOff needs previous logs, a rollback and rollout verification', async ({ page }) => {
  await page.goto('/labs/kubernetes?scenario=kube-crashloop&mode=independent')
  await runTerminal(page, [
    'kubectl get pods -n production',
    'kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production',
    'kubectl rollout undo deployment/web -n production',
    'kubectl get pods -n production',
    'kubectl rollout status deployment/web -n production',
  ])
  await expect(page.locator('main')).toContainText('Сценарий решён')
})

test('Pending worker uses its own describe output and request repair', async ({ page }) => {
  await page.goto('/labs/kubernetes?scenario=kube-pending&mode=independent')
  await runTerminal(page, [
    'kubectl get pods -n production',
    'kubectl describe pod worker-5f6d78cf9-xtfd -n production',
    'kubectl set resources deployment/worker -c worker --requests=cpu=200m -n production',
    'kubectl get pods worker-5f6d78cf9-xtfd -n production',
  ])
  await expect(page.locator('main')).toContainText('Сценарий решён')
})

test('Progress reset clears persisted attempts and readiness remains bounded', async ({ page }) => {
  await page.goto('/quiz')
  await page.locator('input[type="radio"]').first().check()
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await page.goto('/progress')
  const readiness = await page.locator('main').locator('text=/^\\d+%$/').first().textContent()
  expect(Number((readiness ?? '0').replace('%', ''))).toBeLessThanOrEqual(100)
  await page.getByRole('button', { name: 'Сбросить прогресс' }).click()
  const persisted = await page.evaluate((key) => localStorage.getItem(key), storageKey)
  expect(persisted).toContain('"quizAttempts":[]')
})

test('Mobile menu opens and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible()
  await page.getByRole('link', { name: 'Квиз', exact: true }).last().click()
  await expect(page).toHaveURL(/\/quiz$/)
})
