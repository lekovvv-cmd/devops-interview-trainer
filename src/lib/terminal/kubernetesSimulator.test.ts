import { describe, expect, it } from 'vitest'
import { KubernetesSimulator } from './kubernetesSimulator'

describe('KubernetesSimulator scenario state', () => {
  it('repairs ImagePullBackOff only with the concrete workload, container image and namespace', () => {
    const simulator = new KubernetesSimulator('kube-imagepull')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('ImagePullBackOff')
    const before = simulator.execute('kubectl describe pod web-6d7c9f6b7d-2xk9m -n production').output
    expect(before).toContain('Status:         Pending')
    expect(before).toContain('Reason:       ImagePullBackOff')
    expect(before).toContain('registry.local/web:missing')
    for (const command of [
      'kubectl set image deployment/api web=registry.local/web:stable -n production',
      'kubectl set image deployment/web api=registry.local/web:stable -n production',
      'kubectl set image deployment/web web=wrong-image -n production',
      'kubectl set image deployment/web web=registry.local/web:stable -n staging',
    ]) expect(simulator.execute(command).isError).toBe(true)
    simulator.execute('kubectl --namespace=production set image deployment/web web=registry.local/web:stable')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('1/1       Running')
    expect(simulator.execute('kubectl describe pod web-6d7c9f6b7d-2xk9m -n production').output).toContain('registry.local/web:stable')
    expect(simulator.execute('kubectl rollout status deployment/web -n production').output).toContain('successfully rolled out')
    expect(simulator.execute('kubectl get deployment web -n production').output).toContain('1/1')
  })

  it('uses previous CrashLoop logs before rollback and keeps rollout state aligned with its only pod', () => {
    const simulator = new KubernetesSimulator('kube-crashloop')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('CrashLoopBackOff')
    expect(simulator.execute('kubectl logs web-6d7c9f6b7d-2xk9m -n production').isError).toBe(true)
    expect(simulator.execute('kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production').output).toBe('listen tcp :8080: bind: address already in use')
    expect(simulator.execute('kubectl delete pod web-6d7c9f6b7d-2xk9m -n production').action?.dangerous).toBe(true)
    simulator.execute('kubectl rollout undo deployment/web -n production')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('1/1       Running')
    expect(simulator.execute('kubectl get deployment web -n production').output).toContain('1/1')
    expect(simulator.execute('kubectl rollout status deployment/web -n production').output).toContain('successfully rolled out')
  })

  it('shows OOMKilled last state and accepts only api memory limit 512Mi', () => {
    const simulator = new KubernetesSimulator('kube-oomkilled')
    const describe = simulator.execute('kubectl describe pod api-7d8f -n production').output
    expect(describe).toContain('Status:         Running')
    expect(describe).toContain('Reason:       OOMKilled')
    expect(describe).toContain('Exit Code:    137')
    expect(describe).toContain('memory: 128Mi')
    expect(simulator.execute('kubectl logs api-7d8f --previous -n production').tags).toContain('diag:logs')
    for (const command of [
      'kubectl set resources deployment/worker -c api --limits=memory=512Mi -n production',
      'kubectl set resources deployment/api -c web --limits=memory=512Mi -n production',
      'kubectl set resources deployment/api -c api --limits=memory=128Mi -n production',
      'kubectl set resources deployment/api -c api --requests=cpu=200m -n production',
    ]) expect(simulator.execute(command).isError).toBe(true)
    simulator.execute('kubectl -n production set resources deployment/api --limits=memory=512Mi -c api')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('1/1       Running')
    expect(simulator.execute('kubectl describe pod api-7d8f -n production').output).not.toContain('OOMKilled')
  })

  it('describes the concrete Pending worker consistently before and after the request repair', () => {
    const simulator = new KubernetesSimulator('kube-pending')
    expect(simulator.execute('kubectl describe pod web -n production').isError).toBe(true)
    const before = simulator.execute('kubectl describe po worker-5f6d78cf9-xtfd --namespace production').output
    expect(before).toContain('Status:         Pending')
    expect(before).toContain('Node:           <none>')
    expect(before).toContain('PodScheduled   False')
    expect(before).toContain('Reason:       Unschedulable')
    expect(before).toContain('cpu: 1000m')
    expect(simulator.execute('kubectl set resources deployment/worker -c worker --requests=cpu=500m -n production').isError).toBe(true)
    simulator.execute('kubectl set resources deployment/worker --requests=cpu=200m -c worker -n production')
    const after = simulator.execute('kubectl describe pod worker-5f6d78cf9-xtfd -n production').output
    expect(after).toContain('Status:         Running')
    expect(after).toContain('Node:           worker-node-1')
    expect(after).toContain('PodScheduled   True')
    expect(after).toContain('Ready:          true')
    expect(after).toContain('cpu: 200m')
  })

  it('models readiness, not selector mismatch, as the sole Service endpoint cause', () => {
    const simulator = new KubernetesSimulator('kube-service-endpoints')
    expect(simulator.execute('kubectl describe service web -n production').output).toContain('Selector:                 app=web')
    expect(simulator.execute('kubectl get endpoints web -n production').output).toContain('<none>')
    expect(simulator.execute('kubectl describe pod web-6d7c9f6b7d-2xk9m -n production').output).toContain('Readiness probe failed')
    expect(simulator.execute('kubectl logs web-6d7c9f6b7d-2xk9m -n production').output).toContain('/ready -> 500')
    simulator.execute('kubectl rollout undo deployment/web -n production')
    const endpoints = simulator.execute('kubectl get endpoints web -n production').output
    expect(endpoints).toContain('10.42.0.18:8080')
    expect(endpoints.match(/10\.42\.0\.18:8080/g)).toHaveLength(1)
    expect(simulator.execute('kubectl get deployment web -n production').output).toContain('1/1')
  })
})

describe('KubernetesSimulator command validation', () => {
  it.each([
    ['kube-imagepull', 'kubectl describe pod unknown -n production'],
    ['kube-crashloop', 'kubectl logs unknown -n production'],
    ['kube-oomkilled', 'kubectl rollout status deployment/web -n production'],
    ['kube-pending', 'kubectl rollout history deployment/api -n production'],
    ['kube-service-endpoints', 'kubectl get service unknown -n production'],
    ['kube-service-endpoints', 'kubectl get endpoints unknown -n production'],
    ['kube-pending', 'kubectl get pods -n staging'],
  ])('returns an error without a tag or exception for %s: %s', (scenario, command) => {
    const simulator = new KubernetesSimulator(scenario)
    const result = simulator.execute(command)
    expect(result.isError).toBe(true)
    expect(result.tags).toEqual([])
    expect(result.output).toMatch(/NotFound|namespaces/)
  })

  it.each([
    'kubectl get pods -n production',
    'kubectl get -n production pods',
    'kubectl -n production get pods',
    'kubectl --namespace production get pods',
    'kubectl --namespace=production get pods',
  ])('accepts global namespace form: %s', (command) => {
    const result = new KubernetesSimulator('kube-imagepull').execute(command)
    expect(result.isError).not.toBe(true)
    expect(result.output).toContain('ImagePullBackOff')
  })
})
