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
    // xterm receives keyboard data asynchronously; this is the only intentional input delay.
    await page.waitForTimeout(25)
  }
}

async function runScenario(page: Page, domain: 'linux' | 'kubernetes', scenario: string, commands: string[]) {
  await page.goto(`/labs/${domain}?scenario=${scenario}&mode=independent`)
  await runTerminal(page, commands)
  await expect(page.locator('main')).toContainText('Сценарий решён')
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

test('Linux permissions scenario completes with diagnosis, repair and service-user verification', async ({ page }) => {
  await runScenario(page, 'linux', 'linux-permission', [
    'systemctl status app-worker', 'stat /srv/app/config.yml', 'chown app:app /srv/app/config.yml', 'chmod 640 /srv/app/config.yml', 'sudo -u app cat /srv/app/config.yml',
  ])
})

test('Linux runaway process completes through SIGTERM rather than SIGKILL', async ({ page }) => {
  await runScenario(page, 'linux', 'linux-runaway-process', [
    'top', 'ps -o pid,ppid,stat,cmd -p 3912', 'kill -TERM 3912', 'ps -p 3912',
  ])
})

test('Linux systemd scenario requires reload and restart', async ({ page }) => {
  await runScenario(page, 'linux', 'linux-systemd', [
    'systemctl status app-worker', 'journalctl -n 30 -u app-worker --no-pager', 'systemctl daemon-reload', 'systemctl restart app-worker', 'systemctl status app-worker',
  ])
})

test('Linux disk full scenario verifies released deleted descriptor', async ({ page }) => {
  await runScenario(page, 'linux', 'linux-disk-full', [
    'df -h /var', 'du -xhd1 /var', 'lsof +L1', 'systemctl restart nginx', 'df -h /var',
  ])
})

test('Linux network bind scenario requires edit, restart and external check', async ({ page }) => {
  await runScenario(page, 'linux', 'linux-network', [
    'curl http://10.4.8.21:8080', 'cat /etc/app/app.env', 'ss -lntp', 'trainer edit /etc/app/app.env BIND_ADDRESS=0.0.0.0', 'systemctl restart app-worker', 'ss -lntp', 'curl http://10.4.8.21:8080',
  ])
})

test('CrashLoopBackOff completes through previous logs, rollback and rollout check', async ({ page }) => {
  await runScenario(page, 'kubernetes', 'kube-crashloop', [
    'kubectl get pods -n production', 'kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production', 'kubectl rollout undo deployment/web -n production', 'kubectl get pods -n production', 'kubectl rollout status deployment/web -n production',
  ])
})

test('ImagePullBackOff completes with a global namespace flag before the verb', async ({ page }) => {
  await runScenario(page, 'kubernetes', 'kube-imagepull', [
    'kubectl -n production get pods', 'kubectl describe pod web-6d7c9f6b7d-2xk9m -n production', 'kubectl --namespace=production set image deployment/web web=registry.local/web:stable', 'kubectl get pods -n production', 'kubectl rollout status deployment/web -n production',
  ])
})

test('OOMKilled completes only after api logs, describe and memory limit repair', async ({ page }) => {
  await runScenario(page, 'kubernetes', 'kube-oomkilled', [
    'kubectl get pods -n production', 'kubectl describe pod api-7d8f -n production', 'kubectl logs api-7d8f --previous -n production', 'kubectl set resources deployment/api -c api --limits=memory=512Mi -n production', 'kubectl get pods -n production',
  ])
})

test('Pending completes with the concrete worker Pod and reduced CPU request', async ({ page }) => {
  await runScenario(page, 'kubernetes', 'kube-pending', [
    'kubectl get pods -n production', 'kubectl describe pod worker-5f6d78cf9-xtfd -n production', 'kubectl set resources deployment/worker -c worker --requests=cpu=200m -n production', 'kubectl get pods worker-5f6d78cf9-xtfd -n production',
  ])
})

test('Service without endpoints completes after readiness rollback and endpoints verification', async ({ page }) => {
  await runScenario(page, 'kubernetes', 'kube-service-endpoints', [
    'kubectl get service web -n production', 'kubectl get endpoints web -n production', 'kubectl describe pod web-6d7c9f6b7d-2xk9m -n production', 'kubectl logs web-6d7c9f6b7d-2xk9m -n production', 'kubectl rollout undo deployment/web -n production', 'kubectl get endpoints web -n production',
  ])
})

test('SIGKILL cannot complete the lab, demands a reset, and a fresh SIGTERM path succeeds', async ({ page }) => {
  await page.goto('/labs/linux?scenario=linux-runaway-process&mode=independent')
  await runTerminal(page, ['top', 'ps -o pid,ppid,stat,cmd -p 3912', 'kill -9 3912', 'ps -p 3912'])
  await expect(page.locator('main')).not.toContainText('Сценарий решён')
  await expect(page.locator('.xterm-rows')).toContainText('Reset the virtual environment')
  await page.getByRole('button', { name: 'Сбросить среду' }).click()
  await runTerminal(page, ['top', 'ps -o pid,ppid,stat,cmd -p 3912', 'kill 3912', 'ps -p 3912'])
  await expect(page.locator('main')).toContainText('Сценарий решён')
})

test('chmod 777 is dangerous and does not independently solve permissions', async ({ page }) => {
  await page.goto('/labs/linux?scenario=linux-permission&mode=independent')
  await runTerminal(page, ['systemctl status app-worker', 'stat /srv/app/config.yml', 'chmod 777 /srv/app/config.yml', 'sudo -u app cat /srv/app/config.yml'])
  await expect(page.locator('main')).not.toContainText('Сценарий решён')
})

test('wrong namespace and wrong Kubernetes object do not change or solve the scenario', async ({ page }) => {
  await page.goto('/labs/kubernetes?scenario=kube-imagepull&mode=independent')
  await runTerminal(page, [
    'kubectl get pods -n production', 'kubectl describe pod web-6d7c9f6b7d-2xk9m -n production', 'kubectl set image deployment/api web=registry.local/web:stable -n production', 'kubectl set image deployment/web web=registry.local/web:stable -n staging',
  ])
  await expect(page.locator('main')).not.toContainText('Сценарий решён')
})

test('a repair before diagnostics does not complete the scenario', async ({ page }) => {
  await page.goto('/labs/linux?scenario=linux-systemd&mode=independent')
  await runTerminal(page, ['systemctl daemon-reload', 'systemctl restart app-worker', 'systemctl status app-worker', 'journalctl -u app-worker'])
  await expect(page.locator('main')).not.toContainText('Сценарий решён')
})

test('the best LabAttempt survives a lower-scoring repeat', async ({ page }) => {
  await page.goto('/labs/linux?scenario=linux-permission&mode=independent')
  const safe = ['systemctl status app-worker', 'stat /srv/app/config.yml', 'chown app:app /srv/app/config.yml', 'chmod 640 /srv/app/config.yml', 'sudo -u app cat /srv/app/config.yml']
  await runTerminal(page, safe)
  await expect(page.locator('main')).toContainText('Сценарий решён')
  await page.getByRole('button', { name: 'Сбросить среду' }).click()
  await runTerminal(page, ['systemctl status app-worker', 'stat /srv/app/config.yml', 'chmod 777 /srv/app/config.yml', 'chown app:app /srv/app/config.yml', 'chmod 640 /srv/app/config.yml', 'sudo -u app cat /srv/app/config.yml'])
  const persisted = await page.evaluate((key) => localStorage.getItem(key), storageKey)
  expect(persisted).toContain('"score":100')
  expect(persisted).toContain('"attempts":2')
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
  expect(persisted).toContain('"labAttempts":{}')
})

test('Mobile menu opens and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible()
  await page.getByRole('link', { name: 'Квиз', exact: true }).last().click()
  await expect(page).toHaveURL(/\/quiz$/)
})
