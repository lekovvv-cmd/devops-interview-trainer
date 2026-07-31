import { parseCommand } from './commandParser'
import type { CommandResult, ScenarioAction, ScenarioActionType } from '../../types/domain'

type PodPhase = 'Pending' | 'Running'
type WaitingReason = 'ImagePullBackOff' | 'CrashLoopBackOff' | 'OOMKilled' | 'ReadinessProbeFailed' | undefined
type ContainerState = { name: string; image: string; ready: boolean; restartCount: number; waiting?: WaitingReason; lastReason?: string; exitCode?: number; memoryLimit?: string; cpuRequest?: string }
type VirtualPod = { name: string; namespace: string; phase: PodPhase; labels: Record<string, string>; container: ContainerState }
type VirtualDeployment = { name: string; namespace: string; container: string; image: string; revision: number; readyReplicas: number; desiredReplicas: number; cpuRequest?: string; memoryLimit?: string }
type VirtualService = { name: string; namespace: string; selector: Record<string, string>; port: number; targetPort: number }
type VirtualCluster = { pods: Map<string, VirtualPod>; deployments: Map<string, VirtualDeployment>; services: Map<string, VirtualService>; endpoints: Map<string, string[]> }

const aliases: Record<string, string> = { po: 'pod', pods: 'pod', pod: 'pod', deploy: 'deployment', deployments: 'deployment', deployment: 'deployment', svc: 'service', service: 'service', services: 'service', ep: 'endpoints', endpoints: 'endpoints' }

export class KubernetesSimulator {
  private readonly cluster: VirtualCluster

  constructor(private readonly scenarioId: string) { this.cluster = createCluster(scenarioId) }

  execute(input: string): CommandResult {
    const parsed = parseCommand(input)
    if (parsed.command !== 'kubectl') return this.error(`${parsed.command}: command not found in the Kubernetes simulator`, 'unknown')
    const args = parsed.args
    const namespace = readNamespace(args)
    if (namespace !== 'production') return this.error(`Error from server (NotFound): namespaces "${namespace ?? 'default'}" not found`, 'diagnostic')
    const verb = args[0]?.toLowerCase()
    if (verb === 'get') return this.get(args)
    if (verb === 'describe') return this.describe(args)
    if (verb === 'logs') return this.logs(args)
    if (verb === 'set' && args[1]?.toLowerCase() === 'image') return this.setImage(args)
    if (verb === 'set' && args[1]?.toLowerCase() === 'resources') return this.setResources(args)
    if (verb === 'rollout') return this.rollout(args)
    if (verb === 'delete') return this.delete(args)
    return this.error(`kubectl: command '${args.join(' ')}' is not available in the safe simulator`, 'unknown')
  }

  private get(args: string[]): CommandResult {
    const resource = resourceAt(args, 1)
    const name = positionalAfter(args, 1)
    if (resource === 'pod') {
      if (name && !this.cluster.pods.has(name)) return this.notFound('pod', name)
      const pods = name ? [this.cluster.pods.get(name)!] : [...this.cluster.pods.values()]
      const fixed = this.scenarioId === 'kube-pending' ? pods.some((pod) => pod.name.startsWith('worker') && pod.phase === 'Running') : this.scenarioId === 'kube-imagepull' || this.scenarioId === 'kube-crashloop' || this.scenarioId === 'kube-oomkilled' ? pods.every((pod) => pod.container.ready) : false
      const tags = fixed ? ['verify:pods'] : ['symptom:pods']
      return this.result(`NAME                         READY   STATUS             RESTARTS   AGE\n${pods.map(formatPod).join('\n')}`, tags, fixed ? 'verification' : 'symptom', name ?? 'pods')
    }
    if (resource === 'service') {
      const service = name ? this.cluster.services.get(name) : undefined
      if (name && !service) return this.notFound('service', name)
      return this.result(`NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE\n${service?.name ?? 'web'}    ClusterIP   10.96.120.45   <none>        80/TCP    18m`, this.scenarioId === 'kube-service-endpoints' ? ['symptom:service'] : [], 'symptom', service?.name ?? 'service')
    }
    if (resource === 'endpoints') {
      if (name !== 'web') return this.notFound('endpoints', name ?? '')
      const addresses = this.cluster.endpoints.get('web') ?? []
      return this.result(`NAME   ENDPOINTS                                  AGE\nweb    ${addresses.length ? addresses.join(',') : '<none>'}   18m`, [addresses.length ? 'verify:endpoints' : 'symptom:endpoints'], addresses.length ? 'verification' : 'symptom', 'web')
    }
    if (resource === 'deployment') {
      if (name && !this.cluster.deployments.has(name)) return this.notFound('deployment', name)
      const deployments = name ? [this.cluster.deployments.get(name)!] : [...this.cluster.deployments.values()]
      return this.result(`NAME     READY   UP-TO-DATE   AVAILABLE   AGE\n${deployments.map((deployment) => `${deployment.name.padEnd(8)} ${`${deployment.readyReplicas}/${deployment.desiredReplicas}`.padEnd(7)} ${deployment.desiredReplicas.toString().padEnd(12)} ${deployment.readyReplicas}           18m`).join('\n')}`, [], 'diagnostic', name ?? 'deployments')
    }
    return this.error(`error: the server doesn't have a resource type "${args[1] ?? ''}"`, 'unknown')
  }

  private describe(args: string[]): CommandResult {
    const resource = resourceAt(args, 1)
    const name = positionalAfter(args, 1)
    if (resource === 'pod') {
      if (!name || !this.cluster.pods.has(name)) return this.notFound('pod', name ?? '')
      const pod = this.cluster.pods.get(name)!
      const container = pod.container
      const details = container.waiting === 'ImagePullBackOff' ? `State:          Waiting\n      Reason:       ImagePullBackOff\n    Image:          ${container.image}\nEvents:\n  Warning  Failed  30s  kubelet  Failed to pull image "${container.image}": not found` : container.lastReason === 'OOMKilled' ? `State:          Waiting\n      Reason:       CrashLoopBackOff\n    Last State:     Terminated\n      Reason:       OOMKilled\n      Exit Code:    137\n    Limits:\n      memory: ${container.memoryLimit}\nEvents:\n  Warning  BackOff  25s kubelet Back-off restarting failed container api` : container.waiting === 'CrashLoopBackOff' ? `State:          Waiting\n      Reason:       CrashLoopBackOff\n    Image:          ${container.image}\nEvents:\n  Warning  BackOff  20s kubelet Back-off restarting failed container web` : container.waiting === 'ReadinessProbeFailed' ? `State:          Running\n    Ready:          false\n    Image:          ${container.image}\n    Readiness:      http-get http://:8080/ready delay=3s timeout=1s\nEvents:\n  Warning  Unhealthy  20s kubelet Readiness probe failed: HTTP probe failed with statuscode: 500` : `State:          Running\n    Ready:          true\n    Image:          ${container.image}`
      const pendingEvent = pod.phase === 'Pending' ? `\nEvents:\n  Warning  FailedScheduling  30s  default-scheduler  0/3 nodes are available: 3 Insufficient cpu.\n    Requests:\n      cpu: ${container.cpuRequest}` : ''
      const tags = this.scenarioId === 'kube-pending' && pod.name.startsWith('worker') ? ['diag:pod-describe'] : this.scenarioId === 'kube-imagepull' || this.scenarioId === 'kube-oomkilled' || this.scenarioId === 'kube-service-endpoints' ? ['diag:pod-describe'] : []
      return this.result(`Name:           ${pod.name}\nNamespace:      production\nLabels:         ${Object.entries(pod.labels).map(([key, value]) => `${key}=${value}`).join(',')}\nStatus:         ${pod.phase}\nContainers:\n  ${container.name}:\n    ${details}${pendingEvent}`, tags, 'diagnostic', pod.name)
    }
    if (resource === 'service') {
      if (name !== 'web') return this.notFound('service', name ?? '')
      const endpoints = this.cluster.endpoints.get('web') ?? []
      return this.result(`Name:                     web\nNamespace:                production\nSelector:                 app=web\nType:                     ClusterIP\nPort:                     http  80/TCP\nTargetPort:               8080/TCP\nEndpoints:                ${endpoints.length ? endpoints.join(',') : '<none>'}`, this.scenarioId === 'kube-service-endpoints' ? ['symptom:service'] : [], 'diagnostic', 'web')
    }
    return this.error(`error: describe supports pod and service in this simulator`, 'unknown')
  }

  private logs(args: string[]): CommandResult {
    const podName = positionalAfter(args, 0)
    if (!podName || !this.cluster.pods.has(podName)) return this.notFound('pod', podName ?? '')
    const requestedContainer = readFlagValue(args, ['-c', '--container'])
    if (requestedContainer && requestedContainer !== this.cluster.pods.get(podName)!.container.name) return this.error(`Error from server (BadRequest): container "${requestedContainer}" is not valid for pod "${podName}"`, 'diagnostic')
    const previous = args.some((item) => item.toLowerCase() === '--previous')
    if (this.scenarioId === 'kube-crashloop') {
      if (!previous) return this.error(`Error from server (BadRequest): container "web" in pod "${podName}" is waiting to start: CrashLoopBackOff`, 'diagnostic')
      return this.result('2026-07-31T10:20:11Z FATAL listen tcp :8080: bind: address already in use\nprocess exited with code 1', ['diag:logs'], 'diagnostic', podName)
    }
    if (this.scenarioId === 'kube-service-endpoints') return this.result(this.cluster.endpoints.get('web')?.length ? 'INFO /ready 200\nINFO serving traffic' : 'ERROR readiness dependency unavailable\nGET /ready -> 500', ['diag:logs'], 'diagnostic', podName)
    if (this.scenarioId === 'kube-oomkilled') return this.result(previous ? 'INFO processing batch\nINFO allocating cache\nKilled' : 'Error from server (BadRequest): previous terminated container "api" is required; use --previous', previous ? ['diag:logs'] : [], 'diagnostic', podName, !previous)
    return this.error(`Error from server (BadRequest): logs are not diagnostic for pod "${podName}" in this scenario`, 'diagnostic')
  }

  private setImage(args: string[]): CommandResult {
    const target = args[2]?.toLowerCase()
    const assignment = args.find((item) => item.includes('='))
    const exact = sameTokens(withoutNamespace(args), ['set', 'image', 'deployment/web', 'web=registry.local/web:stable'])
    if (this.scenarioId !== 'kube-imagepull' || target !== 'deployment/web' || assignment !== 'web=registry.local/web:stable' || !exact) return this.error('error: expected kubectl set image deployment/web web=registry.local/web:stable -n production', 'change')
    const deployment = this.cluster.deployments.get('web')!; deployment.image = 'registry.local/web:stable'; deployment.revision = 2; deployment.readyReplicas = 3
    for (const pod of this.cluster.pods.values()) { pod.phase = 'Running'; pod.container.image = deployment.image; pod.container.ready = true; pod.container.waiting = undefined; pod.container.restartCount = 0 }
    return this.result('deployment.apps/web image updated\nWaiting for rollout...', ['resolve:image'], 'change', 'deployment/web', false, true)
  }

  private setResources(args: string[]): CommandResult {
    const target = args[2]?.toLowerCase()
    const containerIndex = args.findIndex((item) => item === '-c' || item === '--containers')
    const container = containerIndex >= 0 ? args[containerIndex + 1] : undefined
    const limit = args.find((item) => item.toLowerCase().startsWith('--limits='))
    const request = args.find((item) => item.toLowerCase().startsWith('--requests='))
    if (this.scenarioId === 'kube-oomkilled') {
      const exact = sameTokens(withoutNamespace(args), ['set', 'resources', 'deployment/api', '-c', 'api', '--limits=memory=512mi'])
      if (target !== 'deployment/api' || container !== 'api' || limit?.toLowerCase() !== '--limits=memory=512mi' || !exact) return this.error('error: expected kubectl set resources deployment/api -c api --limits=memory=512Mi -n production', 'change')
      const deployment = this.cluster.deployments.get('api')!; deployment.memoryLimit = '512Mi'; deployment.readyReplicas = 1
      const pod = this.cluster.pods.get('api-7d8f')!; pod.container.memoryLimit = '512Mi'; pod.container.ready = true; pod.container.waiting = undefined; pod.container.lastReason = undefined; pod.container.restartCount = 0
      return this.result('deployment.apps/api resources updated', ['resolve:resources'], 'change', 'deployment/api', false, true)
    }
    if (this.scenarioId === 'kube-pending') {
      const exact = sameTokens(withoutNamespace(args), ['set', 'resources', 'deployment/worker', '-c', 'worker', '--requests=cpu=200m'])
      if (target !== 'deployment/worker' || container !== 'worker' || request?.toLowerCase() !== '--requests=cpu=200m' || !exact) return this.error('error: expected kubectl set resources deployment/worker -c worker --requests=cpu=200m -n production', 'change')
      const deployment = this.cluster.deployments.get('worker')!; deployment.cpuRequest = '200m'; deployment.readyReplicas = 1
      const pod = this.cluster.pods.get('worker-5f6d78cf9-xtfd')!; pod.phase = 'Running'; pod.container.cpuRequest = '200m'; pod.container.ready = true
      return this.result('deployment.apps/worker resources updated', ['resolve:pending'], 'change', 'deployment/worker', false, true)
    }
    return this.error('error: resource change does not match this scenario', 'change')
  }

  private rollout(args: string[]): CommandResult {
    const operation = args[1]?.toLowerCase()
    const target = args[2]?.toLowerCase()
    if (!target || target !== 'deployment/web') return this.error('error: expected a named deployment/web', 'change')
    if (operation === 'history') return this.result('REVISION  CHANGE-CAUSE\n1         web:stable\n2         broken release', [], 'diagnostic', 'deployment/web')
    if (operation === 'status') {
      const deployment = this.cluster.deployments.get('web')!
      const healthy = deployment.readyReplicas === deployment.desiredReplicas
      return this.result(healthy ? 'deployment "web" successfully rolled out' : 'Waiting for deployment "web" rollout to finish: 0 of 3 updated replicas are available...', healthy ? ['verify:rollout'] : [], healthy ? 'verification' : 'diagnostic', 'deployment/web')
    }
    if (operation === 'undo' && (this.scenarioId === 'kube-crashloop' || this.scenarioId === 'kube-service-endpoints')) {
      const deployment = this.cluster.deployments.get('web')!; deployment.revision = 1; deployment.image = 'registry.local/web:stable'; deployment.readyReplicas = 3
      for (const pod of this.cluster.pods.values()) if (pod.labels.app === 'web') { pod.phase = 'Running'; pod.container.image = deployment.image; pod.container.ready = true; pod.container.waiting = undefined; pod.container.restartCount = 0 }
      if (this.scenarioId === 'kube-service-endpoints') this.cluster.endpoints.set('web', ['10.42.0.18:8080', '10.42.0.19:8080'])
      return this.result('deployment.apps/web rolled back to revision 1', ['resolve:workload'], 'change', 'deployment/web', false, true)
    }
    return this.error(`error: rollout ${operation ?? ''} is not a valid fix for this scenario`, 'change')
  }

  private delete(args: string[]): CommandResult {
    const resource = resourceAt(args, 1)
    const name = positionalAfter(args, 1)
    if (resource === 'pod' && name) return this.result(`pod "${name}" was not deleted: deleting a Pod does not repair its workload`, ['danger:delete-pod'], 'dangerous', name, true, false, true)
    return this.error('error: only explicit Pod deletion is modelled as a blocked dangerous action', 'dangerous')
  }

  private notFound(resource: string, name: string): CommandResult { return this.error(`Error from server (NotFound): ${resource}s "${name}" not found`, 'diagnostic') }
  private result(output: string, tags: string[], type: ScenarioActionType, object?: string, isError = false, meaningful = true, dangerous = false): CommandResult { const action: ScenarioAction = { type, object, diagnosticTags: tags, changedState: type === 'change', dangerous, meaningful }; return { output, tags, action, isError } }
  private error(output: string, type: ScenarioActionType): CommandResult { return this.result(output, [], type, undefined, true, false) }
}

function createCluster(scenarioId: string): VirtualCluster {
  const pods = new Map<string, VirtualPod>(); const deployments = new Map<string, VirtualDeployment>(); const services = new Map<string, VirtualService>(); const endpoints = new Map<string, string[]>()
  const web = (state: Partial<ContainerState> = {}) => ({ name: 'web', image: 'registry.local/web:stable', ready: true, restartCount: 0, ...state })
  if (scenarioId === 'kube-imagepull') { deployments.set('web', { name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:missing', revision: 2, readyReplicas: 0, desiredReplicas: 3 }); pods.set('web-6d7c9f6b7d-2xk9m', { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', phase: 'Pending', labels: { app: 'web' }, container: web({ image: 'registry.local/web:missing', ready: false, waiting: 'ImagePullBackOff' }) }) }
  else if (scenarioId === 'kube-crashloop') { deployments.set('web', { name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:port-conflict', revision: 2, readyReplicas: 0, desiredReplicas: 3 }); pods.set('web-6d7c9f6b7d-2xk9m', { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', phase: 'Running', labels: { app: 'web' }, container: web({ image: 'registry.local/web:port-conflict', ready: false, waiting: 'CrashLoopBackOff', restartCount: 5 }) }) }
  else if (scenarioId === 'kube-oomkilled') { deployments.set('api', { name: 'api', namespace: 'production', container: 'api', image: 'registry.local/api:stable', revision: 4, readyReplicas: 0, desiredReplicas: 1, memoryLimit: '128Mi' }); pods.set('api-7d8f', { name: 'api-7d8f', namespace: 'production', phase: 'Running', labels: { app: 'api' }, container: { name: 'api', image: 'registry.local/api:stable', ready: false, restartCount: 6, waiting: 'OOMKilled', lastReason: 'OOMKilled', exitCode: 137, memoryLimit: '128Mi' } }) }
  else if (scenarioId === 'kube-pending') { deployments.set('worker', { name: 'worker', namespace: 'production', container: 'worker', image: 'registry.local/worker:stable', revision: 3, readyReplicas: 0, desiredReplicas: 1, cpuRequest: '1000m' }); pods.set('worker-5f6d78cf9-xtfd', { name: 'worker-5f6d78cf9-xtfd', namespace: 'production', phase: 'Pending', labels: { app: 'worker' }, container: { name: 'worker', image: 'registry.local/worker:stable', ready: false, restartCount: 0, cpuRequest: '1000m' } }) }
  else if (scenarioId === 'kube-service-endpoints') { deployments.set('web', { name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:readiness-broken', revision: 2, readyReplicas: 0, desiredReplicas: 2 }); pods.set('web-6d7c9f6b7d-2xk9m', { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', phase: 'Running', labels: { app: 'web' }, container: web({ image: 'registry.local/web:readiness-broken', ready: false, waiting: 'ReadinessProbeFailed' }) }); services.set('web', { name: 'web', namespace: 'production', selector: { app: 'web' }, port: 80, targetPort: 8080 }); endpoints.set('web', []) }
  else { deployments.set('web', { name: 'web', namespace: 'production', container: 'web', image: 'registry.local/web:stable', revision: 1, readyReplicas: 1, desiredReplicas: 1 }); pods.set('web-6d7c9f6b7d-2xk9m', { name: 'web-6d7c9f6b7d-2xk9m', namespace: 'production', phase: 'Running', labels: { app: 'web' }, container: web() }) }
  return { pods, deployments, services, endpoints }
}

function readNamespace(args: string[]): string | undefined { for (let index = 0; index < args.length; index += 1) { const token = args[index].toLowerCase(); if (token === '-n' || token === '--namespace') return args[index + 1]?.toLowerCase(); if (token.startsWith('--namespace=')) return token.slice('--namespace='.length) } return 'production' }
function readFlagValue(args: string[], names: string[]): string | undefined { for (let index = 0; index < args.length; index += 1) if (names.includes(args[index].toLowerCase())) return args[index + 1]?.toLowerCase(); return undefined }
function withoutNamespace(args: string[]): string[] { const result: string[] = []; for (let index = 0; index < args.length; index += 1) { const token = args[index].toLowerCase(); if (token === '-n' || token === '--namespace') { index += 1; continue } if (token.startsWith('--namespace=')) continue; result.push(token) } return result }
function sameTokens(actual: string[], expected: string[]): boolean { return actual.length === expected.length && expected.every((token) => actual.includes(token)) }
function resourceAt(args: string[], index: number): string { const raw = args[index]?.toLowerCase().split('/')[0] ?? ''; return aliases[raw] ?? raw }
function positionalAfter(args: string[], resourceIndex: number): string | undefined { const resourceToken = args[resourceIndex] ?? ''; if (resourceToken.includes('/')) return resourceToken.split('/')[1]?.toLowerCase(); for (let index = resourceIndex + 1; index < args.length; index += 1) { const token = args[index]; if (token.startsWith('-')) { if (token === '-n' || token === '--namespace') index += 1; continue } return token.toLowerCase() } return undefined }
function formatPod(pod: VirtualPod): string { const status = pod.container.waiting === 'ImagePullBackOff' ? 'ImagePullBackOff' : pod.container.waiting === 'CrashLoopBackOff' || pod.container.waiting === 'OOMKilled' ? 'CrashLoopBackOff' : pod.phase; return `${pod.name.padEnd(28)} ${pod.container.ready ? '1/1' : '0/1'}       ${status.padEnd(18)} ${pod.container.restartCount}          18m` }
