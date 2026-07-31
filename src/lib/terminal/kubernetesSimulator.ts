import { extractKubectlNamespace, parseCommand } from './commandParser'
import type { CommandResult, ScenarioAction, ScenarioActionType } from '../../types/domain'

type PodPhase = 'Pending' | 'Running'
type ContainerWaitingReason = 'ImagePullBackOff' | 'CrashLoopBackOff' | 'Unschedulable' | 'ReadinessProbeFailed'
type ContainerState = {
  name: string
  image: string
  ready: boolean
  restartCount: number
  state: 'Waiting' | 'Running'
  waitingReason?: ContainerWaitingReason
  lastReason?: 'OOMKilled'
  exitCode?: number
  memoryLimit?: string
  cpuRequest?: string
}
type VirtualPod = { name: string; namespace: string; deployment: string; phase: PodPhase; node?: string; ip?: string; labels: Record<string, string>; container: ContainerState }
type VirtualDeployment = { name: string; namespace: string; container: string; image: string; revision: number; desiredReplicas: number; readyReplicas: number; cpuRequest?: string; memoryLimit?: string }
type VirtualService = { name: string; namespace: string; selector: Record<string, string>; port: number; targetPort: number }
type VirtualCluster = { pods: Map<string, VirtualPod>; deployments: Map<string, VirtualDeployment>; services: Map<string, VirtualService>; endpoints: Map<string, string[]> }
type KubectlRequest = { args: string[]; namespace: string; verb: string }

const aliases: Record<string, string> = {
  po: 'pod', pods: 'pod', pod: 'pod',
  deploy: 'deployment', deployments: 'deployment', deployment: 'deployment',
  svc: 'service', services: 'service', service: 'service',
  ep: 'endpoints', endpoints: 'endpoints',
}

/** A typed virtual Kubernetes API for exactly the learning scenarios, never a real cluster. */
export class KubernetesSimulator {
  private readonly cluster: VirtualCluster

  constructor(private readonly scenarioId: string) {
    this.cluster = createCluster(scenarioId)
    this.syncWorkloadState()
  }

  execute(input: string): CommandResult {
    const parsed = parseCommand(input)
    if (parsed.command !== 'kubectl') return this.error(`${parsed.command}: command not found in the Kubernetes simulator`, 'unknown')
    const extracted = extractKubectlNamespace(parsed.args)
    const namespace = extracted.namespace ?? 'production'
    if (namespace !== 'production') return this.error(`Error from server (NotFound): namespaces "${namespace}" not found`, 'diagnostic')
    const [verbRaw = '', ...rest] = extracted.args
    const request: KubectlRequest = { args: [verbRaw, ...rest], namespace, verb: verbRaw.toLowerCase() }
    if (!request.verb) return this.error('kubectl: a command is required', 'unknown')
    try {
      if (request.verb === 'get') return this.get(request)
      if (request.verb === 'describe') return this.describe(request)
      if (request.verb === 'logs') return this.logs(request)
      if (request.verb === 'set' && request.args[1]?.toLowerCase() === 'image') return this.setImage(request)
      if (request.verb === 'set' && request.args[1]?.toLowerCase() === 'resources') return this.setResources(request)
      if (request.verb === 'rollout') return this.rollout(request)
      if (request.verb === 'delete') return this.delete(request)
      return this.error(`kubectl: command '${request.args.join(' ')}' is not available in the safe simulator`, 'unknown')
    } catch {
      return this.error('kubectl: invalid command for the safe simulator', 'unknown')
    }
  }

  private get(request: KubectlRequest): CommandResult {
    const target = readResourceName(request.args, 1)
    if (!target.resource) return this.error('error: a resource type is required', 'unknown')
    if (target.resource === 'pod') {
      if (target.name && !this.cluster.pods.has(target.name)) return this.notFound('pod', target.name)
      const pods = target.name ? [this.cluster.pods.get(target.name)!] : [...this.cluster.pods.values()]
      const relevant = pods.some((pod) => this.isScenarioPod(pod))
      const healthy = relevant && pods.every((pod) => pod.phase === 'Running' && pod.container.ready)
      const tags = this.scenarioUsesPodSymptom() && relevant ? [healthy ? 'verify:pods' : 'symptom:pods'] : []
      return this.result(`NAME                         READY   STATUS             RESTARTS   AGE\n${pods.map(formatPod).join('\n')}`, tags, healthy && tags.length ? 'verification' : tags.length ? 'symptom' : 'diagnostic', target.name ?? 'pods')
    }
    if (target.resource === 'deployment') {
      if (target.name && !this.cluster.deployments.has(target.name)) return this.notFound('deployment', target.name)
      const deployments = target.name ? [this.cluster.deployments.get(target.name)!] : [...this.cluster.deployments.values()]
      return this.result(`NAME     READY   UP-TO-DATE   AVAILABLE   AGE\n${deployments.map((deployment) => `${deployment.name.padEnd(8)} ${`${deployment.readyReplicas}/${deployment.desiredReplicas}`.padEnd(7)} ${deployment.desiredReplicas.toString().padEnd(12)} ${deployment.readyReplicas}           18m`).join('\n')}`, [], 'diagnostic', target.name ?? 'deployments')
    }
    if (target.resource === 'service') {
      if (target.name && !this.cluster.services.has(target.name)) return this.notFound('service', target.name)
      const services = target.name ? [this.cluster.services.get(target.name)!] : [...this.cluster.services.values()]
      if (!services.length) return this.error('No resources found in production namespace.', 'diagnostic')
      const tags = this.scenarioId === 'kube-service-endpoints' && services.some((service) => service.name === 'web') ? ['symptom:service'] : []
      return this.result(`NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE\n${services.map((service) => `${service.name}    ClusterIP   10.96.120.45   <none>        ${service.port}/TCP    18m`).join('\n')}`, tags, tags.length ? 'symptom' : 'diagnostic', target.name ?? 'services')
    }
    if (target.resource === 'endpoints') {
      if (!target.name || !this.cluster.services.has(target.name)) return this.notFound('endpoints', target.name ?? '')
      const addresses = this.cluster.endpoints.get(target.name) ?? []
      const tags = this.scenarioId === 'kube-service-endpoints' && target.name === 'web' ? [addresses.length ? 'verify:endpoints' : 'symptom:endpoints'] : []
      return this.result(`NAME   ENDPOINTS                                  AGE\n${target.name}    ${addresses.length ? addresses.join(',') : '<none>'}   18m`, tags, addresses.length && tags.length ? 'verification' : tags.length ? 'symptom' : 'diagnostic', target.name)
    }
    return this.error(`error: the server doesn't have a resource type "${request.args[1] ?? ''}"`, 'unknown')
  }

  private describe(request: KubectlRequest): CommandResult {
    const target = readResourceName(request.args, 1)
    if (target.resource === 'pod') {
      if (!target.name || !this.cluster.pods.has(target.name)) return this.notFound('pod', target.name ?? '')
      const pod = this.cluster.pods.get(target.name)!
      const tags = this.diagnosticTagsForPod(pod)
      return this.result(describePod(pod), tags, tags.length ? 'diagnostic' : 'diagnostic', pod.name)
    }
    if (target.resource === 'service') {
      if (!target.name || !this.cluster.services.has(target.name)) return this.notFound('service', target.name ?? '')
      const service = this.cluster.services.get(target.name)!
      const endpoints = this.cluster.endpoints.get(service.name) ?? []
      const tags = this.scenarioId === 'kube-service-endpoints' && service.name === 'web' ? ['symptom:service'] : []
      return this.result(`Name:                     ${service.name}\nNamespace:                ${service.namespace}\nSelector:                 ${Object.entries(service.selector).map(([key, value]) => `${key}=${value}`).join(',')}\nType:                     ClusterIP\nPort:                     http  ${service.port}/TCP\nTargetPort:               ${service.targetPort}/TCP\nEndpoints:                ${endpoints.length ? endpoints.join(',') : '<none>'}`, tags, tags.length ? 'symptom' : 'diagnostic', service.name)
    }
    return this.error('error: describe supports pod and service in this simulator', 'unknown')
  }

  private logs(request: KubectlRequest): CommandResult {
    const podName = firstPositional(request.args, 1)
    if (!podName || !this.cluster.pods.has(podName)) return this.notFound('pod', podName ?? '')
    const pod = this.cluster.pods.get(podName)!
    const requestedContainer = readFlagValue(request.args, ['-c', '--container', '--containers'])
    if (requestedContainer && requestedContainer !== pod.container.name) return this.error(`Error from server (BadRequest): container "${requestedContainer}" is not valid for pod "${podName}"`, 'diagnostic')
    const previous = request.args.some((item) => item.toLowerCase() === '--previous')
    if (this.scenarioId === 'kube-crashloop' && pod.name === 'web-6d7c9f6b7d-2xk9m') {
      if (!previous) return this.error(`Error from server (BadRequest): container "web" in pod "${podName}" is waiting to start: CrashLoopBackOff`, 'diagnostic')
      return this.result('listen tcp :8080: bind: address already in use', ['diag:logs'], 'diagnostic', podName)
    }
    if (this.scenarioId === 'kube-oomkilled' && pod.name === 'api-7d8f') {
      if (!previous) return this.error('Error from server (BadRequest): previous terminated container "api" is required; use --previous', 'diagnostic')
      return this.result('INFO processing batch\nINFO allocating cache\nKilled', ['diag:logs'], 'diagnostic', podName)
    }
    if (this.scenarioId === 'kube-service-endpoints' && pod.name === 'web-6d7c9f6b7d-2xk9m') {
      const output = pod.container.ready ? 'INFO /ready 200\nINFO serving traffic' : 'ERROR readiness dependency unavailable\nGET /ready -> 500'
      return this.result(output, ['diag:logs'], 'diagnostic', podName)
    }
    return this.error(`Error from server (BadRequest): logs are not diagnostic for pod "${podName}" in this scenario`, 'diagnostic')
  }

  private setImage(request: KubectlRequest): CommandResult {
    const target = readResourceName(request.args, 2)
    const assignments = request.args.filter((item) => item.includes('='))
    const valid = this.scenarioId === 'kube-imagepull'
      && target.resource === 'deployment'
      && target.name === 'web'
      && this.cluster.deployments.has('web')
      && assignments.length === 1
      && assignments[0].toLowerCase() === 'web=registry.local/web:stable'
      && request.args.filter((item) => !item.startsWith('-')).length === 4
    if (!valid) return this.error('error: expected kubectl set image deployment/web web=registry.local/web:stable -n production', 'change')
    const deployment = this.cluster.deployments.get('web')!
    const pod = podForDeployment(this.cluster, 'web')!
    deployment.image = 'registry.local/web:stable'
    deployment.revision = 1
    pod.phase = 'Running'
    pod.node = 'worker-node-1'
    pod.ip = '10.42.0.18'
    pod.container = { ...pod.container, image: deployment.image, ready: true, restartCount: 0, state: 'Running', waitingReason: undefined, lastReason: undefined, exitCode: undefined }
    this.syncWorkloadState()
    return this.result('deployment.apps/web image updated\nWaiting for rollout...', ['resolve:image'], 'change', 'deployment/web', false, true, false, false, true)
  }

  private setResources(request: KubectlRequest): CommandResult {
    const target = readResourceName(request.args, 2)
    const container = readFlagValue(request.args, ['-c', '--container', '--containers'])
    const limit = readEqualsFlag(request.args, '--limits')
    const requestValue = readEqualsFlag(request.args, '--requests')
    const plain = request.args.filter((item) => !item.startsWith('-') && !item.includes('='))
    if (this.scenarioId === 'kube-oomkilled') {
      const valid = target.resource === 'deployment' && target.name === 'api' && this.cluster.deployments.has('api') && container === 'api' && limit?.toLowerCase() === 'memory=512mi' && !requestValue && plain.length === 4
      if (!valid) return this.error('error: expected kubectl set resources deployment/api -c api --limits=memory=512Mi -n production', 'change')
      const deployment = this.cluster.deployments.get('api')!
      const pod = podForDeployment(this.cluster, 'api')!
      deployment.memoryLimit = '512Mi'
      pod.container = { ...pod.container, memoryLimit: '512Mi', ready: true, restartCount: 0, state: 'Running', waitingReason: undefined, lastReason: undefined, exitCode: undefined }
      this.syncWorkloadState()
      return this.result('deployment.apps/api resources updated', ['resolve:resources'], 'change', 'deployment/api', false, true, false, false, true)
    }
    if (this.scenarioId === 'kube-pending') {
      const valid = target.resource === 'deployment' && target.name === 'worker' && this.cluster.deployments.has('worker') && container === 'worker' && requestValue?.toLowerCase() === 'cpu=200m' && !limit && plain.length === 4
      if (!valid) return this.error('error: expected kubectl set resources deployment/worker -c worker --requests=cpu=200m -n production', 'change')
      const deployment = this.cluster.deployments.get('worker')!
      const pod = podForDeployment(this.cluster, 'worker')!
      deployment.cpuRequest = '200m'
      pod.phase = 'Running'
      pod.node = 'worker-node-1'
      pod.ip = '10.42.0.20'
      pod.container = { ...pod.container, cpuRequest: '200m', ready: true, state: 'Running', waitingReason: undefined }
      this.syncWorkloadState()
      return this.result('deployment.apps/worker resources updated', ['resolve:pending'], 'change', 'deployment/worker', false, true, false, false, true)
    }
    return this.error('error: resource change does not match this scenario', 'change')
  }

  private rollout(request: KubectlRequest): CommandResult {
    const operation = request.args[1]?.toLowerCase()
    const target = readResourceName(request.args, 2)
    if (target.resource !== 'deployment' || !target.name) return this.error('error: expected a named deployment resource', 'change')
    const deployment = this.cluster.deployments.get(target.name)
    if (!deployment) return this.notFound('deployment', target.name)
    if (operation === 'history') return this.result(`REVISION  CHANGE-CAUSE\n1         ${deployment.name}:stable\n${deployment.revision}         broken release`, [], 'diagnostic', `deployment/${deployment.name}`)
    if (operation === 'status') {
      const healthy = deployment.readyReplicas === deployment.desiredReplicas
      const verification = healthy && this.isVerificationDeployment(deployment.name)
      return this.result(healthy ? `deployment "${deployment.name}" successfully rolled out` : `Waiting for deployment "${deployment.name}" rollout to finish: 0 of ${deployment.desiredReplicas} updated replicas are available...`, verification ? ['verify:rollout'] : [], verification ? 'verification' : 'diagnostic', `deployment/${deployment.name}`)
    }
    if (operation === 'undo' && target.name === 'web' && (this.scenarioId === 'kube-crashloop' || this.scenarioId === 'kube-service-endpoints')) {
      const pod = podForDeployment(this.cluster, 'web')!
      deployment.revision = 1
      deployment.image = 'registry.local/web:stable'
      pod.phase = 'Running'
      pod.node = 'worker-node-1'
      pod.ip = '10.42.0.18'
      pod.container = { ...pod.container, image: deployment.image, ready: true, restartCount: 0, state: 'Running', waitingReason: undefined, lastReason: undefined, exitCode: undefined }
      this.syncWorkloadState()
      return this.result('deployment.apps/web rolled back to revision 1', ['resolve:workload'], 'change', 'deployment/web', false, true, false, false, true)
    }
    return this.error(`error: rollout ${operation ?? ''} is not a valid fix for this scenario`, 'change')
  }

  private delete(request: KubectlRequest): CommandResult {
    const target = readResourceName(request.args, 1)
    if (target.resource !== 'pod' || !target.name) return this.error('error: only explicit Pod deletion is modelled as a blocked dangerous action', 'dangerous')
    if (!this.cluster.pods.has(target.name)) return this.notFound('pod', target.name)
    return this.result(`pod "${target.name}" was not deleted: deleting a Pod does not repair its workload`, ['danger:delete-pod'], 'dangerous', target.name, true, false, true, false, false)
  }

  /** Recomputes all derived status fields from the actual Pod objects. */
  private syncWorkloadState(): void {
    for (const deployment of this.cluster.deployments.values()) {
      deployment.readyReplicas = [...this.cluster.pods.values()].filter((pod) => pod.namespace === deployment.namespace && pod.deployment === deployment.name && pod.phase === 'Running' && pod.container.ready).length
    }
    for (const service of this.cluster.services.values()) {
      const addresses = [...this.cluster.pods.values()]
        .filter((pod) => pod.namespace === service.namespace && pod.phase === 'Running' && pod.container.ready && Boolean(pod.ip) && Object.entries(service.selector).every(([key, value]) => pod.labels[key] === value))
        .map((pod) => `${pod.ip}:${service.targetPort}`)
      this.cluster.endpoints.set(service.name, addresses)
    }
  }

  private isScenarioPod(pod: VirtualPod): boolean {
    const expected = this.scenarioId === 'kube-oomkilled' ? 'api' : this.scenarioId === 'kube-pending' ? 'worker' : 'web'
    return pod.deployment === expected
  }

  private scenarioUsesPodSymptom(): boolean { return ['kube-crashloop', 'kube-imagepull', 'kube-oomkilled', 'kube-pending'].includes(this.scenarioId) }
  private isVerificationDeployment(name: string): boolean {
    return (this.scenarioId === 'kube-imagepull' || this.scenarioId === 'kube-crashloop') && name === 'web'
  }
  private diagnosticTagsForPod(pod: VirtualPod): string[] {
    if (this.scenarioId === 'kube-pending' && pod.name === 'worker-5f6d78cf9-xtfd') return ['diag:pod-describe']
    if (this.scenarioId === 'kube-imagepull' && pod.name === 'web-6d7c9f6b7d-2xk9m') return ['diag:pod-describe']
    if (this.scenarioId === 'kube-oomkilled' && pod.name === 'api-7d8f') return ['diag:pod-describe']
    if (this.scenarioId === 'kube-service-endpoints' && pod.name === 'web-6d7c9f6b7d-2xk9m') return ['diag:pod-describe']
    return []
  }

  private notFound(resource: string, name: string): CommandResult {
    const kind = resource === 'deployment' ? 'deployments.apps' : `${resource}s`
    return this.error(`Error from server (NotFound): ${kind} "${name}" not found`, 'diagnostic')
  }
  private result(output: string, tags: string[], type: ScenarioActionType, object?: string, isError = false, meaningful = true, dangerous = false, blocksResolution = false, changedState = type === 'change'): CommandResult {
    const action: ScenarioAction = { type, object, diagnosticTags: tags, changedState, dangerous, blocksResolution, meaningful }
    return { output, tags, action, isError }
  }
  private error(output: string, type: ScenarioActionType): CommandResult { return this.result(output, [], type, undefined, true, false, false, false, false) }
}

function createCluster(scenarioId: string): VirtualCluster {
  const pods = new Map<string, VirtualPod>()
  const deployments = new Map<string, VirtualDeployment>()
  const services = new Map<string, VirtualService>()
  const endpoints = new Map<string, string[]>()
  const add = (deployment: VirtualDeployment, pod: VirtualPod) => { deployments.set(deployment.name, deployment); pods.set(pod.name, pod) }
  const webContainer = (state: Partial<ContainerState> = {}): ContainerState => ({ name: 'web', image: 'registry.local/web:stable', ready: true, restartCount: 0, state: 'Running', ...state })

  if (scenarioId === 'kube-imagepull') {
    add({ name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:missing', revision: 2, desiredReplicas: 1, readyReplicas: 0 }, { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', deployment: 'web', phase: 'Pending', node: 'worker-node-1', labels: { app: 'web' }, container: webContainer({ image: 'registry.local/web:missing', ready: false, state: 'Waiting', waitingReason: 'ImagePullBackOff' }) })
  } else if (scenarioId === 'kube-crashloop') {
    add({ name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:port-conflict', revision: 2, desiredReplicas: 1, readyReplicas: 0 }, { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', deployment: 'web', phase: 'Running', node: 'worker-node-1', ip: '10.42.0.18', labels: { app: 'web' }, container: webContainer({ image: 'registry.local/web:port-conflict', ready: false, restartCount: 5, state: 'Waiting', waitingReason: 'CrashLoopBackOff' }) })
  } else if (scenarioId === 'kube-oomkilled') {
    add({ name: 'api', namespace: 'production', container: 'api', image: 'registry.local/api:stable', revision: 4, desiredReplicas: 1, readyReplicas: 0, memoryLimit: '128Mi' }, { name: 'api-7d8f', namespace: 'production', deployment: 'api', phase: 'Running', node: 'worker-node-1', ip: '10.42.0.22', labels: { app: 'api' }, container: { name: 'api', image: 'registry.local/api:stable', ready: false, restartCount: 6, state: 'Waiting', waitingReason: 'CrashLoopBackOff', lastReason: 'OOMKilled', exitCode: 137, memoryLimit: '128Mi' } })
  } else if (scenarioId === 'kube-pending') {
    add({ name: 'worker', namespace: 'production', container: 'worker', image: 'registry.local/worker:stable', revision: 3, desiredReplicas: 1, readyReplicas: 0, cpuRequest: '1000m' }, { name: 'worker-5f6d78cf9-xtfd', namespace: 'production', deployment: 'worker', phase: 'Pending', labels: { app: 'worker' }, container: { name: 'worker', image: 'registry.local/worker:stable', ready: false, restartCount: 0, state: 'Waiting', waitingReason: 'Unschedulable', cpuRequest: '1000m' } })
  } else if (scenarioId === 'kube-service-endpoints') {
    add({ name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:readiness-broken', revision: 2, desiredReplicas: 1, readyReplicas: 0 }, { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', deployment: 'web', phase: 'Running', node: 'worker-node-1', ip: '10.42.0.18', labels: { app: 'web' }, container: webContainer({ image: 'registry.local/web:readiness-broken', ready: false, state: 'Running', waitingReason: 'ReadinessProbeFailed' }) })
    services.set('web', { name: 'web', namespace: 'production', selector: { app: 'web' }, port: 80, targetPort: 8080 })
  } else {
    add({ name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:stable', revision: 1, desiredReplicas: 1, readyReplicas: 0 }, { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', deployment: 'web', phase: 'Running', node: 'worker-node-1', ip: '10.42.0.18', labels: { app: 'web' }, container: webContainer() })
  }
  return { pods, deployments, services, endpoints }
}

function readResourceName(args: string[], start: number): { resource: string; name?: string } {
  const raw = args[start]?.toLowerCase() ?? ''
  const [resourceRaw, inlineName] = raw.split('/', 2)
  return { resource: aliases[resourceRaw] ?? resourceRaw, name: inlineName ?? firstPositional(args, start + 1) }
}
function firstPositional(args: string[], start: number): string | undefined {
  for (let index = start; index < args.length; index += 1) {
    const token = args[index]
    if (token.startsWith('-')) {
      if (['-c', '--container', '--containers'].includes(token.toLowerCase())) index += 1
      continue
    }
    if (!token.includes('=')) return token.toLowerCase()
  }
  return undefined
}
function readFlagValue(args: string[], names: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const lower = args[index].toLowerCase()
    if (names.includes(lower)) return args[index + 1]?.toLowerCase()
    const name = names.find((candidate) => lower.startsWith(`${candidate}=`))
    if (name) return lower.slice(name.length + 1)
  }
  return undefined
}
function readEqualsFlag(args: string[], name: string): string | undefined {
  const token = args.find((item) => item.toLowerCase().startsWith(`${name}=`))
  return token?.slice(name.length + 1)
}
function podForDeployment(cluster: VirtualCluster, deployment: string): VirtualPod | undefined { return [...cluster.pods.values()].find((pod) => pod.deployment === deployment) }
function formatPod(pod: VirtualPod): string {
  const status = pod.container.waitingReason === 'ImagePullBackOff' ? 'ImagePullBackOff' : pod.container.waitingReason === 'CrashLoopBackOff' ? 'CrashLoopBackOff' : pod.phase
  return `${pod.name.padEnd(28)} ${pod.container.ready ? '1/1' : '0/1'}       ${status.padEnd(18)} ${pod.container.restartCount}          18m`
}
function describePod(pod: VirtualPod): string {
  const container = pod.container
  const heading = `Name:           ${pod.name}\nNamespace:      ${pod.namespace}\nStatus:         ${pod.phase}\nNode:           ${pod.node ?? '<none>'}\nConditions:\n  Type           Status\n  PodScheduled   ${pod.node ? 'True' : 'False'}\nContainers:\n  ${container.name}:`
  if (pod.phase === 'Pending' && container.waitingReason === 'Unschedulable') return `${heading}\n    State:          Waiting\n      Reason:       Unschedulable\n    Ready:          false\nRequests:\n  cpu: ${container.cpuRequest}\nEvents:\n  Warning  FailedScheduling  30s  default-scheduler  0/3 nodes are available: 3 Insufficient cpu.`
  if (container.waitingReason === 'ImagePullBackOff') return `${heading}\n    State:          Waiting\n      Reason:       ImagePullBackOff\n    Ready:          false\n    Image:          ${container.image}\nEvents:\n  Warning  Failed  30s  kubelet  Failed to pull image "${container.image}": not found`
  if (container.lastReason === 'OOMKilled') return `${heading}\n    State:          Waiting\n      Reason:       CrashLoopBackOff\n    Ready:          false\n    Last State:     Terminated\n      Reason:       OOMKilled\n      Exit Code:    137\n    Limits:\n      memory: ${container.memoryLimit}\nEvents:\n  Warning  BackOff  25s kubelet Back-off restarting failed container api`
  if (container.waitingReason === 'CrashLoopBackOff') return `${heading}\n    State:          Waiting\n      Reason:       CrashLoopBackOff\n    Ready:          false\n    Image:          ${container.image}\nEvents:\n  Warning  BackOff  20s kubelet Back-off restarting failed container web`
  if (container.waitingReason === 'ReadinessProbeFailed') return `${heading}\n    State:          Running\n    Ready:          false\n    Image:          ${container.image}\n    Readiness:      http-get http://:8080/ready delay=3s timeout=1s\nEvents:\n  Warning  Unhealthy  20s kubelet Readiness probe failed: HTTP probe failed with statuscode: 500`
  const resource = container.memoryLimit ? `\n    Limits:\n      memory: ${container.memoryLimit}` : container.cpuRequest ? `\nRequests:\n  cpu: ${container.cpuRequest}` : ''
  return `${heading}\n    State:          Running\n    Ready:          true\n    Image:          ${container.image}${resource}`
}
