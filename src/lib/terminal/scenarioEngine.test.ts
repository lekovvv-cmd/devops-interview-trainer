import { describe, expect, it } from 'vitest'
import { scenarios } from '../../data/scenarios'
import { SafeLabSession } from '.'

function sessionFor(id: string): SafeLabSession {
  const scenario = scenarios.find((item) => item.id === id)
  if (!scenario) throw new Error(`Scenario ${id} is missing`)
  return new SafeLabSession(scenario)
}

function run(session: SafeLabSession, commands: string[]) {
  for (const command of commands) session.execute(command)
  return session.evaluator.getScore()
}

describe('ScenarioEngine', () => {
  it('records an inspectable ordered action journal and requires the full Linux permission path', () => {
    const session = sessionFor('linux-permission')
    const score = run(session, [
      'systemctl status app-worker',
      'stat /srv/app/config.yml',
      'chown app:app /srv/app/config.yml',
      'chmod 640 /srv/app/config.yml',
      'sudo -u app cat /srv/app/config.yml',
    ])
    expect(score.isResolved).toBe(true)
    expect(score.score).toBe(100)
    expect(session.evaluator.getActions()[0]).toMatchObject({ sequence: 1, rawCommand: 'systemctl status app-worker', type: 'symptom', changedState: false })
    expect(session.evaluator.getActions()[2]).toMatchObject({ sequence: 3, object: '/srv/app/config.yml', type: 'change', changedState: true })
  })

  it('does not award a complete score to a fix made before diagnostic proof', () => {
    const session = sessionFor('linux-permission')
    session.execute('chown app:app /srv/app/config.yml')
    session.execute('chmod 640 /srv/app/config.yml')
    session.execute('systemctl status app-worker')
    session.execute('stat /srv/app/config.yml')
    session.execute('sudo -u app cat /srv/app/config.yml')
    const score = session.evaluator.getScore()
    expect(score.isResolved).toBe(false)
    expect(score.score).toBeLessThan(100)
  })

  it('locks the scenario after SIGKILL before SIGTERM and never accepts a later process check', () => {
    const session = sessionFor('linux-runaway-process')
    session.execute('top')
    session.execute('ps -o pid,ppid,stat,cmd -p 3912')
    const unsafeKill = session.execute('kill -9 3912')
    const laterCheck = session.execute('ps -p 3912')
    const score = session.evaluator.getScore()
    expect(score.dangerousActions).toBe(1)
    expect(score.isResolved).toBe(false)
    expect(unsafeKill.result.tags).not.toContain('resolve:process')
    expect(laterCheck.result.isError).toBe(true)
    expect(session.evaluator.getActions()[2]).toMatchObject({ dangerous: true, changedState: true, blocksResolution: true })
  })

  it.each([
    ['linux-runaway-process', ['top', 'ps -o pid,ppid,stat,cmd -p 3912', 'kill -TERM 3912', 'ps -p 3912']],
    ['linux-systemd', ['systemctl status app-worker', 'journalctl -u app-worker -n 30', 'systemctl daemon-reload', 'systemctl restart app-worker', 'systemctl status app-worker']],
    ['linux-disk-full', ['df -h /var', 'du -xhd1 /var', 'lsof +L1', 'systemctl restart nginx', 'df -h /var']],
    ['linux-network', ['curl http://10.4.8.21:8080', 'cat /etc/app/app.env', 'ss -lntp', 'trainer edit /etc/app/app.env BIND_ADDRESS=0.0.0.0', 'systemctl restart app-worker', 'curl http://10.4.8.21:8080']],
    ['kube-crashloop', ['kubectl get pods -n production', 'kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production', 'kubectl rollout undo deployment/web -n production', 'kubectl get pods -n production', 'kubectl rollout status deployment/web -n production']],
    ['kube-imagepull', ['kubectl get pods -n production', 'kubectl describe pod web-6d7c9f6b7d-2xk9m -n production', 'kubectl set image deployment/web web=registry.local/web:stable -n production', 'kubectl get pods -n production', 'kubectl rollout status deployment/web -n production']],
    ['kube-oomkilled', ['kubectl get pods -n production', 'kubectl describe pod api-7d8f -n production', 'kubectl logs api-7d8f --previous -n production', 'kubectl set resources deployment/api -c api --limits=memory=512Mi -n production', 'kubectl get pods -n production']],
    ['kube-pending', ['kubectl get pods -n production', 'kubectl describe pod worker-5f6d78cf9-xtfd -n production', 'kubectl set resources deployment/worker -c worker --requests=cpu=200m -n production', 'kubectl get pods worker-5f6d78cf9-xtfd -n production']],
    ['kube-service-endpoints', ['kubectl get service web -n production', 'kubectl get endpoints web -n production', 'kubectl describe pod web-6d7c9f6b7d-2xk9m -n production', 'kubectl logs web-6d7c9f6b7d-2xk9m -n production', 'kubectl rollout undo deployment/web -n production', 'kubectl get endpoints web -n production']],
  ])('completes the full valid path for %s', (id, commands) => {
    expect(run(sessionFor(id), commands).isResolved).toBe(true)
  })

  it('never delegates an unknown command to an operating system', () => {
    const { result } = sessionFor('linux-permission').execute('rm -rf /')
    expect(result.isError).toBe(true)
    expect(result.output).toContain('safe simulator')
  })
})
