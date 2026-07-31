import { describe, expect, it } from 'vitest'
import { commandsEquivalent, matchesAcceptedCommand, normalizedCommand, parseCommand } from './commandParser'

describe('parseCommand', () => {
  it('extracts a command, flags and positional arguments', () => {
    expect(parseCommand('kubectl get pods -n production')).toEqual({ raw: 'kubectl get pods -n production', command: 'kubectl', args: ['get', 'pods', '-n', 'production'], flags: ['-n'] })
  })

  it('keeps quoted values together without evaluating input', () => {
    expect(parseCommand("grep 'access log' /var/log/app.log")).toEqual({ raw: "grep 'access log' /var/log/app.log", command: 'grep', args: ['access log', '/var/log/app.log'], flags: [] })
  })

  it('returns an empty command for whitespace', () => {
    expect(parseCommand('   ')).toEqual({ raw: '', command: '', args: [], flags: [] })
  })

  it('normalizes signal aliases and whitespace without accepting another command', () => {
    expect(commandsEquivalent(' kill   -TERM 3912 ', 'kill -15 3912')).toBe(true)
    expect(commandsEquivalent('kill -KILL 3912', 'kill -TERM 3912')).toBe(false)
  })

  it('normalizes Kubernetes resource aliases, namespace flags and independent flag order', () => {
    expect(commandsEquivalent('kubectl describe po api-7d8f --namespace production', 'kubectl describe pod api-7d8f -n production')).toBe(true)
    expect(commandsEquivalent('kubectl logs -n production web-6d7c9f6b7d-2xk9m --previous', 'kubectl logs web-6d7c9f6b7d-2xk9m --previous -n production')).toBe(true)
    expect(commandsEquivalent('kubectl -n production get pods', 'kubectl get pods --namespace production')).toBe(true)
    expect(commandsEquivalent('kubectl get -n production pods', 'kubectl --namespace=production get pods')).toBe(true)
  })

  it('keeps Linux -n as a line-count flag rather than a Kubernetes namespace', () => {
    const normalized = normalizedCommand('journalctl -n 30 -u app-worker --no-pager')
    expect(normalized).not.toContain('"namespace"')
    expect(normalized).toContain('"-n=30"')
    expect(commandsEquivalent('journalctl -n 30 -u app-worker --no-pager', 'journalctl -u app-worker -n 30 --no-pager')).toBe(true)
  })

  it('checks command questions semantically, including the required object and namespace', () => {
    expect(matchesAcceptedCommand('kubectl get po -n production', ['kubectl get pods --namespace production'])).toBe(true)
    expect(matchesAcceptedCommand('kubectl get pods -n staging', ['kubectl get pods -n production'])).toBe(false)
    expect(matchesAcceptedCommand('kubectl get deployments -n production', ['kubectl get pods -n production'])).toBe(false)
    expect(normalizedCommand('kill -SIGTERM 3912')).toContain('"signal":"TERM"')
  })
})
