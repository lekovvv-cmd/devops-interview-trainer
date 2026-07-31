import { parseCommand } from './commandParser'
import type { CommandResult, ScenarioAction, ScenarioActionType } from '../../types/domain'

type ProcessState = 'running' | 'stopped' | 'exited'
type VirtualFile = { owner: string; group: string; mode: string; content: string }

const signalNames: Record<string, 'TERM' | 'KILL' | 'STOP' | 'CONT'> = { TERM: 'TERM', SIGTERM: 'TERM', '15': 'TERM', KILL: 'KILL', SIGKILL: 'KILL', '9': 'KILL', STOP: 'STOP', SIGSTOP: 'STOP', CONT: 'CONT', SIGCONT: 'CONT' }

export class LinuxSimulator {
  private readonly files = new Map<string, VirtualFile>([
    ['/srv/app/config.yml', { owner: 'root', group: 'root', mode: '600', content: 'DATABASE_URL=postgres://app@db:5432/app\nLOG_LEVEL=info' }],
    ['/etc/app/app.env', { owner: 'root', group: 'app', mode: '640', content: 'BIND_ADDRESS=127.0.0.1\nPORT=8080' }],
  ])
  private readonly directories = new Map([['/srv', { owner: 'root', group: 'root', mode: '755' }], ['/srv/app', { owner: 'app', group: 'app', mode: '750' }]])
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
    if (this.scenarioId === 'linux-runaway-process' && this.processScenarioLocked) return this.result('Scenario is locked after unsafe SIGKILL. Reset the virtual environment and diagnose the process before changing it.', [], 'noop', 'api-worker', true, false)
    if (parsed.command === 'sudo' && parsed.args.slice(0, 3).map((item) => item.toLowerCase()).join(' ') === '-u app cat') return this.cat(parsed.args[3] ?? '', true)
    switch (parsed.command) {
      case 'pwd': return this.result('/home/student', [], 'diagnostic', 'cwd')
      case 'ls': return this.list(parsed.args)
      case 'stat': return this.stat(parsed.args.at(-1) ?? '')
      case 'cat': return this.cat(parsed.args.at(-1) ?? '', this.scenarioId === 'linux-permission')
      case 'chmod': return this.chmod(parsed.args)
      case 'chown': return this.chown(parsed.args)
      case 'ps': return this.ps()
      case 'pgrep': return this.pgrep(parsed.args)
      case 'top': return this.top()
      case 'kill': return this.kill(parsed.args)
      case 'systemctl': return this.systemctl(parsed.args)
      case 'journalctl': return this.journalctl(parsed.args)
      case 'df': return this.df()
      case 'du': return this.du()
      case 'lsof': return this.lsof(parsed.args)
      case 'ss': return this.ss()
      case 'curl': return this.curl(parsed.args.join(' '))
      case 'ip': return this.result('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>\n    inet 10.4.8.21/24 brd 10.4.8.255 scope global eth0\ndefault via 10.4.8.1 dev eth0', [], 'diagnostic', 'network')
      case 'dig': return this.dig(parsed.args)
      case 'trainer': return this.trainer(parsed.args)
      case 'reboot': return this.danger('reboot is blocked in the safe simulator', 'host')
      default: return this.error(`${parsed.command}: command not found in the safe simulator`, 'unknown')
    }
  }

  private list(args: string[]): CommandResult {
    const path = args.at(-1)?.startsWith('/') ? args.at(-1)! : '/srv/app/config.yml'
    if (path === '/srv' || path === '/srv/app') {
      const directory = this.directories.get(path)!
      return this.result(`${modeString(directory.mode, true)} 2 ${directory.owner} ${directory.group} 4096 Jul 31 10:00 ${path}`, this.permissionTags(), 'diagnostic', path)
    }
    const file = this.files.get(path)
    if (!file) return this.error(`ls: cannot access '${path}': No such file or directory`, 'diagnostic')
    return this.result(`${modeString(file.mode)} 1 ${file.owner} ${file.group} ${file.content.length} Jul 31 10:15 ${path}`, this.permissionTags(), 'diagnostic', path)
  }

  private stat(path: string): CommandResult {
    const file = this.files.get(path)
    if (!file) return this.error(`stat: cannot statx '${path}': No such file or directory`, 'diagnostic')
    return this.result(`  File: ${path}\n  Size: ${file.content.length}\tBlocks: 8\tregular file\nAccess: (0${file.mode}/${modeString(file.mode)})  Uid: (1001/${file.owner})   Gid: (1001/${file.group})\nModify: 2026-07-31 10:15:30.000000000 +0500`, this.permissionTags(), 'diagnostic', path)
  }

  private cat(path: string, asApp: boolean): CommandResult {
    const file = this.files.get(path)
    if (!file) return this.error(`cat: ${path}: No such file or directory`, 'diagnostic')
    if (path === '/etc/app/app.env') return this.result(file.content, this.scenarioId === 'linux-network' ? ['diag:network-config'] : [], 'diagnostic', path)
    if (asApp && !this.appCanReadConfig()) return this.result(`cat: ${path}: Permission denied`, ['diag:permissions'], 'diagnostic', path, true)
    const tags = this.scenarioId === 'linux-permission' && this.safePermissionState() ? ['verify:permission'] : this.permissionTags()
    return this.result(file.content, tags, tags.includes('verify:permission') ? 'verification' : 'diagnostic', path)
  }

  private chmod(args: string[]): CommandResult {
    const [mode, path] = args
    const file = this.files.get(path)
    if (!file || !/^[0-7]{3,4}$/.test(mode ?? '')) return this.error('chmod: missing or invalid operand', 'change')
    const dangerous = mode === '777' || mode === '0777'
    file.mode = mode.slice(-3)
    const resolved = this.scenarioId === 'linux-permission' && this.safePermissionState()
    return this.result('', resolved ? ['resolve:permission'] : [], dangerous ? 'dangerous' : 'change', path, false, true, dangerous)
  }

  private chown(args: string[]): CommandResult {
    const [identity, path] = args
    const file = this.files.get(path)
    if (!file || !identity || !identity.includes(':')) return this.error('chown: missing or invalid operand', 'change')
    const [owner, group] = identity.split(':', 2)
    if (!owner || !group) return this.error('chown: invalid user:group', 'change')
    file.owner = owner; file.group = group
    const resolved = this.scenarioId === 'linux-permission' && this.safePermissionState()
    return this.result('', resolved ? ['resolve:permission'] : [], 'change', path, false, true)
  }

  private ps(): CommandResult {
    const api = this.processState === 'exited' ? '' : `\n 3912     1 app  ${this.processState === 'stopped' ? 'T' : 'Rl'}  ${this.processState === 'stopped' ? '0.0' : '92.7'} /srv/api/bin/api-worker --workers=8`
    const tags = this.scenarioId === 'linux-runaway-process' ? [this.processState === 'exited' ? 'verify:process' : 'diag:processes'] : []
    return this.result(`  PID  PPID USER STAT %CPU COMMAND\n  812     1 root Ss    0.2 /usr/lib/systemd/systemd${api}\n 1234     1 www-data S     0.3 nginx: worker process`, tags, tags.includes('verify:process') ? 'verification' : 'diagnostic', 'process')
  }

  private pgrep(args: string[]): CommandResult {
    if (args.join(' ').toLowerCase().includes('api-worker') && this.processState !== 'exited') return this.result('3912 /srv/api/bin/api-worker --workers=8', this.scenarioId === 'linux-runaway-process' ? ['diag:processes'] : [], 'diagnostic', 'api-worker')
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
    if (pid === 1234) return this.danger('kill: stopping nginx is not the disk-full repair; use systemctl restart nginx after lsof', 'nginx')
    if (this.processState === 'exited') return this.error(`kill: (${pid}) - No such process`, 'change')
    if (signal === 'TERM') { this.termTried = true; this.processState = 'exited'; return this.result('api-worker: draining requests\napi-worker: stopped cleanly', this.scenarioId === 'linux-runaway-process' ? ['resolve:process'] : [], 'change', 'api-worker', false, true) }
    if (signal === 'KILL') {
      if (!this.termTried) {
        this.processState = 'exited'
        this.processScenarioLocked = this.scenarioId === 'linux-runaway-process'
        return this.result('api-worker: killed with SIGKILL before SIGTERM; this is an unsafe, non-recoverable scenario path. Reset the virtual environment.', [], 'dangerous', 'api-worker', false, true, true, true)
      }
      return this.error(`kill: (${pid}) - No such process`, 'change')
    }
    if (signal === 'STOP') { this.processState = 'stopped'; return this.result('api-worker: stopped', [], 'change', 'api-worker', false, true) }
    this.processState = 'running'; return this.result('api-worker: continued', [], 'change', 'api-worker', false, true)
  }

  private systemctl(args: string[]): CommandResult {
    const [action, service] = args.map((item) => item.toLowerCase())
    if (action === 'daemon-reload') { this.unitReloaded = true; return this.result('systemd manager configuration reloaded', [], 'change', 'systemd', false, true) }
    if (!service || !['app-worker', 'nginx'].includes(service)) return this.error(`Unit ${service ?? ''}.service could not be found.`, 'diagnostic')
    if (action === 'status') {
      if (service === 'app-worker' && this.scenarioId === 'linux-systemd') {
        const active = this.systemdActive ? 'active (running)' : 'failed (Result: exit-code)'
        const tail = this.systemdActive ? 'Main PID: 2451 (app-worker)' : 'Hint: unit file changed on disk; run systemctl daemon-reload'
        return this.result(`● app-worker.service - application worker\n   Loaded: loaded (/etc/systemd/system/app-worker.service)\n   Active: ${active}\n   ${tail}`, [this.systemdActive ? 'verify:service' : 'symptom:service'], this.systemdActive ? 'verification' : 'symptom', 'app-worker')
      }
      if (service === 'app-worker' && this.scenarioId === 'linux-permission') return this.result(`● app-worker.service - application worker\n   Active: ${this.safePermissionState() ? 'active (running)' : 'failed (Result: exit-code)'}\n   ${this.safePermissionState() ? 'Configuration is readable.' : 'error: permission denied reading /srv/app/config.yml'}`, [this.safePermissionState() ? 'verify:permission' : 'symptom:service'], this.safePermissionState() ? 'verification' : 'symptom', 'app-worker')
      return this.result(`● ${service}.service - ${service}\n   Active: active (running)`, [], 'diagnostic', service)
    }
    if (action !== 'restart') return this.error(`systemctl: unsupported safe action '${action ?? ''}'`, 'unknown')
    if (service === 'nginx' && this.scenarioId === 'linux-disk-full') { this.descriptorOpen = false; return this.result('nginx restarted; closed old log descriptor', ['resolve:disk'], 'change', 'nginx', false, true) }
    if (service === 'app-worker' && this.scenarioId === 'linux-systemd') {
      if (!this.unitReloaded) return this.result('Job for app-worker.service failed: unit cache is stale; run systemctl daemon-reload first.', [], 'noop', 'app-worker')
      this.systemdActive = true; return this.result('app-worker restarted with reloaded unit', ['resolve:service'], 'change', 'app-worker', false, true)
    }
    if (service === 'app-worker' && this.scenarioId === 'linux-network') {
      if (this.configuredBind !== '0.0.0.0') return this.result('app-worker restarted; still bound to 127.0.0.1:8080', [], 'noop', 'app-worker')
      this.runningBind = this.configuredBind; return this.result('app-worker restarted with BIND_ADDRESS=0.0.0.0', ['resolve:network'], 'change', 'app-worker', false, true)
    }
    return this.result(`${service} restarted`, [], 'change', service, false, true)
  }

  private journalctl(args: string[]): CommandResult {
    const joined = args.join(' ').toLowerCase()
    if (joined.includes('nginx')) return this.result(this.descriptorOpen ? 'Jul 31 10:21 nginx[1234]: access log file deleted but still open\nJul 31 10:21 nginx[1234]: disk space exhausted' : 'Jul 31 10:25 nginx[1234]: reopened access log; disk space recovered', this.descriptorOpen ? ['diag:open-file'] : ['verify:disk'], this.descriptorOpen ? 'diagnostic' : 'verification', 'nginx')
    if (this.scenarioId === 'linux-systemd') return this.result(this.systemdActive ? 'Jul 31 10:25 systemd[1]: Started app-worker.service.' : 'Jul 31 10:22 systemd[1]: app-worker.service: unit file changed on disk, run systemctl daemon-reload.', this.systemdActive ? ['verify:service'] : ['diag:journal'], this.systemdActive ? 'verification' : 'diagnostic', 'app-worker')
    return this.result('Jul 31 10:22 app-worker[2451]: configuration file is not readable', ['symptom:service'], 'diagnostic', 'app-worker')
  }

  private df(): CommandResult {
    const fixed = !this.descriptorOpen
    const tags = this.scenarioId === 'linux-disk-full' ? [fixed ? 'verify:disk' : 'symptom:disk'] : []
    return this.result(`Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda3        20G  ${fixed ? '2.0G   18G  10%' : '20G     0 100%'} /var`, tags, fixed ? 'verification' : 'symptom', '/var')
  }

  private du(): CommandResult { return this.result('4.0K    /var/tmp\n1.2G    /var/lib\n0.8G    /var/log\n2.0G    /var', this.scenarioId === 'linux-disk-full' ? ['diag:disk-usage'] : [], 'diagnostic', '/var') }
  private lsof(args: string[]): CommandResult {
    if (!args.includes('+L1')) return this.error('lsof: only +L1 is supported in the safe simulator', 'unknown')
    const open = this.descriptorOpen
    return this.result(open ? 'COMMAND  PID USER     FD TYPE DEVICE SIZE/OFF NLINK NAME\nnginx   1234 www-data 7w REG  8,2   18G      0 /var/log/nginx/access.log (deleted)' : '', this.scenarioId === 'linux-disk-full' ? [open ? 'diag:open-file' : 'verify:disk'] : [], open ? 'diagnostic' : 'verification', 'deleted-file')
  }

  private ss(): CommandResult {
    const tags = this.scenarioId === 'linux-network' ? [this.runningBind === '0.0.0.0' ? 'verify:network' : 'diag:ports'] : []
    return this.result(`State  Recv-Q Send-Q Local Address:Port Process\nLISTEN 0      128    ${this.runningBind}:8080 users:(("app-worker",pid=2451,fd=8))\nLISTEN 0      511    0.0.0.0:80 users:(("nginx",pid=1234,fd=6))`, tags, this.runningBind === '0.0.0.0' ? 'verification' : 'diagnostic', 'app-worker')
  }

  private curl(target: string): CommandResult {
    const lower = target.toLowerCase()
    if (lower.includes('unknown.production.local')) return this.result('curl: (6) Could not resolve host: unknown.production.local', [], 'symptom', 'dns', true)
    if (lower.includes('10.4.8.250')) return this.result('curl: (28) Connection timed out after 3000 milliseconds', [], 'symptom', 'route', true)
    if (lower.includes('10.4.8.21:8080')) {
      if (this.runningBind !== '0.0.0.0') return this.result('curl: (7) Failed to connect to 10.4.8.21 port 8080: Connection refused', ['symptom:network'], 'symptom', 'app-worker', true)
      return this.result('HTTP/1.1 200 OK\ncontent-type: application/json\n\n{"status":"ok"}', ['verify:network'], 'verification', 'app-worker')
    }
    return this.result('HTTP/1.1 200 OK\n\n{"status":"ok"}', [], 'diagnostic', 'http')
  }

  private dig(args: string[]): CommandResult { const host = args.find((item) => !item.startsWith('-')) ?? ''; return host === 'api.production.local' ? this.result('api.production.local. 60 IN A 10.4.8.21', [], 'diagnostic', 'dns') : this.result(`;; ->>HEADER<<- status: NXDOMAIN\n;; QUESTION: ${host}`, [], 'diagnostic', 'dns') }
  private trainer(args: string[]): CommandResult {
    if (args[0] === 'edit' && args[1] === '/etc/app/app.env' && args[2] === 'BIND_ADDRESS=0.0.0.0') { this.configuredBind = '0.0.0.0'; this.files.get('/etc/app/app.env')!.content = 'BIND_ADDRESS=0.0.0.0\nPORT=8080'; return this.result('updated /etc/app/app.env: BIND_ADDRESS=0.0.0.0', [], 'change', '/etc/app/app.env', false, true) }
    if (args[0] === 'disable-firewall') return this.danger('trainer: firewall changes are intentionally unavailable', 'firewall')
    return this.error('trainer: supported command is edit /etc/app/app.env BIND_ADDRESS=0.0.0.0', 'unknown')
  }

  private appCanReadConfig(): boolean { const file = this.files.get('/srv/app/config.yml')!; const ownerBits = Number(file.mode[0]); const groupBits = Number(file.mode[1]); return (file.owner === 'app' && (ownerBits & 4) !== 0 || file.group === 'app' && (groupBits & 4) !== 0) && this.pathAllowsApp() }
  private pathAllowsApp(): boolean { return [...this.directories.values()].every((directory) => { const bit = directory.owner === 'app' ? Number(directory.mode[0]) : directory.group === 'app' ? Number(directory.mode[1]) : Number(directory.mode[2]); return (bit & 1) !== 0 }) }
  private safePermissionState(): boolean { const file = this.files.get('/srv/app/config.yml')!; return file.owner === 'app' && file.group === 'app' && file.mode === '640' && this.appCanReadConfig() }
  private permissionTags(): string[] { return this.scenarioId === 'linux-permission' ? ['diag:permissions'] : [] }
  private result(output: string, tags: string[], type: ScenarioActionType, object?: string, isError = false, meaningful = true, dangerous = false, blocksResolution = false): CommandResult { const action: ScenarioAction = { type, object, diagnosticTags: tags, changedState: type === 'change' || type === 'dangerous', dangerous, blocksResolution, meaningful }; return { output, tags, action, isError } }
  private error(output: string, type: ScenarioActionType): CommandResult { return this.result(output, [], type, undefined, true, false) }
  private danger(output: string, object: string): CommandResult { return this.result(output, [], 'dangerous', object, true, false, true) }
}

function modeString(mode: string, directory = false): string { const chars = [...mode].map((digit) => { const value = Number(digit); return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}` }).join(''); return `${directory ? 'd' : '-'}${chars}` }
