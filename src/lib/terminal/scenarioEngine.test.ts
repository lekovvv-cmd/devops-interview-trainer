import { describe, expect, it } from 'vitest'
import { scenarios } from '../../data/scenarios'
import { SafeLabSession } from '.'

describe('safe lab session', () => {
  it('accepts Linux diagnostics in a flexible order and resolves the disk scenario', () => {
    const scenario = scenarios.find((item) => item.id === 'linux-disk-full')!
    const session = new SafeLabSession(scenario)
    session.execute('lsof +L1')
    session.execute('du -xhd1 /var')
    session.execute('df -h /var')
    const { score } = session.execute('systemctl restart nginx')

    expect(score.foundCause).toBe(true)
    expect(score.isResolved).toBe(true)
    expect(score.score).toBe(100)
  })

  it('requires evidence before a Kubernetes fix is fully accepted', () => {
    const scenario = scenarios.find((item) => item.id === 'kube-service-endpoints')!
    const session = new SafeLabSession(scenario)
    session.execute('kubectl set image deployment/web web=web:stable -n production')
    expect(session.evaluator.getScore().isResolved).toBe(false)

    session.execute('kubectl get pods -n production')
    session.execute('kubectl describe svc web -n production')
    const score = session.evaluator.getScore()
    expect(score.foundCause).toBe(true)
    expect(score.isResolved).toBe(true)
  })

  it('never delegates an unknown command to an operating system', () => {
    const scenario = scenarios.find((item) => item.id === 'linux-permission')!
    const session = new SafeLabSession(scenario)
    const { result } = session.execute('rm -rf /')
    expect(result.isError).toBe(true)
    expect(result.output).toContain('safe simulator')
  })
})
