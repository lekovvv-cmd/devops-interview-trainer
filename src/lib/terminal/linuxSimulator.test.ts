import { describe, expect, it } from 'vitest'
import { LinuxSimulator } from './linuxSimulator'

describe('LinuxSimulator', () => {
  it('keeps file owner and mode consistent across stat, ls and service access', () => {
    const simulator = new LinuxSimulator('linux-permission')
    expect(simulator.execute('stat /srv/app/config.yml').output).toContain('0600/-rw-------')
    expect(simulator.execute('cat /srv/app/config.yml').output).toContain('Permission denied')
    simulator.execute('chown app:app /srv/app/config.yml')
    simulator.execute('chmod 640 /srv/app/config.yml')

    expect(simulator.execute('stat /srv/app/config.yml').output).toContain('0640/-rw-r-----')
    expect(simulator.execute('ls -l /srv/app/config.yml').output).toContain('app app')
    expect(simulator.execute('sudo -u app cat /srv/app/config.yml').output).toContain('DATABASE_URL')
  })

  it('does not accept world-writable or wrong-owner permission changes as a safe repair', () => {
    const simulator = new LinuxSimulator('linux-permission')
    const unsafe = simulator.execute('chmod 777 /srv/app/config.yml')
    expect(unsafe.action?.dangerous).toBe(true)
    simulator.execute('chown root:app /srv/app/config.yml')
    expect(simulator.execute('cat /srv/app/config.yml').tags).not.toContain('verify:permission')
  })

  it('models TERM, KILL, STOP and CONT with valid PID handling', () => {
    const simulator = new LinuxSimulator('linux-runaway-process')
    expect(simulator.execute('kill -BOGUS 3912').isError).toBe(true)
    expect(simulator.execute('kill -TERM 9999').isError).toBe(true)
    simulator.execute('kill -STOP 3912')
    expect(simulator.execute('ps -o pid,stat -p 3912').output).toContain(' T')
    simulator.execute('kill -CONT 3912')
    expect(simulator.execute('top').output).toContain('92.7')
    expect(simulator.execute('kill 3912').output).toContain('stopped cleanly')
    expect(simulator.execute('ps -p 3912').output).not.toContain('3912')

    const forced = new LinuxSimulator('linux-runaway-process')
    const unsafeKill = forced.execute('kill -9 3912')
    expect(unsafeKill.action).toMatchObject({ dangerous: true, blocksResolution: true })
    expect(unsafeKill.tags).not.toContain('resolve:process')
    expect(forced.execute('ps -p 3912').isError).toBe(true)

    const namedKill = new LinuxSimulator('linux-runaway-process').execute('kill -KILL 3912')
    expect(namedKill.action).toMatchObject({ dangerous: true, blocksResolution: true })
    expect(namedKill.tags).not.toContain('resolve:process')
  })

  it('requires daemon-reload before the fixed systemd service can start', () => {
    const simulator = new LinuxSimulator('linux-systemd')
    expect(simulator.execute('systemctl status app-worker').output).toContain('unit file changed on disk')
    expect(simulator.execute('systemctl restart app-worker').output).toContain('daemon-reload')
    simulator.execute('systemctl daemon-reload')
    simulator.execute('systemctl restart app-worker')
    expect(simulator.execute('systemctl status app-worker').output).toContain('active (running)')
    expect(simulator.execute('journalctl -u app-worker').output).toContain('Started app-worker.service')
  })

  it('releases a deleted open file only when the owning service closes its descriptor', () => {
    const simulator = new LinuxSimulator('linux-disk-full')
    expect(simulator.execute('df -h /var').output).toContain('100%')
    expect(simulator.execute('du -xhd1 /var').output).toContain('2.0G')
    expect(simulator.execute('lsof +L1').output).toContain('(deleted)')
    expect(simulator.execute('kill 1234').action?.dangerous).toBe(true)
    expect(simulator.execute('df -h /var').output).toContain('100%')
    simulator.execute('systemctl restart nginx')
    expect(simulator.execute('lsof +L1').output).toBe('')
    expect(simulator.execute('df -h /var').output).toContain('10%')
  })

  it('changes network reachability only after the explicit safe configuration edit and restart', () => {
    const simulator = new LinuxSimulator('linux-network')
    expect(simulator.execute('curl http://10.4.8.21:8080').output).toContain('Connection refused')
    simulator.execute('systemctl restart app-worker')
    expect(simulator.execute('ss -lntp').output).toContain('127.0.0.1:8080')
    expect(simulator.execute('trainer edit /etc/app/app.env BIND_ADDRESS=0.0.0.0').output).toContain('updated')
    simulator.execute('systemctl restart app-worker')
    expect(simulator.execute('ss -lntp').output).toContain('0.0.0.0:8080')
    expect(simulator.execute('curl http://10.4.8.21:8080').output).toContain('200 OK')
    expect(simulator.execute('curl http://unknown.production.local').output).toContain('Could not resolve host')
    expect(simulator.execute('curl http://10.4.8.250:8080').output).toContain('timed out')
  })
})
