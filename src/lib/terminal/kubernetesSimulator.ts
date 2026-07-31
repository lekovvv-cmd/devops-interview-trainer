import { parseCommand } from './commandParser'
import type { CommandResult } from '../../types/domain'

export class KubernetesSimulator {
  private imageFixed = false
  private replicas = 3

  constructor(private readonly scenarioId: string) {}

  execute(input: string): CommandResult {
    const parsed = parseCommand(input)
    const raw = parsed.raw.toLowerCase()
    if (parsed.command !== 'kubectl') return { output: `${parsed.command}: command not found in the Kubernetes simulator`, tags: [], isError: true }
    if (parsed.args[0] === 'get') return this.get(raw)
    if (parsed.args[0] === 'describe') return this.describe(raw)
    if (parsed.args[0] === 'logs') return this.logs(raw)
    if (parsed.args[0] === 'scale') return this.scale(raw)
    if (parsed.args[0] === 'delete') return this.delete(raw)
    if (parsed.args[0] === 'set' && parsed.args[1] === 'image') return this.setImage(raw)
    if (parsed.args[0] === 'set' && parsed.args[1] === 'resources') return this.setResources(raw)
    if (parsed.args[0] === 'rollout') return this.rollout(raw)
    return { output: `kubectl: command '${parsed.args.join(' ')}' is not available in the safe simulator`, tags: [], isError: true }
  }

  private get(raw: string): CommandResult {
    if (raw.includes('endpoints')) {
      const empty = this.scenarioId === 'kube-service-endpoints' && !this.imageFixed
      return { output: `NAME   ENDPOINTS   AGE\nweb    ${empty ? '<none>' : '10.42.0.18:8080,10.42.0.19:8080'}   18m`, tags: ['diag:endpoints'] }
    }
    if (raw.includes('pods') || raw.includes('pod ')) {
      const state = this.podState()
      return { output: `NAME                     READY   STATUS             RESTARTS   AGE\nweb-6d7c9f6b7d-2xk9m   ${state.ready}       ${state.status}   ${state.restarts}          18m\nweb-6d7c9f6b7d-bnnz4   ${state.ready}       ${state.status}   ${state.restarts}          18m\nworker-5f6d78cf9-xtfd ${this.scenarioId === 'kube-pending' ? '0/1' : '1/1'}       ${this.scenarioId === 'kube-pending' ? 'Pending' : 'Running'}            0          7m`, tags: ['diag:pods'] }
    }
    if (raw.includes('svc') || raw.includes('service')) return { output: 'NAME   TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE\nweb    ClusterIP   10.96.120.45   <none>        80/TCP    18m', tags: ['diag:service'] }
    if (raw.includes('deploy')) return { output: `NAME     READY   UP-TO-DATE   AVAILABLE   AGE\nweb      ${this.imageFixed ? '3/3' : '0/3'}     3            ${this.imageFixed ? '3' : '0'}           18m\nworker   ${this.scenarioId === 'kube-pending' ? '2/3' : '3/3'}     3            2           7m`, tags: ['diag:deployment'] }
    return { output: 'NAME          DATA   AGE\nweb-config    2      18m\napp-secret    1      18m', tags: ['diag:resources'] }
  }

  private describe(raw: string): CommandResult {
    if (raw.includes('svc') || raw.includes('service')) {
      const endpoints = this.scenarioId === 'kube-service-endpoints' && !this.imageFixed ? '<none>' : '10.42.0.18:8080,10.42.0.19:8080'
      return { output: `Name:                     web\nNamespace:                production\nSelector:                 app=web\nType:                     ClusterIP\nIP:                       10.96.120.45\nPort:                     http  80/TCP\nTargetPort:               8080/TCP\nEndpoints:                ${endpoints}\nEvents:                   <none>`, tags: ['diag:service', 'diag:endpoints'] }
    }
    if (raw.includes('pod')) {
      const pending = this.scenarioId === 'kube-pending' && !this.imageFixed
      const oom = this.scenarioId === 'kube-oomkilled' && !this.imageFixed
      const reason = this.scenarioId === 'kube-imagepull' && !this.imageFixed ? 'Failed to pull image "registry.local/web:missing": not found' : pending ? '0/3 nodes are available: 3 Insufficient cpu.' : oom ? 'Container web was terminated by the kernel: OOMKilled' : 'Back-off restarting failed container web'
      const state = oom ? '\n    Limits:     memory: 128Mi\n    Last State: Terminated\n      Reason:   OOMKilled\n      Exit Code: 137' : ''
      return { output: `Name:         web-6d7c9f6b7d-2xk9m\nNamespace:    production\nLabels:       app=web\nStatus:       ${pending ? 'Pending' : 'Running'}\nContainers:\n  web:\n    Image:      registry.local/web:${this.imageFixed ? 'stable' : 'broken'}\n    Requests:   cpu: 500m, memory: 256Mi${state}\nEvents:\n  Warning  Failed  30s  kubelet  ${reason}`, tags: ['diag:pod-describe'] }
    }
    return { output: 'Name: web\nReplicas: 3 desired | 3 updated | 0 available\nStrategyType: RollingUpdate', tags: ['diag:deployment'] }
  }

  private logs(raw: string): CommandResult {
    if (this.scenarioId === 'kube-imagepull' && !this.imageFixed) return { output: 'Error from server (BadRequest): container "web" in pod "web-..." is waiting to start: image pull failed', tags: ['diag:image'] }
    if (this.scenarioId === 'kube-oomkilled' && !this.imageFixed) return { output: 'INFO processing batch\nINFO allocating cache\nKilled', tags: ['diag:logs'] }
    if ((this.scenarioId === 'kube-crashloop' || this.scenarioId === 'kube-service-endpoints') && !this.imageFixed) return { output: raw.includes('--previous') ? 'FATAL: cannot load configuration: APP_PORT must be 8080\nprocess exited with code 1' : 'Error: listen tcp :8080: bind: address already in use\nprocess exited with code 1', tags: ['diag:logs'] }
    return { output: 'INFO server started on :8080\nINFO readiness probe returned 200\nINFO listening for requests', tags: ['diag:logs'] }
  }

  private scale(raw: string): CommandResult {
    if (!raw.includes('deployment')) return { output: 'error: only deployments can be scaled in this simulator', tags: [], isError: true }
    const match = raw.match(/--replicas[=\s]+(\d+)/)
    this.replicas = Number(match?.[1] ?? 3)
    if (this.scenarioId === 'kube-pending' && this.replicas <= 2) {
      this.imageFixed = true
      return { output: 'deployment.apps/worker scaled', tags: ['resolve:pending'] }
    }
    return { output: `deployment.apps/worker scaled to ${this.replicas}`, tags: [] }
  }

  private delete(raw: string): CommandResult {
    if (this.scenarioId === 'kube-pending' && raw.includes('pod')) {
      this.imageFixed = true
      return { output: 'pod "analytics-batch" deleted', tags: ['resolve:pending'] }
    }
    return { output: 'pod "web-6d7c9f6b7d-2xk9m" deleted\nA new replica will be created by the Deployment.', tags: [] }
  }

  private setImage(raw: string): CommandResult {
    if (!raw.includes('deployment')) return { output: 'error: image can be set only for a Deployment in this simulator', tags: [], isError: true }
    this.imageFixed = true
    const tags = this.scenarioId === 'kube-imagepull' ? ['resolve:image'] : this.scenarioId === 'kube-pending' ? [] : ['resolve:workload']
    return { output: 'deployment.apps/web image updated\nWaiting for the rollout to finish...', tags }
  }

  private setResources(raw: string): CommandResult {
    if (!raw.includes('deployment')) return { output: 'error: resources can be changed only for a Deployment in this simulator', tags: [], isError: true }
    this.imageFixed = true
    return { output: 'deployment.apps/web resources updated\nWaiting for the rollout to finish...', tags: this.scenarioId === 'kube-oomkilled' ? ['resolve:resources'] : [] }
  }

  private rollout(raw: string): CommandResult {
    if (raw.includes('undo')) {
      this.imageFixed = true
      return { output: 'deployment.apps/web rolled back', tags: this.scenarioId === 'kube-imagepull' ? ['resolve:image'] : this.scenarioId === 'kube-pending' ? [] : ['resolve:workload'] }
    }
    if (raw.includes('status')) return { output: this.imageFixed ? 'deployment "web" successfully rolled out' : 'Waiting for deployment "web" rollout to finish: 0 of 3 updated replicas are available...', tags: ['diag:rollout'] }
    if (raw.includes('history')) return { output: 'REVISION  CHANGE-CAUSE\n1         web:stable\n2         web:broken', tags: ['diag:rollout'] }
    return { output: 'kubectl rollout: supported commands are status, history, undo', tags: [], isError: true }
  }

  private podState(): { ready: string; status: string; restarts: string } {
    if (this.imageFixed) return { ready: '1/1', status: 'Running', restarts: '0' }
    if (this.scenarioId === 'kube-imagepull') return { ready: '0/1', status: 'ImagePullBackOff', restarts: '0' }
    if (this.scenarioId === 'kube-pending') return { ready: '0/1', status: 'Pending', restarts: '0' }
    return { ready: '0/1', status: 'CrashLoopBackOff', restarts: '5 (1m ago)' }
  }
}
