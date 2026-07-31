import { describe, expect, it } from 'vitest'
import { KubernetesSimulator } from './kubernetesSimulator'

describe('KubernetesSimulator', () => {
  it('repairs ImagePullBackOff only with the exact workload, image and namespace', () => {
    const simulator = new KubernetesSimulator('kube-imagepull')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('ImagePullBackOff')
    expect(simulator.execute('kubectl describe pod web-6d7c9f6b7d-2xk9m -n production').output).toContain('registry.local/web:missing')
    expect(simulator.execute('kubectl set image deployment/web web=registry.local/web:stable -n staging').isError).toBe(true)
    expect(simulator.execute('kubectl set image deployment/api web=registry.local/web:stable -n production').isError).toBe(true)
    simulator.execute('kubectl set image deployment/web web=registry.local/web:stable --namespace production')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('Running')
    expect(simulator.execute('kubectl rollout status deployment/web -n production').output).toContain('successfully rolled out')
  })

  it('uses previous CrashLoop logs before a rollback and exposes a healthy rollout afterwards', () => {
    const simulator = new KubernetesSimulator('kube-crashloop')
    expect(simulator.execute('kubectl logs web-6d7c9f6b7d-2xk9m -n production').isError).toBe(true)
    expect(simulator.execute('kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production').output).toContain('address already in use')
    expect(simulator.execute('kubectl delete pod web-6d7c9f6b7d-2xk9m -n production').action?.dangerous).toBe(true)
    simulator.execute('kubectl rollout undo deployment/web -n production')
    expect(simulator.execute('kubectl rollout status deployment/web -n production').output).toContain('successfully rolled out')
  })

  it('requires the API container and a valid memory limit for OOMKilled', () => {
    const simulator = new KubernetesSimulator('kube-oomkilled')
    const describe = simulator.execute('kubectl describe pod api-7d8f -n production').output
    expect(describe).toContain('Reason:       OOMKilled')
    expect(describe).toContain('Exit Code:    137')
    expect(simulator.execute('kubectl set resources deployment/api -c web --limits=memory=512Mi -n production').isError).toBe(true)
    simulator.execute('kubectl set resources deployment/api -c api --limits=memory=512Mi -n production')
    expect(simulator.execute('kubectl get pods -n production').output).toContain('1/1')
  })

  it('describes only the concrete Pending worker and schedules it after requests are reduced', () => {
    const simulator = new KubernetesSimulator('kube-pending')
    expect(simulator.execute('kubectl describe pod web -n production').isError).toBe(true)
    const describe = simulator.execute('kubectl describe po worker-5f6d78cf9-xtfd --namespace production').output
    expect(describe).toContain('Insufficient cpu')
    expect(describe).toContain('cpu: 1000m')
    expect(simulator.execute('kubectl set resources deployment/worker -c worker --requests=cpu=500m -n production').isError).toBe(true)
    simulator.execute('kubectl set resources deployment/worker --requests=cpu=200m -c worker -n production')
    expect(simulator.execute('kubectl get pods worker-5f6d78cf9-xtfd -n production').output).toContain('Running')
  })

  it('models matching Service labels with readiness as the only endpoint cause', () => {
    const simulator = new KubernetesSimulator('kube-service-endpoints')
    expect(simulator.execute('kubectl describe service web -n production').output).toContain('Selector:                 app=web')
    expect(simulator.execute('kubectl get endpoints web -n production').output).toContain('<none>')
    expect(simulator.execute('kubectl describe pod web-6d7c9f6b7d-2xk9m -n production').output).toContain('Readiness probe failed')
    expect(simulator.execute('kubectl set image deployment/web web=registry.local/web:stable -n production').isError).toBe(true)
    simulator.execute('kubectl rollout undo deployment/web -n production')
    expect(simulator.execute('kubectl get endpoints web -n production').output).toContain('10.42.0.18:8080')
  })
})
