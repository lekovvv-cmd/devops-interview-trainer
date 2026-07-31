import { parseCommand } from './commandParser'
import type { CommandResult } from '../../types/domain'

type ServiceStatus = 'active' | 'failed'

export class LinuxSimulator {
  private cwd = '/home/student'
  private unitReloaded = false
  private networkFixed = false
  private readonly modes = new Map([
    ['/srv/app/config.yml', { mode: '600', owner: 'root:root', content: 'DATABASE_URL=postgres://app@db:5432/app\nLOG_LEVEL=info' }],
    ['/var/log/nginx/access.log', { mode: '644', owner: 'www-data:adm', content: '10.4.8.11 GET /health 200\n10.4.8.12 GET /api 200' }],
    ['/etc/resolv.conf', { mode: '644', owner: 'root:root', content: 'nameserver 10.96.0.10\nsearch production.local' }],
  ])
  private readonly services = new Map<string, ServiceStatus>([['nginx', 'active'], ['app-worker', 'failed']])
  private readonly processes = new Map([[1234, 'nginx: worker process'], [2451, 'app-worker'], [3912, 'api-worker'], [5678, 'rsyslogd']])

  constructor(private readonly scenarioId: string) {}

  execute(input: string): CommandResult {
    const parsed = parseCommand(input)
    if (!parsed.command) return { output: '', tags: [] }
    const joined = parsed.args.join(' ')
    const command = parsed.command

    if (command === 'pwd') return { output: this.cwd, tags: [] }
    if (command === 'cd') return this.changeDirectory(parsed.args[0] ?? '/home/student')
    if (command === 'ls') return this.listFiles(parsed.flags.includes('-l') || parsed.flags.includes('-la'))
    if (command === 'cat') return this.cat(parsed.args.at(-1) ?? '')
    if (command === 'grep') return this.grep(parsed.args)
    if (command === 'find') return { output: '/var/log/nginx/access.log\n/srv/app/config.yml\n/etc/resolv.conf', tags: ['diag:files'] }
    if (command === 'chmod') return this.chmod(parsed.args)
    if (command === 'chown') return this.chown(parsed.args)
    if (command === 'stat') return this.stat(parsed.args.at(-1) ?? '')
    if (command === 'ps') return this.processList()
    if (command === 'pgrep') return { output: this.scenarioId === 'linux-runaway-process' ? '3912 api-worker' : '1234\n2451', tags: ['diag:processes'] }
    if (command === 'kill') return this.kill(parsed.args.at(-1) ?? '')
    if (command === 'top') return this.top()
    if (command === 'free') return { output: '               total        used        free\nMem:            2048        1640         408\nSwap:           1024          14        1010', tags: ['diag:memory'] }
    if (command === 'df') return this.diskFree()
    if (command === 'du') return this.diskUsage()
    if (command === 'lsblk') return { output: 'NAME   SIZE TYPE MOUNTPOINTS\nsda     50G disk\n├─sda1   1G part /boot\n└─sda2  49G part /\n                 /var', tags: ['diag:disk'] }
    if (command === 'ip') return { output: '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>\n    inet 10.4.8.21/24 brd 10.4.8.255 scope global eth0\ndefault via 10.4.8.1 dev eth0', tags: ['diag:network'] }
    if (command === 'ss') return { output: `State  Recv-Q Send-Q Local Address:Port Process\nLISTEN 0      511    0.0.0.0:80        users:(("nginx",pid=1234,fd=6))\nLISTEN 0      128    ${this.scenarioId === 'linux-network' && this.networkFixed ? '0.0.0.0' : '127.0.0.1'}:8080    users:(("app-worker",pid=2451,fd=8))`, tags: ['diag:ports'] }
    if (command === 'curl') return this.curl(joined)
    if (command === 'systemctl') return this.systemctl(parsed.args)
    if (command === 'journalctl') return this.journalctl(joined)
    if (command === 'lsof' && joined.includes('+L1')) return { output: 'COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NLINK NAME\nnginx   1234 www-data 7w REG  8,2   18G      0 /var/log/nginx/access.log (deleted)', tags: ['diag:open-file'] }
    return { output: `${command}: command not found in the safe simulator`, tags: [], isError: true }
  }

  private changeDirectory(path: string): CommandResult {
    const target = path === '~' ? '/home/student' : path.startsWith('/') ? path : `${this.cwd}/${path}`
    if (['/home/student', '/var', '/srv/app', '/etc'].includes(target)) {
      this.cwd = target
      return { output: '', tags: [] }
    }
    return { output: `cd: no such file or directory: ${path}`, tags: [], isError: true }
  }

  private listFiles(long: boolean): CommandResult {
    const items = this.cwd === '/srv/app' ? ['config.yml'] : this.cwd === '/var' ? ['log', 'tmp', 'lib'] : ['notes.md', 'labs', '.bashrc']
    return { output: long ? items.map((item) => `-rw-r----- 1 student devops  128 May 21 10:00 ${item}`).join('\n') : items.join('  '), tags: ['diag:files'] }
  }

  private processList(): CommandResult {
    if (this.scenarioId === 'linux-runaway-process') {
      const running = this.processes.has(3912)
      return { output: running ? '  PID  PPID USER STAT %CPU COMMAND\n 3912     1 app  Rl   92.7 /srv/api/bin/api-worker --workers=8\n  812     1 root Ss    0.2 /usr/lib/systemd/systemd' : '  PID  PPID USER STAT %CPU COMMAND\n  812     1 root Ss    0.2 /usr/lib/systemd/systemd', tags: ['diag:processes'] }
    }
    return { output: '  PID USER     STAT COMMAND\n 1234 www-data S    nginx: worker process\n 2451 app      Sl   app-worker\n 5678 root     Ss   rsyslogd', tags: ['diag:processes'] }
  }

  private top(): CommandResult {
    if (this.scenarioId === 'linux-runaway-process') {
      const running = this.processes.has(3912)
      return { output: running ? 'top - 14:20:11  load average: 4.91, 3.14, 1.87\nTasks: 154 total, 2 running\n%Cpu(s): 96.2 us, 2.1 sy, 1.4 id\n  PID USER      %CPU COMMAND\n 3912 app       92.7 api-worker' : 'top - 14:22:03  load average: 1.10, 1.84, 1.77\nTasks: 153 total, 1 running\n%Cpu(s): 14.3 us, 3.1 sy, 81.9 id', tags: ['diag:cpu', 'diag:processes'] }
    }
    return { output: 'top - 12:09:11  load average: 1.12, 0.98, 0.74\nTasks: 87 total, 1 running\n%Cpu(s): 12.5 us, 4.3 sy\n  PID USER      %CPU COMMAND\n 2451 app       34.2 app-worker', tags: ['diag:processes'] }
  }

  private cat(file: string): CommandResult {
    const item = this.modes.get(file)
    return item ? { output: item.content, tags: ['diag:files'] } : { output: `cat: ${file}: No such file`, tags: [], isError: true }
  }

  private grep(args: string[]): CommandResult {
    const file = args.at(-1) ?? ''
    const item = this.modes.get(file)
    if (!item) return { output: `grep: ${file}: No such file`, tags: [], isError: true }
    const phrase = args.find((itemArg) => !itemArg.startsWith('-') && itemArg !== file) ?? ''
    return { output: item.content.split('\n').filter((line) => line.toLowerCase().includes(phrase.toLowerCase())).join('\n'), tags: ['diag:files'] }
  }

  private chmod(args: string[]): CommandResult {
    const [mode, file] = args
    const item = this.modes.get(file)
    if (!mode || !item) return { output: 'chmod: missing or invalid operand', tags: [], isError: true }
    item.mode = mode
    return { output: '', tags: this.scenarioId === 'linux-permission' ? ['resolve:permission'] : [] }
  }

  private chown(args: string[]): CommandResult {
    const [owner, file] = args
    const item = this.modes.get(file)
    if (!owner || !item) return { output: 'chown: missing or invalid operand', tags: [], isError: true }
    item.owner = owner
    return { output: '', tags: this.scenarioId === 'linux-permission' ? ['resolve:permission'] : [] }
  }

  private stat(file: string): CommandResult {
    const item = this.modes.get(file)
    if (!item) return { output: `stat: cannot statx '${file}': No such file or directory`, tags: [], isError: true }
    return { output: `  File: ${file}\n  Size: ${item.content.length}\tBlocks: 8\tregular file\nAccess: (${item.mode}/-rw-------)  Uid: ( 0/root)   Gid: ( 0/root)\nModify: 2026-07-31 10:15:30.000000000 +0500`, tags: ['diag:permissions'] }
  }

  private kill(pid: string): CommandResult {
    const number = Number(pid)
    if (!this.processes.has(number)) return { output: `kill: (${pid}) - No such process`, tags: [], isError: true }
    this.processes.delete(number)
    const tags = this.scenarioId === 'linux-disk-full' && number === 1234 ? ['resolve:disk'] : this.scenarioId === 'linux-runaway-process' && number === 3912 ? ['resolve:process'] : []
    return { output: '', tags }
  }

  private diskFree(): CommandResult {
    const full = this.scenarioId === 'linux-disk-full'
    return { output: `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda2        49G  ${full ? '48G  0.8G  99%' : '29G   18G  62%'} /\n/dev/sda3        20G  ${full ? '20G     0 100%' : '7.2G   12G  38%'} /var`, tags: ['diag:disk'] }
  }

  private diskUsage(): CommandResult {
    return { output: '4.0K    /var/tmp\n1.2G    /var/lib\n18G     /var/log\n20G     /var', tags: ['diag:disk-usage'] }
  }

  private curl(target: string): CommandResult {
    if (target.includes('api.production.local')) return { output: 'curl: (6) Could not resolve host: api.production.local', tags: ['diag:dns'], isError: true }
    if (target.includes('localhost:8081')) return { output: 'curl: (7) Failed to connect to localhost port 8081: Connection refused', tags: ['diag:ports'], isError: true }
    if (this.scenarioId === 'linux-network' && target.includes('10.4.8.21:8080') && !this.networkFixed) return { output: 'curl: (7) Failed to connect to 10.4.8.21 port 8080: Connection refused', tags: ['diag:ports'], isError: true }
    return { output: 'HTTP/1.1 200 OK\ncontent-type: application/json\n\n{"status":"ok"}', tags: ['diag:network'] }
  }

  private systemctl(args: string[]): CommandResult {
    const [action, service = 'app-worker'] = args
    const status = this.services.get(service) ?? 'failed'
    if (action === 'daemon-reload') {
      this.unitReloaded = true
      return { output: '', tags: this.scenarioId === 'linux-systemd' ? ['diag:unit-reload'] : [] }
    }
    if (action === 'status') return { output: `● ${service}.service - ${service}\n   Loaded: loaded (/etc/systemd/system/${service}.service)\n   Active: ${status} ${status === 'failed' ? '(Result: exit-code)' : '(running)'}`, tags: ['diag:service'] }
    if (action === 'restart') {
      this.services.set(service, 'active')
      const tags = this.scenarioId === 'linux-disk-full' && service === 'nginx' ? ['resolve:disk'] : this.scenarioId === 'linux-systemd' && this.unitReloaded ? ['resolve:service'] : this.scenarioId === 'linux-network' && service === 'app-worker' ? ['resolve:network'] : []
      if (this.scenarioId === 'linux-network' && service === 'app-worker') this.networkFixed = true
      return { output: '', tags }
    }
    return { output: `systemctl: unsupported safe action '${action ?? ''}'`, tags: [], isError: true }
  }

  private journalctl(joined: string): CommandResult {
    const output = joined.includes('nginx')
      ? 'Jul 31 10:21:03 prod-web nginx[1234]: access log file deleted but still open\nJul 31 10:21:08 prod-web nginx[1234]: disk space exhausted'
      : 'Jul 31 10:22:11 prod-web app-worker[2451]: error: configuration file /srv/app/config.yml is not readable\nJul 31 10:22:11 prod-web systemd[1]: app-worker.service: Failed with result exit-code.'
    return { output, tags: joined.includes('nginx') ? ['diag:open-file'] : this.scenarioId === 'linux-systemd' ? ['diag:journal'] : ['diag:service'] }
  }
}
