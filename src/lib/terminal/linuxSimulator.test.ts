import { describe, expect, it } from 'vitest'
import { LinuxSimulator } from './linuxSimulator'

const config = '/srv/app/config.yml'

describe('LinuxSimulator permissions and virtual users', () => {
  it('keeps UID/GID, mode and ls output synchronized after ownership changes', () => {
    const simulator = new LinuxSimulator('linux-permission')
    expect(simulator.execute(`stat ${config}`).output).toContain('Uid: (0/root)')
    expect(simulator.execute(`stat ${config}`).output).toContain('Gid: (0/root)')
    simulator.execute(`chown app:app ${config}`)
    expect(simulator.execute(`stat ${config}`).output).toContain('Uid: (1001/app)')
    expect(simulator.execute(`stat ${config}`).output).toContain('Gid: (1001/app)')
    simulator.execute(`chown root:app ${config}`)
    const stat = simulator.execute(`stat ${config}`).output
    expect(stat).toContain('Uid: (0/root)')
    expect(stat).toContain('Gid: (1001/app)')
    expect(simulator.execute(`ls -l ${config}`).output).toContain('root app')
  })

  it('evaluates default, app and root reads as different virtual users', () => {
    const simulator = new LinuxSimulator('linux-permission')
    expect(simulator.execute(`cat ${config}`).output).toContain('Permission denied')
    expect(simulator.execute(`sudo -u app cat ${config}`).output).toContain('Permission denied')
    expect(simulator.execute(`sudo -u root cat ${config}`).output).toContain('DATABASE_URL')
    expect(simulator.execute(`sudo -u unknown cat ${config}`).isError).toBe(true)
    simulator.execute(`chown root:app ${config}`)
    simulator.execute(`chmod 640 ${config}`)
    expect(simulator.execute(`cat ${config}`).tags).not.toContain('verify:permission')
    expect(simulator.execute(`sudo -u app cat ${config}`).tags).toContain('verify:permission')
  })

  it.each([
    ['app', 'app', '600'],
    ['app', 'app', '640'],
    ['root', 'app', '640'],
  ])('accepts the minimally sufficient %s:%s %s state', (owner, group, mode) => {
    const simulator = new LinuxSimulator('linux-permission')
    simulator.execute(`chown ${owner}:${group} ${config}`)
    simulator.execute(`chmod ${mode} ${config}`)
    expect(simulator.execute(`sudo -u app cat ${config}`).tags).toContain('verify:permission')
  })

  it.each([
    ['root', 'root', '600'],
    ['root', 'root', '644'],
    ['app', 'app', '666'],
    ['app', 'app', '777'],
    ['app', 'app', '664'],
    ['root', 'app', '660'],
  ])('rejects the unsafe %s:%s %s state', (owner, group, mode) => {
    const simulator = new LinuxSimulator('linux-permission')
    simulator.execute(`chown ${owner}:${group} ${config}`)
    const result = simulator.execute(`chmod ${mode} ${config}`)
    expect(simulator.execute(`sudo -u app cat ${config}`).tags).not.toContain('verify:permission')
    if (['666', '777', '664', '660'].includes(mode)) expect(result.action?.dangerous).toBe(true)
  })

  it('accepts 0640 and rejects invalid owners, groups, modes and paths without mutating state', () => {
    const simulator = new LinuxSimulator('linux-permission')
    simulator.execute(`chmod 0640 ${config}`)
    expect(simulator.execute(`stat ${config}`).output).toContain('0640/-rw-r-----')
    const before = simulator.execute(`stat ${config}`).output
    for (const command of [
      `chown unknown:app ${config}`,
      `chown app:unknown ${config}`,
      `chmod abc ${config}`,
      `chmod 999 ${config}`,
      'chmod 640 /unknown',
    ]) expect(simulator.execute(command).isError).toBe(true)
    expect(simulator.execute(`stat ${config}`).output).toBe(before)
  })

  it('awards permission diagnostics only to the implicated file, path directories and service', () => {
    const simulator = new LinuxSimulator('linux-permission')
    for (const command of ['stat /etc/app/app.env', 'ls -l /tmp/file', 'stat /etc/passwd']) {
      expect(simulator.execute(command).tags).not.toContain('diag:permissions')
    }
    for (const command of [`stat ${config}`, `ls -l ${config}`, 'ls -ld /srv', 'ls -ld /srv/app']) {
      expect(simulator.execute(command).tags).toContain('diag:permissions')
    }
    expect(simulator.execute('systemctl status app-worker').tags).toContain('symptom:service')
  })
})

describe('LinuxSimulator processes, systemd, disk and network', () => {
  it('models TERM, KILL, STOP and CONT with concrete PID handling', () => {
    const simulator = new LinuxSimulator('linux-runaway-process')
    expect(simulator.execute('kill -BOGUS 3912').isError).toBe(true)
    expect(simulator.execute('kill -TERM 9999').isError).toBe(true)
    simulator.execute('kill -STOP 3912')
    expect(simulator.execute('ps -o pid,stat -p 3912').output).toContain(' T')
    simulator.execute('kill -CONT 3912')
    expect(simulator.execute('top').output).toContain('92.7')
    expect(simulator.execute('kill 3912').output).toContain('stopped cleanly')
    expect(simulator.execute('ps -p 3912').output).not.toContain('3912     1')

    const unsafe = new LinuxSimulator('linux-runaway-process').execute('kill -KILL 3912')
    expect(unsafe.action).toMatchObject({ dangerous: true, blocksResolution: true, changedState: true })
    expect(unsafe.tags).not.toContain('resolve:process')
  })

  it('requires app-worker journal diagnostics and daemon-reload before systemd becomes active', () => {
    const simulator = new LinuxSimulator('linux-systemd')
    expect(simulator.execute('journalctl -u nginx').tags).not.toContain('diag:journal')
    expect(simulator.execute('journalctl -u unknown').output).toContain('No entries')
    expect(simulator.execute('systemctl restart app-worker').output).toContain('daemon-reload')
    expect(simulator.execute('systemctl status app-worker').output).toContain('failed')
    expect(simulator.execute('journalctl --unit app-worker -n 30 --no-pager').tags).toContain('diag:journal')
    simulator.execute('systemctl daemon-reload')
    expect(simulator.execute('systemctl status app-worker').output).toContain('failed')
    simulator.execute('systemctl restart app-worker')
    expect(simulator.execute('systemctl status app-worker').output).toContain('active (running)')
    expect(simulator.execute('journalctl -u app-worker').output).toContain('Started app-worker.service')
  })

  it('keeps df, du and lsof consistent and rejects irrelevant disk objects', () => {
    const simulator = new LinuxSimulator('linux-disk-full')
    expect(simulator.execute('df -h /home').output).toContain('/home')
    expect(simulator.execute('df -h /home').tags).toEqual([])
    expect(simulator.execute('du -xhd1 /tmp').output).toContain('/tmp')
    expect(simulator.execute('du -xhd1 /tmp').tags).toEqual([])
    expect(simulator.execute('df -h /var').output).toContain('100%')
    expect(simulator.execute('du -xhd1 /var').output).toContain('2.0G')
    expect(simulator.execute('lsof +L1').output).toContain('(deleted)')
    expect(simulator.execute('kill 1234').action?.dangerous).toBe(true)
    expect(simulator.execute('systemctl restart app-worker').output).not.toContain('closed old log')
    simulator.execute('systemctl restart nginx')
    expect(simulator.execute('lsof +L1').output).toBe('')
    expect(simulator.execute('df -h /var').output).toContain('10%')
    expect(simulator.execute('du -xhd1 /var').output).toContain('2.0G')
  })

  it('changes the running bind only after the exact configuration edit and restart', () => {
    const simulator = new LinuxSimulator('linux-network')
    expect(simulator.execute('curl http://10.4.8.21:8080').tags).toContain('symptom:network')
    expect(simulator.execute('curl http://10.4.8.21:9999').tags).toEqual([])
    expect(simulator.execute('cat /etc/app/app.env').tags).toContain('diag:network-config')
    expect(simulator.execute('cat /srv/app/config.yml').tags).toEqual([])
    expect(simulator.execute('ss -lntp').output).toContain('127.0.0.1:8080')
    expect(simulator.execute('ss -lntp sport = :9999').tags).toEqual([])
    expect(simulator.execute('trainer edit /etc/app/other.env BIND_ADDRESS=0.0.0.0').isError).toBe(true)
    simulator.execute('trainer edit /etc/app/app.env BIND_ADDRESS=0.0.0.0')
    expect(simulator.execute('ss -lntp').output).toContain('127.0.0.1:8080')
    simulator.execute('systemctl restart app-worker')
    expect(simulator.execute('ss -lntp').output).toContain('0.0.0.0:8080')
    expect(simulator.execute('curl http://10.4.8.21:8080').output).toContain('200 OK')
  })
})
