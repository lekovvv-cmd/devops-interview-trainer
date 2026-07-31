import { parseCommand } from './commandParser'
import type { CommandResult, ScenarioAction, ScenarioActionType } from '../../types/domain'

type ProcessState = 'running' | 'stopped' | 'exited'
type UserName = 'root' | 'student' | 'app'
type GroupName = UserName
type VirtualNode = { owner: UserName; group: GroupName; mode: string }
type VirtualFile = VirtualNode & { content: string }

const users: Record<UserName, { uid: number; primaryGroup: GroupName; supplementaryGroups: GroupName[] }> = {
  root: { uid: 0, primaryGroup: 'root', supplementaryGroups: [] },
  student: { uid: 1000, primaryGroup: 'student', supplementaryGroups: [] },
  app: { uid: 1001, primaryGroup: 'app', supplementaryGroups: [] },
}

const groups: Record<GroupName, number> = { root: 0, student: 1000, app: 1001 }
const signalNames: Record<string, 'TERM' | 'KILL' | 'STOP' | 'CONT'> = {
  TERM: 'TERM', SIGTERM: 'TERM', '15': 'TERM',
  KILL: 'KILL', SIGKILL: 'KILL', '9': 'KILL',
  STOP: 'STOP', SIGSTOP: 'STOP', CONT: 'CONT', SIGCONT: 'CONT',
}

/** A deliberately small, stateful Linux environment. No host command is ever executed. */
export class LinuxSimulator {
  private readonly files = new Map<string, VirtualFile>([
    ['/srv/app/config.yml', { owner: 'root', group: 'root', mode: '600', content: 'DATABASE_URL=postgres://app@db:5432/app\nLOG_LEVEL=info' }],
    ['/etc/app/app.env', { owner: 'root', group: 'app', mode: '644', content: 'BIND_ADDRESS=127.0.0.1\nPORT=8080' }],
  ])
  private readonly directories = new Map<string, VirtualNode>([
    ['/srv', { owner: 'root', group: 'root', mode: '755' }],
    ['/srv/app', { owner: 'app', group: 'app', mode: '750' }],
  ])
  private processState: ProcessState = 'running'
  private termTried = false
  private processScenarioLocked = false
  private unitReloaded = false
  private systemdActive = false
  private descriptorOpen = true
  private configuredBind = '127.0.0.1'
  private runningBind = '127.0.0.1'

  constructor(private readonly scenarioId: string) {}

  execute(input: string): CommandResult {
    const parsed = parseCommand(input)
    if (!parsed.command) return this.result('', [], 'noop')
    if (this.scenarioId === 'linux-runaway-process' && this.processScenarioLocked) {
      return this.result('Scenario is locked after unsafe SIGKILL. Reset the virtual environment and diagnose the process before changing it.', [], 'noop', 'api-worker', true, false)
    }
    if (parsed.command === 'sudo') return this.sudo(parsed.args)
    return this.executeAs(parsed.command, parsed.args, 'student')
  }

  private executeAs(command: string, args: string[], user: UserName): CommandResult {
    switch (command) {
      case 'pwd': return this.result('/home/student', [], 'diagnostic', 'cwd')
      case 'ls': return this.list(args)
      case 'stat': return this.stat(lastPath(args))
      case 'cat': return this.cat(lastPath(args), user)
      case 'chmod': return this.chmod(args)
      case 'chown': return this.chown(args)
      case 'ps': return this.ps(args)
      case 'pgrep': return this.pgrep(args)
      case 'top': return this.top()
      case 'kill': return this.kill(args)
      case 'systemctl': return this.systemctl(args)
      case 'journalctl': return this.journalctl(args)
      case 'df': return this.df(args)
      case 'du': return this.du(args)
      case 'lsof': return this.lsof(args)
      case 'ss': return this.ss(args)
      case 'curl': return this.curl(args.join(' '))
      case 'ip': return this.result('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>\n    inet 10.4.8.21/24 brd 10.4.8.255 scope global eth0\ndefault via 10.4.8.1 dev eth0', [], 'diagnostic', 'network')
      case 'dig': return this.dig(args)
      case 'trainer': return this.trainer(args)
      case 'reboot': return this.danger('reboot is blocked in the safe simulator', 'host')
      default: return this.error(`${command}: command not found in the safe simulator`, 'unknown')
    }
  }

  private sudo(args: string[]): CommandResult {
    if (args[0] !== '-u' || !args[1] || !args[2]) return this.error('sudo: only sudo -u <user> cat <path> is available in the safe simulator', 'unknown')
    const requestedUser = args[1].toLowerCase()
    if (!isUser(requestedUser)) return this.error(`sudo: unknown user: ${args[1]}`, 'unknown')
    if (args[2].toLowerCase() !== 'cat') return this.error('sudo: only cat is available in the safe simulator', 'unknown')
    return this.cat(args[3] ?? '', requestedUser)
  }

  private list(args: string[]): CommandResult {
    const path = lastPath(args)
    const directory = this.directories.get(path)
    if (directory) return this.result(`${modeString(directory.mode, true)} 2 ${directory.owner} ${directory.group} 4096 Jul 31 10:00 ${path}`, this.permissionTagsForPath(path), 'diagnostic', path)
    const file = this.files.get(path)
    if (!file) return this.error(`ls: cannot access '${path}': No such file or directory`, 'diagnostic')
    return this.result(`${modeString(file.mode)} 1 ${file.owner} ${file.group} ${file.content.length} Jul 31 10:15 ${path}`, this.permissionTagsForPath(path), 'diagnostic', path)
  }

  private stat(path: string): CommandResult {
    const node = this.files.get(path) ?? this.directories.get(path)
    if (!node) return this.error(`stat: cannot statx '${path}': No such file or directory`, 'diagnostic')
    const owner = users[node.owner]
    const groupId = groups[node.group]
    const file = this.files.get(path)
    const kind = file ? 'regular file' : 'directory'
    const size = file ? file.content.length : 4096
    return this.result(`  File: ${path}\n  Size: ${size}\tBlocks: 8\t${kind}\nAccess: (0${node.mode}/${modeString(node.mode, !file)})  Uid: (${owner.uid}/${node.owner})   Gid: (${groupId}/${node.group})\nModify: 2026-07-31 10:15:30.000000000 +0500`, this.permissionTagsForPath(path), 'diagnostic', path)
  }

  private cat(path: string, user: UserName): CommandResult {
    const file = this.files.get(path)
    if (!file) return this.error(`cat: ${path}: No such file or directory`, 'diagnostic')
    if (!this.canRead(user, path)) return this.result(`cat: ${path}: Permission denied`, [], 'diagnostic', path, true, false)
    const verifyPermission = this.scenarioId === 'linux-permission' && user === 'app' && path === '/srv/app/config.yml' && this.safePermissionState()
    const networkConfig = this.scenarioId === 'linux-network' && path === '/etc/app/app.env'
    const tags = verifyPermission ? ['verify:permission'] : networkConfig ? ['diag:network-config'] : []
    return this.result(file.content, tags, verifyPermission ? 'verification' : 'diagnostic', path)
  }

  private chmod(args: string[]): CommandResult {
    const [rawMode, path] = args
    const file = this.files.get(path)
    if (!file) return this.error(`chmod: cannot access '${path ?? ''}': No such file or directory`, 'change')
    if (!rawMode || !/^(?:0?[0-7]{3})$/.test(rawMode)) return this.error(`chmod: invalid mode: '${rawMode ?? ''}'`, 'change')
    const mode = rawMode.slice(-3)
    const wasSafe = this.safePermissionState()
    const changed = file.mode !== mode
    file.mode = mode
    const dangerous = isDangerousFileMode(mode)
    const resolved = this.scenarioId === 'linux-permission' && !wasSafe && this.safePermissionState()
    return this.result('', resolved ? ['resolve:permission'] : [], dangerous ? 'dangerous' : 'change', path, false, changed, dangerous, false, changed)
  }

  private chown(args: string[]): CommandResult {
    const [identity, path] = args
    const file = this.files.get(path)
    if (!file) return this.error(`chown: cannot access '${path ?? ''}': No such file or directory`, 'change')
    if (!identity) return this.error('chown: missing operand', 'change')
    const [ownerRaw, groupRaw] = identity.split(':', 2)
    const owner = ownerRaw.toLowerCase()
    const group = (groupRaw || ownerRaw).toLowerCase()
    if (!isUser(owner)) return this.error(`chown: invalid user: '${ownerRaw}'`, 'change')
    if (!isGroup(group)) return this.error(`chown: invalid group: '${groupRaw || ownerRaw}'`, 'change')
    const wasSafe = this.safePermissionState()
    const changed = file.owner !== owner || file.group !== group
    file.owner = owner
    file.group = group
    const resolved = this.scenarioId === 'linux-permission' && !wasSafe && this.safePermissionState()
    return this.result('', resolved ? ['resolve:permission'] : [], 'change', path, false, changed, false, false, changed)
  }

  private ps(args: string[]): CommandResult {
    const pid = readPid(args)
    if (pid !== undefined && pid !== 3912 && pid !== 812 && pid !== 1234) return this.result('  PID  PPID USER STAT %CPU COMMAND', [], 'diagnostic', `pid:${pid}`)
    const requestedApi = pid === 3912
    const api = this.processState === 'exited' ? '' : `\n 3912     1 app  ${this.processState === 'stopped' ? 'T' : 'Rl'}  ${this.processState === 'stopped' ? '0.0' : '92.7'} /srv/api/bin/api-worker --workers=8`
    const tags = this.scenarioId === 'linux-runaway-process' && requestedApi ? [this.processState === 'exited' ? 'verify:process' : 'diag:processes'] : []
    return this.result(`  PID  PPID USER STAT %CPU COMMAND\n  812     1 root Ss    0.2 /usr/lib/systemd/systemd${api}\n 1234     1 www-data S     0.3 nginx: worker process`, tags, tags.includes('verify:process') ? 'verification' : 'diagnostic', requestedApi ? 'api-worker' : 'process')
  }

  private pgrep(args: string[]): CommandResult {
    const lookingForApi = args.some((item) => item.toLowerCase().includes('api-worker'))
    if (lookingForApi && this.processState !== 'exited') return this.result('3912 /srv/api/bin/api-worker --workers=8', this.scenarioId === 'linux-runaway-process' ? ['diag:processes'] : [], 'diagnostic', 'api-worker')
    return this.result('', [], 'diagnostic', 'process')
  }

  private top(): CommandResult {
    const running = this.processState === 'running'
    const tags = this.scenarioId === 'linux-runaway-process' ? [this.processState === 'exited' ? 'verify:process' : 'symptom:cpu'] : []
    const row = this.processState === 'exited' ? '' : `\n 3912 app       ${running ? '92.7' : '0.0 '} api-worker`
    return this.result(`top - 14:20:11  load average: ${running ? '4.91, 3.14, 1.87' : '0.84, 1.02, 1.11'}\nTasks: 154 total, ${running ? '2' : '1'} running\n%Cpu(s): ${running ? '96.2 us, 2.1 sy, 1.4 id' : '14.3 us, 3.1 sy, 81.9 id'}\n  PID USER      %CPU COMMAND${row}`, tags, tags.includes('verify:process') ? 'verification' : 'symptom', 'cpu')
  }

  private kill(args: string[]): CommandResult {
    const pidToken = [...args].reverse().find((item) => /^\d+$/.test(item))
    if (!pidToken) return this.error('kill: usage: kill [-signal] pid', 'change')
    const pid = Number(pidToken)
    if (pid !== 3912 && pid !== 1234) return this.error(`kill: (${pid}) - No such process`, 'change')
    const signalToken = args.find((item) => item.startsWith('-'))?.replace(/^-+/, '').toUpperCase() ?? 'TERM'
    const signal = signalNames[signalToken]
    if (!signal) return this.error(`kill: invalid signal specification: ${signalToken}`, 'change')
    if (pid === 1234) return this.danger('kill: stopping nginx is not the disk-full repair; inspect lsof and restart nginx instead', 'nginx')
    if (this.processState === 'exited') return this.error(`kill: (${pid}) - No such process`, 'change')
    if (signal === 'TERM') {
      this.termTried = true
      this.processState = 'exited'
      return this.result('api-worker: draining requests\napi-worker: stopped cleanly', this.scenarioId === 'linux-runaway-process' ? ['resolve:process'] : [], 'change', 'api-worker', false, true, false, false, true)
    }
    if (signal === 'KILL') {
      if (!this.termTried) {
        this.processState = 'exited'
        this.processScenarioLocked = this.scenarioId === 'linux-runaway-process'
        return this.result('api-worker: killed with SIGKILL before SIGTERM; this is an unsafe, non-recoverable scenario path. Reset the virtual environment.', [], 'dangerous', 'api-worker', false, true, true, this.processScenarioLocked, true)
      }
      return this.error(`kill: (${pid}) - No such process`, 'change')
    }
    if (signal === 'STOP') {
      this.processState = 'stopped'
      return this.result('api-worker: stopped', [], 'change', 'api-worker', false, true, false, false, true)
    }
    this.processState = 'running'
    return this.result('api-worker: continued', [], 'change', 'api-worker', false, true, false, false, true)
  }

  private systemctl(args: string[]): CommandResult {
    const action = args[0]?.toLowerCase()
    const service = normalizeService(args[1])
    if (action === 'daemon-reload') {
      this.unitReloaded = true
      return this.result('systemd manager configuration reloaded', [], 'change', 'systemd', false, true, false, false, true)
    }
    if (!service || !['app-worker', 'nginx'].includes(service)) return this.error(`Unit ${args[1] ?? ''}.service could not be found.`, 'diagnostic')
    if (action === 'status') return this.systemctlStatus(service)
    if (action !== 'restart') return this.error(`systemctl: unsupported safe action '${action ?? ''}'`, 'unknown')
    if (service === 'nginx' && this.scenarioId === 'linux-disk-full') {
      const changed = this.descriptorOpen
      this.descriptorOpen = false
      return this.result('nginx restarted; closed old log descriptor', ['resolve:disk'], 'change', 'nginx', false, changed, false, false, changed)
    }
    if (service === 'app-worker' && this.scenarioId === 'linux-systemd') {
      if (!this.unitReloaded) return this.result('Job for app-worker.service failed: unit cache is stale; run systemctl daemon-reload first.', [], 'noop', 'app-worker', false, false)
      this.systemdActive = true
      return this.result('app-worker restarted with reloaded unit', ['resolve:service'], 'change', 'app-worker', false, true, false, false, true)
    }
    if (service === 'app-worker' && this.scenarioId === 'linux-network') {
      if (this.configuredBind !== '0.0.0.0') return this.result('app-worker restarted; still bound to 127.0.0.1:8080', [], 'noop', 'app-worker', false, false)
      const changed = this.runningBind !== this.configuredBind
      this.runningBind = this.configuredBind
      return this.result('app-worker restarted with BIND_ADDRESS=0.0.0.0', ['resolve:network'], 'change', 'app-worker', false, changed, false, false, changed)
    }
    return this.result(`${service} restarted`, [], 'change', service, false, true, false, false, true)
  }

  private systemctlStatus(service: string): CommandResult {
    if (service === 'app-worker' && this.scenarioId === 'linux-systemd') {
      const active = this.systemdActive ? 'active (running)' : 'failed (Result: exit-code)'
      const tail = this.systemdActive ? 'Main PID: 2451 (app-worker)' : 'Hint: unit file changed on disk; run systemctl daemon-reload'
      return this.result(`● app-worker.service - application worker\n   Loaded: loaded (/etc/systemd/system/app-worker.service)\n   Active: ${active}\n   ${tail}`, [this.systemdActive ? 'verify:service' : 'symptom:service'], this.systemdActive ? 'verification' : 'symptom', 'app-worker')
    }
    if (service === 'app-worker' && this.scenarioId === 'linux-permission') {
      const active = this.safePermissionState()
      return this.result(`● app-worker.service - application worker\n   Active: ${active ? 'active (running)' : 'failed (Result: exit-code)'}\n   ${active ? 'Configuration is readable.' : 'error: permission denied reading /srv/app/config.yml'}`, [active ? 'verify:permission' : 'symptom:service'], active ? 'verification' : 'symptom', 'app-worker')
    }
    return this.result(`● ${service}.service - ${service}\n   Active: active (running)`, [], 'diagnostic', service)
  }

  private journalctl(args: string[]): CommandResult {
    const unit = readFlag(args, ['-u', '--unit'])
    if (!unit) return this.result('-- No entries --', [], 'diagnostic', 'journal')
    const service = normalizeService(unit)
    if (service !== 'app-worker' && service !== 'nginx') return this.result('-- No entries --', [], 'diagnostic', service)
    if (service === 'app-worker' && this.scenarioId === 'linux-systemd') {
      const tags = this.systemdActive ? ['verify:service'] : ['diag:journal']
      const output = this.systemdActive
        ? 'Jul 31 10:25 systemd[1]: Started app-worker.service.'
        : 'Jul 31 10:22 systemd[1]: app-worker.service: unit file changed on disk, run systemctl daemon-reload.'
      return this.result(output, tags, this.systemdActive ? 'verification' : 'diagnostic', 'app-worker')
    }
    if (service === 'nginx' && this.scenarioId === 'linux-disk-full') return this.result(this.descriptorOpen ? 'Jul 31 10:21 nginx[1234]: access log file deleted but still open' : 'Jul 31 10:25 nginx[1234]: reopened access log; disk space recovered', [], 'diagnostic', 'nginx')
    return this.result('-- No entries --', [], 'diagnostic', service)
  }

  private df(args: string[]): CommandResult {
    const path = lastPath(args) || '/'
    if (path === '/var') {
      const fixed = !this.descriptorOpen
      const tags = this.scenarioId === 'linux-disk-full' ? [fixed ? 'verify:disk' : 'symptom:disk'] : []
      return this.result(`Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda3        20G  ${fixed ? '2.0G   18G  10%' : '20G     0 100%'} /var`, tags, fixed ? 'verification' : 'symptom', '/var')
    }
    const neutral = filesystemFor(path)
    return this.result(`Filesystem      Size  Used Avail Use% Mounted on\n${neutral}`, [], 'diagnostic', path)
  }

  private du(args: string[]): CommandResult {
    const path = lastPath(args)
    if (path === '/var') return this.result('4.0K    /var/tmp\n1.2G    /var/lib\n0.8G    /var/log\n2.0G    /var', this.scenarioId === 'linux-disk-full' ? ['diag:disk-usage'] : [], 'diagnostic', '/var')
    if (path === '/tmp') return this.result('12M     /tmp', [], 'diagnostic', '/tmp')
    return this.error(`du: ${path || '/'} is outside the virtual disk-full fixture`, 'diagnostic')
  }

  private lsof(args: string[]): CommandResult {
    if (!args.includes('+L1')) return this.error('lsof: only +L1 is supported in the safe simulator', 'unknown')
    const tags = this.scenarioId === 'linux-disk-full' ? [this.descriptorOpen ? 'diag:open-file' : 'verify:disk'] : []
    const output = this.descriptorOpen ? 'COMMAND  PID USER     FD TYPE DEVICE SIZE/OFF NLINK NAME\nnginx   1234 www-data 7w REG  8,2   18G      0 /var/log/nginx/access.log (deleted)' : ''
    return this.result(output, tags, this.descriptorOpen ? 'diagnostic' : 'verification', 'deleted-file')
  }

  private ss(args: string[]): CommandResult {
    const requestedListenerView = args.some((item) => item.includes('l')) && args.some((item) => item.includes('t'))
    const requestsAnotherPort = args.some((item) => /:\d+/.test(item) && !item.includes(':8080'))
    const tags = this.scenarioId === 'linux-network' && requestedListenerView && !requestsAnotherPort ? [this.runningBind === '0.0.0.0' ? 'verify:network' : 'diag:ports'] : []
    return this.result(`State  Recv-Q Send-Q Local Address:Port Process\nLISTEN 0      128    ${this.runningBind}:8080 users:(("app-worker",pid=2451,fd=8))\nLISTEN 0      511    0.0.0.0:80 users:(("nginx",pid=1234,fd=6))`, tags, tags.includes('verify:network') ? 'verification' : 'diagnostic', 'app-worker')
  }

  private curl(target: string): CommandResult {
    const lower = target.toLowerCase()
    if (lower.includes('unknown.production.local')) return this.result('curl: (6) Could not resolve host: unknown.production.local', [], 'symptom', 'dns', true, false)
    if (lower.includes('10.4.8.250')) return this.result('curl: (28) Connection timed out after 3000 milliseconds', [], 'symptom', 'route', true, false)
    if (lower.includes('10.4.8.21:8080')) {
      if (this.runningBind !== '0.0.0.0') return this.result('curl: (7) Failed to connect to 10.4.8.21 port 8080: Connection refused', this.scenarioId === 'linux-network' ? ['symptom:network'] : [], 'symptom', 'app-worker', true, false)
      return this.result('HTTP/1.1 200 OK\ncontent-type: application/json\n\n{"status":"ok"}', this.scenarioId === 'linux-network' ? ['verify:network'] : [], 'verification', 'app-worker')
    }
    return this.result('curl: (7) Failed to connect: Connection refused', [], 'diagnostic', 'http', true, false)
  }

  private dig(args: string[]): CommandResult {
    const host = args.find((item) => !item.startsWith('-')) ?? ''
    return host === 'api.production.local'
      ? this.result('api.production.local. 60 IN A 10.4.8.21', [], 'diagnostic', 'dns')
      : this.result(`;; ->>HEADER<<- status: NXDOMAIN\n;; QUESTION: ${host}`, [], 'diagnostic', 'dns')
  }

  private trainer(args: string[]): CommandResult {
    const exactEdit = args.length === 3 && args[0] === 'edit' && args[1] === '/etc/app/app.env' && args[2] === 'BIND_ADDRESS=0.0.0.0'
    if (exactEdit) {
      const changed = this.configuredBind !== '0.0.0.0'
      this.configuredBind = '0.0.0.0'
      this.files.get('/etc/app/app.env')!.content = 'BIND_ADDRESS=0.0.0.0\nPORT=8080'
      return this.result('updated /etc/app/app.env: BIND_ADDRESS=0.0.0.0', [], 'change', '/etc/app/app.env', false, changed, false, false, changed)
    }
    if (args[0] === 'disable-firewall') return this.danger('trainer: firewall changes are intentionally unavailable', 'firewall')
    return this.error('trainer: supported command is edit /etc/app/app.env BIND_ADDRESS=0.0.0.0', 'unknown')
  }

  private canRead(user: UserName, path: string): boolean {
    const file = this.files.get(path)
    if (!file) return false
    if (user === 'root') return true
    const directories = path.split('/').slice(1, -1).map((_, index, pieces) => `/${pieces.slice(0, index + 1).join('/')}`)
    return directories.every((directory) => {
      const node = this.directories.get(directory)
      return node ? hasPermission(node, user, 1) : true
    }) && hasPermission(file, user, 4)
  }

  private safePermissionState(): boolean {
    const file = this.files.get('/srv/app/config.yml')!
    const [owner, group, other] = [...file.mode].map(Number)
    const appCanRead = this.canRead('app', '/srv/app/config.yml')
    const onlyMinimalBits = (owner & 4) !== 0 && (owner & ~6) === 0 && (group & ~4) === 0 && other === 0
    return appCanRead && onlyMinimalBits && (file.owner === 'app' || file.group === 'app')
  }

  private permissionTagsForPath(path: string): string[] {
    return this.scenarioId === 'linux-permission' && ['/srv/app/config.yml', '/srv', '/srv/app'].includes(path) ? ['diag:permissions'] : []
  }

  private result(output: string, tags: string[], type: ScenarioActionType, object?: string, isError = false, meaningful = true, dangerous = false, blocksResolution = false, changedState = type === 'change' || type === 'dangerous'): CommandResult {
    const action: ScenarioAction = { type, object, diagnosticTags: tags, changedState, dangerous, blocksResolution, meaningful }
    return { output, tags, action, isError }
  }

  private error(output: string, type: ScenarioActionType): CommandResult { return this.result(output, [], type, undefined, true, false, false, false, false) }
  private danger(output: string, object: string): CommandResult { return this.result(output, [], 'dangerous', object, true, false, true, false, false) }
}

function isUser(value: string): value is UserName { return value in users }
function isGroup(value: string): value is GroupName { return value in groups }
function normalizeService(value?: string): string | undefined { return value?.toLowerCase().replace(/\.service$/, '') }
function lastPath(args: string[]): string { return [...args].reverse().find((item) => !item.startsWith('-')) ?? '' }
function readPid(args: string[]): number | undefined {
  for (let index = 0; index < args.length; index += 1) if (args[index] === '-p') return Number(args[index + 1])
  const token = args.find((item) => /^\d+$/.test(item))
  return token ? Number(token) : undefined
}
function readFlag(args: string[], names: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const lower = args[index].toLowerCase()
    if (names.includes(lower)) return args[index + 1]
    const name = names.find((candidate) => lower.startsWith(`${candidate}=`))
    if (name) return args[index].slice(name.length + 1)
  }
  return undefined
}
function hasPermission(node: VirtualNode, user: UserName, bit: number): boolean {
  if (user === 'root') return true
  const account = users[user]
  const digit = node.owner === user ? node.mode[0] : node.group === account.primaryGroup || account.supplementaryGroups.includes(node.group) ? node.mode[1] : node.mode[2]
  return (Number(digit) & bit) !== 0
}
function isDangerousFileMode(mode: string): boolean { return (Number(mode[1]) & 2) !== 0 || (Number(mode[2]) & 2) !== 0 }
function filesystemFor(path: string): string {
  if (path === '/home') return '/dev/sda2        40G   8G   32G  20% /home'
  if (path === '/tmp') return 'tmpfs             2G  12M  2.0G   1% /tmp'
  return '/dev/sda1        24G   5G   19G  21% /'
}
function modeString(mode: string, directory = false): string {
  const chars = [...mode].map((digit) => {
    const value = Number(digit)
    return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`
  }).join('')
  return `${directory ? 'd' : '-'}${chars}`
}
